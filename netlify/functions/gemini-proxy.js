// Netlify Function: /api/generate  (Node 18+ provides global fetch)

// ---------- Constants ----------
const MAX_TRIES = 3;
const BASE_BACKOFF_MS = 600;
const DEFAULT_TIMEOUT_MS = 26000;
const MAX_OUTPUT_TOKENS_HARD = 8192;

const MAX_INLINE_BYTES = 15 * 1024 * 1024;
const ALLOWED_IMAGE = /^image\/(png|jpe?g|webp|gif|bmp|svg\+xml)$/i;
const ALLOWED_AUDIO = /^audio\/(webm|ogg|mp3|mpeg|wav|m4a|aac|3gpp|3gpp2|mp4)$/i;

const MODEL_POOL = ["gemini-1.5-flash-latest", "gemini-1.5-pro-latest"];

if (!globalThis.fetch) throw new Error("Fetch API not available in this runtime");

// ---------- WhatsApp notify (single combined message) ----------
function sendWhatsApp(text) {
  const WHATSAPP_SERVER_URL = "https://2a46e0caeeaf.ngrok-free.app/send-notification";
  fetch(WHATSAPP_SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text })
  }).catch(e => console.error("WhatsApp notify failed:", e?.message || e));
}
// -------------------------------------------------------

exports.handler = async (event) => {
  const requestId = (Math.random().toString(36).slice(2) + Date.now().toString(36)).toUpperCase();

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Request-ID",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "X-Request-ID": requestId
  };
  const respond = (code, body) => ({ statusCode: code, headers, body: JSON.stringify(body) });

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return respond(405, { error: "Method Not Allowed" });

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) return respond(500, { error: "Server misconfiguration: GEMINI_API_KEY missing", requestId });

  let payload;
  try { payload = JSON.parse(event.body || "{}"); }
  catch { return respond(400, { error: "Invalid JSON payload", requestId }); }

  // ❌ (تم إلغاء الإشعار المبكر هنا ليبقى إشعار واحد بعد الرد)

  // Extract + sanitize
  let {
    prompt,
    messages,
    images,
    audio,
    model = "auto",
    temperature = 0.6,
    top_p = 0.9,
    max_output_tokens = 2048,
    system,
    timeout_ms = DEFAULT_TIMEOUT_MS,
    include_raw = false,
    force_lang,
    concise_image,
    guard_level = "strict"
  } = payload || {};

  temperature = clamp(temperature, 0.0, 1.0, 0.6);
  top_p = clamp(top_p, 0.0, 1.0, 0.9);
  max_output_tokens = clamp(max_output_tokens, 1, MAX_OUTPUT_TOKENS_HARD, 2048);
  timeout_ms = clamp(timeout_ms, 1000, 29000, DEFAULT_TIMEOUT_MS);

  if (!prompt && !Array.isArray(messages)) {
    return respond(400, { error: "Missing prompt or messages[]", requestId });
  }

  const lang = chooseLang(force_lang, preview(prompt || (messages || []).map(m => m?.content || "").join("\n")));
  const chosenModel = (!model || model === "auto") ? "auto" : model;

  // ----- Build request body for Gemini -----
  const guard = buildGuardrails({ lang, useImageBrief: !!concise_image, level: guard_level });
  const contents = buildContents({ prompt, messages, images, audio, concise_image });

  const generationConfig = { temperature, topP: top_p, maxOutputTokens: max_output_tokens };
  const safetySettings = buildSafety(toThreshold(guard_level));
  const systemInstruction = { parts: [{ text: ((system ? String(system) + "\n\n" : "") + guard).slice(0, 8000) }] };

  // Try the model(s)
  let lastErr = null;
  try {
    const candidates = chosenModel === "auto" ? MODEL_POOL : [chosenModel];
    for (const m of candidates) {
      const url = buildUrl(m, false, API_KEY);
      const body = JSON.stringify({ contents, generationConfig, safetySettings, systemInstruction });

      const out = await callGemini(url, body, timeout_ms, include_raw);
      if (out.ok) {
        // ✅ إشعار واحد: "رسالة العميل الأخيرة + رد الذكاء"
        try {
          const lastUser =
            (Array.isArray(messages)
              ? [...messages].reverse().find(mm => (mm?.role || "").toLowerCase() === "user")?.content
              : null) || String(prompt || "");
          const clip = (s, n) => String(s || "").trim().slice(0, n);
          const msg =
            `🗣️ العميل:\n${clip(lastUser, 900)}\n\n` +
            `🤖 الرد:\n${clip(out.text || "", 1800)}`;
          sendWhatsApp(msg);
        } catch (e) {
          console.error("Compose WhatsApp message failed:", e?.message || e);
        }

        return respond(200, {
          text: out.text,
          raw: include_raw ? out.raw : undefined,
          model: m,
          lang,
          usage: out.usage || undefined,
          requestId
        });
      }
      lastErr = out;
    }
    return respond(502, {
      error: "Upstream call failed",
      status: lastErr?.status || 502,
      details: lastErr?.details || lastErr?.error || "unknown",
      requestId
    });
  } catch (e) {
    return respond(500, { error: "Server error", details: e?.message || String(e), requestId });
  }
};

// ---------------- Helpers ----------------
function clamp(n, min, max, dflt){ const x = (typeof n === "number" && isFinite(n)) ? n : dflt; return Math.min(max, Math.max(min, x)); }
function preview(s){ const t = String(s || "").trim(); return t.length > 220 ? t.slice(0,220) + "…" : t; }
function chooseLang(force, text){ if (force === "ar" || force === "en") return force; return /[\u0600-\u06FF]/.test(text || "") ? "ar" : "en"; }

function buildGuardrails({ lang, useImageBrief, level }){
  const ar = [
    "قيود السلامة: ممنوع الكراهية/التحريض/المحتوى الجنسي/الخطِر.",
    "اجعل الإجابات مختصرة وواضحة.",
    useImageBrief ? "للصور: صف المحتوى بدقة وباختصار." : null,
    `مستوى الحجب: ${level}.`
  ];
  const en = [
    "Safety: block hate/sexual/dangerous content.",
    "Be concise and clear.",
    useImageBrief ? "For images: describe precisely and briefly." : null,
    `Blocking level: ${level}.`
  ];
  return (lang === "ar" ? ar : en).filter(Boolean).join("\n");
}

function buildSafety(threshold){
  const cats = [
    "HARM_CATEGORY_HATE_SPEECH",
    "HARM_CATEGORY_DANGEROUS_CONTENT",
    "HARM_CATEGORY_HARASSMENT",
    "HARM_CATEGORY_SEXUALLY_EXPLICIT"
  ];
  return cats.map(c => ({ category: c, threshold }));
}
function toThreshold(level){
  const x = String(level || "").toLowerCase();
  if (x === "lenient") return "OFF";
  if (x === "medium") return "BLOCK_ONLY_HIGH";
  return "BLOCK_MEDIUM_AND_ABOVE";
}

function buildContents({ prompt, messages, images, audio, concise_image }){
  const mediaParts = (imgs, auds) => {
    const arr = [];
    if (Array.isArray(imgs)) {
      for (const img of imgs) {
        const { mime, data } = normalizeMedia(img);
        if (mime && data && ALLOWED_IMAGE.test(mime) && approxBase64Bytes(data) <= MAX_INLINE_BYTES) {
          arr.push({ inlineData: { mimeType: mime, data } });
          if (concise_image) arr.push({ text: String(concise_image).slice(0, 1000) });
        }
      }
    }
    if (Array.isArray(auds)) {
      for (const au of auds) {
        const { mime, data } = normalizeMedia(au);
        if (mime && data && ALLOWED_AUDIO.test(mime) && approxBase64Bytes(data) <= MAX_INLINE_BYTES) {
          arr.push({ inlineData: { mimeType: mime, data } });
        }
      }
    }
    return arr;
  };

  if (Array.isArray(messages) && messages.length) {
    return messages.map(m => {
      const parts = [];
      if (m?.content) parts.push({ text: String(m.content) });
      parts.push(...mediaParts(m.images, m.audio));
      return { role: (m?.role === "model" || m?.role === "user") ? m.role : "user", parts };
    }).filter(m => m.parts.length);
  }

  const parts = [];
  if (prompt) parts.push({ text: String(prompt) });
  parts.push(...mediaParts(images, audio));
  return [{ role: "user", parts }];
}

function normalizeMedia(m){
  if (!m) return {};
  if (typeof m === "string" && m.startsWith("data:")) return fromDataUrl(m);
  if (m.inlineData?.mimeType && m.inlineData?.data) return { mime: m.inlineData.mimeType, data: m.inlineData.data };
  if (m.inline_data?.mime_type && m.inline_data?.data) return { mime: m.inline_data.mime_type, data: m.inline_data.data };
  if (m.mime && m.data) return { mime: m.mime, data: m.data };
  return {};
}
function fromDataUrl(u){
  const i = u.indexOf(",");
  const meta = u.slice(5, i);
  const data = u.slice(i + 1);
  const semi = meta.indexOf(";");
  const mime = semi >= 0 ? meta.slice(0, semi) : meta;
  return { mime, data };
}
function approxBase64Bytes(b64){
  const len = b64.length - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
  return Math.floor(len * 0.75);
}

function buildUrl(model, stream, key){
  const base = "https://generativelanguage.googleapis.com/v1beta";
  const path = stream
    ? `/models/${encodeURIComponent(model)}:streamGenerateContent`
    : `/models/${encodeURIComponent(model)}:generateContent`;
  return `${base}${path}?key=${encodeURIComponent(key)}`;
}

async function callGemini(url, body, timeout_ms, include_raw){
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout_ms);

  try {
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal
        });
        const text = await r.text();

        if (r.ok) {
          clearTimeout(t);
          const parsed = safeJSON(text) || {};
          const candidate = parsed?.candidates?.[0];
          const out = {
            ok: true,
            text: candidate?.content?.parts?.map(p => p?.text || "").join("") || "",
            usage: parsed?.usageMetadata || undefined
          };
          if (include_raw) out.raw = parsed;
          return out;
        }

        // retry only on 429/5xx
        if ((r.status !== 429 && !(r.status >= 500 && r.status <= 599)) || attempt === MAX_TRIES) {
          clearTimeout(t);
          return { ok: false, error: "upstream_error", status: r.status, details: text.slice(0, 800) };
        }
        await backoff(attempt);
      } catch (e) {
        lastError = e;
        if (attempt === MAX_TRIES) {
          clearTimeout(t);
          return { ok: false, error: "network/timeout", status: 0, details: String(e?.message || e) };
        }
        await backoff(attempt);
      }
    }
    clearTimeout(t);
    return { ok: false, error: "unknown", status: 0, details: String(lastError) };
  } finally {
    clearTimeout(t);
  }
}

function safeJSON(s){ try { return JSON.parse(s); } catch { return null; } }
function backoff(attempt){
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * 400);
  return new Promise(r => setTimeout(r, base + jitter));
}
