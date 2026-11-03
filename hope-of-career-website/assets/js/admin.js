(() => {
  const CMS = window.HopeCMS;
  if (!CMS) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = () => CMS.getState();
  const now = () => new Date();
  let currentPage = CMS.pages[0].id;
  let pageItems = [];
  let pageSections = [];
  let selectedItemId = '';
  let toastTimer;

  const toast = (message) => {
    const node = $('#toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 3200);
  };

  const node = (tag, className = '', text = '') => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== '') element.textContent = text;
    return element;
  };

  const button = (text, className, handler, ariaLabel = '') => {
    const control = node('button', className, text);
    control.type = 'button';
    if (ariaLabel) control.setAttribute('aria-label', ariaLabel);
    control.addEventListener('click', handler);
    return control;
  };

  function localDateTime(date = now()) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function fieldsToPublishAt(date, time) {
    const result = new Date(`${date}T${time}`);
    return Number.isNaN(result.getTime()) ? '' : result.toISOString();
  }

  function toDateAndTime(value) {
    if (!value) return { date: '', time: '' };
    const local = localDateTime(new Date(value));
    return { date: local.slice(0, 10), time: local.slice(11, 16) };
  }

  function statusName(item) {
    if (item.status === 'draft') return ['Draft', 'draft'];
    if (item.status === 'published' && item.publishAt && new Date(item.publishAt).getTime() > Date.now()) {
      return ['Scheduled', 'scheduled'];
    }
    return ['Published', 'published'];
  }

  function fillPageSelect() {
    const select = $('#pageSelect');
    CMS.pages.forEach((page) => {
      const option = document.createElement('option');
      option.value = page.id;
      option.textContent = page.title;
      select.append(option);
    });
  }

  async function loadPage(pageId) {
    currentPage = pageId;
    selectedItemId = '';
    $('#contentList').replaceChildren(node('div', 'loading', 'Page content loading…'));
    $('#sectionList').replaceChildren();
    $('#itemEditor').replaceChildren(emptyEditor());
    try {
      const page = CMS.pages.find((item) => item.id === pageId);
      [pageItems, pageSections] = await Promise.all([
        CMS.describePage(page),
        CMS.describeSections(page),
      ]);
      renderContentList();
      renderSections();
    } catch (error) {
      pageItems = [];
      pageSections = [];
      $('#contentList').replaceChildren(node('div', 'empty-list', 'Page HTML load nahi hui. Admin panel aur website ko ek hi web address par host/open karein; file:// mode mein browser doosre pages fetch nahi kar sakta.'));
      $('#sectionList').replaceChildren(node('div', 'empty-list', 'Page sections dekhne ke liye site ko same web host par kholen.'));
      toast(error.message || 'Page content load nahi ho saka.');
    }
  }

  function emptyEditor() {
    const wrapper = node('div', 'empty-editor');
    wrapper.append(node('span', 'empty-editor-icon', '✎'));
    wrapper.append(node('h3', '', 'Select an item to edit'));
    wrapper.append(node('p', '', 'Pick a page item from the list to change its text or replace an image.'));
    return wrapper;
  }

  function renderContentList() {
    const list = $('#contentList');
    list.replaceChildren();
    $('#contentCount').textContent = `${pageItems.length} items`;
    if (!pageItems.length) {
      list.append(node('div', 'empty-list', 'Is page par edit karne ke liye content nahi mila.'));
      return;
    }
    pageItems.forEach((item) => {
      const override = state().edits?.[currentPage]?.[item.id];
      const preview = item.type === 'Image'
        ? (override?.alt || item.text || 'Image')
        : (override?.text ?? item.text) || '(empty text)';
      const row = button('', `content-row${selectedItemId === item.id ? ' selected' : ''}`, () => {
        selectedItemId = item.id;
        renderContentList();
        showEditor(item);
      });
      const badge = node('span', 'item-icon', item.type === 'Image' ? 'img' : item.type);
      const copy = node('span', 'item-copy');
      copy.append(node('strong', '', preview));
      copy.append(node('small', '', item.type === 'Image' ? item.src : `${item.tag.toUpperCase()} · ${item.id}`));
      row.append(badge, copy);
      list.append(row);
    });
  }

  async function showEditor(item) {
    const editor = $('#itemEditor');
    editor.replaceChildren();
    const override = state().edits?.[currentPage]?.[item.id] || {};
    const titleRow = node('div', 'editor-title');
    titleRow.append(node('strong', '', item.type === 'Image' ? 'Edit image' : `Edit ${item.type.toLowerCase()}`));
    titleRow.append(node('span', 'type-chip', item.type));
    editor.append(titleRow);

    const form = node('form', 'edit-form');
    form.addEventListener('submit', (event) => savePageItem(event, item));
    if (item.type === 'Image') {
      const preview = document.createElement('img');
      preview.className = 'image-preview';
      preview.alt = override.alt || item.text || 'Selected image';
      preview.src = item.src;
      if (override.mediaKey) {
        CMS.getMedia(override.mediaKey).then((record) => {
          if (record?.blob) preview.src = URL.createObjectURL(record.blob);
        }).catch(() => {});
      } else if (override.imageSrc) preview.src = CMS.safeAssetUrl(override.imageSrc);
      form.append(preview);

      const sourceLabel = node('label', '', 'Image URL or site path');
      const source = node('input', 'control');
      source.name = 'imageSrc';
      source.value = override.imageSrc || (override.mediaKey ? '' : item.src);
      source.placeholder = 'assets/images/photo.jpg';
      sourceLabel.append(source);
      form.append(sourceLabel);

      const altLabel = node('label', '', 'Image description (alt text)');
      const alt = node('input', 'control');
      alt.name = 'alt';
      alt.maxLength = 250;
      alt.value = override.alt ?? item.text;
      altLabel.append(alt);
      form.append(altLabel);

      const uploadLabel = node('label', '', 'Upload a replacement image');
      const upload = node('input', 'control file-control');
      upload.type = 'file';
      upload.name = 'image';
      upload.accept = 'image/*';
      upload.addEventListener('change', () => {
        const file = upload.files?.[0];
        if (file) preview.src = URL.createObjectURL(file);
      });
      uploadLabel.append(upload);
      form.append(uploadLabel);

      const hidden = !!state().hiddenImages?.[currentPage]?.[item.id];
      const actions = node('div', 'edit-actions');
      const save = node('button', 'button button-primary', 'Save image');
      save.type = 'submit';
      const toggle = button(hidden ? 'Restore image' : 'Hide image', 'button button-outline', () => toggleImage(item));
      actions.append(save, toggle);
      form.append(actions);
    } else {
      const textLabel = node('label', '', 'Replace all text');
      const textarea = node('textarea', 'control');
      textarea.name = 'text';
      textarea.rows = 7;
      textarea.maxLength = 3000;
      textarea.value = override.text ?? item.text;
      textarea.placeholder = 'Enter the complete replacement text';
      textLabel.append(textarea);
      form.append(textLabel);
      const actions = node('div', 'edit-actions');
      const save = node('button', 'button button-primary', 'Save text');
      save.type = 'submit';
      actions.append(save);
      if (override.text !== undefined) {
        actions.append(button('Restore original', 'button button-outline', () => resetPageItem(item)));
      }
      form.append(actions);
    }
    editor.append(form);
  }

  async function savePageItem(event, item) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const pageTitle = CMS.pageName(currentPage);
    if (item.type === 'Image') {
      const file = data.get('image');
      const edit = {
        alt: String(data.get('alt') || ''),
        imageSrc: String(data.get('imageSrc') || '').trim(),
      };
      const existingEdit = state().edits?.[currentPage]?.[item.id];
      if (file instanceof File && file.size) {
        if (!file.type.startsWith('image/')) return toast('Sirf image file upload karein.');
        if (file.size > 20 * 1024 * 1024) return toast('Image 20 MB se chhoti honi chahiye.');
        try {
          const media = await CMS.saveMedia(file);
          edit.mediaKey = media.id;
          edit.imageSrc = '';
        } catch (error) {
          return toast(error.message || 'Image save nahi ho saki.');
        }
      } else if (!edit.imageSrc && existingEdit?.mediaKey) {
        edit.mediaKey = existingEdit.mediaKey;
      }
      state().edits[currentPage] ||= {};
      state().edits[currentPage][item.id] = edit;
      if (state().hiddenImages[currentPage]) delete state().hiddenImages[currentPage][item.id];
      CMS.persist('Image updated', `${pageTitle}: image and alt text updated`);
    } else {
      state().edits[currentPage] ||= {};
      state().edits[currentPage][item.id] = { text: String(data.get('text') ?? '') };
      CMS.persist('Page text updated', `${pageTitle}: ${item.type} replaced`);
    }
    renderContentList();
    await showEditor(item);
    refreshDashboard();
    toast('Change browser mein save ho gayi.');
  }

  function resetPageItem(item) {
    if (!state().edits?.[currentPage]?.[item.id]) return;
    delete state().edits[currentPage][item.id];
    CMS.persist('Page text restored', `${CMS.pageName(currentPage)}: original text restored`);
    renderContentList();
    showEditor(item);
    refreshDashboard();
    toast('Original text restore ho gaya.');
  }

  function toggleImage(item) {
    state().hiddenImages[currentPage] ||= {};
    const wasHidden = !!state().hiddenImages[currentPage][item.id];
    if (wasHidden) delete state().hiddenImages[currentPage][item.id];
    else state().hiddenImages[currentPage][item.id] = true;
    CMS.persist(wasHidden ? 'Image restored' : 'Image hidden', `${CMS.pageName(currentPage)}: ${wasHidden ? 'image restored' : 'image hidden'}`);
    renderContentList();
    showEditor(item);
    refreshDashboard();
    toast(wasHidden ? 'Image restore ho gayi.' : 'Image website preview se hide ho gayi.');
  }

  function renderSections() {
    const list = $('#sectionList');
    list.replaceChildren();
    pageSections.forEach((section) => {
      const row = node('div', 'section-row');
      row.append(node('span', '', section.title));
      const hidden = !!state().hiddenSections?.[currentPage]?.[section.id];
      row.append(button(hidden ? 'Restore' : 'Hide', '', () => toggleSection(section)));
      list.append(row);
    });
    (state().customSections?.[currentPage] || []).forEach((section) => {
      const row = node('div', 'section-row');
      row.append(node('span', '', `New: ${section.title || section.eyebrow || 'Untitled section'}`));
      row.append(button('Edit', '', () => editCustomSection(section)));
      row.append(button('Delete', '', async () => {
        const ok = await askConfirm('Delete this section?', 'This added section will be removed from this browser’s website view.');
        if (!ok) return;
        const custom = state().customSections[currentPage] || [];
        const item = custom.find((entry) => entry.id === section.id);
        state().customSections[currentPage] = custom.filter((entry) => entry.id !== section.id);
        if (item?.mediaKey) CMS.deleteMedia(item.mediaKey).catch(() => {});
        CMS.persist('Custom section deleted', `${CMS.pageName(currentPage)}: ${section.title || 'Untitled section'}`);
        renderSections();
        refreshDashboard();
        toast('Section delete ho gayi.');
      }));
      list.append(row);
    });
    if (!pageSections.length && !(state().customSections?.[currentPage] || []).length) {
      list.append(node('div', 'empty-list', 'No sections found.'));
    }
  }

  function editCustomSection(section) {
    const form = $('#customSectionForm');
    form.elements.id.value = section.id;
    form.elements.eyebrow.value = section.eyebrow || '';
    form.elements.title.value = section.title || '';
    form.elements.body.value = section.body || '';
    form.elements.image.value = '';
    $('#saveCustomSection').textContent = 'Save section';
    $('#cancelCustomEdit').hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    form.elements.title.focus();
  }

  function resetCustomSectionForm() {
    const form = $('#customSectionForm');
    form.reset();
    form.elements.id.value = '';
    $('#saveCustomSection').textContent = '＋ Add section';
    $('#cancelCustomEdit').hidden = true;
  }

  function toggleSection(section) {
    state().hiddenSections[currentPage] ||= {};
    const hidden = !!state().hiddenSections[currentPage][section.id];
    if (hidden) delete state().hiddenSections[currentPage][section.id];
    else state().hiddenSections[currentPage][section.id] = true;
    CMS.persist(hidden ? 'Page section restored' : 'Page section hidden', `${CMS.pageName(currentPage)}: ${section.title}`);
    renderSections();
    refreshDashboard();
    toast(hidden ? 'Section restore ho gayi.' : 'Section hide ho gayi.');
  }

  async function addCustomSection(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const id = String(data.get('id') || '');
    const old = (state().customSections?.[currentPage] || []).find((section) => section.id === id);
    const item = {
      ...(old || {}),
      id: old?.id || CMS.makeId(),
      eyebrow: String(data.get('eyebrow') || '').trim(),
      title: String(data.get('title') || '').trim(),
      body: String(data.get('body') || '').trim(),
      createdAt: new Date().toISOString(),
    };
    const file = data.get('image');
    if (!item.title && !item.body) return toast('Section ke liye heading ya paragraph likhein.');
    if (file instanceof File && file.size) {
      if (!file.type.startsWith('image/')) return toast('Section ke liye image file chunein.');
      if (file.size > 20 * 1024 * 1024) return toast('Image 20 MB se chhoti honi chahiye.');
      try {
        item.mediaKey = (await CMS.saveMedia(file)).id;
        if (old?.mediaKey) CMS.deleteMedia(old.mediaKey).catch(() => {});
      } catch (error) {
        return toast(error.message || 'Image save nahi ho saki.');
      }
    }
    state().customSections[currentPage] ||= [];
    if (old) {
      state().customSections[currentPage] = state().customSections[currentPage].map((section) => section.id === id ? item : section);
    } else {
      state().customSections[currentPage].push(item);
    }
    CMS.persist(old ? 'Custom section edited' : 'Page section added', `${CMS.pageName(currentPage)}: ${item.title || 'New section'}`);
    resetCustomSectionForm();
    renderSections();
    refreshDashboard();
    toast('Naya section add ho gaya.');
  }

  function renderActivity(target, limit) {
    const list = $(target);
    list.replaceChildren();
    const entries = state().activity.slice(0, limit);
    if (!entries.length) {
      list.append(node('div', 'activity-empty', 'Abhi koi change record nahi hui.'));
      return;
    }
    entries.forEach((entry) => {
      const row = node('div', 'activity-row');
      row.append(node('span', 'activity-dot', activityIcon(entry.action)));
      const copy = node('div', 'activity-copy');
      copy.append(node('strong', '', entry.action));
      copy.append(node('span', '', entry.detail || ''));
      row.append(copy, node('time', 'activity-time', CMS.formatDate(entry.at)));
      list.append(row);
    });
  }

  function activityIcon(action) {
    if (/delete|remov/i.test(action)) return '−';
    if (/add|created|new|publish/i.test(action)) return '+';
    if (/image|gallery/i.test(action)) return '▧';
    return '✎';
  }

  function refreshDashboard() {
    const publishedAnnouncements = state().announcements.filter(CMS.isPublished).length;
    const publishedGallery = state().gallery.filter(CMS.isPublished).length;
    $('#statAnnouncements').textContent = publishedAnnouncements;
    $('#statGallery').textContent = publishedGallery;
    $('#statChanges').textContent = state().activity.length;
    $('#navAnnouncements').textContent = state().announcements.length;
    $('#navGallery').textContent = state().gallery.length;
    renderActivity('#dashboardActivity', 5);
    renderActivity('#fullActivity', 100);
    renderAnnouncementsList();
    renderGalleryList();
  }

  function viewTitle(name) {
    const labels = {
      dashboard: ['Dashboard', 'Welcome back'],
      pages: ['Website pages', 'Edit website pages'],
      announcements: ['Announcements', 'Manage announcements'],
      gallery: ['Gallery', 'Manage your gallery'],
      activity: ['Activity log', 'Content activity'],
      backup: ['Backup & restore', 'Manage your backups'],
    };
    const [crumb, title] = labels[name] || labels.dashboard;
    $('#viewCrumb').textContent = crumb;
    $('#viewTitle').textContent = title;
  }

  function showView(name) {
    const view = $(`#view-${name}`);
    if (!view) return;
    $$('.view').forEach((panel) => panel.classList.toggle('active', panel === view));
    $$('.side-link').forEach((link) => link.classList.toggle('active', link.dataset.view === name));
    viewTitle(name);
    if (name === 'pages') loadPage($('#pageSelect').value || currentPage);
    if (name === 'activity') renderActivity('#fullActivity', 100);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderManagedPost(item, kind) {
    const wrapper = node('article', 'managed-item');
    const thumb = node('span', 'managed-thumb', kind === 'gallery' ? (item.kind === 'video' ? '▶' : '▧') : '◷');
    if (item.mediaKey) {
      CMS.getMedia(item.mediaKey).then((record) => {
        if (!record?.blob) return;
        const media = document.createElement(kind === 'gallery' && item.kind === 'video' ? 'video' : 'img');
        media.src = URL.createObjectURL(record.blob);
        if (media.tagName === 'VIDEO') media.muted = true;
        thumb.replaceChildren(media);
      }).catch(() => {});
    } else if (item.imageSrc) {
      const media = document.createElement('img');
      media.src = CMS.safeAssetUrl(item.imageSrc);
      thumb.replaceChildren(media);
    }
    const copy = node('div', 'managed-copy');
    copy.append(node('strong', '', item.title || 'Untitled post'));
    const [status, className] = statusName(item);
    const meta = node('small');
    meta.append(node('span', `status-chip ${className}`, status), document.createTextNode(` · ${CMS.formatDate(item.publishAt)}`));
    copy.append(meta);
    const actions = node('div', 'managed-actions');
    actions.append(button('Edit', 'mini-button', () => kind === 'gallery' ? editGallery(item) : editAnnouncement(item)));
    actions.append(button('Delete', 'mini-button delete', () => kind === 'gallery' ? deleteGallery(item) : deleteAnnouncement(item)));
    wrapper.append(thumb, copy, actions);
    return wrapper;
  }

  function renderAnnouncementsList() {
    const target = $('#announcementList');
    if (!target) return;
    target.replaceChildren();
    const items = [...state().announcements].sort((a, b) => new Date(b.publishAt) - new Date(a.publishAt));
    $('#announcementCount').textContent = items.length;
    if (!items.length) {
      target.append(node('div', 'empty-list', 'Abhi announcement nahi hai. New announcement se pehli post banayein.'));
      return;
    }
    items.forEach((item) => target.append(renderManagedPost(item, 'announcement')));
  }

  function renderGalleryList() {
    const target = $('#galleryList');
    if (!target) return;
    target.replaceChildren();
    const items = [...state().gallery].sort((a, b) => new Date(b.publishAt) - new Date(a.publishAt));
    $('#galleryCount').textContent = items.length;
    if (!items.length) {
      target.append(node('div', 'empty-list', 'Abhi gallery post nahi hai. Add media se photo ya video share karein.'));
      return;
    }
    items.forEach((item) => target.append(renderManagedPost(item, 'gallery')));
  }

  function resetAnnouncementForm() {
    const form = $('#announcementForm');
    form.reset();
    form.elements.id.value = '';
    const local = localDateTime();
    form.elements.date.value = local.slice(0, 10);
    form.elements.time.value = local.slice(11, 16);
    form.elements.status.value = 'published';
    $('#announcementFormTitle').textContent = 'Create announcement';
  }

  function editAnnouncement(item) {
    const form = $('#announcementForm');
    const { date, time } = toDateAndTime(item.publishAt);
    form.elements.id.value = item.id;
    form.elements.title.value = item.title || '';
    form.elements.body.value = item.body || '';
    form.elements.date.value = date;
    form.elements.time.value = time;
    form.elements.status.value = item.status || 'published';
    form.elements.image.value = '';
    $('#announcementFormTitle').textContent = 'Edit announcement';
    $('#announcementFormPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveAnnouncement(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get('title') || '').trim();
    const body = String(data.get('body') || '').trim();
    const publishAt = fieldsToPublishAt(String(data.get('date') || ''), String(data.get('time') || ''));
    if (!title || !body || !publishAt) return toast('Title, detail, date aur time zaroori hain.');
    const id = String(data.get('id') || '');
    const old = state().announcements.find((item) => item.id === id);
    const item = {
      ...(old || {}),
      id: old?.id || CMS.makeId(),
      title,
      body,
      publishAt,
      status: String(data.get('status') || 'published'),
      updatedAt: new Date().toISOString(),
      createdAt: old?.createdAt || new Date().toISOString(),
    };
    const file = data.get('image');
    if (file instanceof File && file.size) {
      if (!file.type.startsWith('image/')) return toast('Announcement cover ke liye image file chunein.');
      if (file.size > 20 * 1024 * 1024) return toast('Image 20 MB se chhoti honi chahiye.');
      try {
        const media = await CMS.saveMedia(file);
        item.mediaKey = media.id;
        delete item.imageSrc;
      } catch (error) {
        return toast(error.message || 'Image save nahi ho saki.');
      }
    }
    if (old) state().announcements = state().announcements.map((entry) => entry.id === id ? item : entry);
    else state().announcements.unshift(item);
    CMS.persist(old ? 'Announcement edited' : 'Announcement created', `${title} · ${statusName(item)[0].toLowerCase()}`);
    resetAnnouncementForm();
    refreshDashboard();
    toast(old ? 'Announcement update ho gayi.' : 'Announcement save ho gayi.');
  }

  async function deleteAnnouncement(item) {
    const ok = await askConfirm('Delete announcement?', `“${item.title}” will be removed from this browser's website content.`);
    if (!ok) return;
    state().announcements = state().announcements.filter((entry) => entry.id !== item.id);
    if (item.mediaKey) CMS.deleteMedia(item.mediaKey).catch(() => {});
    CMS.persist('Announcement deleted', item.title);
    refreshDashboard();
    toast('Announcement delete ho gayi.');
  }

  function resetGalleryForm() {
    const form = $('#galleryForm');
    form.reset();
    form.elements.id.value = '';
    const local = localDateTime();
    form.elements.date.value = local.slice(0, 10);
    form.elements.time.value = local.slice(11, 16);
    form.elements.status.value = 'published';
    $('#galleryFormTitle').textContent = 'Add gallery media';
    $('#galleryMediaHint').textContent = 'Choose an image or video file. Uploads are stored in this browser.';
  }

  function editGallery(item) {
    const form = $('#galleryForm');
    const { date, time } = toDateAndTime(item.publishAt);
    form.elements.id.value = item.id;
    form.elements.title.value = item.title || '';
    form.elements.description.value = item.description || '';
    form.elements.date.value = date;
    form.elements.time.value = time;
    form.elements.status.value = item.status || 'published';
    form.elements.media.value = '';
    $('#galleryFormTitle').textContent = 'Edit gallery post';
    $('#galleryMediaHint').textContent = item.kind
      ? `Current media: ${item.kind}. Upload a new file to replace it; leave blank to keep the current media.`
      : 'Upload a file to replace the existing media.';
    $('#galleryFormPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveGalleryItem(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get('title') || '').trim();
    const description = String(data.get('description') || '').trim();
    const lines = description.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const publishAt = fieldsToPublishAt(String(data.get('date') || ''), String(data.get('time') || ''));
    if (lines.length < 2 || lines.length > 5) return toast('Description 2 se 5 non-empty lines mein likhein.');
    const id = String(data.get('id') || '');
    const old = state().gallery.find((item) => item.id === id);
    const file = data.get('media');
    if (!title || !publishAt) return toast('Title, date aur time zaroori hain.');
    if ((!old?.mediaKey && !old?.mediaUrl) && (!(file instanceof File) || !file.size)) {
      return toast('Gallery post ke liye image ya video upload karein.');
    }
    const item = {
      ...(old || {}),
      id: old?.id || CMS.makeId(),
      title,
      description,
      publishAt,
      status: String(data.get('status') || 'published'),
      updatedAt: new Date().toISOString(),
      createdAt: old?.createdAt || new Date().toISOString(),
    };
    if (file instanceof File && file.size) {
      const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : '';
      if (!kind) return toast('Image ya video file select karein.');
      if (file.size > 100 * 1024 * 1024) return toast('Video ya image 100 MB se chhoti honi chahiye.');
      try {
        const media = await CMS.saveMedia(file);
        item.mediaKey = media.id;
        item.kind = kind;
        delete item.mediaUrl;
      } catch (error) {
        return toast(error.message || 'Media save nahi ho saka. Browser storage space check karein.');
      }
    }
    if (old) state().gallery = state().gallery.map((entry) => entry.id === id ? item : entry);
    else state().gallery.unshift(item);
    CMS.persist(old ? 'Gallery post edited' : 'Gallery media added', `${title} · ${item.kind || 'media'}`);
    resetGalleryForm();
    refreshDashboard();
    toast(old ? 'Gallery post update ho gayi.' : 'Gallery post save ho gayi.');
  }

  async function deleteGallery(item) {
    const ok = await askConfirm('Delete gallery post?', `“${item.title}” and its media reference will be removed from this browser's website content.`);
    if (!ok) return;
    state().gallery = state().gallery.filter((entry) => entry.id !== item.id);
    if (item.mediaKey) CMS.deleteMedia(item.mediaKey).catch(() => {});
    CMS.persist('Gallery post deleted', item.title);
    refreshDashboard();
    toast('Gallery post delete ho gayi.');
  }

  function askConfirm(title, message) {
    const dialog = $('#confirmDialog');
    $('#confirmTitle').textContent = title;
    $('#confirmMessage').textContent = message;
    dialog.showModal();
    return new Promise((resolve) => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    });
  }

  function mediaKeysFrom(value, result = new Set()) {
    if (!value || typeof value !== 'object') return result;
    if (Array.isArray(value)) value.forEach((item) => mediaKeysFrom(item, result));
    else {
      if (typeof value.mediaKey === 'string') result.add(value.mediaKey);
      Object.values(value).forEach((item) => mediaKeysFrom(item, result));
    }
    return result;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Backup media read nahi ho saka.'));
      reader.readAsDataURL(blob);
    });
  }

  async function exportBackup() {
    try {
      const backup = {
        format: 'hope-career-cms-backup',
        version: 1,
        createdAt: new Date().toISOString(),
        state: CMS.snapshot(),
        media: {},
      };
      for (const id of mediaKeysFrom(backup.state)) {
        const record = await CMS.getMedia(id);
        if (!record?.blob) continue;
        backup.media[id] = {
          name: record.name,
          type: record.type,
          dataUrl: await blobToDataUrl(record.blob),
        };
      }
      const payload = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(payload);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hope-career-content-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast('Backup download ho gaya.');
    } catch (error) {
      toast(error.message || 'Backup create nahi ho saka.');
    }
  }

  function dataUrlToBlob(dataUrl) {
    const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl || '');
    if (!match) throw new Error('Backup mein media format theek nahi.');
    const mime = match[1] || 'application/octet-stream';
    const bytes = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
    const array = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) array[i] = bytes.charCodeAt(i);
    return new Blob([array], { type: mime });
  }

  function replaceMediaKeys(value, mapping) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item) => replaceMediaKeys(item, mapping));
      return;
    }
    if (typeof value.mediaKey === 'string' && mapping[value.mediaKey]) {
      value.mediaKey = mapping[value.mediaKey];
    }
    Object.values(value).forEach((item) => replaceMediaKeys(item, mapping));
  }

  async function restoreBackup(file) {
    try {
      if (file.size > 300 * 1024 * 1024) throw new Error('Backup file 300 MB se bari hai.');
      const backup = JSON.parse(await file.text());
      if (backup.format !== 'hope-career-cms-backup' || backup.version !== 1 || !backup.state) {
        throw new Error('Yeh Hope Career website ka pehchana hua backup nahi hai.');
      }
      const ok = await askConfirm('Restore this backup?', 'Current browser content will be replaced with the selected backup.');
      if (!ok) return;
      const mapping = {};
      const newIds = [];
      for (const [oldId, media] of Object.entries(backup.media || {})) {
        if (!media?.dataUrl) continue;
        const blob = dataUrlToBlob(media.dataUrl);
        const fileObject = new File([blob], media.name || 'restored-media', { type: media.type || blob.type });
        const saved = await CMS.saveMedia(fileObject);
        mapping[oldId] = saved.id;
        newIds.push(saved.id);
      }
      const restoredState = backup.state;
      replaceMediaKeys(restoredState, mapping);
      const previousIds = [...mediaKeysFrom(CMS.snapshot())];
      CMS.replaceState(restoredState);
      for (const id of previousIds) if (!newIds.includes(id)) CMS.deleteMedia(id).catch(() => {});
      refreshDashboard();
      if ($('#view-pages').classList.contains('active')) loadPage(currentPage);
      toast('Backup restore ho gaya.');
    } catch (error) {
      toast(error.message || 'Backup restore nahi ho saka.');
    } finally {
      $('#restoreBackup').value = '';
    }
  }

  function setupEvents() {
    $$('.side-link').forEach((link) => link.addEventListener('click', () => showView(link.dataset.view)));
    $$('[data-go]').forEach((link) => link.addEventListener('click', () => showView(link.dataset.go)));
    $('#backupQuick').addEventListener('click', () => showView('backup'));
    $('#pageSelect').addEventListener('change', (event) => loadPage(event.target.value));
    $('#customSectionForm').addEventListener('submit', addCustomSection);
    $('#cancelCustomEdit').addEventListener('click', resetCustomSectionForm);
    $('#announcementForm').addEventListener('submit', saveAnnouncement);
    $('#galleryForm').addEventListener('submit', saveGalleryItem);
    $('#newAnnouncement').addEventListener('click', () => {
      resetAnnouncementForm();
      $('#announcementFormPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('#announcementForm').elements.title.focus();
    });
    $('#newGalleryItem').addEventListener('click', () => {
      resetGalleryForm();
      $('#galleryFormPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('#galleryForm').elements.title.focus();
    });
    $('#cancelAnnouncement').addEventListener('click', resetAnnouncementForm);
    $('#cancelGallery').addEventListener('click', resetGalleryForm);
    $('#downloadBackup').addEventListener('click', exportBackup);
    $('#restoreBackup').addEventListener('change', (event) => {
      if (event.target.files?.[0]) restoreBackup(event.target.files[0]);
    });
    $('#backupQuick').title = 'Backup & restore';
    $$('[data-dismiss-notice]').forEach((close) => close.addEventListener('click', () => close.closest('.notice-banner').remove()));
  }

  fillPageSelect();
  setupEvents();
  resetAnnouncementForm();
  resetGalleryForm();
  refreshDashboard();
})();
