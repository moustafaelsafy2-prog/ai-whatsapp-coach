// bot.ts - TypeScript version of the WhatsApp bot

import { Client, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

const client = new Client({
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// When the bot is ready
client.on('ready', () => {
    console.log('البوت جاهز! 🤖');
});

// Display QR code for the first time
client.on('qr', (qr: string) => {
    console.log('امسح هذا الكود QR باستخدام WhatsApp:');
    qrcode.generate(qr, { small: true });
});

// When authenticated
client.on('authenticated', () => {
    console.log('تم تسجيل الدخول بنجاح! ✅');
});

// Message handling
client.on('message', async (message) => {
    try {
        const { body, from, type } = message;

        // Ignore messages sent by the bot itself
        if (message.fromMe) return;
        if (from === 'status@broadcast') return;

        console.log(`رسالة جديدة من ${from}: ${body} (نوع: ${type})`);

        // Reply to text messages
        if (type === 'chat') {
            const response = generateResponse(body);
            await message.reply(response);
        }

        // Handle images
        else if (type === 'image') {
            console.log('📷 تم استقبال صورة');

            const media: MessageMedia = await message.downloadMedia();
            if (media) {
                console.log('تم تنزيل الصورة بنجاح');
                await message.reply('شكرًا على الصورة! 😊 سيتم معالجتها قريبًا.');
            }
        }

        // Handle audio
        else if (type === 'audio' || type === 'ptt') {
            console.log('🎵 تم استقبال ملف صوتي');

            const media: MessageMedia = await message.downloadMedia();
            if (media) {
                console.log('تم تنزيل الملف الصوتي بنجاح');
                await message.reply('تم استقبال الصوت! 🎙️');
            }
        }

        // Handle video
        else if (type === 'video') {
            console.log('🎬 تم استقبال فيديو');

            const media: MessageMedia = await message.downloadMedia();
            if (media) {
                console.log('تم تنزيل الفيديو بنجاح');
                await message.reply('شكرًا للفيديو! 📹');
            }
        }

        // Handle other documents
        else if (type === 'document') {
            console.log('📄 تم استقبال ملف');

            const media: MessageMedia = await message.downloadMedia();
            if (media) {
                console.log('تم تنزيل الملف بنجاح');
                await message.reply('تم استقبال الملف! 📎');
            }
        }

        // Handle stickers
        else if (type === 'sticker') {
            console.log('🎭 تم استقبال ملصق');
            await message.reply('جميل الملصق! 😀');
        }

    } catch (error) {
        console.error('خطأ في معالجة الرسالة:', error);
        try {
            await message.reply('عذرًا، حدث خطأ في المعالجة. برجاء المحاولة مرة أخرى.');
        } catch (replyError) {
            console.error('خطأ في إرسال رد الخطأ:', replyError);
        }
    }
});

// Generate simple response (can be replaced with AI)
function generateResponse(text: string): string {
    const responses = [
        'مرحبا! كيف يمكنني مساعدتك؟',
        'شكرا لرسالتك! 🤖',
        'أنا هنا للمساعدة في أي شيء تحتاجه.',
        'كيف حالك اليوم؟',
        'سأقوم بمعالجة طلبك الآن.'
    ];

    if (text.toLowerCase().includes('مرحبا') || text.toLowerCase().includes('hello')) {
        return 'مرحبا! كيف يمكنني مساعدتك؟ 👋';
    }

    if (text.toLowerCase().includes('كيف حالك') || text.toLowerCase().includes('how are you')) {
        return 'أنا في أحسن حال! شكرًا لسؤالك 😊';
    }

    return responses[Math.floor(Math.random() * responses.length)];
}

// Handle disconnection
client.on('disconnected', (reason: string) => {
    console.log('تم قطع الاتصال:', reason);
});

// Handle auth failure
client.on('auth_failure', (msg: string) => {
    console.error('فشل في المصادقة:', msg);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('إغلاق البوت...');
    await client.destroy();
    process.exit(0);
});

// Start the bot
console.log('جاري تشغيل البوت...');
client.initialize();
