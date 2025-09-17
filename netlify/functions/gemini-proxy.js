// netlify/functions/generate (gemini-proxy.js) — Node 18+

// ================ الإعدادات العامة ================
const MODEL_POOL = ["gemini-1.5-flash-latest", "gemini-1.5-pro-latest"];
const DEFAULT_TIMEOUT_MS = 26000;
const MAX_TRIES = 3;
const BASE_BACKOFF_MS = 600;

const MAX_INLINE_BYTES = 15 * 1024 * 1024;
const ALLOWED_IMAGE = /^image\/(png|jpe?g|webp|gif|bmp|svg\+xml)$/i;
const ALLOWED_AUDIO = /^audio\/(webm|ogg|mp3|mpeg|wav|m4a|aac|3gpp|3gpp2|mp4)$/i;

if (!globalThis.fetch) throw new Error("Fetch API not available");

// ================ أدوات مساعدة ================
const clamp = (n, min, max, dflt) =>
  Math.min(max, Math.max(min, typeof n === "number" && isFinite(n) ? n : dflt));

const safeJSON = (s) => { try { return JSON.parse(s); } catch { return null; } };

const backoff = (attempt) =>
  new Promise((r) =>
    setTimeout(r, BASE_BACKOFF_MS * Math.pow(2, attempt - 1) + Math.random() * 400)
  );

const approxBase64Bytes = (b64 = "") => {
  const len = b64.length - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
  return Math.floor(len * 0.75);
};

const fromDataUrl = (u = "") => {
  const i = u.indexOf(",");
  if (i < 0) return {};
  const meta = u.slice(5, i);
  const data = u.slice(i + 1);
  const semi = meta.indexOf(";");
  const mime = semi >= 0 ? meta.slice(0, semi) : meta;
  return { mime, data };
};

function normalizeMedia(m) {
  if (!m) return {};
  if (typeof m === "string" && m.startsWith("data:")) return fromDataUrl(m);
  if (m.inlineData?.mimeType && m.inlineData?.data)
    return { mime: m.inlineData.mimeType, data: m.inlineData.data };
  if (m.inline_data?.mime_type && m.inline_data?.data)
    return { mime: m.inline_data.mime_type, data: m.inline_data.data };
  if (m.mime && m.data) return { mime: m.mime, data: m.data };
  return {};
}

function buildUrl(model, stream, key) {
  const base = "https://generativelanguage.googleapis.com/v1beta";
  const path = stream
    ? `/models/${encodeURIComponent(model)}:streamGenerateContent`
    : `/models/${encodeURIComponent(model)}:generateContent`;
  return `${base}${path}?key=${encodeURIComponent(key)}`;
}

function buildContents({ prompt, messages, images, audio, concise_image }) {
  const mediaParts = (imgs, auds) => {
    const arr = [];
    if (Array.isArray(imgs)) {
      for (const img of imgs) {
        const { mime, data } = normalizeMedia(img);
        if (
          mime &&
          data &&
          ALLOWED_IMAGE.test(mime) &&
          approxBase64Bytes(data) <= MAX_INLINE_BYTES
        ) {
          arr.push({ inlineData: { mimeType: mime, data } });
          if (concise_image) arr.push({ text: String(concise_image).slice(0, 1000) });
        }
      }
    }
    if (Array.isArray(auds)) {
      for (const au of auds) {
        const { mime, data } = normalizeMedia(au);
        if (
          mime &&
          data &&
          ALLOWED_AUDIO.test(mime) &&
          approxBase64Bytes(data) <= MAX_INLINE_BYTES
        ) {
          arr.push({ inlineData: { mimeType: mime, data } });
        }
      }
    }
    return arr;
  };

  if (Array.isArray(messages) && messages.length) {
    return messages
      .map((m) => {
        const parts = [];
        if (m?.content) parts.push({ text: String(m.content) });
        parts.push(...mediaParts(m.images, m.audio));
        return {
          role: m?.role === "model" || m?.role === "user" ? m.role : "user",
          parts,
        };
      })
      .filter((m) => m.parts.length);
  }

  const parts = [];
  if (prompt) parts.push({ text: String(prompt) });
  parts.push(...mediaParts(images, audio));
  return [{ role: "user", parts }];
}

function buildSafety(threshold) {
  const cats = [
    "HARM_CATEGORY_HATE_SPEECH",
    "HARM_CATEGORY_DANGEROUS_CONTENT",
    "HARM_CATEGORY_HARASSMENT",
    "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  ];
  return cats.map((c) => ({ category: c, threshold }));
}

function toThreshold(level) {
  const x = String(level || "").toLowerCase();
  if (x === "lenient") return "OFF";
  if (x === "medium") return "BLOCK_ONLY_HIGH";
  return "BLOCK_MEDIUM_AND_ABOVE";
}

// ================ إشعارات واتساب (كل رسالة منفصلة) ================
async function notifyWhatsApp({ type, text }) {
  const url = process.env.WHATSAPP_WEBHOOK_URL;
  const token = process.env.WHATSAPP_TOKEN || "";
  if (!url || !text) return;

  const prefix =
    type === "user" ? "📝 رسالة جديدة من العميل:" : "🤖 رد المدرب الذكي:";
  const message = `${prefix}\n\n${String(text).trim().slice(0, 4000)}`;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message }),
    });
  } catch (e) {
    console.error("WhatsApp notify failed:", e?.message || e);
  }
}

// ================ نداء Gemini ================
async function callGemini({ model, key, body, timeout_ms }) {
  const url = buildUrl(model, false, key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout_ms);

  try {
    let lastErr = null;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });
        const text = await r.text();

        if (r.ok) {
          const parsed = safeJSON(text) || {};
          const candidate = parsed?.candidates?.[0];
          return {
            ok: true,
            text: candidate?.content?.parts?.map((p) => p?.text || "").join("") || "",
            usage: parsed?.usageMetadata,
            raw: parsed,
          };
        }

        if ((r.status !== 429 && !(r.status >= 500 && r.status <= 599)) || attempt === MAX_TRIES) {
          return { ok: false, status: r.status, details: text.slice(0, 800) };
        }
        await backoff(attempt);
      } catch (e) {
        lastErr = e;
        if (attempt === MAX_TRIES) {
          return { ok: false, status: 0, details: String(e?.message || e) };
        }
        await backoff(attempt);
      }
    }
    return { ok: false, status: 0, details: String(lastErr) };
  } finally {
    clearTimeout(timer);
  }
}

// ================ الـ Handler الرئيسي ================
exports.handler = async (event) => {
  const requestId =
    (Math.random().toString(36).slice(2) + Date.now().toString(36)).toUpperCase();

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Request-ID",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "X-Request-ID": requestId,
  };
  const respond = (code, body) => ({
    statusCode: code,
    headers,
    body: JSON.stringify(body),
  });

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return respond(405, { error: "Method Not Allowed" });

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) return respond(500, { error: "GEMINI_API_KEY missing", requestId });

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return respond(400, { error: "Invalid JSON payload", requestId });
  }

  // ====== استخراج نص رسالة العميل (لإرسال إشعار أول) ======
  const userMsg =
    payload.prompt ||
    (Array.isArray(payload.messages)
      ? payload.messages
          .filter((m) => (m.role === "user" || m.role === "model" ? m.role === "user" : true))
          .map((m) => m?.content || "")
          .join("\n")
      : "") ||
    "";

  // أرسل إشعار رسالة العميل بشكل منفصل
  if (userMsg.trim()) {
    await notifyWhatsApp({ type: "user", text: userMsg });
  }

  // ====== إعداد استدعاء Gemini ======
  let {
    prompt,
    messages,
    images,
    audio,
    model = "auto",
    temperature = 0.6,
    top_p = 0.9,
    max_output_tokens = 2048,
    system,                 // يُستخدم كـ systemInstruction (اختياري)
    timeout_ms = DEFAULT_TIMEOUT_MS,
    guard_level = "strict",
    concise_image = true,
    include_raw = false,
  } = payload;

  temperature = clamp(temperature, 0, 1, 0.6);
  top_p = clamp(top_p, 0, 1, 0.9);
  max_output_tokens = clamp(max_output_tokens, 1, 8192, 2048);
  timeout_ms = clamp(timeout_ms, 1000, 29000, DEFAULT_TIMEOUT_MS);

  if (!prompt && !Array.isArray(messages)) {
    return respond(400, { error: "Missing prompt or messages[]", requestId });
  }

  const generationConfig = { temperature, topP: top_p, maxOutputTokens: max_output_tokens };
  const safetySettings = buildSafety(toThreshold(guard_level));
  const contents = buildContents({ prompt, messages, images, audio, concise_image });

  const systemInstruction = system
    ? { parts: [{ text: String(system).slice(0, 8000) }] }
    : undefined;

  const candidates = model === "auto" ? MODEL_POOL : [model];
  let lastErr = null;

  for (const m of candidates) {
    const body = JSON.stringify({ contents, generationConfig, safetySettings, systemInstruction });
    const out = await callGemini({ model: m, key: API_KEY, body, timeout_ms });

    if (out.ok) {
      // أرسل إشعار ردّ الذكاء الاصطناعي بشكل منفصل
      if (out.text?.trim()) {
        await notifyWhatsApp({ type: "assistant", text: out.text });
      }

      return respond(200, {
        text: out.text,
        raw: include_raw ? out.raw : undefined,
        model: m,
        usage: out.usage || undefined,
        requestId,
      });
    }
    lastErr = out;
  }

  return respond(502, {
    error: "Upstream call failed",
    status: lastErr?.status || 502,
    details: lastErr?.details || "unknown",
    requestId,
  });
};
