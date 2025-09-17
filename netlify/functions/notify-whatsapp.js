// netlify/functions/notify-whatsapp.js
export const config = { path: "/api/notify-whatsapp" };

// تنقية خفيفة وطول آمن
const sanitize = (s = "") =>
  String(s).replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 4000);

export default async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    // نقبل أي اسم حقل من الواجهة ثم نطابقه إلى "message"
    const bodyIn = await req.json().catch(() => ({}));
    const raw =
      bodyIn?.message ??
      bodyIn?.text ??
      bodyIn?.body ??
      bodyIn?.content ??
      bodyIn?.msg ??
      "";

    const message = sanitize(raw);
    if (!message) {
      return new Response(JSON.stringify({ error: "Empty message" }), { status: 400 });
    }

    const webhook = process.env.WHATSAPP_WEBHOOK_URL; // مثال: https://<tunnel>.trycloudflare.com/send-notification
    const token = process.env.WHATSAPP_TOKEN || "";   // اختياري إن كان سيرفرك يتحقق من توكن

    if (!webhook) {
      return new Response(JSON.stringify({ error: "WHATSAPP_WEBHOOK_URL not set" }), { status: 500 });
    }

    // الإرسال بما يطابق index.js لديك تمامًا: JSON يحتوي { message: "<text>" }
    const res = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ message })
    });

    const upstream = await res.text();
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, status: res.status, upstream }), { status: 502 });
    }

    return new Response(JSON.stringify({ ok: true, upstream }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), { status: 500 });
  }
};
