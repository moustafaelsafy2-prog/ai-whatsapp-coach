// For Netlify Functions environment, explicitly require node-fetch
const fetch = require('node-fetch');

const MAX_TRIES = 3;
const BASE_BACKOFF_MS = 600;
const MAX_OUTPUT_TOKENS_HARD = 8192;
const DEFAULT_TIMEOUT_MS = 26000;
const MODEL_POOL = ["gemini-1.5-flash-latest", "gemini-1.5-pro-latest"];

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ error: "GEMINI_API_KEY is missing" }) };
    }

    try {
        const payload = JSON.parse(event.body || "{}");
        
        const { messages, system } = payload;
        if (!Array.isArray(messages)) {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing messages[]" }) };
        }

        const contents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        const systemInstruction = system ? { role: "system", parts: [{ text: system }] } : undefined;
        
        const modelToUse = MODEL_POOL[0];
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${API_KEY}`;
        
        const body = JSON.stringify({
            contents,
            ...(systemInstruction && { systemInstruction })
        });

        const apiResponse = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: body,
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            console.error("Google API Error:", errorText);
            return { statusCode: apiResponse.status, body: JSON.stringify({ error: "Failed to get response from Google AI", details: errorText }) };
        }

        const responseData = await apiResponse.json();
        const text = responseData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ text }),
        };

    } catch (e) {
        console.error("Function Error:", e);
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
};
