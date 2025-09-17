/**
 * gemini-proxy.js — إصدار متوافق مزدوج (ESM + Global)
 * - يتصل بوظيفة Netlify: /api/generate
 * - يرسل payload متوافقًا تمامًا مع الباك إند الذي اعتمدناه
 * - يعالج dataURL / File للصور والصوت
 * - يوفر API واحدًا:
 *      GeminiProxy.generate(params)
 *      GeminiProxy.ask(prompt, opts)
 *      GeminiProxy.canSendMedia()
 *
 * الاستخدام:
 *   // ES Module:
 *   import { generate, ask } from './gemini-proxy.js';
 *   const res = await generate({ messages: [{ role:'user', content:'مرحبا' }] });
 *
 *   // سكربت عادي:
 *   <script src="gemini-proxy.js"></script>
 *   const res = await window.GeminiProxy.generate({ ... });
 */

(function (root, factory) {
  const mod = factory();
  // Global
  root.GeminiProxy = mod;
  // ESM/CommonJS interop (لن يضرّ لو استُخدم كـ <script>)
  try {
    if (typeof module !== "undefined" && module.exports) {
      module.exports = mod;
    }
  } catch {}
  try {
    if (typeof define === "function" && define.amd) {
      define([], () => mod);
    }
  } catch {}
  try {
    // ES module named exports (يعمل فقط إذا استورد كـ type="module")
    // ملاحظة: بعض المتصفحات تتجاهل هذا إذا لم يكن ملفًا ESM حقيقيًا.
    // لذا نُبقي الـ Global دومًا.
    // eslint-disable-next-line no-undef
    export const generate = mod.generate;
    // eslint-disable-next-line no-undef
    export const ask = mod.ask;
    // eslint-disable-next-line no-undef
    export const canSendMedia = mod.canSendMedia;
  } catch {}
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const API_ENDPOINT = "/api/generate";
  const DEFAULT_TIMEOUT_MS = 26000;
  const MAX_INLINE_BYTES = 15 * 1024 * 1024;

  const ALLOWED_IMAGE = /^image\/(png|jpe?g|webp|gif|bmp|svg\+xml)$/i;
  const ALLOWED_AUDIO = /^(audio|video)\/(webm|ogg|mp3|mpeg|wav|m4a|aac|3gpp2?|mp4)$/i;

  // ---------- Utilities ----------
  function clamp(n, min, max, dflt) {
    const x = typeof n === "number" && isFinite(n) ? n : dflt;
    return Math.min(max, Math.max(min, x));
  }

  function approxBase64Bytes(b64) {
    if (!b64) return 0;
    const len = b64.length - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
    return Math.floor(len * 0.75);
  }

  function isDataUrl(str) {
    return typeof str === "string" && str.startsWith("data:");
  }

  function parseDataUrl(u) {
    const i = u.indexOf(",");
    const meta = u.slice(5, i);
    const data = u.slice(i + 1);
    const semi = meta.indexOf(";");
    const mime = semi >= 0 ? meta.slice(0, semi) : meta;
    return { mime, data };
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  async function ensureInline(item, type /* "image"|"audio" */) {
    // يدعم:
    // - dataURL string
    // - { inlineData: { mimeType, data } }
    // - File/Blob
    // - { mime, data } أو { inline_data: { mime_type, data } }
    if (!item) return null;

    // 1) dataURL
    if (isDataUrl(item)) {
      const { mime, data } = parseDataUrl(item);
      return { mimeType: mime, data };
    }

    // 2) شكل inlineData
    if (item.inlineData?.mimeType && item.inlineData?.data) {
      return { mimeType: item.inlineData.mimeType, data: item.inlineData.data };
    }
    if (item.inline_data?.mime_type && item.inline_data?.data) {
      return { mimeType: item.inline_data.mime_type, data: item.inline_data.data };
    }

    // 3) File/Blob
    if (typeof File !== "undefined" && item instanceof File) {
      const dataUrl = await fileToDataUrl(item);
      const { mime, data } = parseDataUrl(dataUrl);
      return { mimeType: mime, data };
    }
    if (typeof Blob !== "undefined" && item instanceof Blob) {
      const f = new File([item], "blob", { type: item.type || "" });
      const dataUrl = await fileToDataUrl(f);
      const { mime, data } = parseDataUrl(dataUrl);
      return { mimeType: mime, data };
    }

    // 4) { mime, data }
    if (item.mime && item.data) return { mimeType: item.mime, data: item.data };

    // 5) { type, data }
    if (item.type && item.data) return { mimeType: item.type, data: item.data };

    return null;
  }

  async function normalizeMediaArray(arr, kind /* "image"|"audio" */) {
    if (!Array.isArray(arr) || !arr.length) return [];
    const out = [];
    for (const item of arr) {
      const inline = await ensureInline(item, kind);
      if (!inline) continue;
      const mime = String(inline.mimeType || "").toLowerCase();
      const ok = kind === "image" ? ALLOWED_IMAGE.test(mime) : ALLOWED_AUDIO.test(mime);
      if (!ok) continue;
      if (approxBase64Bytes(inline.data) > MAX_INLINE_BYTES) continue;
      out.push({ inlineData: { mimeType: inline.mimeType, data: inline.data } });
    }
    return out;
  }

  async function requestWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch { /* ignore */ }

      if (!res.ok) {
        const err = (data && (data.error || data.details)) || text || `HTTP ${res.status}`;
        throw new Error(err);
      }
      return data ?? {};
    } finally {
      clearTimeout(t);
    }
  }

  // ---------- Payload Builder ----------
  async function normalizePayload(params = {}) {
    // القيم الافتراضية + ضبط الحدود (مطابقة للباك إند)
    const {
      system,
      messages,
      images,
      audio,
      concise_image,
      model,
      temperature,
      top_p,
      max_output_tokens,
      guard_level,
      force_lang,
      include_raw,
      timeout_ms
    } = params;

    const payload = {};
    if (system) payload.system = String(system);

    // إما messages أو prompt (نُفضّل messages دائمًا)
    if (Array.isArray(messages) && messages.length) {
      const outMsgs = [];
      for (const m of messages) {
        const role = (m && (m.role === "user" || m.role === "model")) ? m.role : "user";
        const content = m && m.content ? String(m.content) : "";
        const imgs = await normalizeMediaArray(m?.images, "image");
        const auds = await normalizeMediaArray(m?.audio, "audio");
        const out = { role, content };
        if (imgs.length) out.images = imgs;
        if (auds.length) out.audio = auds;
        outMsgs.push(out);
      }
      payload.messages = outMsgs;
    } else if (params.prompt) {
      // دعم prompt البسيط عند الحاجة
      payload.prompt = String(params.prompt);
    }

    // وسائط على مستوى الطلب (اختيارية)
    const topImgs = await normalizeMediaArray(images, "image");
    const topAuds = await normalizeMediaArray(audio, "audio");
    if (topImgs.length) payload.images = topImgs;
    if (topAuds.length) payload.audio = topAuds;

    if (concise_image != null) payload.concise_image = concise_image === true ? true : String(concise_image || "");
    if (model) payload.model = String(model);
    if (typeof temperature === "number") payload.temperature = clamp(temperature, 0, 1, 0.6);
    if (typeof top_p === "number") payload.top_p = clamp(top_p, 0, 1, 0.9);
    if (typeof max_output_tokens === "number") payload.max_output_tokens = max_output_tokens;
    if (guard_level) payload.guard_level = String(guard_level);
    if (force_lang) payload.force_lang = String(force_lang);
    if (include_raw != null) payload.include_raw = !!include_raw;
    if (typeof timeout_ms === "number") payload.timeout_ms = clamp(timeout_ms, 1000, 29000, DEFAULT_TIMEOUT_MS);

    return payload;
  }

  // ---------- Public API ----------
  async function generate(params = {}) {
    const payload = await normalizePayload(params);
    const data = await requestWithTimeout(
      API_ENDPOINT,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      typeof params.timeout_ms === "number" ? params.timeout_ms : DEFAULT_TIMEOUT_MS
    );
    return {
      text: data?.text || "",
      model: data?.model || "",
      lang: data?.lang || "",
      usage: data?.usage || null,
      raw: data?.raw || null,
      requestId: data?.requestId || ""
    };
  }

  async function ask(prompt, opts = {}) {
    const params = {
      system: opts.system || "",
      messages: [{ role: "user", content: String(prompt || "") }],
      model: opts.model,
      temperature: opts.temperature,
      top_p: opts.top_p,
      max_output_tokens: opts.max_output_tokens,
      guard_level: opts.guard_level,
      force_lang: opts.force_lang,
      include_raw: opts.include_raw,
      timeout_ms: opts.timeout_ms
    };
    return generate(params);
  }

  function canSendMedia() {
    try {
      return !!(window && window.fetch && window.FileReader);
    } catch { return false; }
  }

  return { generate, ask, canSendMedia };
});
