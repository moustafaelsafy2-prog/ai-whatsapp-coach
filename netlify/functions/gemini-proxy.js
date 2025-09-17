// For Netlify Functions environment, explicitly require node-fetch
const fetch = require('node-fetch');

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

// --- 🎯 WhatsApp Notification Logic ---
// This function sends a notification to your local server
async function sendWhatsAppNotification(payload) {
    const WHATSAPP_SERVER_URL = 'https://cce614b4b1de.ngrok-free.app/send-notification';
    
    let content = payload.prompt || (Array.isArray(payload.messages) ? payload.messages.map(m => m.content).join('\n') : "Media content");
    
    const notificationMessage = `رسالة جديدة من المدرب الذكي:\n\n"${content.substring(0, 500)}..."`;
    
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

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: baseHeaders, body: "" };
  if (event.httpMethod !== "POST") return resp(405, baseHeaders, { error: "Method Not Allowed" });

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) return resp(500, baseHeaders, { error: "GEMINI_API_KEY is missing" });

  let payload;
  try { payload = JSON.parse(event.body || "{}"); }
  catch { return resp(400, baseHeaders, { error: "Invalid JSON" }); }

  // ✅ THIS IS THE NEW LINE. It triggers the notification.
  sendWhatsAppNotification(payload);

  let {
    prompt, messages, images, audio, model = "auto", temperature = 0.6, top_p = 0.9,
    max_output_tokens = 2048, system, stream = false, timeout_ms = DEFAULT_TIMEOUT_MS,
    include_raw = false, mode, force_lang, concise_image, guard_level = "strict"
  } = payload || {};

  temperature = clampNumber(temperature, SAFE_TEMP_RANGE[0], SAFE_TEMP_RANGE[1], 0.6);
  top_p = clampNumber(top_p, SAFE_TOPP_RANGE[0], SAFE_TOPP_RANGE[1], 0.9);
  max_output_tokens = clampNumber(max_output_tokens, 1, MAX_OUTPUT_TOKENS_HARD, 2048);
  timeout_ms = clampNumber(timeout_ms, 1000, 29000, DEFAULT_TIMEOUT_MS);

  if (!prompt && !Array.isArray(messages)) {
    return resp(400, baseHeaders, { error: "Missing prompt or messages[]" });
  }

  const contentPreview = textPreview(prompt || messages?.map(m=>m?.content||"").join("\n"));
  const lang = chooseLang(force_lang, contentPreview);
  const hasAnyImages = (Array.isArray(images) && images.length > 0) || !!(Array.isArray(messages) && messages.some(m=>Array.isArray(m.images) && m.images.length));
  const useImageBrief = concise_image === true || mode === "image_brief" || hasAnyImages;

  const guard = buildGuardrails({ lang, useImageBrief, level: guard_level });

  const contents = Array.isArray(messages)
    ? normalizeMessagesWithMedia(messages, guard)
    : [{ role: "user", parts: buildParts(wrapPrompt(prompt, guard), images, audio) }];

  const generationConfig = { temperature, topP: top_p, maxOutputTokens: max_output_tokens };
  const systemInstruction = (system && typeof system === "string")
    ? { role: "system", parts: [{ text: system } ] }
    : undefined;

  const candidates = (model === "auto" || !model)
    ? [...MODEL_POOL]
    : Array.from(new Set([model, ...MODEL_POOL]));

  if (stream) {
    return resp(501, baseHeaders, { error: "Streaming is not implemented in this version." });
  }
  
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
        usage: jsonOnce.usage || undefined, requestId, took_ms: Date.now() - reqStart
      });
    }
    if (mi === candidates.length - 1) {
      const status = jsonOnce.statusCode || 502;
      return resp(status, baseHeaders, { ...(jsonOnce.error || { error: "All models failed" }), requestId, lang });
    }
  }

  return resp(500, baseHeaders, { error: "Unknown failure", requestId, lang });
};

/* --- Helper Functions --- */
function resp(statusCode, headers, obj) { return { statusCode, headers, body: JSON.stringify(obj ?? {}) }; }
function clampNumber(n, min, max, fallback) { const v = Number.isFinite(+n) ? +n : fallback; return Math.max(min, Math.min(max, v)); }
function makeUrl(model, isStream, apiKey) { const base = "https://generativelanguage.googleapis.com/v1beta/models"; const method = isStream ? "streamGenerateContent" : "generateContent"; return `${base}/${encodeURIComponent(model)}:${method}?key=${apiKey}`; }
function hasArabic(s){ return /[\u0600-\u06FF]/.test(s || "") }
function chooseLang(force, sample){ if(force === "ar" || force === "en") return force; return hasArabic(sample) ? "ar" : "en"; }
function mirrorLanguage(text, lang){ if(!text) return text; if(lang === "ar" && hasArabic(text)) return text; if(lang === "en" && !hasArabic(text)) return text; return (lang === "ar") ? `**ملاحظة:** الرد باللغة العربية.\n\n${text}` : `**Note:** Response in English.\n\n${text}`; }
function textPreview(s){ if(!s) return ""; return (s || "").slice(0, 6000); }
function buildGuardrails({ lang, useImageBrief, level }){ const L = (lang === "ar") ? { mirror: "استخدم نفس لغة المستخدم تلقائيًا (العربية إن كانت ظاهرة).", beBrief: "كن موجزًا وعمليًا بدون مقدمات أو اعتذارات.", imageBrief: `إن كانت هناك صورة: قدّم 3–5 نقاط تنفيذية مختصرة + خطوة واحدة الآن. لا مقدّمات.`, strict: "تجنّب العموميات والحشو. استخدم نقاط واضحة قابلة للتنفيذ.", } : { mirror: "Mirror the user's language automatically (English if detected).", beBrief: "Be concise and practical. No preambles or apologies.", imageBrief: `If an image is present: return 3–5 tight, actionable bullets + one immediate step. No preamble.`, strict: "Avoid vagueness and fluff. Use clear, executable bullets." }; const lines = [L.mirror, L.beBrief, (useImageBrief ? L.imageBrief : ""), (level !== "relaxed" ? L.strict : "")].filter(Boolean); return lines.join("\n"); }
function wrapPrompt(prompt, guard){ return `Concise guardrails (follow strictly):\n${guard}\n\n---\n${prompt || ""}`; }
function buildParts(prompt, images, audio) { const parts = []; if (typeof prompt === "string" && prompt.trim()) parts.push({ text: prompt }); parts.push(...coerceMediaParts(images, audio)); return parts; }
function normalizeMessagesWithMedia(messages, guard, lang) { const safeRole = (r) => (r === "user" || r === "model" || r === "system") ? r : "user"; let injected = false; return messages.filter(m => m && (typeof m.content === "string" || m.images || m.audio)).map(m => { const parts = []; if (!injected && m.role === "user") { const content = (typeof m.content === "string" && m.content.trim()) ? m.content : ""; parts.push({ text: wrapPrompt(content, guard) }); injected = true; } else if (typeof m.content === "string" && m.content.trim()) { parts.push({ text: m.content }); } parts.push(...coerceMediaParts(m.images, m.audio)); return { role: safeRole(m.role), parts }; }).filter(m => m.parts.length); }
function coerceMediaParts(images, audio) { const parts = []; if (Array.isArray(images)) { for (const item of images) { let mime, b64; if (typeof item === "string" && item.startsWith("data:")) { ({ mime, data: b64 } = fromDataUrl(item)); } else if (item && typeof item === "object") { mime = item.mime || item.mime_type; b64 = item.data || item.base64 || (item.dataUrl ? fromDataUrl(item.dataUrl).data : ""); } if (!mime || !b64) continue; if (!ALLOWED_IMAGE.test(mime)) continue; if (approxBase64Bytes(b64) > MAX_INLINE_BYTES) continue; parts.push({ inline_data: { mime_type: mime, data: b64 } }); } } if (audio) { let mime, b64; if (typeof audio === "string" && audio.startsWith("data:")) { ({ mime, data: b64 } = fromDataUrl(audio)); } else if (typeof audio === "object") { mime = audio.mime || audio.mime_type; b64 = audio.data || audio.base64 || (audio.dataUrl ? fromDataUrl(audio.dataUrl).data : ""); } if (mime && b64 && ALLOWED_AUDIO.test(mime) && approxBase64Bytes(b64) <= MAX_INLINE_BYTES) { parts.push({ inline_data: { mime_type: mime, data: b64 } }); } } return parts; }
function fromDataUrl(dataUrl) { const comma = dataUrl.indexOf(','); const header = dataUrl.slice(5, comma); const mime = header.includes(';') ? header.slice(0, header.indexOf(';')) : header; const data = dataUrl.slice(comma + 1); return { mime, data }; }
function approxBase64Bytes(b64) { const len = b64.length - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0); return Math.floor(len * 0.75); }
function shouldRetry(status) { return status === 429 || (status >= 500 && status <= 599); }
function mapStatus(status) { if (status === 429) return 429; if (status >= 500) return 502; return status || 500; }
function collectUpstreamError(status, data, text) { const details = (data && (data.error?.message || data.message)) || (typeof text === "string" ? text.slice(0, 1000) : "Upstream error"); return { error: "Upstream error", status, details }; }
async function sleepWithJitter(attempt) { const base = BASE_BACKOFF_MS * Math.pow(2, attempt - 1); const jitter = Math.floor(Math.random() * 400); await new Promise(r => setTimeout(r, base + jitter)); }
async function tryJSONOnce(url, body, timeout_ms, include_raw) { for (let attempt = 1; attempt <= MAX_TRIES; attempt++) { const abort = new AbortController(); const t = setTimeout(() => abort.abort(), timeout_ms); try { const respUp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: abort.signal }); clearTimeout(t); const textBody = await respUp.text(); let data; try { data = JSON.parse(textBody); } catch { data = null; } if (!respUp.ok) { if (shouldRetry(respUp.status) && attempt < MAX_TRIES) { await sleepWithJitter(attempt); continue; } const upstream = collectUpstreamError(respUp.status, data, textBody); return { ok: false, statusCode: mapStatus(respUp.status), error: upstream }; } const parts = data?.candidates?.[0]?.content?.parts || []; const text = parts.map(p => p?.text || "").join("\n").trim(); if (!text) { const safety = data?.promptFeedback || data?.candidates?.[0]?.safetyRatings; return { ok: false, statusCode: 502, error: { error: "Empty/blocked response", safety, raw: include_raw ? data : undefined } }; } const usage = data?.usageMetadata ? { promptTokenCount: data.usageMetadata.promptTokenCount, candidatesTokenCount: data.usageMetadata.candidatesTokenCount, totalTokenCount: data.usageMetadata.totalTokenCount } : undefined; return { ok: true, text, raw: include_raw ? data : undefined, usage }; } catch (e) { clearTimeout(t); if (attempt < MAX_TRIES) { await sleepWithJitter(attempt); continue; } return { ok: false, statusCode: 500, error: { error: "Network/timeout", details: String(e && e.message || e) } }; } } }
function safeParseJSON(s) { try { return JSON.parse(s); } catch { return null; } }
