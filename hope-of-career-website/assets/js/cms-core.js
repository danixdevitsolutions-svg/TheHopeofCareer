(() => {
  const STATE_KEY = 'hopeCareerCms.state.v1';
  const DB_NAME = 'hopeCareerCms.media.v1';
  const DB_STORE = 'media';

  const pages = [
    { id: 'home', title: 'Home', file: 'index.html' },
    { id: 'about', title: 'About', file: 'about.html' },
    { id: 'programs', title: 'Programs', file: 'programs.html' },
    { id: 'faculty', title: 'Faculty', file: 'faculty.html' },
    { id: 'announcements', title: 'Announcements', file: 'announcements.html' },
    { id: 'admissions', title: 'Admissions', file: 'admissions.html' },
    { id: 'gallery', title: 'Gallery', file: 'gallery.html' },
    { id: 'contact', title: 'Contact', file: 'contact.html' },
  ];

  const emptyState = () => ({
    version: 1,
    edits: {},
    hiddenImages: {},
    hiddenSections: {},
    customSections: {},
    announcements: [],
    gallery: [],
    activity: [],
  });

  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      if (!saved || saved.version !== 1) return emptyState();
      const base = emptyState();
      return { ...base, ...saved };
    } catch {
      return emptyState();
    }
  }

  let state = readState();
  let dbPromise;

  function persist(action, detail = '') {
    if (action) {
      state.activity.unshift({
        id: makeId(),
        action,
        detail,
        at: new Date().toISOString(),
      });
      state.activity = state.activity.slice(0, 100);
    }
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('hope-cms-updated'));
    return state;
  }

  function makeId() {
    return window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `cms-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('Is browser mein media storage available nahi hai.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Media storage open nahi ho saki.'));
    });
    return dbPromise;
  }

  async function saveMedia(file, idOverride) {
    const db = await openDb();
    const id = idOverride || makeId();
    const record = {
      id,
      blob: file,
      name: file.name || 'uploaded-media',
      type: file.type || 'application/octet-stream',
      size: file.size || 0,
    };
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Media save nahi ho saki.'));
    });
    return { id, name: record.name, type: record.type, size: record.size };
  }

  async function getMedia(id) {
    if (!id) return null;
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Media load nahi ho saka.'));
    });
  }

  async function deleteMedia(id) {
    if (!id) return;
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Media delete nahi ho saka.'));
    });
  }

  async function clearMedia() {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Media clear nahi ho saka.'));
    });
  }

  function safeAssetUrl(value) {
    const input = String(value || '').trim();
    if (!input || /^javascript:/i.test(input)) return '';
    if (/^(https?:|blob:|data:image\/)/i.test(input)) return input;
    if (/^[a-z][a-z0-9+.-]*:/i.test(input)) return '';
    return input;
  }

  function formatDate(value, options = {}) {
    if (!value) return 'Date not set';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Date not set';
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: options.time === false ? undefined : 'short',
    }).format(parsed);
  }

  function pageName(pageId) {
    return pages.find((page) => page.id === pageId)?.title || pageId;
  }

  function snapshot() {
    return JSON.parse(JSON.stringify(state));
  }

  function replaceState(next) {
    const base = emptyState();
    state = { ...base, ...next, version: 1 };
    return persist('Backup restored', 'Site content and control panel data restored from backup');
  }

  function isPublished(item) {
    return item?.status === 'published' && item.publishAt && new Date(item.publishAt).getTime() <= Date.now();
  }

  function currentPage() {
    return document.body?.dataset.page || '';
  }

  function createElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function imageFromItem(item, className = '') {
    const img = document.createElement('img');
    img.className = className;
    img.alt = item.title || '';
    img.loading = 'lazy';
    img.src = safeAssetUrl(item.imageSrc || '');
    return img;
  }

  async function mediaUrl(item) {
    if (item?.mediaKey) {
      const record = await getMedia(item.mediaKey);
      if (record?.blob) return URL.createObjectURL(record.blob);
    }
    return safeAssetUrl(item?.mediaUrl || item?.imageSrc || '');
  }

  async function resolveEditImage(img, edit) {
    if (edit.mediaKey) {
      const record = await getMedia(edit.mediaKey);
      if (record?.blob) img.src = URL.createObjectURL(record.blob);
      return;
    }
    if (edit.imageSrc) img.src = safeAssetUrl(edit.imageSrc);
  }

  function getNativeTargets(main) {
    const candidates = [...main.querySelectorAll('h1, h2, h3, h4, p, img')];
    return candidates.filter((node) => {
      if (node.closest('[data-cms-generated]')) return false;
      if (node.matches('.sr-only')) return false;
      return true;
    });
  }

  async function applyPageContent() {
    const pageId = currentPage();
    const main = document.querySelector('main');
    if (!pageId || !main || document.body.dataset.cmsReady === 'true') return;

    main.querySelectorAll('[data-cms-generated]').forEach((generated) => generated.remove());
    const targets = getNativeTargets(main);
    targets.forEach((node, index) => {
      const key = `element-${index}`;
      node.dataset.cmsId = key;
      if (node.dataset.cmsOriginalText === undefined && node.tagName !== 'IMG') {
        node.dataset.cmsOriginalText = node.textContent;
      }
      if (node.tagName !== 'IMG') node.textContent = node.dataset.cmsOriginalText;
      if (node.tagName === 'IMG') {
        if (node.dataset.cmsOriginalSrc === undefined) node.dataset.cmsOriginalSrc = node.getAttribute('src') || '';
        if (node.dataset.cmsOriginalAlt === undefined) node.dataset.cmsOriginalAlt = node.alt || '';
        node.src = node.dataset.cmsOriginalSrc;
        node.alt = node.dataset.cmsOriginalAlt;
        if (node.dataset.cmsOriginalHidden === undefined) node.dataset.cmsOriginalHidden = String(node.hidden);
        node.hidden = node.dataset.cmsOriginalHidden === 'true';
      }
      if (node.tagName === 'IMG') return;
      const edit = state.edits?.[pageId]?.[key];
      if (edit && typeof edit.text === 'string') node.textContent = edit.text;
    });

    const sections = [...main.querySelectorAll(':scope > section')].filter((section) => !section.hasAttribute('data-cms-generated'));
    sections.forEach((section, index) => {
      const key = `section-${index}`;
      section.dataset.cmsSection = key;
      if (section.dataset.cmsOriginalHidden === undefined) section.dataset.cmsOriginalHidden = String(section.hidden);
      section.hidden = section.dataset.cmsOriginalHidden === 'true';
      if (state.hiddenSections?.[pageId]?.[key]) section.hidden = true;
    });

    for (const node of targets) {
      if (node.tagName !== 'IMG') continue;
      const edit = state.edits?.[pageId]?.[node.dataset.cmsId];
      if (state.hiddenImages?.[pageId]?.[node.dataset.cmsId]) node.hidden = true;
      if (edit) {
        if (edit.alt !== undefined) node.alt = edit.alt;
        await resolveEditImage(node, edit);
      }
    }

    renderCustomSections(pageId, main);
    await renderAnnouncements(pageId, main);
    await renderGallery(pageId, main);
    document.body.dataset.cmsReady = 'true';
  }

  function renderCustomSections(pageId, main) {
    (state.customSections?.[pageId] || []).forEach((item) => {
      const section = createElement('section', 'section cms-custom-section');
      section.dataset.cmsGenerated = 'custom-section';
      const wrap = createElement('div', 'wrap');
      if (item.eyebrow) wrap.append(createElement('p', 'eyebrow', item.eyebrow));
      if (item.title) wrap.append(createElement('h2', '', item.title));
      if (item.body) {
        const paragraph = createElement('p', 'section-lede cms-preserve-lines', item.body);
        wrap.append(paragraph);
      }
      if (item.mediaKey || item.imageSrc) {
        const image = document.createElement('img');
        image.className = 'cms-section-image';
        image.alt = item.title || '';
        wrap.append(image);
        if (item.mediaKey) {
          getMedia(item.mediaKey).then((record) => {
            if (record?.blob) image.src = URL.createObjectURL(record.blob);
          }).catch(() => {});
        } else image.src = safeAssetUrl(item.imageSrc);
      }
      section.append(wrap);
      main.append(section);
    });
  }

  function renderAnnouncementCard(item) {
    const article = createElement('article', 'cms-post-card');
    article.dataset.cmsGenerated = 'announcement';
    if (item.mediaKey || item.imageSrc) {
      const media = document.createElement('img');
      media.className = 'cms-post-image';
      media.alt = item.title || '';
      media.src = safeAssetUrl(item.imageSrc || '');
      article.append(media);
      if (item.mediaKey) {
        getMedia(item.mediaKey).then((record) => {
          if (record?.blob) media.src = URL.createObjectURL(record.blob);
        }).catch(() => {});
      }
    }
    article.append(createElement('time', 'cms-post-date', formatDate(item.publishAt)));
    article.append(createElement('h2', 'cms-post-title', item.title || 'Announcement'));
    article.append(createElement('p', 'cms-post-body cms-preserve-lines', item.body || ''));
    return article;
  }

  async function renderAnnouncements(pageId, main) {
    if (pageId !== 'announcements') return;
    const published = state.announcements.filter(isPublished)
      .sort((a, b) => new Date(b.publishAt) - new Date(a.publishAt));
    if (!published.length) return;
    const baseline = main.querySelector('.empty-panel')?.closest('section');
    if (baseline) baseline.hidden = true;
    const section = createElement('section', 'section cms-post-section');
    section.dataset.cmsGenerated = 'announcements';
    const wrap = createElement('div', 'wrap');
    wrap.append(createElement('p', 'eyebrow', 'Latest updates'));
    wrap.append(createElement('h2', 'cms-feed-heading', 'Announcements'));
    const grid = createElement('div', 'cms-post-grid');
    published.forEach((item) => grid.append(renderAnnouncementCard(item)));
    wrap.append(grid);
    section.append(wrap);
    main.append(section);
  }

  async function renderGallery(pageId, main) {
    if (pageId !== 'gallery') return;
    const published = state.gallery.filter(isPublished)
      .sort((a, b) => new Date(b.publishAt) - new Date(a.publishAt));
    if (!published.length) return;
    const section = createElement('section', 'section cms-post-section');
    section.dataset.cmsGenerated = 'gallery';
    const wrap = createElement('div', 'wrap');
    wrap.append(createElement('p', 'eyebrow', 'Institute gallery'));
    wrap.append(createElement('h2', 'cms-feed-heading', 'Photos & videos'));
    const grid = createElement('div', 'cms-gallery-grid');
    for (const item of published) {
      const card = createElement('article', 'cms-gallery-card');
      card.dataset.cmsGenerated = 'gallery-item';
      const media = document.createElement(item.kind === 'video' ? 'video' : 'img');
      media.className = 'cms-gallery-media';
      if (item.kind === 'video') {
        media.controls = true;
        media.preload = 'metadata';
        media.setAttribute('aria-label', item.title || 'Gallery video');
      } else {
        media.alt = item.title || '';
        media.loading = 'lazy';
      }
      const resolvedUrl = await mediaUrl(item);
      if (resolvedUrl) media.src = resolvedUrl;
      card.append(media);
      card.append(createElement('time', 'cms-post-date', formatDate(item.publishAt)));
      card.append(createElement('h3', 'cms-gallery-title', item.title || 'Gallery item'));
      card.append(createElement('p', 'cms-gallery-description cms-preserve-lines', item.description || ''));
      grid.append(card);
    }
    wrap.append(grid);
    section.append(wrap);
    const lastNative = [...main.querySelectorAll(':scope > section')].filter((node) => !node.hasAttribute('data-cms-generated')).at(-1);
    if (lastNative) lastNative.before(section);
    else main.append(section);
  }

  async function describePage(page) {
    const response = await fetch(page.file, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${page.file} load nahi ho saka (${response.status}).`);
    const html = await response.text();
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const main = parsed.querySelector('main');
    if (!main) throw new Error(`${page.title} page mein main content nahi mila.`);
    const targets = getNativeTargets(main);
    return targets.map((node, index) => ({
      id: `element-${index}`,
      type: node.tagName.toLowerCase() === 'img' ? 'Image' : node.tagName.toLowerCase(),
      text: node.tagName === 'IMG' ? (node.alt || node.getAttribute('src') || 'Image') : node.textContent.trim().replace(/\s+/g, ' '),
      src: node.tagName === 'IMG' ? (node.getAttribute('src') || '') : '',
      tag: node.tagName.toLowerCase(),
    }));
  }

  async function describeSections(page) {
    const response = await fetch(page.file, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${page.file} load nahi ho saka (${response.status}).`);
    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    const main = parsed.querySelector('main');
    if (!main) return [];
    return [...main.querySelectorAll(':scope > section')].map((section, index) => {
      const title = section.querySelector('h1, h2, h3')?.textContent?.trim();
      return { id: `section-${index}`, title: title || `Section ${index + 1}` };
    });
  }

  window.HopeCMS = {
    pages,
    pageName,
    getState: () => state,
    snapshot,
    persist,
    replaceState,
    makeId,
    saveMedia,
    getMedia,
    deleteMedia,
    clearMedia,
    safeAssetUrl,
    formatDate,
    isPublished,
    mediaUrl,
    describePage,
    describeSections,
    applyPageContent,
  };

  if (document.body?.dataset.page && document.body.dataset.page !== 'admin') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => applyPageContent().catch(() => {}), { once: true });
    } else {
      applyPageContent().catch(() => {});
    }
  }

  window.addEventListener('storage', (event) => {
    if (event.key === STATE_KEY) {
      state = readState();
      document.body.dataset.cmsReady = 'false';
      applyPageContent().catch(() => {});
    }
  });
})();
