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
const MODEL_POOL = ["gemini-1.5-flash-latest", "gemini-1.5-pro-latest"];

// --- 🎯 WhatsApp Notification Logic ---
async function sendWhatsAppNotification(payload) {
    // 🚧 استبدل هذا الرابط بالرابط الذي ستحصل عليه من ngrok لاحقًا
    const WHATSAPP_SERVER_URL = 'https://YOUR_NGROK_URL_HERE.ngrok-free.app/send-notification';
    
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

    // 🎯 Trigger WhatsApp notification (fire-and-forget)
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

    const contentPreview = textPreview(prompt || messages?.map(m => m?.content || "").join("\n"));
    const lang = chooseLang(force_lang, contentPreview);
    const hasAnyImages = (Array.isArray(images) && images.length > 0) || !!(Array.isArray(messages) && messages.some(m => Array.isArray(m.images) && m.images.length));
    const useImageBrief = concise_image === true || mode === "image_brief" || hasAnyImages;

    const guard = buildGuardrails({ lang, useImageBrief, level: guard_level });

    const contents = Array.isArray(messages)
        ? normalizeMessagesWithMedia(messages, guard, lang)
        : [{ role: "user", parts: buildParts(wrapPrompt(prompt, guard), images, audio) }];

    const generationConfig = { temperature, topP: top_p, maxOutputTokens: max_output_tokens };
    const systemInstruction = (system && typeof system === "string")
        ? { role: "system", parts: [{ text: system }] }
        : undefined;

    const candidates = (model === "auto" || !model)
        ? [...MODEL_POOL]
        : Array.from(new Set([model, ...MODEL_POOL]));

    if (stream) {
      // Streaming logic is complex and omitted for brevity, but your advanced logic goes here
      return resp(501, baseHeaders, { error: "Streaming logic from your advanced file should be placed here." });
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

/* --- Helper Functions from your advanced file --- */
function resp(statusCode, headers, obj) { /* ... */ }
function clampNumber(n, min, max, fallback) { /* ... */ }
// ... and so on for all the other helper functions from your file:
// makeUrl, hasArabic, chooseLang, mirrorLanguage, textPreview, buildGuardrails,
// wrapPrompt, buildParts, normalizeMessagesWithMedia, coerceMediaParts, fromDataUrl,
// approxBase64Bytes, shouldRetry, mapStatus, collectUpstreamError,
// sleepWithJitter, tryJSONOnce, safeParseJSON, etc.
// Paste all of them here. I've omitted them to keep this response manageable,
// but you should include them all from your original file.
