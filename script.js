function initUIEnhancements() { const userInput = document.getElementById('userInput'); if (!userInput) return; const adjustTextareaHeight = () => { userInput.style.height = 'auto'; userInput.style.height = userInput.scrollHeight + 'px'; }; userInput.addEventListener('input', adjustTextareaHeight); const originalSendMessage = App.core.sendMessage; App.core.sendMessage = function(...args) { originalSendMessage.apply(this, args); setTimeout(adjustTextareaHeight, 0); }; }

const App = {
  config: { MAX_PROMPT_CHARS: 28000, STORAGE_KEY: 'smart-coach-session-v3', LONG_PRESS_DURATION: 400, MAX_IMAGES: 5 },
  state: { userState: { step: 0, data: {} }, lang: 'ar', chatHistory: [], isRecording: false, sttSessionId: 0, recognition: null, mediaStream: null, mediaRecorder: null, audioChunks: [], recStartTime: 0, pendingImages: [], pinnedMessageId: null, longPressTimer: null, currentContextMenu: null, isEditing: false, editingMessageId: null },
  elements: {},
  cacheElements() {
    const $ = id => document.getElementById(id); this.elements = { chatMessages: $('chatMessages'), userInput: $('userInput'), sendBtn: $('sendBtn'), startBtn: $('startBtn'), nextBtn: $('nextBtn'), welcomeScreen: $('welcomeScreen'), userDataScreen: $('userDataScreen'), chatContainer: $('chatContainer'), userNameInput: $('userName'), userAgeInput: $('userAge'), userCountryInput: $('userCountry'), btnTheme: $('btnTheme'), plusBtn: $('plusBtn'), fileInput: $('fileInput'), micBtn: $('micBtn'), recHintWrap: $('recHintWrap'), recHint: $('recHint'), planButtonArea: $('planButtonArea'), generatePlanBtn: $('generatePlanBtn'), contactModal: $('contactModal'), closeContactBtn: $('closeContactBtn'), copyAndGoIherbBtn: $('copy-and-go-iherb-btn'), iherbCode: $('iherb-code'), imagePreviewsWrapper: $('imagePreviewsWrapper'), imagePreviewsContainer: $('imagePreviewsContainer'), chatAvatar: $('chatAvatar'), profileModal: $('profileModal'), closeProfileBtn: $('closeProfileBtn'), profileGetPlanBtn: $('profileGetPlanBtn'), resetBtn: $('resetBtn'), resetConfirmModal: $('resetConfirmModal'), confirmResetBtn: $('confirmResetBtn'), cancelResetBtn: $('cancelResetBtn'), messageContextMenu: $('messageContextMenu'), pinnedMessageArea: $('pinnedMessageArea'), pinnedText: $('pinnedText'), unpinBtn: $('unpinBtn'), footerRights: $('footerRights'), footerCoffee: $('footerCoffee'), imageViewerModal: $('imageViewerModal'), fullImageView: $('fullImageView'), closeImageViewerBtn: $('closeImageViewerBtn'), howToUseLink: $('howToUseLink'), howToUseModal: $('howToUseModal'), closeHowToUseBtn: $('closeHowToUseBtn'), howToUseTitle: $('howToUseTitle'), howToUseContent: $('howToUseContent'), howToUseText: $('howToUseText') };
  },
  i18n: {
    strings: {
      ar: {
        appName: 'مدربك الشخصي الذكي', welcomeSubtitle: 'جاهز للتغيير؟ خطتك مصممة خصصًا لك — تنفيذ محكم، متابعة دقيقة، ونتيجة ملموسة.',
        startButtonText: 'ابدأ الآن', userDataTitle: 'لنبني ملفك السريع', userDataSubtitle: 'نحتاج بعض المعلومات للبدء',
        namePlaceholder:'اكتب اسمك هنا', agePlaceholder:'عمرك', countryPlaceholder:'بلدك', nextButtonText:'ابدأ المحادثة',
        inputPlaceholder:'اكتب رسالتك...', emptyFields:'الرجاء إدخال اسمك وعمرك وبلدك للمتابعة.', imageUpload:'تم استلام الصورة — يتم التحليل الآن.',
        maxImagesReached: 'يا بطل، تقدر ترفع 5 صور بس في المرة الواحدة.',
        typing:'…', recStart:'● جاري التسجيل… ارفع إصبعك للإرسال', recDenied:'تعذّر الوصول للميكروفوون.', recTooShort:'التسجيل قصير جدًا.', recSaved:'تم نسخ الكلام إلى خانة الكتابة.',
        ctaTitle: 'جاهز لنتيجة ملموسة؟', ctaSubtitle: 'خطة مُحكمة + متابعة أسبوعية.', getPlanButton: 'احصل على خطتك الآن',
        contactModalTitle: 'احصل على خطتك الآن', contactModalText1: 'اختر الطريقة المناسبة للتواصل المباشر مع المدرب.',
        whatsappBtnText: 'واتساب', phoneBtnText: 'اتصال', copied: 'تم النسخ!',
        iherbTitle: 'احصل على مكملاتك من iHerb', iherbSubtitle: 'خصم إضافي 10% هدية من مدربك!',
        copyAndGoButton: 'اذهب للمتجر', iherbCopiedAndRedirecting: 'تم نسخ الكود! يتم الآن تحويلك...',
        coffeeText: 'هل أعجبتك الأداة؟ دعمك يساعدنا على الاستمرار.', coffeeBtnText: 'ادعمني بقهوة', coffeeBtnText2: 'ادعمني بقهوة',
        imageAttached: '[صور مرفقة]', resetTitle: 'ابدأ من جديد',
        resetModalTitle: 'تأكيد الحذف', resetModalText: 'هل أنت متأكد أنك تريد حذف كل الرسائل والبدء من جديد؟',
        resetCancelBtn: 'إلغاء', resetConfirmBtn: 'موافق',
        contextCopy: 'نسخ', contextShare: 'مشاركة', contextPin: 'تثبيت', contextUnpin: 'إلغاء التثبيت',
        contextEdit: 'تعديل', contextDelete: 'حذف', messageDeleted: 'تم حذف الرسالة.',
        unpinTitle: 'إلغاء التثبيت', sharedSuccessfully: 'تمت المشاركة بنجاح!', shareFailed: 'فشلت المشاركة.',
        profileName: 'الكابتن مصطفى الصافي', profilePhone: '', profileBioTitle: 'عني',
        profileBioText: 'شغفي هو هندسة الأجسام والعقول. كخبير دولي معتمد من كاليفورنيا، أدمج أحدث علوم اللياقة والتغذية مع فهم عميق لأسلوب حياتك، لأصنع لك تحولاً حقيقياً ومستداماً. مهمتي ليست مجرد خطة، بل بناء نظام حياة يطلق أفضل نسخة منك.',
        profileGetPlanBtn: 'احصل على خطتك',
        footerRights: '© 2024 جميع الحقوق محفوظة للكابتن مصطفى الصافي.',
        footerCoffee: 'ادعمني بقهوة',
        howToUseText: 'كيف تستخدم الخدمة',
        howToUseTitle: 'دليل استخدام المدرب الذكي',
        howToUseContent: `<div class='space-y-3 text-sm'><p><strong>أهلاً بك في مساعدك التدريبي الذكي! إليك كيفية تحقيق أقصى استفادة:</strong></p><ul class='list-disc list-inside space-y-2'><li><strong>بدء المحادثة:</strong> أدخل بياناتك الأولية لبدء حوار مخصص معك.</li><li><strong>إرسال الرسائل:</strong> اكتب استفسارك في مربع النص واضغط على زر الإرسال.</li><li><strong>إرفاق الصور:</strong> اضغط على أيقونة المشبك 📎 لإرفاق صورة واحدة أو عدة صور (حتى 5 صور) ليحللها المدرب. يمكنك إضافة نص مع الصور.</li><li><strong>الرسائل الصوتية:</strong> اضغط مطولاً على أيقونة الميكروفون 🎤 للتسجيل، ثم اترك إصبعك للإرسال.</li><li><strong>تعديل أو حذف رسالة:</strong> اضغط مطولاً على أي رسالة أرسلتها لتظهر قائمة خيارات. يمكنك من خلالها تعديل الرسالة أو حذفها.</li><li><strong>ملاحظة هامة عند التعديل:</strong> عند تعديل أي رسالة، سيتم حذف جميع الرسائل التي تليها (لك وللمدرب) وسيتم إرسال رد جديد بناءً على تعديلك.</li><li><strong>نسخ ومشاركة:</strong> يمكنك أيضاً من نفس القائمة نسخ نص الرسالة أو مشاركتها.</li></ul><p>نحن هنا لمساعدتك في كل خطوة نحو هدفك!</p></div>`,
        welcomeMessage: 'أهلًا بيك يا {name}، معاك مساعد المدرب الدولي مصطفى الصافي. جاهز نبدأ رحلتك؟ إيه هدفك الأساسي؟',
      },
      en: {
        appName:'Smart Personal Coach', welcomeSubtitle:'Ready for a change? Your plan is tailored for you—precise execution, close follow-up, and tangible results.',
        startButtonText:'Start Now', userDataTitle:"Let's build your quick profile", userDataSubtitle:"We need some information to get started",
        namePlaceholder:'Your Name', agePlaceholder:'Your Age', countryPlaceholder:'Your Country', nextButtonText:'Start Conversation',
        inputPlaceholder:'Type your message…', emptyFields:'Please enter your name, age, and country to continue.', imageUpload:'Image received — analyzing now.',
        maxImagesReached: 'Heads up! You can only upload 5 images at a time.',
        typing:'…', recStart:'● Recording… release to send', recDenied:'Microphone access denied.', recTooShort:'Recording is too short.', recSaved:'Text copied to input.',
        ctaTitle: 'Ready for tangible results?', ctaSubtitle: 'Precise plan + weekly follow-up.', getPlanButton: 'Get Your Plan Now',
        contactModalTitle: 'Get your plan now', contactModalText1: 'Choose the best way to contact the coach directly.',
        whatsappBtnText: 'WhatsApp', phoneBtnText: 'Call', copied: 'Copied!',
        iherbTitle: 'Get your supplements from iHerb', iherbSubtitle: 'An extra 10% discount, a gift from your coach!',
        copyAndGoButton: 'Go to Store', iherbCopiedAndRedirecting: 'Code copied! Redirecting...',
        coffeeText: 'Did you like this free tool? Your support helps us to continue.', coffeeBtnText: 'Support me with a coffee', coffeeBtnText2: 'Support me with a coffee',
        imageAttached: '[Images Attached]', resetTitle: 'Start Over',
        resetModalTitle: 'Confirm Deletion', resetModalText: 'Are you sure you want to delete all messages and start over?',
        resetCancelBtn: 'Cancel', resetConfirmBtn: 'Confirm',
        contextCopy: 'Copy', contextShare: 'Share', contextPin: 'Pin', contextUnpin: 'Unpin',
        contextEdit: 'Edit', contextDelete: 'Delete', messageDeleted: 'Message deleted.',
        unpinTitle: 'Unpin message', sharedSuccessfully: 'Shared successfully!', shareFailed: 'Sharing failed.',
        profileName: 'Coach Mustafa Elsafy', profilePhone: '', profileBioTitle: 'About',
        profileBioText: "My passion is engineering bodies and minds. As an internationally certified expert from California, I merge the latest in fitness and nutrition science with a deep understanding of your lifestyle to create real, sustainable transformation. My mission isn't just a plan; it's to build a lifestyle system that unleashes the best version of you.",
        profileGetPlanBtn: 'Get Your Plan',
        footerRights: '© 2024 All rights reserved for Coach Mustafa Elsafy.',
        footerCoffee: 'Support me with a coffee',
        howToUseText: 'How to use',
        howToUseTitle: 'Smart Coach Guide',
        howToUseContent: `<div class='space-y-3 text-sm'><p><strong>Welcome to your smart training assistant! Here's how to get the most out of it:</strong></p><ul class='list-disc list-inside space-y-2'><li><strong>Start Conversation:</strong> Enter your initial data to begin a personalized chat.</li><li><strong>Send Messages:</strong> Type your query in the text box and press the send button.</li><li><strong>Attach Images:</strong> Click the paperclip icon 📎 to attach one or more images (up to 5) for the coach to analyze. You can add text with the images.</li><li><strong>Voice Messages:</strong> Press and hold the microphone icon 🎤 to record, then release to send.</li><li><strong>Edit or Delete a Message:</strong> Long-press on any message you've sent to bring up an options menu. From there, you can edit or delete the message.</li><li><strong>Important Note on Editing:</strong> When you edit a message, all subsequent messages (from both you and the coach) will be deleted, and a new response will be generated based on your edit.</li><li><strong>Copy & Share:</strong> From the same menu, you can also copy the message text or share it.</li></ul><p>We're here to help you every step of the way towards your goal!</p></div>`,
        welcomeMessage: "Welcome, {name}! I'm assistant to international coach Mustafa Elsafy. Ready to start your journey? What's your main goal?",
      }
    },
    setLang(lang) {
      App.state.lang = lang;
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
      const L = App.i18n.strings[lang];
      const $ = id => document.getElementById(id);
      const updateText = (elId, key) => { const el = $(elId); if (el) el.textContent = L[key]; };
      const updatePlaceholder = (elId, key) => { const el = $(elId); if (el) el.placeholder = L[key]; };
      const updateTitle = (elId, key) => { const el = $(elId); if (el) el.title = L[key]; };
      const updateHtml = (elId, key) => { const el = $(elId); if (el) el.innerHTML = L[key]; };
      
      updateText('welcomeTitle', 'appName'); updateText('welcomeSubtitle', 'welcomeSubtitle'); updateText('startBtn', 'startButtonText');
      updateText('userDataTitle', 'userDataTitle'); updateText('userDataSubtitle', 'userDataSubtitle');
      updatePlaceholder('userName', 'namePlaceholder'); updatePlaceholder('userAge', 'agePlaceholder'); updatePlaceholder('userCountry', 'countryPlaceholder');
      updateText('nextBtn', 'nextButtonText'); updateText('chatTitle', 'appName'); updatePlaceholder('userInput', 'inputPlaceholder');
      updateText('contactModalTitle', 'contactModalTitle'); updateText('contactModalText1', 'contactModalText1');
      updateText('whatsappBtnText', 'whatsappBtnText'); updateText('phoneBtnText', 'phoneBtnText');
      updateText('coffeeText', 'coffeeText'); updateText('coffeeBtnText', 'coffeeBtnText'); updateText('coffeeBtnText2', 'coffeeBtnText2');
      updateText('ctaTitle', 'ctaTitle'); updateText('ctaSubtitle', 'ctaSubtitle'); updateText('generatePlanBtn', 'getPlanButton');
      updateText('iherbTitle', 'iherbTitle'); updateText('iherbSubtitle', 'iherbSubtitle');
      updateText('copy-and-go-iherb-btn-text', 'copyAndGoButton');
      updateTitle('resetBtn', 'resetTitle'); updateText('resetModalTitle', 'resetModalTitle');
      updateText('resetModalText', 'resetModalText'); updateText('cancelResetBtn', 'resetCancelBtn');
      updateText('confirmResetBtn', 'resetConfirmBtn');  
      updateText('contextCopy', 'contextCopy'); updateText('contextShare', 'contextShare'); updateText('contextPin', 'contextPin');
      updateText('contextEdit', 'contextEdit'); updateText('contextDelete', 'contextDelete');
      updateTitle('unpinBtn', 'unpinTitle');
      updateText('profileName', 'profileName'); updateText('profilePhone', 'profilePhone');
      updateText('profileBioTitle', 'profileBioTitle'); updateText('profileBioText', 'profileBioText');
      updateText('profileGetPlanBtn', 'profileGetPlanBtn');
      updateText('footerRights', 'footerRights');
      updateText('footerCoffee', 'footerCoffee');
      updateText('howToUseText', 'howToUseText');
      updateText('howToUseTitle', 'howToUseTitle');
      updateHtml('howToUseContent', 'howToUseContent');

      document.querySelectorAll('.lang-toggle-btn').forEach(btn => { btn.textContent = lang === 'ar' ? 'EN' : 'AR'; });
      document.title = `${L.appName} | Smart Personal Coach`;
    },
    autoSetByText(s) { if (!s) return; const isArabic = /[\u0600-\u06FF]/.test(s); if ((isArabic ? 'ar' : 'en') !== App.state.lang) { this.setLang(isArabic ? 'ar' : 'en'); } }
  },
  utils: {
    setTheme() { document.documentElement.classList.toggle('dark'); const isDark = document.documentElement.classList.contains('dark'); App.elements.btnTheme.textContent = isDark ? '🌙' : '☀️'; localStorage.setItem('theme', isDark ? 'dark' : 'light'); },
    toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.classList.add('show'), 10); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 2400); },
    removeNode(node) { if (node && node.parentNode) node.parentNode.removeChild(node); },
    formatTime(timestamp) { return new Date(timestamp).toLocaleTimeString(App.state.lang === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit', hour12: true }); }
  },
  ui: {
    displayMessage(message) {
        const { chatMessages } = App.elements;
        const bubble = document.createElement('div');
        const sender = message.role === 'assistant' ? 'ai' : 'user';
        
        bubble.className = `message-bubble ${sender}`;
        bubble.dataset.messageId = message.id;

        let finalHtml = '';

        if (message.role === 'user' && message.images && message.images.length > 0) {
            const imageContainer = document.createElement('div');
            imageContainer.className = 'flex flex-wrap gap-2 mb-2';
            message.images.forEach(imgDataUrl => {
                const img = document.createElement('img');
                img.src = imgDataUrl;
                img.className = 'max-w-[100px] h-auto rounded-lg cursor-pointer';
                img.alt = 'uploaded image';
                img.onclick = () => App.handlers.handleViewImage(imgDataUrl);
                imageContainer.appendChild(img);
            });
            finalHtml += imageContainer.outerHTML;
        }

        const content = message.parts?.[0]?.text || '';
        const safeContent = (content && typeof content === 'string') ? content : '';
        if (safeContent) {
            finalHtml += `<div class="msg-content">${marked.parse(safeContent)}</div>`;
        }

        const timeHtml = `<div class="message-meta"><span class="message-time">${App.utils.formatTime(message.timestamp)}</span></div>`;
        bubble.innerHTML = finalHtml + timeHtml;
        
        chatMessages.appendChild(bubble);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        App.handlers.addMessageEventListeners(bubble);
        return bubble;
    },
    showTyping(sender = 'ai') { const { chatMessages } = App.elements; const bubble = document.createElement('div'); bubble.className = `message-bubble ${sender}`; bubble.innerHTML = `<div class="typing"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`; chatMessages.appendChild(bubble); chatMessages.scrollTop = chatMessages.scrollHeight; return bubble; },
    togglePlanCTA() { const isDataComplete = ['name', 'age', 'country'].every(k => !!App.state.userState.data[k]); if(App.elements.generatePlanBtn) { App.elements.generatePlanBtn.disabled = !isDataComplete; } },
    rebuildChatUI() { App.elements.chatMessages.innerHTML = ''; App.state.chatHistory.forEach(message => this.displayMessage(message)); },
    updatePinnedMessageUI() {
        const { pinnedMessageArea, pinnedText } = App.elements;
        if (App.state.pinnedMessageId) {
            const pinnedMessage = App.state.chatHistory.find(m => m.id === App.state.pinnedMessageId);
            if (pinnedMessage) {
                const textContent = pinnedMessage.parts[0].text.replace(/\[Image Attached\]/g, '📷');
                pinnedText.textContent = textContent;
                pinnedMessageArea.classList.add('show');
                return;
            }
        }
        pinnedMessageArea.classList.remove('show');
        App.state.pinnedMessageId = null;  
    },
    renderImagePreviews() {
        const container = App.elements.imagePreviewsContainer;
        const wrapper = App.elements.imagePreviewsWrapper;
        container.innerHTML = '';

        if (App.state.pendingImages.length === 0) {
            wrapper.classList.add('hidden');
            return;
        }

        App.state.pendingImages.forEach(image => {
            const thumbWrapper = document.createElement('div');
            thumbWrapper.className = 'preview-thumbnail';
            
            const img = document.createElement('img');
            img.src = image.dataUrl;
            img.alt = 'Preview';
            img.onclick = () => App.handlers.handleViewImage(image.dataUrl);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.innerHTML = '×';
            removeBtn.setAttribute('aria-label', 'Remove image');
            removeBtn.onclick = () => App.handlers.handleRemoveImage(image.id);

            thumbWrapper.appendChild(img);
            thumbWrapper.appendChild(removeBtn);
            container.appendChild(thumbWrapper);
        });

        wrapper.classList.remove('hidden');
    },
    setLoading(isLoading) {
        const { userInput, sendBtn, plusBtn, micBtn } = App.elements;
        userInput.disabled = isLoading;
        sendBtn.disabled = isLoading;
        plusBtn.disabled = isLoading;
        micBtn.disabled = isLoading;
        
        if (isLoading) {
            sendBtn.innerHTML = `<div class="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>`;
        } else {
            this.setEditing(false);
        }
    },
    setEditing(isEditing) {
        const { sendBtn } = App.elements;
        if(isEditing) {
            sendBtn.innerHTML = `<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            sendBtn.classList.add('!bg-blue-500');
        } else {
            sendBtn.innerHTML = `<svg class="w-5 h-5" style="transform: translateX(1px);" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>`;
            sendBtn.classList.remove('!bg-blue-500');
        }
    }
  },
  services: {
    async callAI(payload) {
        try {
            const res = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ error: "Failed to parse error response from server." }));
                throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
            }
            
            const data = await res.json();
            return data.text || '';
        } catch (e) {
            console.error("AI Call Error:", e);
            return (App.state.lang === 'ar') ? 'عذرًا، حدث خطأ أثناء الاتصال بالخادم.' : 'Sorry, an error occurred while connecting to the server.';
        }
    },
    speech: { supportSpeechRecognition: () => ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window), startLocalRecognition() { const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return null; const sessionId = ++App.state.sttSessionId; const rec = new SR(); rec.lang = (App.state.lang === 'ar' ? 'ar-EG' : 'en-US'); rec.interimResults = true; rec.continuous = true; rec.onresult = (e) => { if (sessionId !== App.state.sttSessionId) return; let final = '', interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) { final += e.results[i][0].transcript; } else { interim = e.results[i][0].transcript; } } const text = (final || interim).trim(); if (text) { App.elements.userInput.value = text; App.elements.userInput.dispatchEvent(new Event('input')); } }; rec.start(); return { rec, sessionId }; }, async startRecording() { if (App.state.isRecording) return; App.state.isRecording = true; const L = App.i18n.strings[App.state.lang]; if (this.supportSpeechRecognition()) { const h = this.startLocalRecognition(); App.state.recognition = h?.rec || null; } else { App.utils.toast(L.recDenied); App.state.isRecording = false; return; } App.elements.micBtn.classList.add('mic-live'); App.elements.recHintWrap.classList.remove('hidden'); App.elements.recHint.textContent = L.recStart; }, stopRecording() { if (!App.state.isRecording) return; App.state.isRecording = false; if (App.state.recognition && App.state.recognition.stop) { try { App.state.recognition.stop(); App.core.sendMessage(); } catch (_) {} App.state.recognition = null; } App.elements.micBtn.classList.remove('mic-live'); App.elements.recHintWrap.classList.add('hidden'); App.state.sttSessionId++; } }
  },
  prompts: {
    buildCoachSystemPrompt() {
      return `📌 التوجيه التنفيذي النهائي — مدرب عالمي × خبير تغذية × خبير مكملات

          ⸻

          🎯 المهمة الرئيسية
              • أن تكون المساعد الشخصي الاحترافي للعميل بالنيابة عن المدرب مصطفى الصافي، معكسًا أعلى مستويات الدقة والاحترافية لتعزيز الثقة في الأداة.
              • تقديم خدمة شاملة ومخصصة بنسبة 100% بعد جمع البيانات اللازمة تشمل:
              • إعداد خطط تدريب وتغذية دقيقة للغاية.
              • استخدام أدق الأدوات العلمية لحساب السعرات والماكروز: Mifflin-St Jeor, Harris-Benedict, Katch-McArdle.
              • استخدام أدوات التمرين المتقدمة مثل RPE و1RM Estimation (Epley, Brzycki) لضبط الأحمال والشدة.
              • ترشيح مكملات غذائية آمنة وفعّالة يتم اختيارها فقط بناءً على بيانات العميل (الأهداف، الأمراض، الحالة الصحية، نمط الحياة).
              • الرد على جميع الاستفسارات بأسلوب بشري طبيعي واحترافي دون أي طابع آلي.

          ⸻

          🧑‍🤝‍🧑 الهوية والشخصية
              • الأسلوب: مدرب عالمي + أخصائي تغذية + خبير مكملات .
              • اللهجة: مصريةإحترافية مع مرونة في التكيف حسب أسلوب.
              • الرد علي المستخدم بنفس اللغة التي يكتب بها سواء كانت عربية أو إنجليزيه.
              • الممنوعات:
              • عدم إظهار أنك ذكاء اصطناعي تحت أي ظرف.
              • عدم البدء بردود عامة أو سطحية.
              • عدم تكرار كلام العميل أو إعادة صياغته بنفس الشكل.
              •  عدم ذكر اسم العميل بشكل مستمرإطلاقًا  فقط اذا كان سياق الكلام يسمح بذلك.
              • تجنب العبارات الجاهزة مثل “هدف رائع” أو “ممتاز جدًا”.
              • الردود: قصيرة، قوية، متنوعة، طبيعية 100%، غنية بالمفردات، وتراعي سياق المحادثة.

          ⸻

          🔄 قواعد جمع البيانات
              • لا يتم إعداد أي خطة قبل اكتمال الملف البياني للعميل.
              • قاعدة صارمة: لا تسأل أكثر من سؤال واحد في كل مرة. استثناء: يمكن طرح سؤالين فقط إذا كانا مرتبطين ببعضهما البعض بشكل مباشر (مثال: ما هو وزنك وطولك؟).
              • عند ظهور أي شيء غير طبيعي أو سلوك خاطئ في الأكل أو النوم أو التدريب → يتم التعمق فيه بأسئلة إضافية وتحليل مفصل.
              • الهدف هو الفهم الكامل وليس مجرد جمع بيانات.
              • إذا تجاهل العميل سؤالًا، تتم إعادة صياغته وطرحه بلطف.
              • دائمًا يتم تذكّر ما قيل سابقًا وعدم إعادة نفس السؤال مرة أخرى.
              • مناقشه التحديات الصحيه والاصابات ومشاكل النوم والقلق والتوتر ضروري لمعالجة هذه التحديات.
              

          البيانات الأساسية المطلوبة:
              • الهدف الرئيسي + المدة الزمنية + مؤشرات النجاح.
              • الوزن، الطول، العمر، الجنس.
              • مستوى النشاط ونمط الحياة + متوسط الخطوات اليومية.
              • بيئة التدريب (جيم/منزل)، عدد الأيام، المدة، الخبرة، الأدوات المتاحة.
              • مستوي الياقة البزنية ومدي معرفته بالتمارين.
              • التاريخ الصحي (إصابات، أمراض، عمليات، أدوية).
              • اختياري قياسات الجسم + صور أو InBody .
              • المؤشرات الحيوية (ضغط، سكر، دهون الدم، وظائف الكبد والكُلى، فيتامينات).
              • جودة النوم ومواعيده.
              • مستوى الضغط النفسي، السفر المتكرر، طبيعة العمل.
              • العادات الغذائية (وجبات، ماء، كافيين…).
              • مشاكل الهضم والتحمل الغذائي.
              • التفضيلات والقيود الغذائية.
              • الميزانية للطعام والمكملات.
              • إمكانات المطبخ/الطهي.
              • هل يفضل العميل استخدم الصوصات والاضافات  علي الطعام
              • طرق التتبع المفضلة (تطبيقات، موازين…).
              • التجارب السابقة مع الأنظمة.
              • الأولويات التدريبية.
              • اختياري خطة القياس والمتابعة (وزن، صور، قياسات أسبوعية).
              • العضلات التي تحتاج دعم وبها ضعف ويحتاج العميل التركيز عليه.
              •سؤال العميل عن المدة الزمنيه التي يرغب بالوصول لهدفه.
              • هل هناك مناسبات معينه قادمه.
              • الحاله الإجتماعيه متزوج اعزب وهل هناك مشاكل تحتاج دعم.
              قم دائما مناقشه أي شئ غير طبيعي مع العميل لضمان فهمك للتفاصيل

          ⸻

          🗣️ السيناريو الإرشادي
              • افتتاحية طبيعية تناسب الموقف.
              • رد قصير محفز بعد كل إجابة.
              • التفرع المنطقي في الأسئلة حسب الحوار.
              • إعادة صياغة الأسئلة المهملة بطريقة لبقة.
              • إضافة أسئلة إضافية دائمًا حسب ما يكشفه الحوار (نوم، إصابات، عادات سيئة…).
              • الردود متغيرة دائمًا ولا تتبع نفس الأسلوب أو الترتيب.

          ⸻

          📊 مرحلة ما قبل إعداد الخطة
              • قبل تجهيز الخطة: يتم استرجاع كل البيانات في رسالة مراجعة شاملة تُكتب بأسلوب عبقري واحترافي، ويُطلب من العميل تأكيدها.
              • بعد التأكيد: تُستخدم جميع البيانات كما هي بالكامل ودون أي اختصار لتصميم الخطة.

          بعد جمع كل البيانات:
              1. سؤال عن المكملات:
              • تُرشّح المكملات بشكل مخصص 100% بناءً على البيانات (الأهداف، الأمراض، الحالة الصحية).
              • عند موافقة العميل على شراء من iHerb: يتم تقديم كود خصم AYT3413 مرة واحدة فقط، بأسلوب ذكي وغير مزعج.
              2. طلب صور أو تحليل InBody لزيادة الدقة اذا توفرت.

          ⸻

          📋 إعداد وتسليم الخطة
              • فورًا بعد تأكيد العميل على ملخص البيانات، يتم تقديم الخطة الكاملة دون أي تأخير.
              • الخطة التدريبية:
              • منظمة بالأيام.
              • التمارين بالعربية + الإنجليزية.
              • تغطية كل عضلات الجسم بالكامل 
              • دمج تمارين الكارديو اذا كان العميل يحتاج الي ذلك 
              • Sets × Reps × Rest محسوبة بدقة باستخدام RPE و1RM Estimation.
              • الخطة الغذائية:
              • سعرات وماكروز دقيقة جدًا باستخدام Mifflin-St Jeor, Harris-Benedict, Katch-McArdle.
              • وجبات يومية مفصلة بالكميات والبدائل.
              • الاضافات التي يفضل العميل اضافتها علي الطعام ان اراد ذلك.
              • توضيح مكونات كل وجبة بشكل مفصل 
              • مراعاة الحساسية والمشكلات الصحية والوجبات التي لا يفضلها العميل بعدم ادراجها ابدا
              • المكملات:
              • توصف المكملات بناء علي الهدف والحاله الصحية والنوم والقلق والتوتر والاصابات واي شئ اخر يحتاج الي ذلك.
              • اذا كان العميل يواجه مشاكل جنسيه يتم دعمه بالمكملات المناسبه
              • المكملات يجب ان تكون أمنه ولا تتعارض مع بعضها او مع ادويه يستخدمها المسعميل
              • مدمجة بذكاء بناءً على البيانات الصحية.
              • فوائدها موضحة مع ترك القرار النهائي للعميل.
              • إدراج كود الخصم AYT3413 مرة واحدة فقط وبأسلوب لبق وغير دعائي.
              • في نهاية الخطة:
              • اقتراح متابعة خاصة أسبوعية للتعديلات والتوجيه، عبر زر “احصل على خطتك الآن” — بأسلوب طبيعي غير مزعج.

          ⸻

          🔬 تحليل البيانات والصور
              • عندما يرسل المستخدم صورة (أو صورًا متعددة)، قم بتحليلها بدقة كمدرب خبير.
              • الهدف: استخلاص ملاحظات عملية حول تكوين الجسم، الوضعية، التوزيع العضلي والدهني، وتحديد نقاط القوة والمجالات التي تحتاج إلى تحسين.
              • إذا كانت هناك بيانات (مثل InBody)، استخرج المقاييس الرئيسية وفسرها.
              • **الأهم:** لا تقدم التحليل على شكل تقرير أو قائمة نقاط منفصلة. يجب دمج ملاحظاتك بسلاسة وطبيعية في صلب ردك الحواري. اجعل الأمر يبدو وكأنك مدرب حقيقي يعلق على الصور التي أمامه.
              • مثال للأسلوب المطلوب: "تمام شفت الصور، مبدئيًا عندك بناء عضلي كويس في منطقة الأكتاف وده هيدينا شكل V-shape ممتاز. بس محتاجين نركز الفترة الجاية على تقوية عضلات أسفل الظهر والـ core عشان نحسن من ميلان الحوض الأمامي البسيط اللي لاحظته. ده هيفرق معانا جدًا في الأداء والأمان في تمارين زي السكوات والديدلفت."

          ⸻

          📞 سيناريو التواصل والاشتراك
              • إذا سأل العميل عن كيفية التواصل المباشر مع المدرب مصطفى الصافي أو عن تفاصيل الاشتراك، يتم توجيه الرد كالتالي:
              • للتواصل المباشر مع الكابتن مصطفى وفريق العمل، يمكنك استخدام الرقم الموجود عند الضغط على زر 'احصل على خطتك الآن'. هذا سينقلك مباشرة للتواصل معهم."
              • لأنك مهتم فعلًا، فريقنا يقدم لك جلسة تقييم مجانية لتكتشف كيف يمكن لشراكة متكاملة مع خبراء يتابعون تقدمك ويعدّلون خطتك باستمرار ويدعمونك بلا توقف أن تحقق لك تحولًا جذريًا ومستدامًا، فلا تفوّت الفرصة ولحجز موعدك اضغط الآن على زر “احصل على خطتك .
              • إذا كان الطلب يتطلب تدخلًا بشريًا مباشرًا، وجّه المستخدم بالرد: “يُرجى التواصل مع فريق العمل لإتمام هذا الطلب.
              

          ⸻
          
          🔒 الخصوصية والتواصل مع المدرب
              • عندما يسأل المستخدم عن سرية بياناته أو هل المدرب يطلع عليها، يجب أن تكون الإجابة: "تأكد أن هذه المحادثة سرية تمامًا ولا يطلع عليها أي شخص آخر لضمان خصوصيتك الكاملة."
              • عندما يطلب المستخدم التواصل مع الفريق أو المدرب، يجب أن تكون الإجابة: "بالتأكيد، سأقوم بتجهيز كل البيانات التي زودتني بها في رسالة واحدة. يمكنك نسخها بسهولة وإرسالها مباشرة للمدرب."
              • عندما يؤكد المستخدم طلبه ("نعم، أرسلها" أو ما شابه)، قم فورًا بإرسال ملخص شامل ومنسق لجميع البيانات التي تم جمعها في رسالة واحدة. لا تسأل أي أسئلة أخرى، فقط أرسل البيانات.

          ⸻

          ⚡ مميزات النظام الإضافية
              • تخصيص كامل لكل خطة بنسبة 100%.
              • ذكاء في صياغة الأسئلة حسب سياق الحوار.
              • ردود بشرية طبيعية بلا أي طابع آلي.
              • استخدام أدوات ومعادلات دقيقة مثبتة علميًا.
              • ترشيحات مكملات مصممة بعناية بناءً على البيانات الصحية.
              • مراجعة ذاتية قبل كل رد للتأكد من الدقة.
              • تنويع الردود وعدم الالتزام بترتيب ثابت.
              • تسويق ذكي غير مزعج: الكود AYT3413 يُذكر مرة واحدة فقط في التوقيت المناسب.
      `;
    },
  },
  core: {
    saveHistory() {
        const sessionData = { chatHistory: App.state.chatHistory, userState: App.state.userState, pinnedMessageId: App.state.pinnedMessageId };
        localStorage.setItem(App.config.STORAGE_KEY, JSON.stringify(sessionData));
    },
    loadHistory() {
        const savedData = localStorage.getItem(App.config.STORAGE_KEY);
        if (savedData) {
            try {
                const sessionData = JSON.parse(savedData);
                if (sessionData.chatHistory && sessionData.userState) {
                    App.state.chatHistory = sessionData.chatHistory;
                    App.state.userState = sessionData.userState;
                    App.state.pinnedMessageId = sessionData.pinnedMessageId || null;
                    if (App.state.userState.step > 0) {
                        App.elements.welcomeScreen.classList.add('hidden');
                        App.elements.userDataScreen.classList.add('hidden');
                        App.elements.chatContainer.classList.remove('hidden');
                        App.ui.rebuildChatUI();
                        App.ui.togglePlanCTA();
                        App.ui.updatePinnedMessageUI();
                    }
                }
            } catch (e) { console.error("Failed to load saved history:", e); localStorage.removeItem(App.config.STORAGE_KEY); }
        }
    },
    async processAIResponse(payload) {
        const typingEl = App.ui.showTyping('ai');
        
        let response = await App.services.callAI(payload);
        App.utils.removeNode(typingEl);

        const newMessage = { id: `ai-${Date.now()}`, role: 'assistant', parts: [{ text: response }], timestamp: Date.now() };
        App.state.chatHistory.push(newMessage);  
        this.saveHistory();  
        App.ui.displayMessage(newMessage);  
        App.ui.togglePlanCTA();
        App.ui.setLoading(false);
    },
    sendMessage() {
        const msg = (App.elements.userInput.value || '').trim();  
        const images = App.state.pendingImages;

        if (App.state.isEditing) {
            const editIndex = App.state.chatHistory.findIndex(m => m.id === App.state.editingMessageId);
            if (editIndex > -1) {
                App.state.chatHistory.splice(editIndex);
            }
            App.state.isEditing = false;
            App.state.editingMessageId = null;
            App.ui.setEditing(false);
        }

        if (!msg && images.length === 0) return;
        
        App.ui.setLoading(true);
        App.i18n.autoSetByText(msg);
        
        App.state.chatHistory.push({
            id: `user-${Date.now()}`,
            role: 'user',
            parts: [{ text: msg }],
            images: images.map(img => img.dataUrl),
            timestamp: Date.now()
        });

        App.ui.rebuildChatUI();
        this.saveHistory();
        
        const payload = {
            system: App.prompts.buildCoachSystemPrompt(),
            messages: App.state.chatHistory
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => {
                    const messagePayload = {
                        role: m.role === 'assistant' ? 'model' : 'user',
                        content: m.parts[0].text
                    };
                    if (m.images && m.images.length > 0) {
                        messagePayload.images = m.images; 
                    }
                    return messagePayload;
                }),
            concise_image: true
        };
        
        this.processAIResponse(payload);
        
        App.elements.userInput.value = '';  
        App.handlers.clearPendingImages();
    }
  },
  handlers: {
    handleStartClick() { App.elements.welcomeScreen.classList.add('hidden'); App.elements.userDataScreen.classList.remove('hidden'); App.i18n.setLang(App.state.lang); },
    handleNextClick() {  
        const { userNameInput: u, userAgeInput: a, userCountryInput: c } = App.elements;  
        const n=u.value.trim(),g=a.value.trim(),o=c.value.trim();  
        App.i18n.autoSetByText(n||o);  
        if(!n||!g||!o){ App.utils.toast(App.i18n.strings[App.state.lang].emptyFields); return; }  
        App.state.userState.data={...App.state.userState.data,name:n,age:g,country:o};  
        App.state.userState.step = 1;  
        App.elements.userDataScreen.classList.add('hidden');  
        App.elements.chatContainer.classList.remove('hidden');  
        
        const L = App.i18n.strings[App.state.lang];
        const welcomeMsg = L.welcomeMessage.replace('{name}', n);
        
        const firstMessage = {id: `ai-${Date.now()}`, role:'assistant', parts:[{text:welcomeMsg}], timestamp: Date.now()};  
        App.state.chatHistory = [firstMessage];  
        App.core.saveHistory();  
        App.ui.displayMessage(firstMessage);  
        App.ui.togglePlanCTA();  
    },
    handleKeyPress(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); App.core.sendMessage(); } },
    handleFileChange(e) {
        const L = App.i18n.strings[App.state.lang];
        const limit = App.config.MAX_IMAGES;
        let files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
        if (!files.length) return;
        const currentCount = App.state.pendingImages.length;
        const canUploadCount = limit - currentCount;
        if (canUploadCount <= 0) { App.utils.toast(L.maxImagesReached); e.target.value = ''; return; }
        if (files.length > canUploadCount) { App.utils.toast(L.maxImagesReached); files = files.slice(0, canUploadCount); }
        const filePromises = files.map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (ev) => resolve({ id: `${Date.now()}-${file.name}`, dataUrl: ev.target.result });
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        });
        Promise.all(filePromises).then(newImages => { App.state.pendingImages.push(...newImages); App.ui.renderImagePreviews(); });
        e.target.value = '';
    },
    clearPendingImages() { App.state.pendingImages = []; App.ui.renderImagePreviews(); },
    handleRemoveImage(id) { App.state.pendingImages = App.state.pendingImages.filter(img => img.id !== id); App.ui.renderImagePreviews(); },
    handleViewImage(dataUrl) { App.elements.fullImageView.src = dataUrl; App.elements.imageViewerModal.classList.add('open'); },
    closeImageViewer() { App.elements.imageViewerModal.classList.remove('open'); },
    handleMicRecord(e) { e.preventDefault(); App.services.speech.startRecording(); },
    handleMicStop(e) { e.preventDefault(); App.services.speech.stopRecording(); },
    openContactModal() { App.elements.contactModal.classList.add('open'); App.elements.contactModal.setAttribute('aria-hidden', 'false'); },
    closeContactModal() { App.elements.contactModal.classList.remove('open'); App.elements.contactModal.setAttribute('aria-hidden', 'true'); },
    handleIherbCopy(e) { e.preventDefault(); const { copyAndGoIherbBtn, iherbCode } = App.elements; if (!copyAndGoIherbBtn || !iherbCode) return; const code = iherbCode.textContent.trim(); navigator.clipboard.writeText(code).then(() => { App.utils.toast(App.i18n.strings[App.state.lang].iherbCopiedAndRedirecting); setTimeout(() => { window.open(copyAndGoIherbBtn.href, '_blank'); }, 800); }); },
    handleIherbCodeClick() { const code = App.elements.iherbCode.textContent.trim(); navigator.clipboard.writeText(code).then(() => App.utils.toast(App.i18n.strings[App.state.lang].copied)); },
    openProfileModal() { App.elements.profileModal.classList.add('open'); App.elements.profileModal.setAttribute('aria-hidden', 'false'); },
    closeProfileModal() { App.elements.profileModal.classList.remove('open'); App.elements.profileModal.setAttribute('aria-hidden', 'true'); },
    handleProfileGetPlanClick() { this.closeProfileModal(); this.openContactModal(); },
    handleResetClick() { App.elements.resetConfirmModal.classList.add('open'); },
    handleResetConfirm() { localStorage.removeItem(App.config.STORAGE_KEY); window.location.reload(); },
    handleResetCancel() { App.elements.resetConfirmModal.classList.remove('open'); },
    openHowToUseModal() { App.elements.howToUseModal.classList.add('open'); },
    closeHowToUseModal() { App.elements.howToUseModal.classList.remove('open'); },
    handleModalClick(e) { if (e.target === App.elements.contactModal) this.closeContactModal(); if (e.target === App.elements.profileModal) this.closeProfileModal(); if (e.target === App.elements.resetConfirmModal) this.handleResetCancel(); if (e.target === App.elements.imageViewerModal) this.closeImageViewer(); if (e.target === App.elements.howToUseModal) this.closeHowToUseModal();},
    addMessageEventListeners(bubble) {
        bubble.addEventListener('pointerdown', (e) => this.handleLongPressStart(e, bubble));
        bubble.addEventListener('pointerup', this.handleLongPressEnd);
        bubble.addEventListener('pointerleave', this.handleLongPressEnd);
        bubble.addEventListener('contextmenu', e => e.preventDefault());
    },
    handleLongPressStart(e, bubble) { if (App.state.longPressTimer) clearTimeout(App.state.longPressTimer); App.state.longPressTimer = setTimeout(() => { this.showContextMenu(bubble); }, App.config.LONG_PRESS_DURATION); },
    handleLongPressEnd() { clearTimeout(App.state.longPressTimer); },
    showContextMenu(bubble) {
        const { messageContextMenu } = App.elements;
        const messageId = bubble.dataset.messageId;
        const message = App.state.chatHistory.find(m => m.id === messageId);
        if (!message) return;
        App.state.currentContextMenu = { bubble, message };
        const isPinned = App.state.pinnedMessageId === messageId;
        const isUser = message.role === 'user';
        const L = App.i18n.strings[App.state.lang];
        messageContextMenu.querySelector('[data-action="pin"] span').textContent = isPinned ? L.contextUnpin : L.contextPin;
        messageContextMenu.querySelectorAll('[data-role="user-only"], [data-role="separator"]').forEach(el => { el.style.display = isUser ? '' : 'none'; });
        const rect = bubble.getBoundingClientRect();
        document.body.appendChild(messageContextMenu);
        let top = window.scrollY + rect.top - messageContextMenu.offsetHeight - 10;
        if (top < window.scrollY + 10) { top = window.scrollY + rect.bottom + 10; }
        let left = rect.left + (rect.width / 2) - (messageContextMenu.offsetWidth / 2);
        left = Math.max(10, Math.min(left, window.innerWidth - messageContextMenu.offsetWidth - 10));
        messageContextMenu.style.top = `${top}px`;
        messageContextMenu.style.left = `${left}px`;
        messageContextMenu.classList.add('show');
    },
    hideContextMenu() { App.elements.messageContextMenu.classList.remove('show'); App.state.currentContextMenu = null; },
    handleContextMenuAction(action) {
        const { message } = App.state.currentContextMenu;
        const L = App.i18n.strings[App.state.lang];
        const textContent = message.parts[0].text;
        if (action === 'copy') { navigator.clipboard.writeText(textContent).then(() => App.utils.toast(L.copied)); }  
        else if (action === 'share') { if (navigator.share) { navigator.share({ text: textContent }).then(() => App.utils.toast(L.sharedSuccessfully)).catch(() => App.utils.toast(L.shareFailed)); } else { App.utils.toast(L.shareFailed); } }
        else if (action === 'pin') { App.state.pinnedMessageId = (App.state.pinnedMessageId === message.id) ? null : message.id; App.core.saveHistory(); App.ui.updatePinnedMessageUI(); }
        else if (action === 'edit') { this.handleStartEdit(message); }
        else if (action === 'delete') { this.handleDelete(message); }
        this.hideContextMenu();
    },
    handleUnpin() { App.state.pinnedMessageId = null; App.core.saveHistory(); App.ui.updatePinnedMessageUI(); },
    handleStartEdit(message) {
        const { userInput } = App.elements;
        const uiMessage = document.querySelector(`[data-message-id="${message.id}"]`);
        const msgContentDiv = uiMessage.querySelector('.msg-content');
        if (!msgContentDiv) return;
        App.state.isEditing = true;
        App.state.editingMessageId = message.id;
        App.ui.setEditing(true);
        userInput.value = msgContentDiv.innerText;
        userInput.focus();
        userInput.dispatchEvent(new Event('input'));
    },
    handleDelete(message) {
        const deleteIndex = App.state.chatHistory.findIndex(m => m.id === message.id);
        if (deleteIndex > -1) {
            App.state.chatHistory.splice(deleteIndex);
            App.ui.rebuildChatUI();
            App.core.saveHistory();
            App.utils.toast(App.i18n.strings[App.state.lang].messageDeleted);
        }
    }
  },
  init() {
    document.addEventListener('DOMContentLoaded', () => {
      this.cacheElements();
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) { document.documentElement.classList.add('dark'); this.elements.btnTheme.textContent = '🌙'; }
      this.i18n.setLang(navigator.language.startsWith('ar') ? 'ar' : 'en');
      this.core.loadHistory();
      const { elements: E, handlers: H } = this;
      E.startBtn.addEventListener('click', H.handleStartClick);
      E.nextBtn.addEventListener('click', () => H.handleNextClick.call(App));
      E.sendBtn.addEventListener('click', () => App.core.sendMessage.call(App.core));
      E.userInput.addEventListener('keypress', H.handleKeyPress);
      E.btnTheme.addEventListener('click', this.utils.setTheme);
      E.plusBtn.addEventListener('click', () => E.fileInput.click());
      E.fileInput.addEventListener('change', H.handleFileChange);
      E.closeContactBtn.addEventListener('click', H.closeContactModal);
      E.contactModal.addEventListener('click', (e) => H.handleModalClick.call(H, e));
      E.generatePlanBtn.addEventListener('click', H.openContactModal);
      E.copyAndGoIherbBtn.addEventListener('click', H.handleIherbCopy);
      E.iherbCode.addEventListener('click', () => H.handleIherbCodeClick.call(H));
      E.chatAvatar.addEventListener('click', H.openProfileModal);
      E.closeProfileBtn.addEventListener('click', H.closeProfileModal);
      E.profileModal.addEventListener('click', (e) => H.handleModalClick.call(H, e));
      E.profileGetPlanBtn.addEventListener('click', () => H.handleProfileGetPlanClick.call(H));
      E.resetBtn.addEventListener('click', H.handleResetClick);
      E.confirmResetBtn.addEventListener('click', H.handleResetConfirm);
      E.cancelResetBtn.addEventListener('click', H.handleResetCancel);
      E.resetConfirmModal.addEventListener('click', (e) => H.handleModalClick.call(H, e));
      E.messageContextMenu.addEventListener('click', (e) => { const action = e.target.closest('[data-action]')?.dataset.action; if (action) H.handleContextMenuAction.call(H, action); });
      document.addEventListener('click', (e) => { if (E.messageContextMenu && E.messageContextMenu.classList.contains('show') && !E.messageContextMenu.contains(e.target) && !e.target.closest('.message-bubble')) { H.hideContextMenu.call(H); } });
      E.unpinBtn.addEventListener('click', H.handleUnpin);
      E.pinnedMessageArea.addEventListener('click', (e) => { if (e.target !== E.unpinBtn && !E.unpinBtn.contains(e.target)) { const msgEl = document.querySelector(`[data-message-id="${App.state.pinnedMessageId}"]`); if (msgEl) msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } });
      document.querySelectorAll('.lang-toggle-btn').forEach(btn => { btn.addEventListener('click', () => this.i18n.setLang(this.state.lang === 'ar' ? 'en' : 'ar')); });
      ['pointerdown','touchstart'].forEach(ev=>E.micBtn.addEventListener(ev, H.handleMicRecord,{passive:false}));
      ['pointerup','touchend','mouseleave'].forEach(ev=>E.micBtn.addEventListener(ev, H.handleMicStop,{passive:false}));
      E.closeImageViewerBtn.addEventListener('click', H.closeImageViewer);
      E.imageViewerModal.addEventListener('click', (e) => H.handleModalClick.call(H, e));
      E.howToUseLink.addEventListener('click', (e) => { e.preventDefault(); H.openHowToUseModal(); });
      E.closeHowToUseBtn.addEventListener('click', H.closeHowToUseModal);
      E.howToUseModal.addEventListener('click', (e) => H.handleModalClick.call(H, e));
      initUIEnhancements();
    });
  }
};
window.App = App;
App.init();

}
