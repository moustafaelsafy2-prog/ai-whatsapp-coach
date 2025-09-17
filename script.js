function initUIEnhancements() { const userInput = document.getElementById('userInput'); const micBtn = document.getElementById('micBtn'); const sendBtn = document.getElementById('sendBtn'); if (!userInput || !micBtn || !sendBtn) return; const adjustTextareaHeight = () => { userInput.style.height = 'auto'; const maxH = 180; const newH = Math.min(userInput.scrollHeight, maxH); userInput.style.height = `${newH}px`; userInput.style.overflowY = (userInput.scrollHeight > maxH) ? 'auto' : 'hidden'; }; ['input','change','keyup'].forEach(ev => userInput.addEventListener(ev, adjustTextareaHeight)); adjustTextareaHeight(); const handleKey = (e) => { if ((e.key === 'Enter' && !e.shiftKey) || (e.keyCode === 13 && !e.shiftKey)) { e.preventDefault(); sendBtn.click(); } }; userInput.addEventListener('keydown', handleKey); if ('ontouchstart' in window || navigator.maxTouchPoints > 0) { userInput.setAttribute('inputmode','text'); } const originalScrollIntoViewIfNeeded = Element.prototype.scrollIntoViewIfNeeded || function(centerIfNeeded) { this.scrollIntoView({ behavior: 'smooth', block: centerIfNeeded ? 'center' : 'nearest'}); }; Element.prototype.scrollIntoViewIfNeeded = function() { const args = arguments; window.requestAnimationFrame(() => { try { originalScrollIntoViewIfNeeded.apply(this, args); } catch {} }); }; const origFocus = HTMLElement.prototype.focus; HTMLElement.prototype.focus = function() { const args = arguments; setTimeout(() => { try { origFocus.apply(this, args); } catch {} }, 0); }; const origAppend = Element.prototype.appendChild; Element.prototype.appendChild = function() { const args = arguments; const el = origAppend.apply(this, args); if (el && el.tagName === 'TEXTAREA') setTimeout(adjustTextareaHeight, 0); return el; }; const origInsert = Element.prototype.insertBefore; Element.prototype.insertBefore = function() { const args = arguments; const el = origInsert.apply(this, args); if (el && el.tagName === 'TEXTAREA') setTimeout(adjustTextareaHeight, 0); return el; }; const origReplace = Element.prototype.replaceChildren; Element.prototype.replaceChildren = function() { const args = arguments; const el = origReplace.apply(this, args); setTimeout(adjustTextareaHeight, 0); return el; }; const origSetRangeText = HTMLTextAreaElement.prototype.setRangeText; HTMLTextAreaElement.prototype.setRangeText = function() { const args = arguments; const r = origSetRangeText.apply(this, args); setTimeout(adjustTextareaHeight, 0); return r; }; const origInsertData = DataTransfer.prototype.setData; DataTransfer.prototype.setData = function() { const args = arguments; try { return origInsertData.apply(this, args); } finally { setTimeout(adjustTextareaHeight, 0); } }; const origClipboard = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText.bind(navigator.clipboard) : null; if (origClipboard) { navigator.clipboard.writeText = function() { const args = arguments; return origClipboard.apply(this, args).finally(() => setTimeout(adjustTextareaHeight, 0)); }; } const origAppendMessage = (window.__appendMessage__ || function(){}); window.__appendMessage__ = function() { const args = arguments; origAppendMessage.apply(this, args); setTimeout(adjustTextareaHeight, 0); }; }

const App = {
  config: { MAX_PROMPT_CHARS: 28000, STORAGE_KEY: 'smart-coach-session-v3', LONG_PRESS_DURATION: 400, MAX_IMAGES: 5 },
  state: { userState: { step: 0, data: {} }, lang: 'ar', chatHistory: [], uploading: false, isRecording: false, mediaRecorder: null, recordedChunks: [], audioBlob: null, imageBlobs: [], currentContextMenu: null, isEditing: false, editingMessageId: null },
  elements: {},
  cacheElements() {
    const $ = id => document.getElementById(id);
    this.elements = {
      chat: $('chat'),
      userInput: $('userInput'),
      sendBtn: $('sendBtn'),
      micBtn: $('micBtn'),
      uploadImageBtn: $('uploadImageBtn'),
      clearBtn: $('clearBtn'),
      langToggleBtn: $('langToggleBtn'),
      fileInput: $('fileInput'),
      imagePreview: $('imagePreview'),
      imageViewerModal: $('imageViewerModal'),
      imageViewer: $('imageViewer'),
      closeImageViewerBtn: $('closeImageViewerBtn'),
      howToUseModal: $('howToUseModal'),
      howToUseLink: $('howToUseLink'),
      closeHowToUseBtn: $('closeHowToUseBtn')
    };
  },
  i18n: {
    strings: {
      ar: {
        placeholder: 'اكتب رسالتك...',
        send: 'إرسال',
        mic: 'تسجيل',
        stop: 'إيقاف',
        clear: 'مسح المحادثة',
        typing: 'يكتب...',
        you: 'أنت',
        bot: 'المدرب الذكي',
        uploadImage: 'إرفاق صورة',
        howToUse: 'كيف تستخدم الخدمة',
        error: '⚠️ خطأ من الخادم: ',
        empty: 'الرسالة فارغة.',
        copied: 'تم النسخ!',
        view: 'عرض',
        close: 'إغلاق',
        edit: 'تعديل',
        save: 'حفظ',
        cancel: 'إلغاء'
      },
      en: {
        placeholder: 'Type your message...',
        send: 'Send',
        mic: 'Record',
        stop: 'Stop',
        clear: 'Clear chat',
        typing: 'typing…',
        you: 'You',
        bot: 'Smart Coach',
        uploadImage: 'Attach image',
        howToUse: 'How to use',
        error: '⚠️ Server error: ',
        empty: 'Empty message.',
        copied: 'Copied!',
        view: 'View',
        close: 'Close',
        edit: 'Edit',
        save: 'Save',
        cancel: 'Cancel'
      }
    },
    t(key) { return this.strings[App.state.lang][key] || key; },
    setLang(l){ App.state.lang = l; App.elements.userInput.placeholder = this.t('placeholder'); document.documentElement.dir = (l === 'ar') ? 'rtl' : 'ltr'; document.documentElement.lang = l; }
  },
  ui: {
    appendMessage(role, content, opts = {}) {
      const E = App.elements;
      const wrap = document.createElement('div');
      wrap.className = `msg ${role}`;
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.dir = (App.state.lang === 'ar') ? 'rtl' : 'ltr';

      if (opts.editable) {
        wrap.dataset.messageId = opts.id || (Date.now() + '_' + Math.random().toString(16).slice(2));
        bubble.setAttribute('contenteditable', 'true');
        bubble.classList.add('editable');
      }
      if (opts.rawHTML) bubble.innerHTML = content; else bubble.textContent = content;

      wrap.appendChild(bubble);
      E.chat.appendChild(wrap);
      E.chat.scrollTop = E.chat.scrollHeight;
      return wrap;
    },
    showTyping() {
      const id = 'typing-' + Date.now();
      const node = this.appendMessage('bot', App.i18n.t('typing'), { id });
      node.id = id;
      return id;
    },
    hideTyping(id) {
      const el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    },
    showImagePreview(files) {
      const E = App.elements;
      E.imagePreview.innerHTML = '';
      if (!files || !files.length) { E.imagePreview.classList.add('hidden'); return; }
      E.imagePreview.classList.remove('hidden');
      Array.from(files).forEach((f, idx) => {
        const url = URL.createObjectURL(f);
        const img = document.createElement('img');
        img.src = url;
        img.alt = f.name || `image-${idx+1}`;
        img.className = 'preview-image';
        img.addEventListener('click', () => App.handlers.openImageViewer(url));
        E.imagePreview.appendChild(img);
      });
    },
    setRecording(isRec) {
      const E = App.elements;
      App.state.isRecording = isRec;
      E.micBtn.textContent = isRec ? App.i18n.t('stop') : App.i18n.t('mic');
      E.micBtn.classList.toggle('recording', isRec);
    }
  },
  net: {
    toBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },
    async callAI({ prompt, messages, images, audio, options = {} }) {
      const headers = { 'Content-Type': 'application/json' };
      const body = JSON.stringify({
        prompt, messages, images, audio,
        model: options.model || 'auto',
        temperature: options.temperature ?? 0.6,
        top_p: options.top_p ?? 0.9,
        max_output_tokens: options.max_output_tokens ?? 2048,
        system: options.system || undefined,
        stream: false,
        timeout_ms: options.timeout_ms ?? 26000,
        include_raw: false,
        force_lang: App.state.lang,
        concise_image: options.concise_image || undefined,
        guard_level: options.guard_level || 'strict'
      });

      const res = await fetch('/api/generate', { method: 'POST', headers, body });
      if (!res.ok) {
        let errorData = {};
        try { errorData = await res.json(); } catch {}
        const serverMsg = [errorData.error, errorData.details, errorData.requestId].filter(Boolean).join(' | ');
        throw new Error(serverMsg || `HTTP ${res.status}`);
      }
      const data = await res.json();
      return data?.text || '';
    },
    async toInlineData(files) {
      const out = [];
      for (const f of files) {
        const mime = f.type || 'application/octet-stream';
        const data = await this.toBase64(f);
        out.push({ inline_data: { mime_type: mime, data } });
      }
      return out;
    }
  },
  handlers: {
    async sendMessage() {
      const E = App.elements;
      const text = (E.userInput.value || '').trim();
      const files = Array.from(E.fileInput.files || []);
      if (!text && !files.length && !App.state.audioBlob) {
        alert(App.i18n.t('empty'));
        return;
      }

      const userNode = App.ui.appendMessage('user', text || '[media]');
      E.userInput.value = '';
      App.state.imageBlobs = files;
      App.ui.showImagePreview(files);

      let inlineImages = [];
      let inlineAudio = [];
      if (files.length) {
        inlineImages = await App.net.toInlineData(files);
      }
      if (App.state.audioBlob) {
        const aFile = new File([App.state.audioBlob], 'audio.webm', { type: 'audio/webm' });
        inlineAudio = await App.net.toInlineData([aFile]);
        App.state.audioBlob = null;
      }

      const typingId = App.ui.showTyping();
      try {
        const reply = await App.net.callAI({
          prompt: text,
          images: inlineImages,
          audio: inlineAudio,
          options: { guard_level: 'strict' }
        });
        App.ui.hideTyping(typingId);
        App.ui.appendMessage('bot', reply);
      } catch (e) {
        App.ui.hideTyping(typingId);
        const msg = (App.state.lang === 'ar') ? `⚠️ خطأ من الخادم: ${e.message}` : `⚠️ Server error: ${e.message}`;
        App.ui.appendMessage('bot', msg);
      } finally {
        E.userInput.focus();
      }
    },
    async handleMicRecord(e) {
      e.preventDefault();
      if (App.state.isRecording) return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Microphone not supported.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream);
        App.state.mediaRecorder = mr;
        App.state.recordedChunks = [];
        mr.ondataavailable = (ev) => { if (ev.data && ev.data.size) App.state.recordedChunks.push(ev.data); };
        mr.onstop = () => {
          const blob = new Blob(App.state.recordedChunks, { type: 'audio/webm' });
          App.state.audioBlob = blob;
        };
        mr.start();
        App.ui.setRecording(true);
      } catch (err) {
        alert('Cannot access microphone.');
      }
    },
    handleMicStop() {
      if (!App.state.isRecording) return;
      const mr = App.state.mediaRecorder;
      try { mr && mr.state !== 'inactive' && mr.stop(); } catch {}
      App.ui.setRecording(false);
    },
    addImageFiles(files) {
      const E = App.elements;
      if (!files || !files.length) return;
      const dt = new DataTransfer();
      Array.from(E.fileInput.files || []).forEach(f => dt.items.add(f));
      for (const f of files) {
        if ((E.fileInput.files.length + dt.items.length) >= App.config.MAX_IMAGES) break;
        dt.items.add(f);
      }
      E.fileInput.files = dt.files;
      App.ui.showImagePreview(E.fileInput.files);
    },
    handleFileInput(e) {
      const files = Array.from(e.target.files || []);
      App.handlers.addImageFiles(files);
    },
    handleDrop(e) {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files || []);
      App.handlers.addImageFiles(files);
    },
    handleDragOver(e){ e.preventDefault(); },
    openImageViewer(src){
      const E = App.elements;
      E.imageViewer.src = src;
      E.imageViewerModal.classList.remove('hidden');
    },
    closeImageViewer(){
      const E = App.elements;
      E.imageViewerModal.classList.add('hidden');
      E.imageViewer.src = '';
    },
    handleModalClick(e){
      if (e.target && e.target.classList.contains('modal')) {
        this.closeImageViewer();
        const E = App.elements;
        if (!E.howToUseModal.classList.contains('hidden')) E.howToUseModal.classList.add('hidden');
      }
    },
    openHowToUseModal(){
      const E = App.elements;
      E.howToUseModal.classList.remove('hidden');
    }
  },
  init() {
    this.cacheElements();
    const E = this.elements;
    this.i18n.setLang(this.state.lang);

    E.userInput.placeholder = this.i18n.t('placeholder');
    E.sendBtn.textContent = this.i18n.t('send');
    E.micBtn.textContent = this.i18n.t('mic');
    E.clearBtn.textContent = this.i18n.t('clear');
    E.uploadImageBtn.textContent = this.i18n.t('uploadImage');

    E.sendBtn.addEventListener('click', this.handlers.sendMessage);
    E.userInput.addEventListener('drop', this.handlers.handleDrop);
    E.userInput.addEventListener('dragover', this.handlers.handleDragOver);
    E.fileInput.addEventListener('change', this.handlers.handleFileInput);
    E.uploadImageBtn.addEventListener('click', () => E.fileInput.click());
    E.clearBtn.addEventListener('click', () => { E.chat.innerHTML = ''; E.userInput.value=''; E.userInput.focus(); });
    E.langToggleBtn.addEventListener('click', () => this.i18n.setLang(this.state.lang === 'ar' ? 'en' : 'ar'));

    ['pointerdown','touchstart'].forEach(ev => E.micBtn.addEventListener(ev, this.handlers.handleMicRecord, { passive:false }));
    ['pointerup','touchend','mouseleave'].forEach(ev => E.micBtn.addEventListener(ev, this.handlers.handleMicStop, { passive:false }));

    E.closeImageViewerBtn.addEventListener('click', this.handlers.closeImageViewer);
    E.imageViewerModal.addEventListener('click', (e)=> this.handlers.handleModalClick.call(this.handlers, e));
    E.howToUseLink.addEventListener('click', (e)=>{ e.preventDefault(); this.handlers.openHowToUseModal(); });
    E.closeHowToUseBtn.addEventListener('click', ()=> E.howToUseModal.classList.add('hidden'));
    E.howToUseModal.addEventListener('click', (e)=> this.handlers.handleModalClick.call(this.handlers, e));

    initUIEnhancements();
  }
};
window.App = App;
App.init();
