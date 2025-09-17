// --- تم حذف: const fetch = require('node-fetch');  // Node 18 يوفر fetch مدمجاً

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

// --- 🎯 WhatsApp Notification Logic (يظل كما هو) ---
async function sendWhatsAppNotification(payload) {
  const WHATSAPP_SERVER_URL = 'https://2a46e0caeeaf.ngrok-free.app/send-notification';

  let content;
  try {
    if (payload?.prompt) {
      content = String(payload.prompt);
    } else if (Array.isArray(payload?.messages)) {
      content = payload.messages.map(m => m?.content || "").join("\n");
    } else {
      content = "Media content";
    }
  } catch {
    content = "New message";
  }

  const notificationMessage = `رسالة جديدة من المدرب الذكي:\n\n"${String(content).substring(0, 500)}..."`;

  fetch(WHATSAPP_SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: notificationMessage }),
  }).catch(error => console.error('WhatsApp notification failed:', error));
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

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: baseHeaders, body: "" };
  if (event.httpMethod !== "POST") return resp(405, baseHeaders, { error: "Method Not Allowed" });

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) return resp(500, baseHeaders, { error: "GEMINI_API_KEY is missing" });

  let payload;
  try { payload = JSON.parse(event.body || "{}"); }
  catch { return resp(400, baseHeaders, { error: "Invalid JSON" }); }

  // Trigger WhatsApp notification (fire-and-forget)
  sendWhatsAppNotification(payload);

  let {
    prompt, messages, images, audio, model = "auto", temperature = 0.6, top_p = 0.9,
    max_output_tokens = 2048, system, stream = false, timeout_ms = DEFAULT_TIMEOUT_MS,
    include_raw = false, force_lang, concise_image, guard_level = "strict"
  } = payload || {};

  // --- Sanitization
  temperature = clampNumber(temperature, SAFE_TEMP_RANGE[0], SAFE_TEMP_RANGE[1], 0.6);
  top_p = clampNumber(top_p, SAFE_TOPP_RANGE[0], SAFE_TOPP_RANGE[1], 0.9);
  max_output_tokens = clampNumber(max_output_tokens, 1, MAX_OUTPUT_TOKENS_HARD, 2048);
  timeout_ms = clampNumber(timeout_ms, 1000, 29000, DEFAULT_TIMEOUT_MS);

  if (!prompt && !Array.isArray(messages)) {
    return resp(400, baseHeaders, { error: "Missing prompt or messages[]" });
  }

  const contentPreview = textPreview(prompt || messages?.map(m=>m?.content||"").join("\n"));
  const lang = chooseLang(force_lang, contentPreview);
  const chosenModel = chooseModel(model);

  const contents = buildContents({ prompt, messages, images, audio, concise_image, lang });
  const systemInstruction = system ? { role: "user", parts: [{ text: String(system).slice(0, 8000) }] } : null;

  const generationConfig = {
    temperature,
    topP: top_p,
    maxOutputTokens: max_output_tokens,
    safetySettings: guardSettings(guard_level)
  };

  try {
    // حاول عبر مجموعة النماذج بالترتيب
    const candidates = chosenModel === "auto" ? MODEL_POOL : [chosenModel];

    for (let mi = 0; mi < candidates.length; mi++) {
      const m = candidates[mi];
      const url = makeUrl(m, false, API_KEY);
      const body = JSON.stringify({
        contents,
        generationConfig,
        ...(systemInstruction ? { systemInstruction } : {})
      });

      const jsonOnce = await tryJSONOnce(url, body, timeout_ms, include_raw);
      if (jsonOnce.ok) {
        return resp(200, baseHeaders, {
          text: mirrorLanguage(jsonOnce.text, lang),
          raw: include_raw ? jsonOnce.raw : undefined, model: m, lang,
          usage: jsonOnce.usage || undefined, requestId,
          t_ms: Date.now() - reqStart
        });
      }
    }

    return resp(502, baseHeaders, { error: "All model attempts failed", requestId });
  } catch (e) {
    return resp(500, baseHeaders, { error: "Server error", details: String(e?.message || e), requestId });
  }
};

// ---- Helpers (كما هي من نسختك، مع حواف أمان طفيفة) ----
function clampNumber(n, min, max, dflt) {
  const x = typeof n === "number" && isFinite(n) ? n : dflt;
  return Math.min(max, Math.max(min, x));
}

function textPreview(s) {
  const t = String(s || "").trim();
  return t.length > 220 ? t.slice(0, 220) + "…" : t;
}

function chooseLang(force_lang, preview) {
  if (force_lang === "ar" || force_lang === "en") return force_lang;
  // كشف بسيط: حروف عربية؟
  return /[\u0600-\u06FF]/.test(preview) ? "ar" : "en";
}

function mirrorLanguage(text, lang) {
  if (!text) return "";
  return String(text);
}

function chooseModel(model) {
  if (!model || model === "auto") return "auto";
  return model;
}

function guardSettings(level) {
  const strict = [
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  ];
  const medium = strict.map(s => ({ ...s, threshold: "BLOCK_ONLY_HIGH" }));
  return level === "lenient" ? [] : level === "medium" ? medium : strict;
}

function buildContents({ prompt, messages, images, audio, concise_image, lang }) {
  const parts = [];

  // messages
  if (Array.isArray(messages)) {
    for (const m of messages) {
      if (m?.content) parts.push({ text: String(m.content) });
      if (Array.isArray(m?.images)) {
        for (const img of m.images) {
          if (img?.mime && img?.data && ALLOWED_IMAGE.test(img.mime)) {
            parts.push({ inlineData: { mimeType: img.mime, data: img.data } });
          }
        }
      }
    }
  }

  // prompt
  if (prompt) parts.push({ text: String(prompt) });

  // images
  if (Array.isArray(images)) {
    for (const img of images) {
      if (img?.mime && img?.data && ALLOWED_IMAGE.test(img.mime)) {
        parts.push({ inlineData: { mimeType: img.mime, data: img.data } });
      }
    }
  }

  // audio
  if (Array.isArray(audio)) {
    for (const au of audio) {
      if (au?.mime && au?.data && ALLOWED_AUDIO.test(au.mime)) {
        parts.push({ inlineData: { mimeType: au.mime, data: au.data } });
      }
    }
  }

  return [{ role: "user", parts }];
}

function makeUrl(model, stream, API_KEY) {
  const base = "https://generativelanguage.googleapis.com/v1beta";
  const path = stream
    ? `/models/${encodeURIComponent(model)}:streamGenerateContent`
    : `/models/${encodeURIComponent(model)}:generateContent`;
  return `${base}${path}?key=${encodeURIComponent(API_KEY)}`;
}

async function tryJSONOnce(url, body, timeout_ms, include_raw) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout_ms);
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal });
    clearTimeout(t);

    const text = await r.text();
    if (!r.ok) {
      return { ok: false, error: "upstream_error", status: r.status, details: text.slice(0, 300) };
    }

    const parsed = safeParseJSON(text) || {};
    const candidate = parsed?.candidates?.[0];
    const out = {
      ok: true,
      text: candidate?.content?.parts?.map(p => p?.text || "").join("") || "",
      usage: parsed?.usageMetadata || undefined
    };
    if (include_raw) out.raw = parsed;
    return out;
  } catch (e) {
    return { ok: false, error: "network/timeout", details: String(e?.message || e) };
  }
}

function safeParseJSON(s) { try { return JSON.parse(s); } catch { return null; } }
