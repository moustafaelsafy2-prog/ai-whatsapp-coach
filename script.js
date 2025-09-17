/* ---------- Utilities ---------- */
function $(id) { return document.getElementById(id); }
function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }
function dirFor(lang){ return lang === 'ar' ? 'rtl' : 'ltr'; }

/* ---------- App State ---------- */
const App = {
  config: {
    MAX_IMAGES: 5,
    DEFAULT_MODEL: 'auto',
    DEFAULT_TEMP: 0.6,
    DEFAULT_TOPP: 0.9,
    DEFAULT_MAXTOK: 2048,
    DEFAULT_TIMEOUT: 26000
  },
  state: {
    lang: 'ar',
    isRecording: false,
    mediaRecorder: null,
    recordedChunks: [],
    audioBlob: null
  },
  el: {}
};

/* ---------- Element Binding (with fallbacks) ---------- */
function bindElements(){
  // عناصر أساسية (بعضها يختلف اسمه بين الإصدارات)
  App.el.chat =
    $('chat') || $('chatMessages') || $('chatContainer');            // الحاوية الرئيسية للرسائل
  App.el.userInput = $('userInput') || $('inputArea');               // مربع الإدخال
  App.el.sendBtn = $('sendBtn');                                     // زر الإرسال
  App.el.micBtn = $('micBtn');                                       // زر الميكروفون
  App.el.fileInput = $('fileInput');                                 // إدخال الصور/الملفات

  // عناصر اختيارية (قد لا تكون موجودة)
  App.el.langToggleBtn = $('langToggleBtn') || $('btnLang');         // زر تبديل اللغة
  App.el.clearBtn = $('clearBtn');                                   // زر مسح المحادثة (اختياري)
  App.el.uploadImageBtn = $('uploadImageBtn') || $('btnAttach');     // زر إرفاق الصورة (اختياري)
  App.el.imagePreview =
    $('imagePreview') || $('imagePreviewsContainer') || $('imagePreviewsWrapper');
  App.el.imageViewerModal = $('imageViewerModal') || null;
  App.el.imageViewer = $('imageViewer') || null;
  App.el.closeImageViewerBtn = $('closeImageViewerBtn') || null;
  App.el.howToUseModal = $('howToUseModal') || null;
  App.el.howToUseLink = $('howToUseLink') || null;
  App.el.closeHowToUseBtn = $('closeHowToUseBtn') || null;

  // حماية من عدم توفر العناصر الأساسية
  if (!App.el.chat || !App.el.userInput || !App.el.sendBtn) {
    console.error('Critical elements missing: chat/userInput/sendBtn');
  }
}

/* ---------- UI Helpers ---------- */
const UI = {
  t: (k) => {
    const AR = {
      placeholder: 'اكتب رسالتك...',
      typing: 'يكتب...',
      serverError: '⚠️ خطأ من الخادم: ',
      empty: 'الرسالة فارغة.'
    };
    const EN = {
      placeholder: 'Type your message...',
      typing: 'typing…',
      serverError: '⚠️ Server error: ',
      empty: 'Empty message.'
    };
    return (App.state.lang === 'ar' ? AR : EN)[k] || k;
  },

  setLang(lang){
    App.state.lang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = dirFor(lang);
    if (App.el.userInput) App.el.userInput.placeholder = UI.t('placeholder');
  },

  appendMessage(role, content, { rawHTML=false } = {}){
    if (!App.el.chat) return;
    const wrap = document.createElement('div');
    wrap.className = `msg ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.dir = dirFor(App.state.lang);
    bubble[rawHTML ? 'innerHTML' : 'textContent'] = content;
    wrap.appendChild(bubble);
    App.el.chat.appendChild(wrap);
    App.el.chat.scrollTop = App.el.chat.scrollHeight;
    return wrap;
  },

  showTyping(){
    const id = 'typing-' + Date.now();
    const node = UI.appendMessage('bot', UI.t('typing'));
    if (node) node.id = id;
    return id;
  },

  hideTyping(id){
    const el = $(id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  },

  showImagePreview(files){
    if (!App.el.imagePreview) return;
    App.el.imagePreview.innerHTML = '';
    if (!files || !files.length) { App.el.imagePreview.classList.add('hidden'); return; }
    App.el.imagePreview.classList.remove('hidden');
    Array.from(files).forEach((f, i) => {
      const url = URL.createObjectURL(f);
      const img = document.createElement('img');
      img.src = url;
      img.alt = f.name || `image-${i+1}`;
      img.className = 'preview-image';
      if (App.el.imageViewer && App.el.imageViewerModal) {
        img.addEventListener('click', () => {
          App.el.imageViewer.src = url;
          App.el.imageViewerModal.classList.remove('hidden');
        });
      }
      App.el.imagePreview.appendChild(img);
    });
  }
};

/* ---------- Network ---------- */
const Net = {
  toBase64(file){
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  },
  async toInlineData(files){
    const out = [];
    for (const f of files) {
      out.push({ inline_data: { mime_type: f.type || 'application/octet-stream', data: await Net.toBase64(f) } });
    }
    return out;
  },
  async callAI({ prompt, images, audio }){
    const body = JSON.stringify({
      prompt,
      images,
      audio,
      model: App.config.DEFAULT_MODEL,
      temperature: App.config.DEFAULT_TEMP,
      top_p: App.config.DEFAULT_TOPP,
      max_output_tokens: App.config.DEFAULT_MAXTOK,
      stream: false,
      timeout_ms: App.config.DEFAULT_TIMEOUT,
      force_lang: App.state.lang,
      guard_level: 'strict'
    });

    const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (!res.ok) {
      let err = {};
      try { err = await res.json(); } catch {}
      const msg = [err.error, err.details, err.requestId].filter(Boolean).join(' | ') || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    const data = await res.json();
    return data?.text || '';
  }
};

/* ---------- Handlers ---------- */
const H = {
  async sendMessage(){
    const text = (App.el.userInput?.value || '').trim();
    const files = Array.from(App.el.fileInput?.files || []);
    if (!text && !files.length && !App.state.audioBlob) {
      UI.appendMessage('bot', UI.t('empty'));
      return;
    }

    // طباعة رسالة المستخدم
    UI.appendMessage('user', text || '[media]');
    if (App.el.userInput) App.el.userInput.value = '';

    // تجهيز الوسائط
    let inlineImages = [];
    if (files.length) {
      inlineImages = await Net.toInlineData(files);
      UI.showImagePreview(files);
    }
    let inlineAudio = [];
    if (App.state.audioBlob) {
      const aFile = new File([App.state.audioBlob], 'audio.webm', { type: 'audio/webm' });
      inlineAudio = await Net.toInlineData([aFile]);
      App.state.audioBlob = null;
    }

    // نداء السيرفر
    const typingId = UI.showTyping();
    try {
      const reply = await Net.callAI({ prompt: text, images: inlineImages, audio: inlineAudio });
      UI.hideTyping(typingId);
      UI.appendMessage('bot', reply, { rawHTML: false });
    } catch (e) {
      UI.hideTyping(typingId);
      UI.appendMessage('bot', (App.state.lang === 'ar' ? UI.t('serverError') : UI.t('serverError')) + e.message);
    } finally {
      safe(() => App.el.userInput.focus(), null);
    }
  },

  async handleMicRecord(e){
    e.preventDefault();
    if (App.state.isRecording) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Microphone not supported.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      App.state.mediaRecorder = mr;
      App.state.recordedChunks = [];
      mr.ondataavailable = ev => { if (ev.data && ev.data.size) App.state.recordedChunks.push(ev.data); };
      mr.onstop = () => {
        const blob = new Blob(App.state.recordedChunks, { type: 'audio/webm' });
        App.state.audioBlob = blob;
      };
      mr.start();
      App.state.isRecording = true;
      if (App.el.micBtn) { App.el.micBtn.textContent = (App.state.lang === 'ar') ? 'إيقاف' : 'Stop'; App.el.micBtn.classList.add('recording'); }
    } catch {
      alert('Cannot access microphone.');
    }
  },

  handleMicStop(){
    if (!App.state.isRecording) return;
    const mr = App.state.mediaRecorder;
    try { mr && mr.state !== 'inactive' && mr.stop(); } catch {}
    App.state.isRecording = false;
    if (App.el.micBtn) { App.el.micBtn.textContent = (App.state.lang === 'ar') ? 'تسجيل' : 'Record'; App.el.micBtn.classList.remove('recording'); }
  },

  addImageFiles(files){
    if (!App.el.fileInput || !files?.length) return;
    const dt = new DataTransfer();
    Array.from(App.el.fileInput.files || []).forEach(f => dt.items.add(f));
    for (const f of files) {
      if (dt.files.length >= App.config.MAX_IMAGES) break;
      dt.items.add(f);
    }
    App.el.fileInput.files = dt.files;
    UI.showImagePreview(App.el.fileInput.files);
  },

  handleFileInput(e){ H.addImageFiles(Array.from(e.target.files || [])); },
  handleDrop(e){ e.preventDefault(); H.addImageFiles(Array.from(e.dataTransfer.files || [])); },
  handleDragOver(e){ e.preventDefault(); },

  toggleLang(){
    const next = (App.state.lang === 'ar') ? 'en' : 'ar';
    UI.setLang(next);
  },

  closeImageViewer(){
    if (App.el.imageViewerModal) App.el.imageViewerModal.classList.add('hidden');
    if (App.el.imageViewer) App.el.imageViewer.src = '';
  },

  openHowToUseModal(){
    if (App.el.howToUseModal) App.el.howToUseModal.classList.remove('hidden');
  },

  closeHowToUseModal(){
    if (App.el.howToUseModal) App.el.howToUseModal.classList.add('hidden');
  },

  handleModalClick(e){
    if (e.target && e.target.classList.contains('modal')) {
      H.closeImageViewer();
      H.closeHowToUseModal();
    }
  }
};

/* ---------- Bootstrap ---------- */
function init(){
  bindElements();
  UI.setLang(App.state.lang);

  // نصوص افتراضية للأزرار
  if (App.el.micBtn) App.el.micBtn.textContent = (App.state.lang === 'ar') ? 'تسجيل' : 'Record';
  if (App.el.sendBtn) App.el.sendBtn.textContent = (App.state.lang === 'ar') ? 'إرسال' : 'Send';
  if (App.el.userInput) App.el.userInput.placeholder = UI.t('placeholder');

  // مستمعات أساسية
  App.el.sendBtn && App.el.sendBtn.addEventListener('click', H.sendMessage);
  App.el.userInput && App.el.userInput.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey) { e.preventDefault(); H.sendMessage(); }
  });

  App.el.micBtn && App.el.micBtn.addEventListener('pointerdown', H.handleMicRecord, { passive: false });
  App.el.micBtn && App.el.micBtn.addEventListener('pointerup', H.handleMicStop, { passive: false });
  App.el.micBtn && App.el.micBtn.addEventListener('mouseleave', H.handleMicStop, { passive: false });
  App.el.micBtn && App.el.micBtn.addEventListener('touchstart', H.handleMicRecord, { passive: false });
  App.el.micBtn && App.el.micBtn.addEventListener('touchend', H.handleMicStop, { passive: false });

  App.el.langToggleBtn && App.el.langToggleBtn.addEventListener('click', H.toggleLang);

  App.el.uploadImageBtn && App.el.uploadImageBtn.addEventListener('click', () => App.el.fileInput && App.el.fileInput.click());
  App.el.fileInput && App.el.fileInput.addEventListener('change', H.handleFileInput);

  // سحب وإفلات داخل مربع الإدخال إن وجد
  App.el.userInput && App.el.userInput.addEventListener('drop', H.handleDrop);
  App.el.userInput && App.el.userInput.addEventListener('dragover', H.handleDragOver);

  // عارض الصور/المودالات (اختياري)
  App.el.closeImageViewerBtn && App.el.closeImageViewerBtn.addEventListener('click', H.closeImageViewer);
  App.el.imageViewerModal && App.el.imageViewerModal.addEventListener('click', (e) => H.handleModalClick(e));
  App.el.howToUseLink && App.el.howToUseLink.addEventListener('click', (e) => { e.preventDefault(); H.openHowToUseModal(); });
  App.el.closeHowToUseBtn && App.el.closeHowToUseBtn.addEventListener('click', H.closeHowToUseModal);
  App.el.howToUseModal && App.el.howToUseModal.addEventListener('click', (e) => H.handleModalClick(e));

  // ضبط ارتفاع الـ textarea تلقائيًا
  if (App.el.userInput) {
    const autoGrow = () => {
      App.el.userInput.style.height = 'auto';
      const maxH = 180;
      const newH = Math.min(App.el.userInput.scrollHeight, maxH);
      App.el.userInput.style.height = `${newH}px`;
      App.el.userInput.style.overflowY = (App.el.userInput.scrollHeight > maxH) ? 'auto' : 'hidden';
    };
    ['input','change','keyup'].forEach(ev => App.el.userInput.addEventListener(ev, autoGrow));
    autoGrow();
  }
}

document.addEventListener('DOMContentLoaded', init);
