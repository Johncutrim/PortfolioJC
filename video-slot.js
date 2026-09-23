// Media slots for the portfolio.
//   <video-slot id placeholder>        — one video OR image, dropped by the user
//   <carousel-slot id slides placeholder> — several images with prev/next arrows
// Files are stored locally in the browser (IndexedDB), so they survive reload.
// Videos play muted + looped (browsers block sound on autoplay).
(function () {
  const DB = 'jc-media-slots';
  const STORE = 'files';
  let dbp;
  function db() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbp;
  }
  async function put(key, blob) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  }
  async function get(key) {
    const d = await db();
    return new Promise((res) => {
      const tx = d.transaction(STORE, 'readonly');
      const q = tx.objectStore(STORE).get(key);
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => res(null);
    });
  }
  async function del(key) {
    const d = await db();
    return new Promise((res) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = res;
      tx.onerror = res;
    });
  }

  const CHROME = `
    :host { display:block; position:relative; width:100%; height:100%; background:#0d0d0d; }
    .stage { position:absolute; inset:0; overflow:hidden; }
    .media { width:100%; height:100%; object-fit:cover; display:block; background:#0d0d0d;
             transform:translateZ(0); backface-visibility:hidden; -webkit-backface-visibility:hidden; }
    video.media { filter:blur(0.001px); }
    .ph { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
          justify-content:center; gap:10px; padding:18px; box-sizing:border-box; text-align:center;
          font-family:Inter,system-ui,sans-serif; font-size:10px; letter-spacing:0.14em;
          text-transform:uppercase; color:#8d8d8d; line-height:1.7; cursor:pointer;
          border:1px dashed rgba(255,255,255,0.18); transition:border-color .25s, color .25s; }
    .ph:hover { border-color:rgba(255,255,255,0.5); color:#e6e6e6; }
    .ph svg { width:22px; height:22px; stroke:currentColor; fill:none; stroke-width:1.2; }
    :host(.over) .ph { border-color:#fff; color:#fff; }
    .bar { position:absolute; left:10px; bottom:10px; display:flex; gap:6px; z-index:3; }
    button { font-family:Inter,system-ui,sans-serif; font-size:9px; letter-spacing:0.14em;
             text-transform:uppercase; color:#fff; background:rgba(18,18,18,0.6); cursor:pointer;
             border:1px solid rgba(255,255,255,0.4); border-radius:999px; padding:6px 11px;
             backdrop-filter:blur(6px); opacity:0; transition:opacity .25s, background .25s, color .25s; }
    :host(:hover) button { opacity:1; }
    button:hover { background:#fff; color:#121212; }
    input { display:none; }
  `;

  class VideoSlot extends HTMLElement {
    static get observedAttributes() { return ['src', 'placeholder']; }

    connectedCallback() {
      if (this._built) return;
      this._built = true;
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `<style>${CHROME}</style>
        <div class="stage"></div><div class="bar"></div>
        <input type="file" accept="video/*,image/*">`;
      this._stage = this.shadowRoot.querySelector('.stage');
      this._bar = this.shadowRoot.querySelector('.bar');
      this._input = this.shadowRoot.querySelector('input');
      this._input.addEventListener('change', () => {
        const f = this._input.files && this._input.files[0];
        if (f) this._accept(f);
        this._input.value = '';
      });
      ['dragenter', 'dragover'].forEach((e) => this.addEventListener(e, (ev) => {
        ev.preventDefault(); this.classList.add('over');
      }));
      ['dragleave', 'drop'].forEach((e) => this.addEventListener(e, () => this.classList.remove('over')));
      this.addEventListener('drop', (ev) => {
        ev.preventDefault();
        if (this.getAttribute('src')) return;
        const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
        if (f) this._accept(f);
      });
      this._render();
      this._restore();
    }

    attributeChangedCallback() { if (this._built) this._render(); }
    get key() { return 'slot:' + (this.id || 'default'); }

    async _restore() {
      if (this.getAttribute('src')) return;
      const blob = await get(this.key);
      if (blob) this._show(URL.createObjectURL(blob), blob.type);
    }

    async _accept(file) {
      try { await put(this.key, file); } catch (e) { /* mantém apenas na sessão */ }
      this._show(URL.createObjectURL(file), file.type);
    }

    async _clear() { await del(this.key); this._render(); }

    _render() {
      const src = this.getAttribute('src');
      if (src) {
        const t = this.getAttribute('type');
        const isV = t ? t === 'video' : /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src);
        return this._show(src, isV ? 'video/mp4' : 'image/*', true);
      }
      this._bar.innerHTML = '';
      this._stage.innerHTML = `
        <div class="ph">
          <svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L8 8m4-4 4 4"/><path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/></svg>
          <span>${this.getAttribute('placeholder') || 'Arraste um vídeo ou imagem'}</span>
          <span style="color:#5f5f5f">MP4 · MOV · WEBM · JPG · PNG</span>
        </div>`;
      this._stage.querySelector('.ph').addEventListener('click', () => this._input.click());
    }

    _show(url, type, fixed) {
      const isVideo = /^video\//.test(type || '');
      this._stage.innerHTML = isVideo
        ? `<video class="media" src="${url}" autoplay muted loop playsinline preload="metadata"></video>`
        : `<img class="media" src="${url}" alt="">`;
      const trocar = fixed ? '' : '<button data-act="clear">Trocar</button>';
      this._bar.innerHTML = (isVideo ? '<button data-act="sound">Som</button>' : '') + trocar;
      this._bar.querySelectorAll('button').forEach((b) => b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (b.dataset.act === 'clear') return this._clear();
        const v = this._stage.querySelector('video');
        if (!v) return;
        v.muted = !v.muted;
        b.textContent = v.muted ? 'Som' : 'Mudo';
        if (!v.muted) v.play().catch(() => {});
      }));
      const v = this._stage.querySelector('video');
      if (v) v.play().catch(() => {});
    }
  }

  class CarouselSlot extends HTMLElement {
    static get observedAttributes() { return ['slides', 'placeholder', 'srcs']; }
    attributeChangedCallback(n) { if (this._built && n === 'srcs') this._restore(); }
    get fixed() { return !!(this.getAttribute('srcs') || '').trim(); }

    connectedCallback() {
      if (this._built) return;
      this._built = true;
      this.i = 0;
      this.items = [];
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `<style>${CHROME}
        .nav { position:absolute; top:50%; transform:translateY(-50%); z-index:3; display:flex;
               align-items:center; justify-content:center; width:34px; height:34px; border-radius:999px;
               border:1px solid rgba(255,255,255,0.45); background:rgba(18,18,18,0.55); color:#fff;
               cursor:pointer; opacity:0; transition:opacity .25s, background .25s, color .25s;
               backdrop-filter:blur(6px); font-size:13px; padding:0; }
        :host(:hover) .nav { opacity:1; }
        .nav:hover { background:#fff; color:#121212; }
        .prev { left:10px; } .next { right:10px; }
        .dots { position:absolute; right:12px; bottom:12px; z-index:3; display:flex; gap:6px; align-items:center; }
        .dot { width:5px; height:5px; border-radius:999px; background:rgba(255,255,255,0.35); }
        .dot.on { background:#fff; }
        .count { position:absolute; left:12px; top:12px; z-index:3; font-family:Inter,system-ui,sans-serif;
                 font-size:9px; letter-spacing:0.16em; color:#fff; background:rgba(18,18,18,0.55);
                 border:1px solid rgba(255,255,255,0.25); border-radius:999px; padding:4px 9px;
                 font-feature-settings:'tnum'; }
      </style>
        <div class="stage"></div>
        <button class="nav prev" aria-label="Anterior">‹</button>
        <button class="nav next" aria-label="Próximo">›</button>
        <div class="count"></div><div class="dots"></div><div class="bar"></div>
        <input type="file" accept="image/*,video/*" multiple>`;
      this._stage = this.shadowRoot.querySelector('.stage');
      this._bar = this.shadowRoot.querySelector('.bar');
      this._dots = this.shadowRoot.querySelector('.dots');
      this._count = this.shadowRoot.querySelector('.count');
      this._input = this.shadowRoot.querySelector('input');
      this.shadowRoot.querySelector('.prev').addEventListener('click', (e) => { e.stopPropagation(); this.go(-1); });
      this.shadowRoot.querySelector('.next').addEventListener('click', (e) => { e.stopPropagation(); this.go(1); });
      this._input.addEventListener('change', () => {
        this._accept(Array.from(this._input.files || []));
        this._input.value = '';
      });
      ['dragenter', 'dragover'].forEach((e) => this.addEventListener(e, (ev) => {
        ev.preventDefault(); this.classList.add('over');
      }));
      ['dragleave', 'drop'].forEach((e) => this.addEventListener(e, () => this.classList.remove('over')));
      this.addEventListener('drop', (ev) => {
        ev.preventDefault();
        this._accept(Array.from((ev.dataTransfer && ev.dataTransfer.files) || []));
      });
      this._restore();
    }

    get key() { return 'car:' + (this.id || 'default'); }
    get max() { return parseInt(this.getAttribute('slides') || '10', 10); }

    async _restore() {
      if (this.fixed) {
        this.items = this.getAttribute('srcs').split('|').filter(Boolean).map((u) => ({ url: u, type: 'image/*' }));
        this.i = Math.min(this.i || 0, Math.max(this.items.length - 1, 0));
        return this._render();
      }
      const meta = await get(this.key + ':n');
      const n = Math.min(parseInt(meta || '0', 10) || 0, this.max);
      const out = [];
      for (let k = 0; k < n; k++) {
        const b = await get(this.key + ':' + k);
        if (b) out.push({ url: URL.createObjectURL(b), type: b.type });
      }
      this.items = out;
      this._render();
    }

    async _accept(files) {
      if (this.fixed) return;
      const media = files.filter((f) => /^(image|video)\//.test(f.type)).slice(0, this.max);
      if (!media.length) return;
      for (let k = 0; k < media.length; k++) {
        try { await put(this.key + ':' + k, media[k]); } catch (e) { /* sessão */ }
      }
      try { await put(this.key + ':n', String(media.length)); } catch (e) { /* sessão */ }
      this.items = media.map((f) => ({ url: URL.createObjectURL(f), type: f.type }));
      this.i = 0;
      this._render();
    }

    async _clear() {
      for (let k = 0; k < this.max; k++) await del(this.key + ':' + k);
      await del(this.key + ':n');
      this.items = [];
      this.i = 0;
      this._render();
    }

    go(d) {
      if (this.items.length < 2) return;
      this.i = (this.i + d + this.items.length) % this.items.length;
      this._render();
    }

    _render() {
      const has = this.items.length > 0;
      this.shadowRoot.querySelectorAll('.nav').forEach((b) => {
        b.style.display = this.items.length > 1 ? 'flex' : 'none';
      });
      this._count.style.display = this.items.length > 1 ? 'block' : 'none';
      this._count.textContent = (this.i + 1) + '/' + this.items.length;
      this._dots.innerHTML = this.items.length > 1
        ? this.items.map((_, k) => `<span class="dot${k === this.i ? ' on' : ''}"></span>`).join('')
        : '';
      this._bar.innerHTML = has && !this.fixed ? '<button data-act="clear">Trocar imagens</button>' : '';
      if (has) {
        const cb = this._bar.querySelector('button');
        if (cb) cb.addEventListener('click', (e) => { e.stopPropagation(); this._clear(); });
        const it = this.items[this.i];
        this._stage.innerHTML = /^video\//.test(it.type)
          ? `<video class="media" src="${it.url}" autoplay muted loop playsinline></video>`
          : `<img class="media" src="${it.url}" alt="">`;
        const v = this._stage.querySelector('video');
        if (v) v.play().catch(() => {});
        return;
      }
      this._stage.innerHTML = `
        <div class="ph">
          <svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L8 8m4-4 4 4"/><path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/></svg>
          <span>${this.getAttribute('placeholder') || 'Arraste as imagens do carrossel'}</span>
          <span style="color:#5f5f5f">Selecione várias de uma vez</span>
        </div>`;
      this._stage.querySelector('.ph').addEventListener('click', () => this._input.click());
    }
  }

  if (!window.customElements.get('video-slot')) window.customElements.define('video-slot', VideoSlot);
  if (!window.customElements.get('carousel-slot')) window.customElements.define('carousel-slot', CarouselSlot);
})();
