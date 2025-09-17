// For Netlify Functions environment, explicitly require node-fetch
const MAX_TRIES = 3;
const BASE_BACKOFF_MS = 600;
const MAX_OUTPUT_TOKENS_HARD = 8192;
const DEFAULT_TIMEOUT_MS = 26000;
const SAFE_TEMP_RANGE = [0.0, 1.0];
const SAFE_TOPP_RANGE = [0.0, 1.0];
const MAX_INLINE_BYTES = 15 * 1024 * 1024;
const ALLOWED_IMAGE = /^image\/(png|jpe?g|webp|gif|bmp|svg\+xml)$/i;
const ALLOWED_AUDIO = /^audio\/(webm|ogg|mp3|mpeg|wav|m4a|aac|3gpp|3gpp2|mp4)$/i;
const MODEL_POOL = [
  "gemini-1.5-flash-latest",
  "gemini-1.5-pro-latest"
];

if (!globalThis.fetch) { throw new Error('Fetch API not available in this runtime'); }

// --- 🎯 WhatsApp Notification Logic (يبقى كما هو) ---
async function sendWhatsAppNotification(payload) {
  const WHATSAPP_SERVER_URL = 'https://2a46e0caeeaf.ngrok-free.app/send-notification';

  let content;
  try {
    if (payload?.prompt) {
      content = String(payload.prompt);
    } else if (Array.isArray(payload?.messages)) {
      content = payload.messages.map(m => m?.content || "").join("\n");
    } else if (Array.isArray(payload?.images) || Array.isArray(payload?.audio)) {
      content = "Media content";
    } else {
      content = "New message";
    }
  } catch {
    content = "New message";
  }

  const preview = (s) => {
    try {
      const t = String(s || "");
      return t.length > 500 ? t.slice(0, 500) + "…" : t;
    } catch { return "New message"; }
  };

  const notificationMessage = `رسالة جديدة من المدرب الذكي:\n\n"${preview(content)}"`;

  // fire-and-forget; لا تفشل الطلب الرئيسي
  fetch(WHATSAPP_SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: notificationMessage }),
  }).catch(error => console.error('WhatsApp notification failed:', (error && error.message) ? error.message : error));
}
// --- End of Notification Logic ---

exports.handler = async (event) => {
  const reqStart = Date.now();
  const requestId = (Math.random().toString(36).slice(2) + Date.now().toString(36)).toUpperCase();

  const baseHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Request-ID",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "X-Request-ID": requestId
  };
  const resp = (code, headers, body) => ({ statusCode: code, headers, body: JSON.stringify(body) });

  // CORS preflight
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: baseHeaders, body: "" };
  if (event.httpMethod !== "POST") return resp(405, baseHeaders, { error: "Method Not Allowed" });

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) return resp(500, baseHeaders, { error: "Server misconfiguration: GEMINI_API_KEY is missing in environment." });

  let payload;
  try { payload = JSON.parse(event.body || "{}"); }
  catch { return resp(400, baseHeaders, { error: "Invalid JSON payload" }); }

  // إشعار واتساب (غير حاجب للتنفيذ)
  sendWhatsAppNotification(payload);

  let {
    prompt, messages, images, audio,
    model = "auto",
    temperature = 0.6,
    top_p = 0.9,
    max_output_tokens = 2048,
    system,
    stream = false,
    timeout_ms = DEFAULT_TIMEOUT_MS,
    include_raw = false,
    force_lang,
    concise_image,
    guard_level = "strict"
  } = payload || {};

  // Sanitization
  temperature = clampNumber(temperature, SAFE_TEMP_RANGE[0], SAFE_TEMP_RANGE[1], 0.6);
  top_p = clampNumber(top_p, SAFE_TOPP_RANGE[0], SAFE_TOPP_RANGE[1], 0.9);
  max_output_tokens = clampNumber(max_output_tokens, 1, MAX_OUTPUT_TOKENS_HARD, 2048);
  timeout_ms = clampNumber(timeout_ms, 1000, 29000, DEFAULT_TIMEOUT_MS);

  if (!prompt && !Array.isArray(messages)) {
    return resp(400, baseHeaders, { error: "Missing prompt or messages[]" });
  }

  const lang = chooseLang(force_lang, textPreview(prompt || messages?.map(m=>m?.content||"").join("\n")));
  const chosenModel = chooseModel(model);

  const guard = buildGuardrails({ lang, useImageBrief: !!concise_image, level: guard_level });
  const contents = buildContents({ prompt, messages, images, audio, guard, lang, concise_image });

  const generationConfig = {
    temperature,
    topP: top_p,
    maxOutputTokens: max_output_tokens,
    safetySettings: safety(levelToThreshold(guard_level))
  };

  try {
    const candidates = (chosenModel === "auto") ? MODEL_POOL : [chosenModel];

    for (let i = 0; i < candidates.length; i++) {
      const m = candidates[i];
      const url = buildUrl(m, false, API_KEY);
      const body = JSON.stringify({
        contents,
        generationConfig,
        systemInstruction: { role: "user", parts: [{ text: guard }] }
      });

      const out = await tryJSONOnce(url, body, timeout_ms, include_raw);
      if (out.ok) {
        return resp(200, baseHeaders, {
          text: mirrorLanguage(out.text, lang),
          raw: include_raw ? out.raw : undefined,
          model: m,
          lang,
          usage: out.usage || undefined,
          requestId,
          t_ms: Date.now() - reqStart
        });
      }
      // retry on allowed statuses handled inside tryJSONOnce
    }
    return resp(502, baseHeaders, { error: "All upstream attempts failed", requestId });
  } catch (e) {
    return resp(500, baseHeaders, { error: "Server error", details: String(e && e.message || e), requestId });
  }
};

// -------- Helpers --------
function clampNumber(n, min, max, dflt) {
  const x = typeof n === "number" && isFinite(n) ? n : dflt;
  return Math.min(max, Math.max(min, x));
}

function chooseLang(force, preview) {
  if (force === "ar" || force === "en") return force;
  return /[\u0600-\u06FF]/.test(preview || "") ? "ar" : "en";
}

function mirrorLanguage(text, lang){
  if(!text) return text;
  if(lang === "ar") return text;
  return text;
}

function levelToThreshold(level){
  const map = {
    strict: "BLOCK_MEDIUM_AND_ABOVE",
    medium: "BLOCK_ONLY_HIGH",
    lenient: "OFF"
  };
  return map[level] || map.strict;
}

function safety(threshold){
  const cats = [
    "HARM_CATEGORY_HATE_SPEECH",
    "HARM_CATEGORY_DANGEROUS_CONTENT",
    "HARM_CATEGORY_HARASSMENT",
    "HARM_CATEGORY_SEXUALLY_EXPLICIT"
  ];
  return cats.map(c => ({ category: c, threshold }));
}

function buildGuardrails({ lang, useImageBrief, level }){
  const L = {
    strict: [
      "- ممنوع أي محتوى مسيء/جنسي/خطير.",
      "- التزم بالاختصار والوضوح.",
      "- إذا كان الطلب غير واضح: اسأل سؤالًا واحدًا محددًا فقط."
    ],
    strict_en: [
      "- No hateful/sexual/dangerous content.",
      "- Be concise and clear.",
      "- If unclear, ask exactly one clarifying question."
    ]
  };
  const ar = lang === "ar";
  const lines = [
    ar ? "**قيود السلامة**" : "**Safety Guardrails**",
    ...(ar ? L.strict : L.strict_en),
    useImageBrief ? (ar ? "- لخلاصات الصور: صف المضمون بدقة وباختصار." : "- For image briefs: be precise and concise.") : null,
    ar ? `- مستوى الحجب: ${level}.` : `- Blocking level: ${level}.`
  ].filter(Boolean);
  return lines.join("\n");
}

function wrapPrompt(prompt, guard){
  return `Concise guardrails (follow strictly):\n${guard}\n\n---\n${prompt || ""}`;
}

function textPreview(s){
  if(!s) return "";
  return (s || "").slice(0, 6000);
}

function buildContents({ prompt, messages, images, audio, guard, lang, concise_image }){
  const parts = [];
  // messages (with possible media)
  if (Array.isArray(messages) && messages.length){
    const normalized = normalizeMessagesWithMedia(messages, guard, lang);
    return normalized;
  }
  // prompt + media
  if (prompt) parts.push({ text: wrapPrompt(prompt, guard) });
  parts.push(...coerceMediaParts(images, audio, concise_image));
  return [{ role: "user", parts }];
}

function normalizeMessagesWithMedia(messages, guard, lang){
  return messages.map(m => {
    const parts = [];
    if (m?.content) parts.push({ text: wrapPrompt(m.content, guard) });
    if (Array.isArray(m?.images) || Array.isArray(m?.audio)) {
      parts.push(...coerceMediaParts(m.images, m.audio));
    }
    return { role: safeRole(m.role), parts };
  }).filter(m => m.parts.length);
}

function safeRole(role){
  return (role === "user" || role === "model") ? role : "user";
}

function coerceMediaParts(images, audio, concise_image){
  const parts = [];
  // images
  if (Array.isArray(images)) {
    for (const img of images){
      const { mime, data, inline_data } = normalizeMedia(img);
      if (mime && data && ALLOWED_IMAGE.test(mime) && approxBase64Bytes(data) <= MAX_INLINE_BYTES){
        parts.push({ inlineData: { mimeType: mime, data } });
        if (concise_image) parts.push({ text: String(concise_image).slice(0, 1000) });
      }
    }
  }
  // audio
  if (Array.isArray(audio)) {
    for (const au of audio){
      const { mime, data } = normalizeMedia(au);
      if (mime && data && ALLOWED_AUDIO.test(mime) && approxBase64Bytes(data) <= MAX_INLINE_BYTES){
        parts.push({ inlineData: { mimeType: mime, data } });
      }
    }
  }
  return parts;
}

function normalizeMedia(m){
  if (!m) return {};
  if (m.inlineData && m.inlineData.mimeType && m.inlineData.data) return { mime: m.inlineData.mimeType, data: m.inlineData.data };
  if (m.inline_data && m.inline_data.mime_type && m.inline_data.data) return { mime: m.inline_data.mime_type, data: m.inline_data.data };
  if (m.mime && m.data) return { mime: m.mime, data: m.data };
  if (typeof m === "string" && m.startsWith("data:")) return fromDataUrl(m);
  return {};
}

function fromDataUrl(dataUrl){
  const comma = dataUrl.indexOf(',');
  const meta = dataUrl.slice(5, comma);
  const data = dataUrl.slice(comma + 1);
  const semi = meta.indexOf(';');
  const mime = semi >= 0 ? meta.slice(0, semi) : meta;
  return { mime, data };
}

function approxBase64Bytes(b64){
  const len = b64.length - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  return Math.floor(len * 0.75);
}

function chooseModel(model){
  if (!model || model === "auto") return "auto";
  return model;
}

function buildUrl(model, stream, API_KEY){
  const base = "https://generativelanguage.googleapis.com/v1beta";
  const path = stream
    ? `/models/${encodeURIComponent(model)}:streamGenerateContent`
    : `/models/${encodeURIComponent(model)}:generateContent`;
  return `${base}${path}?key=${encodeURIComponent(API_KEY)}`;
}

function levelIsLenient(level){ return String(level || "").toLowerCase() === "lenient"; }

async function tryJSONOnce(url, body, timeout_ms, include_raw){
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout_ms);
  try {
    let lastErr = null;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++){
      try {
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal });
        const text = await r.text();
        if (r.ok) {
          clearTimeout(t);
          const parsed = safeParseJSON(text) || {};
          const candidate = parsed?.candidates?.[0];
          const out = {
            ok: true,
            text: candidate?.content?.parts?.map(p => p?.text || "").join("") || "",
            usage: parsed?.usageMetadata || undefined
          };
          if (include_raw) out.raw = parsed;
          return out;
        }
        if (!shouldRetry(r.status) || attempt === MAX_TRIES) {
          clearTimeout(t);
          return { ok: false, error: "upstream_error", status: mapStatus(r.status), details: text.slice(0, 400) };
        }
        await sleepWithJitter(attempt);
      } catch (e) {
        lastErr = e;
        if (attempt === MAX_TRIES) { throw e; }
        await sleepWithJitter(attempt);
      }
    }
    clearTimeout(t);
    return { ok: false, error: "network/timeout", details: String(lastErr && lastErr.message || lastErr) };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, error: "network/timeout", details: String(e && e.message || e) };
  }
}

function shouldRetry(status){
  return status === 429 || (status >= 500 && status <= 599);
}

function mapStatus(status){
  if (status === 429) return 429;
  if (status >= 500) return 502;
  return status || 500;
}

async function sleepWithJitter(attempt){
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * 400);
  await new Promise(r => setTimeout(r, base + jitter));
}

function safeParseJSON(s){ try { return JSON.parse(s); } catch { return null; } }
