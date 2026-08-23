/* ================= 主界面逻辑 ================= */
'use strict';

window.App = (function () {

  /* ---------------- 运行时状态 ---------------- */
  const view = { type: 'smart', key: 'today' };    // smart: today/star/done | list: <listId>
  const sel = { kind: null, listId: null, taskId: null, stepId: null, subStepId: null };
  let editingNoteOwner = '';        // 当前正在编辑备注的 owner 属性
  // 步骤/子步骤现在通过“添加模块 → 台前调度浮层”添加，不再使用行内输入状态
  let editingReminderTaskId = '';   // 当前正在设置定时提醒的任务 id
  let search = '';
  let expanded = {};        // taskId -> 是否展开步骤
  let dragTaskId = null;
  let dragStepId = null;       // 当前拖拽的步骤 id
  let dragStepTaskId = null;   // 当前拖拽步骤所属任务 id
  let dragMoveStepId = null;   // 从图标拖出、准备移动到其他任务的步骤 id
  let dragMoveStepTaskId = null; // 被拖出步骤的源任务 id
  let dragFromStepRow = false; // 标记拖拽是否起始于横向步骤图标行内
  let dragSortStepIconId = null;     // 横向图标行内拖拽排序的步骤 id
  let dragSortStepIconTaskId = null; // 横向图标行内拖拽排序所属任务 id
  let dragArchiveId = null;          // 当前拖拽的存档任务表 id

  const $ = (id) => document.getElementById(id);
  const D = () => Store.data;

  /* ---------------- 工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }

  function fmtDue(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const today = startOfDay(Date.now());
    const day = startOfDay(ts);
    const diff = Math.round((day - today) / 86400000);
    const hm = (d.getHours() || d.getMinutes())
      ? ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
      : '';
    if (diff === 0) return '今天' + hm;
    if (diff === 1) return '明天' + hm;
    if (diff === -1) return '昨天' + hm;
    if (diff > 1 && diff < 7) return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()] + hm;
    return (d.getMonth() + 1) + '月' + d.getDate() + '日' + hm;
  }

  function dueClass(t) {
    if (!t.due) return '';
    if (t.due < Date.now()) return 'overdue';
    if (startOfDay(t.due) === startOfDay(Date.now())) return 'today';
    return '';
  }

  function toLocalInput(ts) {
    if (!ts) return '';
    const d = new Date(ts - d0offset(ts));
    return d.toISOString().slice(0, 16);
  }
  function d0offset(ts) { return new Date(ts).getTimezoneOffset() * 60000; }
  function fromLocalInput(v) { return v ? new Date(v).getTime() : null; }

  function fileIcon(ext) {
    const m = {
      pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', csv: '📗',
      ppt: '📙', pptx: '📙', txt: '📄', md: '📄', json: '🧾',
      png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', bmp: '🖼️', webp: '🖼️', svg: '🖼️',
      zip: '🗜️', rar: '🗜️', '7z': '🗜️',
      mp3: '🎵', wav: '🎵', flac: '🎵', mp4: '🎬', avi: '🎬', mkv: '🎬', mov: '🎬',
      exe: '⚙️', js: '📜', py: '📜', html: '🌐'
    };
    return m[ext] || '📎';
  }

  function fmtSize(b) {
    if (!b) return '';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  function isImageIcon(v) {
    return /^data:image\//i.test(v) || /^https?:\/\//i.test(v);
  }

  function stepIconContent(s) {
    if (s.done) return '✓';
    const v = (s.icon || '').trim();
    if (!v) return esc(Array.from(s.title)[0] || '·');
    if (isImageIcon(v)) return `<img src="${esc(v)}" alt="">`;
    return esc(v);
  }

  function stepIconPreview(s) {
    if (s.done) return '✓';
    const v = (s.icon || '').trim();
    if (!v) return '📝';
    if (isImageIcon(v)) return `<img src="${esc(v)}" alt="">`;
    return esc(v);
  }

  function subStepIconContent(sub) {
    if (sub.done) return '✓';
    const v = (sub.icon || '').trim();
    if (!v) return esc(Array.from(sub.title)[0] || '·');
    if (isImageIcon(v)) return `<img src="${esc(v)}" alt="">`;
    return esc(v);
  }

  function subStepsRowHTML(s, cls = 'substep-icons-row') {
    if (!s.subSteps || !s.subSteps.length) return '';
    return `<div class="${cls}" ondragstart="return false">${s.subSteps.map((sub) => `
      <span class="substep-icon ${sub.done ? 'done' : ''}" title="${esc(sub.title)}" data-substepopen="${sub.id}" draggable="false">${subStepIconContent(sub)}</span>
    `).join('')}</div>`;
  }

  function subStepCardsHTML(s) {
    if (!s.subSteps || !s.subSteps.length) return '';
    return `<div class="substep-cards">${s.subSteps.map((sub) => {
      const coverStyle = sub.cover ? `--substep-cover:url('${esc(sub.cover).replace(/'/g, "\\'")}');` : '';
      return `
      <div class="substep-card ${sub.done ? 'done' : ''} ${sub.cover ? 'has-cover' : ''}" data-substepopen="${sub.id}" style="${coverStyle}">
        <span class="substep-check ${sub.done ? 'checked' : ''}" data-substepcheck="${sub.id}"></span>
        <span class="substep-title">${esc(sub.title)}</span>
        <div class="substep-card-meta">
          ${sub.note ? '<span class="attach-mini">📝</span>' : ''}
          ${sub.files.length ? `<span class="attach-mini">📎${sub.files.length}</span>` : ''}
          ${sub.links.length ? `<span class="attach-mini">🔗${sub.links.length}</span>` : ''}
          ${sub.pomodoros ? `<span class="attach-mini">🍅${sub.pomodoros}</span>` : ''}
        </div>
        <span class="icon-btn" data-substepedit="${sub.id}" title="编辑子步骤">✏</span>
      </div>`;
    }).join('')}</div>`;
  }

  function nextDueTime(due, dueRepeat) {
    if (!due) return null;
    if (dueRepeat === 'none' || !dueRepeat) return due;
    const now = Date.now();
    if (due > now) return due;
    let next = due;
    for (let i = 0; i < 365 && next <= now; i++) {
      if (dueRepeat === 'monthly') {
        const d = new Date(next);
        d.setMonth(d.getMonth() + 1);
        next = d.getTime();
      } else {
        next += dueRepeat === 'weekly' ? 604800000 : 86400000;
      }
    }
    return next;
  }

  function reminderSummaryHTML(o) {
    if (!o.due) return '';
    const repeatLabel = ({ daily: '每日重复', weekly: '每周重复', monthly: '每月重复' }[o.dueRepeat]) || '';
    if (o.remindBefore === -1) {
      return `<div class="meta-line" style="margin-top:6px">不提醒${repeatLabel ? ' · ' + repeatLabel : ''}</div>`;
    }
    const effectiveDue = nextDueTime(o.due, o.dueRepeat) || o.due;
    const triggerAt = effectiveDue - o.remindBefore * 60000;
    const isPast = triggerAt <= Date.now();
    const repeatExtra = o.dueRepeat !== 'none' ? ` · 下次到期：${new Date(effectiveDue).toLocaleString('zh-CN')}` : '';
    return `<div class="meta-line" style="margin-top:6px">${isPast ? '已于' : '将于'} ${new Date(triggerAt).toLocaleString('zh-CN')} 提醒${o.notified ? '（已提醒）' : ''}${repeatLabel ? ' · ' + repeatLabel : ''}${repeatExtra}</div>`;
  }

  // 多提醒：选项常量
  const REMIND_BEFORE_OPTS = [
    [-1, '不提醒'], [0, '准时提醒'], [5, '提前 5 分钟'], [15, '提前 15 分钟'],
    [30, '提前 30 分钟'], [60, '提前 1 小时'], [1440, '提前 1 天']
  ];
  const DUE_REPEAT_OPTS = [
    ['none', '不重复提醒'], ['daily', '每日提醒'], ['weekly', '每周提醒'], ['monthly', '每月提醒']
  ];
  function remindSelectHTML(value, attrs) {
    const opts = DUE_REPEAT_OPTS.map(([v, l]) => `<option value="${v}" ${value === v ? 'selected' : ''}>${l}</option>`).join('');
    return `<select class="sel" ${attrs}>${opts}</select>`;
  }
  function beforeSelectHTML(value, attrs) {
    const opts = REMIND_BEFORE_OPTS.map(([v, l]) => `<option value="${v}" ${value === v ? 'selected' : ''}>${l}</option>`).join('');
    return `<select class="sel" ${attrs}>${opts}</select>`;
  }

  // 渲染"提醒"字段：主提醒（沿用原 due/remindBefore/dueRepeat）+ 额外提醒列表 + 添加按钮
  function renderReminderSection(o, ownerKey) {
    const editing = editingReminderTaskId === ownerKey;
    const primaryExists = o.due || editing;
    let html = '';
    if (primaryExists) {
      html += `<div class="reminder-block">
        <input type="datetime-local" class="inp" data-due="${ownerKey}" value="${toLocalInput(o.due)}" />
        <div style="margin-top:8px">${beforeSelectHTML(o.remindBefore === undefined ? 0 : o.remindBefore, `data-remind="${ownerKey}"`)}</div>
        <div style="margin-top:8px">${remindSelectHTML(o.dueRepeat || 'none', `data-due-repeat="${ownerKey}"`)}</div>
        ${reminderSummaryHTML(o)}
      </div>`;
    }
    (o.reminders || []).forEach((rem, idx) => {
      html += `<div class="reminder-block reminder-extra">
        <button class="icon-btn rem-del" data-rem-del="${ownerKey}::${idx}" title="删除此提醒">✕</button>
        <div class="reminder-block-head">额外提醒 ${idx + 1}</div>
        <input type="datetime-local" class="inp" data-rem-due="${ownerKey}::${idx}" value="${toLocalInput(rem.due)}" />
        <div style="margin-top:8px">${beforeSelectHTML(rem.remindBefore === undefined ? 0 : rem.remindBefore, `data-rem-remind="${ownerKey}::${idx}"`)}</div>
        <div style="margin-top:8px">${remindSelectHTML(rem.dueRepeat || 'none', `data-rem-repeat="${ownerKey}::${idx}"`)}</div>
        ${reminderSummaryHTML(rem)}
      </div>`;
    });
    html += `<button class="btn sm rem-add" data-rem-add="${ownerKey}">＋ 添加提醒</button>`;
    const headBtn = primaryExists
      ? `<button class="icon-btn" data-reminder-cancel="${ownerKey}" title="取消主提醒">✕</button>`
      : `<button class="icon-btn" data-reminder-start="${ownerKey}" title="设置提醒">＋</button>`;
    return `<div class="field"><div class="field-label"><span>提醒</span>${headBtn}</div>${html}</div>`;
  }

  function renderCover(obj, owner, position = 'top') {
    const cover = obj.cover || '';
    const coverStyle = cover ? `--cover-img:url("${esc(cover).replace(/"/g, '&quot;')}");` : '';
    const posClass = position === 'bottom' ? 'detail-cover-bottom' : '';
    return `
      <div class="detail-cover ${posClass} ${cover ? 'has-image' : ''}" data-coverowner="${owner}" style="${coverStyle}">
        <div class="detail-cover-actions">
          <button class="icon-btn" data-coverupload="${owner}" title="上传背景图片">📷</button>
          <button class="icon-btn" data-coverclear="${owner}" ${cover ? '' : 'hidden'} title="清除背景图片">🧽</button>
        </div>
        <input type="file" accept="image/*" data-coverfile="${owner}" style="display:none">
      </div>`;
  }

  function setCover(owner, dataUrl) {
    const o = ownerObj(owner);
    if (!o) return;
    o.cover = dataUrl || '';
    Store.save();
    renderDetail();
    toast(dataUrl ? '背景图片已更新' : '背景图片已清除');
  }

  /* ---------------- 台前调度浏览器 ---------------- */
  let browserTitleHandler = null;

  // 判断是否为本地文件 / 快捷方式（如桌面 .lnk、C:\ 路径、file:/// 路径）
  function isLocalPath(url) {
    const u = String(url || '').trim();
    if (/^file:\/\//i.test(u)) return true;            // file:///C:/.../xxx.lnk
    if (/^[a-z]:[\\/]/i.test(u)) return true;          // C:\path\xxx.lnk
    if (/^\\\\/.test(u)) return true;                  // UNC \\server\...
    return false;
  }
  function localPathFromUrl(url) {
    const u = String(url || '').trim();
    if (/^file:\/\//i.test(u)) {
      let p = decodeURIComponent(u.replace(/^file:\/\//i, ''));
      if (/^\/[a-z]:/i.test(p)) p = p.slice(1);        // /C:/... -> C:/...
      return p;
    }
    return u;
  }

  function openInlineBrowser(url) {
    const overlay = $('browserOverlay');
    const webview = $('browserWebview');
    const titleEl = $('browserTitle');
    titleEl.textContent = '加载中…';
    resetBrowserFavicon();
    webview.src = url;
    overlay.hidden = false;

    // 清理旧监听器，防止重复
    if (browserTitleHandler) {
      webview.removeEventListener('page-title-updated', browserTitleHandler);
      browserTitleHandler = null;
    }

    // 页面标题变化时实时更新标签页名称
    browserTitleHandler = (e) => { titleEl.textContent = e.title || '无标题'; };
    webview.addEventListener('page-title-updated', browserTitleHandler);

    // 加载完成后尝试读取 favicon 与标题
    webview.addEventListener('dom-ready', () => {
      try {
        webview.executeJavaScript('document.title', true)
          .then((t) => { if (t) titleEl.textContent = t; })
          .catch(() => {});
        webview.executeJavaScript(`(() => {
          const el = document.querySelector('link[rel*="icon"]');
          return el ? el.href : '';
        })()`, true).then((href) => {
          if (href) {
            const fav = href.startsWith('http') ? href : (new URL(href, url).toString());
            $('browserFavicon').innerHTML = `<img src="${fav}" alt="" onerror="this.textContent='🌐'; this.onerror=null">`;
          } else {
            resetBrowserFavicon();
          }
        }).catch(() => { resetBrowserFavicon(); });
      } catch (e) {}
    }, { once: true });
  }

  function resetBrowserFavicon() { $('browserFavicon').textContent = '🌐'; }

  /* ---------------- 工具箱（常用超链接台前调度浮层） ---------------- */
  // 常用工具链接，按需修改即可（local 为本地路径如 exe/lnk，web 为网址）
  const TOOLBOX_CATEGORIES = [
    { id: 'home', icon: '🏠', name: '主页' },
    { id: 'docs', icon: '📄', name: '常用文档' },
    { id: 'qinglong', icon: '🐉', name: '青龙面板' },
    { id: 'cloud', icon: '☁️', name: '云服务器' },
    { id: 'code', icon: '💻', name: '编程' },
    { id: 'tools', icon: '🧰', name: '常用工具' },
    { id: 'music', icon: '🎵', name: '音乐' },
    { id: 'settings', icon: '⚙️', name: '设置' }
  ];
  const TOOLBOX_LINKS = [
    // 预设链接已移除，仅保留用户自定义链接（通过工具箱「添加」按钮添加）
  ];
  let toolboxActiveCategory = 'tools';

  function openToolboxLink(item) {
    const u = item.url || '';
    if (!u) return;
    if (item.type === 'local' || isLocalPath(u)) {
      window.api.openFile(localPathFromUrl(u));
    } else {
      openInlineBrowser(u);
    }
  }

  function toolboxIconHTML(icon, cls = 'toolbox-app-icon') {
    const v = (icon || '').trim();
    if (!v) return '';
    if (/^data:image\//i.test(v) || /^https?:\/\//i.test(v)) {
      return `<img class="${cls} icon-img" src="${esc(v)}" alt="" onerror="this.replaceWith(document.createTextNode('🔗'))">`;
    }
    return `<span class="${cls}">${esc(v)}</span>`;
  }

  function renderToolbox() {
    const catNav = $('toolboxCategories');
    const grid = $('toolboxGrid');
    const title = $('toolboxSectionTitle');
    const shell = document.querySelector('.toolbox-shell');
    if (!catNav || !grid) return;

    // 应用用户自定义背景
    applyToolboxBackground(shell);

    const hidden = new Set(D().settings.toolboxHidden || []);

    // 左侧分类（去除初始图标）
    catNav.innerHTML = TOOLBOX_CATEGORIES.map(c => `
      <button class="toolbox-cat${c.id === toolboxActiveCategory ? ' active' : ''}" data-cat="${esc(c.id)}">
        <span class="toolbox-cat-name">${esc(c.name)}</span>
      </button>`).join('');

    // 右侧 App 网格：合并预设（过滤隐藏） + 用户自定义链接
    const userLinks = (D().settings.toolboxLinks || []).filter(l => l && l.url);
    const visiblePreset = TOOLBOX_LINKS.filter(p => !hidden.has(p.id)).map(p => ({ ...p, _preset: true }));
    const allLinks = [...visiblePreset, ...userLinks];
    const items = toolboxActiveCategory === 'home'
      ? allLinks.filter(it => it.category === 'home')
      : allLinks.filter(it => it.category === toolboxActiveCategory || (!it.category && toolboxActiveCategory === 'tools'));
    const catName = TOOLBOX_CATEGORIES.find(c => c.id === toolboxActiveCategory)?.name || '工具';
    if (title) title.textContent = catName;

    grid.innerHTML = items.map((it, i) => {
      const rawIcon = (it.icon || it.emoji || '').trim();
      const isImg = /^data:image\//i.test(rawIcon) || /^https?:\/\//i.test(rawIcon);
      const wrapStyle = isImg ? `style="background-image:url(${esc(rawIcon)})"` : '';
      const wrapCls = isImg ? 'toolbox-icon-wrap img-bg' : 'toolbox-icon-wrap';
      const inner = isImg ? '' : toolboxIconHTML(rawIcon);
      return `
      <div class="toolbox-app" data-tool="${esc(toolboxActiveCategory)}:${i}" draggable="true">
        <button class="toolbox-app-menu" data-tb-menu="${esc(toolboxActiveCategory)}:${i}" title="编辑 / 删除">⋮</button>
        <button class="toolbox-app-main" data-tool="${esc(toolboxActiveCategory)}:${i}">
          <span class="${wrapCls}" ${wrapStyle}>${inner}</span>
          <span class="toolbox-app-name">${esc(it.name || '链接')}</span>
        </button>
      </div>`;
    }).join('') + `
      <button class="toolbox-app toolbox-app-add" data-tb-add="1" title="添加常用链接">
        <span class="toolbox-icon-wrap"><span class="toolbox-app-icon">＋</span></span>
        <span class="toolbox-app-name">添加</span>
      </button>`;
  }

  function switchToolboxCategory(catId) {
    toolboxActiveCategory = catId;
    renderToolbox();
  }

  function applyToolboxBackground(shell) {
    if (!shell) return;
    const bg = (D().settings.toolboxBackground || '').trim();
    shell.classList.toggle('has-bg', !!bg);
    if (!bg) {
      shell.style.backgroundImage = '';
      shell.style.backgroundColor = '';
      return;
    }
    if (/^data:image\//i.test(bg) || /^https?:\/\//i.test(bg)) {
      shell.style.backgroundImage = `url(${bg})`;
      shell.style.backgroundColor = '';
    } else {
      shell.style.backgroundImage = '';
      shell.style.backgroundColor = bg;
    }
  }

  function openToolboxBackground() {
    const current = (D().settings.toolboxBackground || '').trim();
    modal(`
      <div class="modal-title">自定义工具箱背景</div>
      <div class="field"><div class="field-label"><span>当前背景</span></div>
        <div class="tb-bg-preview" id="tbBgPreview">${current ? '<span>已设置</span>' : '<span class="muted">未设置</span>'}</div>
      </div>
      <div class="field"><div class="field-label"><span>模式</span></div>
        <div class="tb-icon-modes">
          <button class="btn sm ${!current ? 'active' : ''}" data-tb-bg-mode="none" type="button">默认</button>
          <button class="btn sm ${/^data:image|^https?:/.test(current) ? 'active' : ''}" data-tb-bg-mode="image" type="button">图片</button>
          <button class="btn sm ${current && !/^data:image|^https?:/.test(current) ? 'active' : ''}" data-tb-bg-mode="color" type="button">颜色</button>
        </div>
        <div class="tb-icon-panel ${current && /^data:image|^https?:/.test(current) ? '' : 'hidden'}" id="tbBgPanelImage">
          <button class="btn" id="tbPickBg" type="button">选择背景图片</button>
          <input type="file" accept="image/*" id="tbBgFile" style="display:none">
          <span class="hint-text">支持 png / jpg / gif / webp</span>
        </div>
        <div class="tb-icon-panel ${current && !/^data:image|^https?:/.test(current) ? '' : 'hidden'}" id="tbBgPanelColor">
          <input class="inp" id="tbBgColor" type="color" value="#1e293b" />
          <span class="hint-text">选择纯色背景</span>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" data-cancel="1">取消</button>
        <button class="btn primary" id="tbBgOk">保存</button>
      </div>`, () => {
      const previewEl = $('tbBgPreview');
      let value = current;
      let mode = !current ? 'none' : (/^data:image|^https?:/.test(current) ? 'image' : 'color');

      function updatePanels() {
        document.querySelectorAll('[data-tb-bg-mode]').forEach(b => b.classList.toggle('active', b.dataset.tbBgMode === mode));
        $('tbBgPanelImage')?.classList.toggle('hidden', mode !== 'image');
        $('tbBgPanelColor')?.classList.toggle('hidden', mode !== 'color');
      }
      function updatePreview() {
        if (!value) previewEl.innerHTML = '<span class="muted">未设置</span>';
        else if (/^data:image|^https?:/.test(value)) previewEl.innerHTML = '<img src="' + esc(value) + '" alt="">';
        else previewEl.style.backgroundColor = value;
      }
      document.querySelectorAll('[data-tb-bg-mode]').forEach(b => {
        b.addEventListener('click', () => {
          mode = b.dataset.tbBgMode;
          value = mode === 'none' ? '' : value;
          if (mode === 'color' && !value) value = '#1e293b';
          if (mode === 'image' && !/^data:image|^https?:/.test(value)) value = '';
          updatePanels();
          updatePreview();
        });
      });
      $('tbPickBg').addEventListener('click', () => $('tbBgFile').click());
      $('tbBgFile').addEventListener('change', () => {
        const file = $('tbBgFile').files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { value = reader.result; mode = 'image'; updatePanels(); updatePreview(); toast('已选择背景图片'); };
        reader.readAsDataURL(file);
      });
      $('tbBgColor').addEventListener('input', (e) => { value = e.target.value; mode = 'color'; updatePanels(); updatePreview(); });

      updatePanels();
      updatePreview();

      $('tbBgOk').onclick = () => {
        D().settings.toolboxBackground = value;
        Store.save();
        applyToolboxBackground(document.querySelector('.toolbox-shell'));
        closeModal();
        toast('工具箱背景已保存');
      };
    });
  }

  function openToolbox() {
    renderToolbox();
    bindToolboxDragAndDrop();
    $('toolboxOverlay').hidden = false;
  }
  function closeToolbox() { $('toolboxOverlay').hidden = true; }

  function openAddToolboxLink() {
    const defaultCat = toolboxActiveCategory;
    const catOptions = TOOLBOX_CATEGORIES.map(c =>
      `<option value="${esc(c.id)}"${c.id === defaultCat ? ' selected' : ''}>${esc(c.name)}</option>`
    ).join('');
    modal(`
      <div class="modal-title">添加常用链接</div>
      <div class="field"><div class="field-label"><span>名称</span></div>
        <input class="inp" id="tbLinkName" placeholder="例如：VS Code / 向日葵" /></div>
      <div class="field"><div class="field-label"><span>链接地址</span></div>
        <input class="inp" id="tbLinkUrl" placeholder="https://... 或本地路径，如 C:\\Users\\...\\xxx.lnk" /></div>
      <div class="field"><div class="field-label"><span>图标</span></div>
        <div class="tb-icon-preview" id="tbIconPreview">🔗</div>
        <div class="tb-icon-modes">
          <button class="btn sm active" data-tb-icon-mode="favicon" type="button">网页图标</button>
          <button class="btn sm" data-tb-icon-mode="upload" type="button">上传图片</button>
          <button class="btn sm" data-tb-icon-mode="emoji" type="button">Emoji</button>
        </div>
        <div class="tb-icon-panel" id="tbIconPanelFavicon">
          <button class="btn" id="tbFetchFavicon" type="button">自动获取网页图标</button>
          <span class="hint-text">根据链接地址自动抓取网站 favicon</span>
        </div>
        <div class="tb-icon-panel hidden" id="tbIconPanelUpload">
          <button class="btn" id="tbPickIcon" type="button">选择图片</button>
          <input type="file" accept="image/*" id="tbIconFile" style="display:none">
          <span class="hint-text">支持 png / jpg / gif / webp / ico</span>
        </div>
        <div class="tb-icon-panel hidden" id="tbIconPanelEmoji">
          <input class="inp" id="tbLinkEmoji" maxlength="2" placeholder="🔗" />
        </div>
      </div>
      <div class="field"><div class="field-label"><span>分类</span></div>
        <select class="inp" id="tbLinkCat">${catOptions}</select></div>
      <div class="modal-actions">
        <button class="btn" data-cancel="1">取消</button>
        <button class="btn primary" id="tbLinkOk">添加</button>
      </div>`, () => {
      const nameEl = $('tbLinkName');
      const urlEl = $('tbLinkUrl');
      const catEl = $('tbLinkCat');
      const previewEl = $('tbIconPreview');
      let currentIcon = '🔗';
      let iconMode = 'favicon';

      function setIcon(v) {
        currentIcon = v || '🔗';
        previewEl.innerHTML = toolboxIconHTML(currentIcon, 'tb-preview-icon');
      }
      function updateModeButtons() {
        document.querySelectorAll('[data-tb-icon-mode]').forEach(b => {
          b.classList.toggle('active', b.dataset.tbIconMode === iconMode);
        });
        ['favicon', 'upload', 'emoji'].forEach(m => {
          const p = $(`tbIconPanel${m.charAt(0).toUpperCase() + m.slice(1)}`);
          if (p) p.classList.toggle('hidden', m !== iconMode);
        });
      }
      document.querySelectorAll('[data-tb-icon-mode]').forEach(b => {
        b.addEventListener('click', () => {
          iconMode = b.dataset.tbIconMode;
          updateModeButtons();
          if (iconMode === 'emoji') $('tbLinkEmoji').focus();
        });
      });

      $('tbFetchFavicon').addEventListener('click', async () => {
        const url = urlEl.value.trim();
        if (!url) { toast('请先输入链接地址'); return; }
        if (isLocalPath(url)) { toast('本地路径不支持自动获取网页图标'); return; }
        const r = await window.api.fetchFavicon(url);
        if (r.ok && r.dataUrl) {
          setIcon(r.dataUrl);
          toast('已获取网页图标');
        } else {
          toast('未找到网页图标，可换用上传图片或 Emoji');
        }
      });

      $('tbPickIcon').addEventListener('click', () => $('tbIconFile').click());
      $('tbIconFile').addEventListener('change', () => {
        const file = $('tbIconFile').files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { setIcon(reader.result); toast('已选择图片'); };
        reader.readAsDataURL(file);
      });

      $('tbLinkEmoji').addEventListener('input', () => setIcon($('tbLinkEmoji').value.trim() || '🔗'));

      nameEl.focus();
      updateModeButtons();
      setIcon('🔗');

      const ok = () => {
        const url = urlEl.value.trim();
        if (!url) { toast('请输入链接地址'); return; }
        const name = nameEl.value.trim() || url;
        const category = catEl.value || 'tools';
        const icon = iconMode === 'emoji' ? ($('tbLinkEmoji').value.trim() || '🔗') : currentIcon;
        const type = isLocalPath(url) ? 'local' : 'web';
        const links = D().settings.toolboxLinks || (D().settings.toolboxLinks = []);
        links.push({ id: Store.uid(), name, url, icon, category, type });
        Store.save();
        closeModal();
        renderToolbox();
        toast('已添加到工具箱');
      };
      $('tbLinkOk').onclick = ok;
      urlEl.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
      nameEl.onkeydown = (e) => { if (e.key === 'Enter') urlEl.focus(); };
    });
  }

  function getToolboxItem(cat, idx) {
    const hidden = new Set(D().settings.toolboxHidden || []);
    const userLinks = (D().settings.toolboxLinks || []).filter(l => l && l.url);
    const visiblePreset = TOOLBOX_LINKS.filter(p => !hidden.has(p.id)).map(p => ({ ...p, _preset: true }));
    const allLinks = [...visiblePreset, ...userLinks];
    const items = cat === 'home'
      ? allLinks.filter(it => it.category === 'home')
      : allLinks.filter(it => it.category === cat || (!it.category && cat === 'tools'));
    return items[idx];
  }

  function openToolboxMenu(cat, idx) {
    const item = getToolboxItem(cat, idx);
    if (!item) return;
    const isPreset = !!item._preset;
    const title = item.name || item.url || '链接';
    modal(`
      <div class="modal-title">${esc(title)}</div>
      <div class="tb-menu-list">
        <button class="btn tb-menu-item" data-tb-edit="${esc(cat)}:${idx}">编辑</button>
        ${isPreset
          ? `<button class="btn tb-menu-item danger" data-tb-remove-preset="${esc(item.id)}">删除</button>`
          : `<button class="btn tb-menu-item danger" data-tb-delete="${esc(item.id)}">删除</button>`}
      </div>
      <div class="modal-actions">
        <button class="btn" data-cancel="1">取消</button>
      </div>`, () => {
      const editBtn = document.querySelector('[data-tb-edit]');
      if (editBtn) {
        editBtn.onclick = () => { closeModal(); setTimeout(() => openEditToolboxLink(cat, idx), 0); };
      }
      const delBtn = document.querySelector('[data-tb-delete]');
      if (delBtn) {
        delBtn.onclick = () => {
          closeModal();
          confirmBox('删除链接', `确定删除自定义链接「${esc(title)}」吗？此操作不可撤销。`, () => {
            D().settings.toolboxLinks = (D().settings.toolboxLinks || []).filter(l => l.id !== item.id);
            Store.save(); renderToolbox(); toast('已删除链接');
          });
        };
      }
      const remBtn = document.querySelector('[data-tb-remove-preset]');
      if (remBtn) {
        remBtn.onclick = () => {
          closeModal();
          confirmBox('隐藏预设链接', `确定隐藏预设链接「${esc(title)}」吗？隐藏后可重新添加同名自定义链接。`, () => {
            const hidden = new Set(D().settings.toolboxHidden || []);
            hidden.add(item.id);
            D().settings.toolboxHidden = Array.from(hidden);
            Store.save(); renderToolbox(); toast('已隐藏预设链接');
          });
        };
      }
    });
  }

  function openEditToolboxLink(cat, idx) {
    const item = getToolboxItem(cat, idx);
    if (!item) return;
    const isPreset = !!item._preset;
    const defaultCat = item.category || 'tools';
    const catOptions = TOOLBOX_CATEGORIES.map(c =>
      `<option value="${esc(c.id)}"${c.id === defaultCat ? ' selected' : ''}>${esc(c.name)}</option>`
    ).join('');
    modal(`
      <div class="modal-title">${isPreset ? '编辑预设链接（保存为自定义）' : '编辑常用链接'}</div>
      <div class="field"><div class="field-label"><span>名称</span></div>
        <input class="inp" id="tbLinkName" value="${esc(item.name || '')}" /></div>
      <div class="field"><div class="field-label"><span>链接地址</span></div>
        <input class="inp" id="tbLinkUrl" value="${esc(item.url || '')}" /></div>
      <div class="field"><div class="field-label"><span>图标</span></div>
        <div class="tb-icon-preview" id="tbIconPreview"></div>
        <div class="tb-icon-modes">
          <button class="btn sm" data-tb-icon-mode="favicon" type="button">网页图标</button>
          <button class="btn sm" data-tb-icon-mode="upload" type="button">上传图片</button>
          <button class="btn sm" data-tb-icon-mode="emoji" type="button">Emoji</button>
        </div>
        <div class="tb-icon-panel" id="tbIconPanelFavicon">
          <button class="btn" id="tbFetchFavicon" type="button">自动获取网页图标</button>
          <span class="hint-text">根据链接地址自动抓取网站 favicon</span>
        </div>
        <div class="tb-icon-panel hidden" id="tbIconPanelUpload">
          <button class="btn" id="tbPickIcon" type="button">选择图片</button>
          <input type="file" accept="image/*" id="tbIconFile" style="display:none">
          <span class="hint-text">支持 png / jpg / gif / webp / ico</span>
        </div>
        <div class="tb-icon-panel hidden" id="tbIconPanelEmoji">
          <input class="inp" id="tbLinkEmoji" maxlength="2" placeholder="🔗" />
        </div>
      </div>
      <div class="field"><div class="field-label"><span>分类</span></div>
        <select class="inp" id="tbLinkCat">${catOptions}</select></div>
      <div class="modal-actions">
        <button class="btn" data-cancel="1">取消</button>
        <button class="btn primary" id="tbLinkOk">保存</button>
      </div>`, () => {
      const nameEl = $('tbLinkName');
      const urlEl = $('tbLinkUrl');
      const catEl = $('tbLinkCat');
      const previewEl = $('tbIconPreview');
      const emojiInp = $('tbLinkEmoji');
      let currentIcon = item.icon || item.emoji || '🔗';
      let iconMode = /^data:image\//i.test(currentIcon) ? 'upload' : (/^https?:\/\//i.test(currentIcon) ? 'favicon' : 'emoji');

      function setIcon(v) {
        currentIcon = v || '🔗';
        previewEl.innerHTML = toolboxIconHTML(currentIcon, 'tb-preview-icon') || '🔗';
      }
      function updateModeButtons() {
        document.querySelectorAll('[data-tb-icon-mode]').forEach(b => {
          b.classList.toggle('active', b.dataset.tbIconMode === iconMode);
        });
        ['favicon', 'upload', 'emoji'].forEach(m => {
          const p = $(`tbIconPanel${m.charAt(0).toUpperCase() + m.slice(1)}`);
          if (p) p.classList.toggle('hidden', m !== iconMode);
        });
      }
      document.querySelectorAll('[data-tb-icon-mode]').forEach(b => {
        b.addEventListener('click', () => {
          iconMode = b.dataset.tbIconMode;
          updateModeButtons();
          if (iconMode === 'emoji') emojiInp.focus();
        });
      });

      $('tbFetchFavicon').addEventListener('click', async () => {
        const url = urlEl.value.trim();
        if (!url) { toast('请先输入链接地址'); return; }
        if (isLocalPath(url)) { toast('本地路径不支持自动获取网页图标'); return; }
        const r = await window.api.fetchFavicon(url);
        if (r.ok && r.dataUrl) { setIcon(r.dataUrl); toast('已获取网页图标'); }
        else { toast('未找到网页图标，可换用上传图片或 Emoji'); }
      });

      $('tbPickIcon').addEventListener('click', () => $('tbIconFile').click());
      $('tbIconFile').addEventListener('change', () => {
        const file = $('tbIconFile').files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { setIcon(reader.result); toast('已选择图片'); };
        reader.readAsDataURL(file);
      });

      emojiInp.addEventListener('input', () => setIcon(emojiInp.value.trim() || '🔗'));

      updateModeButtons();
      setIcon(currentIcon);
      if (iconMode === 'emoji') emojiInp.value = currentIcon === '🔗' ? '' : currentIcon;

      const ok = () => {
        const url = urlEl.value.trim();
        if (!url) { toast('请输入链接地址'); return; }
        const name = nameEl.value.trim() || url;
        const category = catEl.value || 'tools';
        const icon = iconMode === 'emoji' ? (emojiInp.value.trim() || '🔗') : currentIcon;
        const type = isLocalPath(url) ? 'local' : 'web';
        if (isPreset) {
          // 编辑预设 → 隐藏原预设并添加为自定义
          const hidden = new Set(D().settings.toolboxHidden || []);
          hidden.add(item.id);
          D().settings.toolboxHidden = Array.from(hidden);
          const links = D().settings.toolboxLinks || (D().settings.toolboxLinks = []);
          links.push({ id: Store.uid(), name, url, icon, category, type });
        } else {
          const existing = (D().settings.toolboxLinks || []).find(l => l.id === item.id);
          if (existing) {
            existing.name = name; existing.url = url; existing.icon = icon; existing.category = category; existing.type = type;
          }
        }
        Store.save();
        closeModal();
        renderToolbox();
        toast('已保存链接');
      };
      $('tbLinkOk').onclick = ok;
      urlEl.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
      nameEl.onkeydown = (e) => { if (e.key === 'Enter') urlEl.focus(); };
    });
  }

  function bindToolboxDragAndDrop() {
    const grid = $('toolboxGrid');
    if (!grid || grid.dataset.tbDragBound) return;
    grid.dataset.tbDragBound = '1';
    const catNav = $('toolboxCategories');
    let dragId = null;

    grid.addEventListener('dragstart', (e) => {
      const app = e.target.closest('.toolbox-app[data-tool]');
      if (!app) { e.preventDefault(); return; }
      const [cat, idx] = app.dataset.tool.split(':');
      const item = getToolboxItem(cat, +idx);
      if (!item || item._preset) { e.preventDefault(); return; }
      dragId = app.dataset.tool;
      app.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragId); } catch (_) {}
    });

    grid.addEventListener('dragend', (e) => {
      e.target.closest('.toolbox-app[data-tool]')?.classList.remove('dragging');
      grid.querySelectorAll('.toolbox-app[data-tool]').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
      catNav?.querySelectorAll('[data-cat]').forEach((b) => b.classList.remove('drop-target'));
      dragId = null;
    });

    grid.addEventListener('dragover', (e) => {
      e.preventDefault();
      const target = e.target.closest('.toolbox-app[data-tool]');
      if (!target || target.dataset.tool === dragId) return;
      const [cat, idx] = target.dataset.tool.split(':');
      const item = getToolboxItem(cat, +idx);
      if (!item || item._preset) return;
      e.dataTransfer.dropEffect = 'move';
      grid.querySelectorAll('.toolbox-app[data-tool]').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
      catNav?.querySelectorAll('[data-cat]').forEach((b) => b.classList.remove('drop-target'));
      const rect = target.getBoundingClientRect();
      const after = e.clientX > rect.left + rect.width / 2;
      target.classList.add(after ? 'drop-after' : 'drop-before');
    });

    grid.addEventListener('dragleave', (e) => {
      const app = e.target.closest('.toolbox-app[data-tool]');
      if (app) app.classList.remove('drop-before', 'drop-after');
    });

    grid.addEventListener('drop', (e) => {
      e.preventDefault();
      const target = e.target.closest('.toolbox-app[data-tool]');
      if (!target || target.dataset.tool === dragId) return;
      const [dragCat, dragIdx] = dragId.split(':');
      const [targetCat, targetIdx] = target.dataset.tool.split(':');
      const dragItem = getToolboxItem(dragCat, +dragIdx);
      const targetItem = getToolboxItem(targetCat, +targetIdx);
      if (!dragItem || !targetItem || dragItem._preset || targetItem._preset) return;

      const links = D().settings.toolboxLinks || [];
      const fromIdx = links.findIndex((l) => l.id === dragItem.id);
      const toIdx = links.findIndex((l) => l.id === targetItem.id);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

      const rect = target.getBoundingClientRect();
      const after = e.clientX > rect.left + rect.width / 2;
      let insertIdx;
      if (after) insertIdx = toIdx > fromIdx ? toIdx : toIdx + 1;
      else insertIdx = toIdx < fromIdx ? toIdx : toIdx - 1;
      insertIdx = Math.max(0, Math.min(insertIdx, links.length - 1));

      const [moved] = links.splice(fromIdx, 1);
      links.splice(insertIdx, 0, moved);

      Store.save(); renderToolbox(); toast('已调整顺序');
    });

    // 跨分组拖拽：拖到左侧分类按钮上时移动到对应分组
    if (catNav && !catNav.dataset.tbCatDragBound) {
      catNav.dataset.tbCatDragBound = '1';
      catNav.addEventListener('dragover', (e) => {
        if (!dragId) return;
        const btn = e.target.closest('[data-cat]');
        if (!btn) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        catNav.querySelectorAll('[data-cat]').forEach((b) => b.classList.remove('drop-target'));
        btn.classList.add('drop-target');
      });
      catNav.addEventListener('dragleave', (e) => {
        const btn = e.target.closest('[data-cat]');
        if (btn) btn.classList.remove('drop-target');
      });
      catNav.addEventListener('drop', (e) => {
        e.preventDefault();
        const btn = e.target.closest('[data-cat]');
        if (!btn || !dragId) return;
        const targetCat = btn.dataset.cat;
        const [dragCat, dragIdx] = dragId.split(':');
        const dragItem = getToolboxItem(dragCat, +dragIdx);
        if (!dragItem || dragItem._preset) return;
        // 设置 category：目标为常用工具(默认)时置空，其它写入对应 id
        dragItem.category = targetCat === 'tools' ? '' : targetCat;
        Store.save();
        toolboxActiveCategory = targetCat;
        renderToolbox();
        catNav.querySelectorAll('[data-cat]').forEach((b) => b.classList.remove('drop-target'));
        toast(`已移动到${TOOLBOX_CATEGORIES.find(c => c.id === targetCat)?.name || '常用工具'}`);
      });
    }
  }

  function closeInlineBrowser() {
    const webview = $('browserWebview');
    if (browserTitleHandler) {
      webview.removeEventListener('page-title-updated', browserTitleHandler);
      browserTitleHandler = null;
    }
    $('browserOverlay').hidden = true;
    webview.src = 'about:blank';
    $('browserTitle').textContent = '加载中…';
    resetBrowserFavicon();
  }

  function toast(msg, ms) {
    const wrap = $('toastWrap');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 320);
    }, ms || 2200);
  }

  function confetti(x, y) {
    const colors = ['#4f6ef7', '#22a06b', '#f2a63b', '#e5484d', '#8b6cf7', '#0ea5e9'];
    for (let i = 0; i < 16; i++) {
      const d = document.createElement('div');
      d.className = 'confetti-dot';
      d.style.background = colors[i % colors.length];
      d.style.left = x + 'px';
      d.style.top = y + 'px';
      document.body.appendChild(d);
      const ang = (Math.PI * 2 * i) / 16 + Math.random() * 0.5;
      const dist = 45 + Math.random() * 70;
      d.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist + 60}px) rotate(${Math.random() * 540}deg) scale(.3)`, opacity: 0 }
      ], { duration: 700 + Math.random() * 350, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => d.remove();
    }
  }

  function animateStepVanish(el, x, y) {
    const rect = el.getBoundingClientRect();
    const clone = el.cloneNode(true);
    clone.classList.add('step-vanish-anim');
    clone.style.left = rect.left + 'px';
    clone.style.top = rect.top + 'px';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    document.body.appendChild(clone);
    clone.addEventListener('animationend', () => clone.remove());
    confetti(x, y);
  }

  /* ---------------- 设置应用 ---------------- */
  function applySettings() {
    const s = D().settings;
    document.documentElement.setAttribute('data-theme', s.theme);
    $('btnTheme').textContent = s.theme === 'dark' ? '☀️' : '🌙';
    Sound.config({ enabled: s.soundEnabled, volume: s.volume, style: s.soundStyle });
    $('btnToggleDone').classList.toggle('on', s.showDone);
    applySidebarCollapse();
  }

  function applySidebarCollapse() {
    const collapsed = D().settings.sidebarCollapsed;
    $('app').classList.toggle('sidebar-collapsed', collapsed);
    const left = $('btnCollapseSidebar');
    if (left) { left.title = collapsed ? '展开侧边栏' : '收起侧边栏'; left.textContent = collapsed ? '▶' : '◀'; }
  }

  function applyDetailPanel() {
    // 详情已改为台前调度浮层，原侧边栏把手不再使用
  }

  /* ---------------- 视图数据 ---------------- */
  function viewTasks() {
    const s = D().settings;
    let arr = D().tasks.slice();
    // 智能视图不显示存档任务表下的任务
    if (view.type === 'smart') {
      arr = arr.filter((t) => { const l = Store.list(t.listId); return !l || !l.archived; });
    }

    if (view.type === 'list') {
      arr = arr.filter((t) => t.listId === view.key);
    } else if (view.type === 'archive') {
      arr = [];
    } else {
      const today = startOfDay(Date.now());
      if (view.key === 'today') arr = arr.filter((t) => t.due && startOfDay(t.due) <= today && !t.done);
      else if (view.key === 'week') arr = arr.filter((t) => t.due && t.due <= today + 7 * 86400000 && !t.done);
      else if (view.key === 'star') arr = arr.filter((t) => t.star);
      else if (view.key === 'done') arr = arr.filter((t) => t.done);
    }

    if (search) {
      const k = search.toLowerCase();
      arr = arr.filter((t) =>
        t.title.toLowerCase().includes(k) ||
        (t.note || '').toLowerCase().includes(k) ||
        t.steps.some((st) => st.title.toLowerCase().includes(k) || (st.note || '').toLowerCase().includes(k)) ||
        (t.links || []).some((l) => (l.title + l.url).toLowerCase().includes(k)) ||
        (t.files || []).some((f) => f.name.toLowerCase().includes(k))
      );
    }

    const cmp = {
      manual: (a, b) => a.order - b.order,
      due: (a, b) => (a.due || 8.64e15) - (b.due || 8.64e15),
      priority: (a, b) => (b.priority - a.priority) || ((a.due || 8.64e15) - (b.due || 8.64e15)),
      created: (a, b) => b.createdAt - a.createdAt,
      title: (a, b) => a.title.localeCompare(b.title, 'zh-CN')
    }[s.sortBy] || ((a, b) => a.order - b.order);

    const active = arr.filter((t) => !t.done).sort(cmp);
    const done = arr.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    return { active, done };
  }

  function viewMeta() {
    if (view.type === 'archive') return { title: '📦 存档', list: null };
    if (view.type === 'list') {
      const l = Store.list(view.key);
      return l ? { title: l.emoji + ' ' + l.name, list: l } : { title: '任务', list: null };
    }
    const map = { today: '📅 今天', week: '🗓️ 未来七天', star: '⭐ 重要', done: '✅ 已完成' };
    return { title: map[view.key] || '任务', list: null };
  }

  /* ---------------- 渲染：侧边栏 ---------------- */
  function renderSidebar() {
    const tasks = D().tasks.filter((t) => { const l = Store.list(t.listId); return !l || !l.archived; });
    const today = startOfDay(Date.now());
    const counts = {
      today: tasks.filter((t) => !t.done && t.due && startOfDay(t.due) <= today).length,
      week: tasks.filter((t) => !t.done && t.due && t.due <= today + 7 * 86400000).length,
      star: tasks.filter((t) => !t.done && t.star).length,
      done: tasks.filter((t) => t.done).length,
      archived: D().lists.filter((l) => l.archived).length
    };
    document.querySelectorAll('[data-count]').forEach((el) => {
      const v = counts[el.dataset.count];
      el.textContent = v > 0 ? v : '';
    });
    document.querySelectorAll('#smartViews .nav-item').forEach((b) => {
      b.classList.toggle('active', (view.type === 'smart' && view.key === b.dataset.view) ||
        (view.type === 'archive' && b.dataset.view === 'archived'));
    });

    const ul = $('listNav');
    const lists = D().lists.filter((l) => !l.archived).sort((a, b) => a.order - b.order);
    ul.innerHTML = lists.map((l) => {
      const n = Store.tasksOf(l.id).filter((t) => !t.done).length;
      return `<li data-list="${l.id}" draggable="true" class="${view.type === 'list' && view.key === l.id ? 'active' : ''}">
        <span class="list-dot" style="background:${esc(l.color)}"></span>
        <span class="list-name">${esc(l.emoji)} ${esc(l.name)}</span>
        <span class="list-count">${n || ''}</span>
        <span class="icon-btn tiny row-menu" data-editlist="${l.id}" title="编辑任务表">⋯</span>
      </li>`;
    }).join('') || '<li style="color:var(--text-3);font-size:12px;cursor:default">还没有任务表</li>';
  }

  /* ---------------- 渲染：任务列表 ---------------- */
  function taskHTML(t) {
    const doneSteps = t.steps.filter((s) => s.done).length;
    const showList = view.type !== 'list';
    const l = Store.list(t.listId);
    const tags = [];

    if (t.due) tags.push(`<span class="tag due ${dueClass(t)}">🕒 ${esc(fmtDue(t.due))}${t.repeat !== 'none' ? ' 🔁' : ''}</span>`);
    else if (t.repeat !== 'none') tags.push(`<span class="tag">🔁 ${t.repeat === 'manual' ? '手动重复' : '重复'}</span>`);
    if (t.priority === 2) tags.push('<span class="tag p-high">高优先</span>');
    if (t.priority === 1) tags.push('<span class="tag p-mid">中优先</span>');
    if (t.steps.length) tags.push(`<span class="tag steps">☑ ${doneSteps}/${t.steps.length}</span>`);
    if (t.note) tags.push('<span class="tag">📝 备注</span>');
    if (t.files.length) tags.push(`<span class="tag">📎 ${t.files.length}</span>`);
    if (t.links.length) tags.push(`<span class="tag">🔗 ${t.links.length}</span>`);
    if (t.pomodoros) tags.push(`<span class="tag tomato">🍅 ${t.pomodoros}</span>`);
    if (showList && l) tags.push(`<span class="tag list"><span class="list-dot" style="background:${esc(l.color)};width:7px;height:7px"></span> ${esc(l.name)}</span>`);

    const pcls = t.priority === 2 ? ' p-high' : t.priority === 1 ? ' p-mid' : '';

    const taskCoverStyle = t.cover ? `--task-cover:url('${esc(t.cover).replace(/'/g, "\\'")}');` : '';
    const stepIconsHTML = t.steps.length ? `<div class="step-icons-row">${t.steps.map((s) => `<span class="step-icon ${s.done ? 'done' : ''}" title="${esc(s.title)}" data-stepopen="${s.id}" data-stepmove="${s.id}" draggable="true">${stepIconContent(s)}</span>`).join('')}</div>` : '';
    return `<div class="task-item ${t.done ? 'done' : ''} ${sel.taskId === t.id ? 'selected' : ''} ${t.cover ? 'has-cover' : ''}" data-task="${t.id}" draggable="true" style="${taskCoverStyle}">
      <div class="task-head" data-open="${t.id}">
        <span class="checkbox ${t.done ? 'checked' : ''}${pcls}" data-check="${t.id}"></span>
        <div class="task-main">
          <div class="task-title-row">
            <div class="task-title">${esc(t.title)}</div>
          </div>
          ${tags.length ? `<div class="task-meta">${tags.join('')}</div>` : ''}
        </div>
        ${stepIconsHTML}
        <div class="task-actions">
          <span class="icon-btn star-btn ${t.star ? 'on' : ''}" data-star="${t.id}" title="标记重要">${t.star ? '★' : '☆'}</span>
          <span class="icon-btn" data-pomo="${t.id}" title="用番茄钟专注此任务">🍅</span>
          <span class="icon-btn" data-del="${t.id}" title="删除任务">🗑</span>
        </div>
      </div>
    </div>`;
  }

  function renderTasks() {
    if (view.type === 'archive') { renderArchive(); return; }
    const { active, done } = viewTasks();
    const meta = viewMeta();
    const showDone = D().settings.showDone || view.key === 'done';

    $('viewTitle').textContent = meta.title;
    const total = active.length + done.length;
    const pct = total ? Math.round((done.length / total) * 100) : 0;
    $('viewSub').textContent = total
      ? `${active.length} 个待办 · ${done.length} 个已完成 · 完成度 ${pct}%`
      : '暂无任务';
    $('progressBar').style.width = pct + '%';
    $('btnListInfo').style.display = view.type === 'list' ? '' : 'none';
    const canAdd = view.key !== 'done';
    $('btnAddTask').style.display = canAdd ? '' : 'none';

    const renderWithGroups = (arr, doneGroup) => arr.map(taskHTML).join('');

    let html = renderWithGroups(active);
    if (showDone && done.length && view.key !== 'done') {
      html += `<div class="group-title">已完成 ${done.length}</div>` + renderWithGroups(done, true);
    } else if (view.key === 'done') {
      html = renderWithGroups(done, true);
    }
    $('taskList').innerHTML = html;
    const hasVisibleTasks = active.length > 0 || (showDone && done.length > 0);
    $('emptyState').hidden = hasVisibleTasks;

    // 为步骤图标横向列表启用鼠标拖拽滚动
    $('taskList').querySelectorAll('.step-icons-row').forEach(enableDragScroll);
    $('taskList').querySelectorAll('.substep-icons-row').forEach(enableDragScroll);

    renderSidebar();
  }

  /* ---------------- 渲染：存档视图 ---------------- */
  function archiveCardHTML(l) {
    const tasks = Store.tasksOf(l.id);
    const doneN = tasks.filter((t) => t.done).length;
    return `<div class="archive-list-card" data-archivelist="${l.id}" draggable="true" style="--ac:${esc(l.color)}">
      <span class="list-dot" style="background:${esc(l.color)}"></span>
      <span class="al-emoji">${esc(l.emoji)}</span>
      <span class="al-name">${esc(l.name)}</span>
      <span class="al-meta">${tasks.length} 个任务 · ${doneN} 已完成</span>
      <span class="icon-btn tiny row-menu" data-unarchive="${l.id}" title="移出存档">↩️</span>
      <span class="icon-btn tiny row-menu" data-delarchivelist="${l.id}" title="删除任务表">🗑</span>
    </div>`;
  }

  function renderArchive() {
    $('viewTitle').textContent = viewMeta().title;
    const archived = D().lists.filter((l) => l.archived).sort((a, b) => a.order - b.order);
    const totalTasks = archived.reduce((s, l) => s + Store.tasksOf(l.id).length, 0);
    $('viewSub').textContent = archived.length ? `${archived.length} 个任务表 · ${totalTasks} 个任务` : '暂无存档';
    $('progressBar').style.width = '0%';
    $('btnListInfo').style.display = 'none';
    $('btnAddTask').style.display = 'none';
    if (!archived.length) {
      $('taskList').innerHTML = `<div class="archive-empty">
        <div class="empty-ico">📦</div>
        <div class="empty-title">还没有存档的任务表</div>
        <div class="empty-sub">在侧边栏任务表上右键，选择「存档任务表」即可归档</div>
      </div>`;
      $('emptyState').hidden = true;
      renderSidebar();
      return;
    }
    $('emptyState').hidden = true;
    $('taskList').innerHTML = archived.map(archiveCardHTML).join('');
    renderSidebar();
  }

  function reorderArchiveLists(srcId, dstId, after) {
    const archived = D().lists.filter((l) => l.archived).sort((a, b) => a.order - b.order);
    const srcIdx = archived.findIndex((x) => x.id === srcId);
    const dstIdx = archived.findIndex((x) => x.id === dstId);
    if (srcIdx < 0 || dstIdx < 0) return;
    const [src] = archived.splice(srcIdx, 1);
    archived.splice(dstIdx + (after ? 1 : 0), 0, src);
    const active = D().lists.filter((l) => !l.archived).sort((a, b) => a.order - b.order);
    active.concat(archived).forEach((l, i) => { l.order = i; });
    Store.save(); renderTasks();
  }

  function unarchiveList(id) {
    Store.unarchiveList(id);
    if (view.type === 'archive') renderTasks(); else renderSidebar();
    toast('已移出存档');
  }

  function deleteArchivedList(id) {
    const l = Store.list(id);
    if (!l) return;
    confirmBox('删除任务表', `确定删除「${l.name}」吗？该表下的 ${Store.tasksOf(id).length} 个任务也会一并删除，且无法恢复。`, () => {
      Store.removeList(id);
      renderTasks(); toast('已删除任务表');
    });
  }

  function enableDragScroll(row) {
    if (row.dataset.dragScrollBound) return;
    row.dataset.dragScrollBound = '1';
    let down = false, startX, scrollLeft, moved = false;
    let pendingIcon = null;
    row.addEventListener('pointerdown', (e) => {
      // 不能 e.preventDefault()，否则会阻止 click 事件，导致点击图标无法打开步骤
      dragFromStepRow = true;
      e.stopPropagation();
      pendingIcon = e.target.closest('.step-icon') || e.target.closest('.substep-icon');
      // 按在图标上时不捕获指针，允许原生 HTML5 拖拽排序生效；按在空白处才捕获做横向滚动
      if (!pendingIcon) {
        (e.target.closest('.step-icons-row') || e.target.closest('.substep-icons-row') || row).setPointerCapture(e.pointerId);
      }
      down = true; moved = false;
      startX = e.pageX - row.offsetLeft;
      scrollLeft = row.scrollLeft;
      row.style.cursor = 'grabbing';
    });
    row.addEventListener('pointerleave', () => { dragFromStepRow = false; down = false; pendingIcon = null; row.style.cursor = ''; });
    row.addEventListener('pointerup', () => {
      dragFromStepRow = false;
      down = false; row.style.cursor = '';
      // 若发生了横向拖拽，拦截随后的 click，避免抬起时打开步骤/链接
      if (moved) {
        // “单链接步骤图标”点击意图就是打开链接，拖拽无实际意义（只有一个图标无需滚动），
        // 因此保留 pendingIcon 并放行 click，让 click 分支直接打开链接，而不是被吞掉。
        const icon = pendingIcon;
        let singleLink = false;
        if (icon && icon.dataset.stepopen) {
          const taskItem = icon.closest('[data-task]');
          if (taskItem) {
            const step = Store.step(taskItem.dataset.task, icon.dataset.stepopen);
            if (step && (!step.subSteps || !step.subSteps.length) && Array.isArray(step.links) && step.links.length === 1) {
              singleLink = true;
            }
          }
        }
        if (!singleLink) {
          pendingIcon = null;
          row.addEventListener('click', (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
          }, { capture: true, once: true });
        }
      }
    });
    row.addEventListener('click', (e) => {
      // setPointerCapture 会让 click 的 target 被重定向到 row，导致委托的 data-stepopen/data-substepopen 失效。
      // 这里直接根据 pointerdown 时记录的图标来打开步骤/子步骤详情或切换子步骤完成。
      // pendingIcon 在发生拖动后会被清空，此时从 e.target 回退查找，避免事件冒泡到 listEl 后打开详情。
      const icon = pendingIcon || e.target.closest('.step-icon') || e.target.closest('.substep-icon');
      pendingIcon = null;
      if (!icon) return;
      const stepId = icon.dataset.stepopen;
      const subStepId = icon.dataset.substepopen;
      const taskItem = icon.closest('[data-task]');
      if (stepId && taskItem) {
        e.stopPropagation();
        e.preventDefault();
        const step = Store.step(taskItem.dataset.task, stepId);
        // 无子步骤且只有一个超链接时，点击图标直接打开链接
        const links = Array.isArray(step && step.links) ? step.links : [];
        if (step && (!step.subSteps || !step.subSteps.length) && links.length === 1) {
          const u = String((links[0] && links[0].url) || '').trim();
          if (u) {
            if (isLocalPath(u)) window.api.openFile(localPathFromUrl(u));
            else openInlineBrowser(u);
            return;
          }
        }
        sel.kind = 'step';
        sel.taskId = taskItem.dataset.task;
        sel.stepId = stepId;
        renderDetail(); renderTasks();
        return;
      }
      if (subStepId) {
        const stepCard = icon.closest('[data-step]') || icon.closest('[data-dstep]');
        const parentStepId = stepCard ? (stepCard.dataset.step || stepCard.dataset.dstep) : null;
        const taskId = taskItem ? taskItem.dataset.task : sel.taskId;
        if (!parentStepId || !taskId) return;
        e.stopPropagation();
        e.preventDefault();
        // 子步骤图标：无备注且仅有一个链接时直接打开链接
        const sub = Store.subStep(taskId, parentStepId, subStepId);
        if (sub && !sub.note && Array.isArray(sub.links) && sub.links.length === 1) {
          const u = String(sub.links[0].url || '').trim();
          if (u) {
            if (isLocalPath(u)) window.api.openFile(localPathFromUrl(u));
            else openInlineBrowser(u);
            return;
          }
        }
        // 左键点击子步骤图标 → 进入子步骤详情
        sel.kind = 'substep';
        sel.taskId = taskId;
        sel.stepId = parentStepId;
        sel.subStepId = subStepId;
        renderDetail(); renderTasks();
      }
    });
    row.addEventListener('contextmenu', (e) => {
      const icon = e.target.closest('.substep-icon');
      if (!icon) return;
      const subStepId = icon.dataset.substepopen;
      const stepCard = icon.closest('[data-step]') || icon.closest('[data-dstep]');
      const parentStepId = stepCard ? (stepCard.dataset.step || stepCard.dataset.dstep) : null;
      const taskId = icon.closest('[data-task]') ? icon.closest('[data-task]').dataset.task : sel.taskId;
      if (!subStepId || !parentStepId || !taskId) return;
      e.preventDefault();
      e.stopPropagation();
      const sub = Store.subStep(taskId, parentStepId, subStepId);
      if (!sub) return;
      sub.done = !sub.done;
      Store.save();
      if (sub.done) {
        const s = D().settings;
        if (s.soundEnabled && s.stepSound) Sound.step();
        animateStepVanish(icon, e.clientX, e.clientY);
      }
      setTimeout(() => { renderTasks(); renderDetail(); }, sub.done ? 60 : 0);
    });
    row.addEventListener('pointermove', (e) => {
      if (!down) return;
      if (dragMoveStepId) return; // 正在拖出步骤图标，不再横向滚动
      const x = e.pageX - row.offsetLeft;
      if (Math.abs(x - startX) > 4) moved = true;
      e.preventDefault();
      e.stopPropagation();
      row.scrollLeft = scrollLeft - (x - startX) * 1.5;
    });
    row.addEventListener('dragstart', (e) => {
      // 允许步骤图标被拖出以移动到其他任务
      if (e.target.closest('.step-icon')) return;
      e.preventDefault(); e.stopPropagation();
    });
    row.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      e.stopPropagation();
      row.scrollLeft += e.deltaY;
    }, { passive: false });
  }

  /* ---------------- 渲染：详情面板 ---------------- */
  function miniFilesHTML(files, ownerAttr) {
    if (!files.length) return '<div class="hint-empty">暂无材料，点击上方 ＋ 或拖拽文件到此处添加</div>';
    return '<div class="mini-list">' + files.map((f) => `
      <div class="mini-item" data-openfile="${esc(f.path)}">
        <span class="mini-ico">${fileIcon(f.ext)}</span>
        <span class="mini-text">
          <div class="mini-name">${esc(f.name)}</div>
          <div class="mini-sub">${fmtSize(f.size)}</div>
        </span>
        <span class="icon-btn" data-revealfile="${esc(f.path)}" title="在文件夹中显示">📂</span>
        <span class="icon-btn" data-delfile="${f.id}" data-owner="${ownerAttr}" title="移除">✕</span>
      </div>`).join('') + '</div>';
  }

  function miniLinksHTML(links, ownerAttr) {
    if (!links.length) return '<div class="hint-empty">暂无超链接，点击上方 ＋ 添加</div>';
    return '<div class="mini-list">' + links.map((l) => `
      <div class="mini-item" data-openlink="${esc(l.url)}" title="${esc(l.url)}">
        <span class="mini-ico">🔗</span>
        <span class="mini-text">
          <div class="mini-name">${esc(l.title || l.url)}</div>
        </span>
        <span class="icon-btn" data-editlink="${l.id}" data-owner="${ownerAttr}" title="编辑">✏</span>
        <span class="icon-btn" data-dellink="${l.id}" data-owner="${ownerAttr}" title="移除">✕</span>
      </div>`).join('') + '</div>';
  }

  function sectionNoteFilesLinks(obj, ownerAttr) {
    const hasNote = (obj.note || '').trim().length > 0;
    const showNoteArea = hasNote || editingNoteOwner === ownerAttr;
    const filesEmpty = !obj.files.length;
    const linksEmpty = !obj.links.length;
    return `
      ${showNoteArea ? `<div class="field"><div class="field-label"><span>备注</span><button class="icon-btn" data-clearnote="${ownerAttr}" title="清空备注">✕</button></div><textarea class="txt" data-note="${ownerAttr}" placeholder="记录想法、背景、注意事项…">${esc(obj.note)}</textarea></div>` : ''}
      ${filesEmpty ? '' : `<div class="field">${miniFilesHTML(obj.files, ownerAttr)}</div>`}
      ${filesEmpty ? '' : `<div class="field"><div class="dropzone" data-drop="${ownerAttr}">拖拽文件到此处添加材料</div></div>`}
      ${linksEmpty ? '' : `<div class="field">${miniLinksHTML(obj.links, ownerAttr)}</div>`}
      <div class="field">
        <button class="add-modules-bar" data-add-modules="${ownerAttr}" title="添加备注 / 材料 / 链接">
          <span class="add-modules-ico">＋</span>
          <span class="add-modules-text">添加模块</span>
        </button>
      </div>`;
  }

  function openAddModulesOverlay(ownerAttr) {
    const overlay = $('addModulesOverlay');
    overlay.hidden = false;
    overlay.querySelectorAll('[data-module]').forEach((btn) => {
      const m = btn.dataset.module;
      const isSubstep = m === 'substep';
      const isStep = m === 'step';
      // 步骤只能给任务添加；子步骤只能给步骤添加
      btn.style.display = ((isSubstep && ownerAttr !== 'step') || (isStep && ownerAttr !== 'task')) ? 'none' : '';
      btn.onclick = () => {
        overlay.hidden = true;
        if (m === 'note') {
          editingNoteOwner = ownerAttr;
          renderDetail();
          setTimeout(() => { const ta = $('detailCardBody').querySelector('[data-note]'); if (ta) ta.focus(); }, 0);
        } else if (m === 'file') {
          addFilesTo(ownerAttr);
        } else if (m === 'link') {
          promptLink(ownerAttr);
        } else if (m === 'step') {
          openQuickInput({
            title: '添加解决步骤',
            placeholder: '输入步骤名称，回车确认',
            confirm: (v) => {
              Store.addStep(sel.taskId, v);
              renderDetail(); renderTasks();
            }
          });
        } else if (m === 'substep') {
          openQuickInput({
            title: '添加子步骤',
            placeholder: '输入子步骤名称，回车确认',
            confirm: (v) => {
              Store.addSubStep(sel.taskId, sel.stepId, v);
              renderDetail(); renderTasks();
            }
          });
        }
      };
    });
    $('addModulesClose').onclick = () => { overlay.hidden = true; };
    overlay.onclick = (e) => { if (e.target === overlay) overlay.hidden = true; };
  }

  function openQuickInput(opts) {
    const overlay = $('quickInputOverlay');
    const field = $('quickInputField');
    const title = $('quickInputTitle');
    const close = () => { overlay.hidden = true; field.value = ''; field.onkeydown = null; };
    title.textContent = opts.title || '添加';
    field.placeholder = opts.placeholder || '输入名称，回车确认';
    field.value = '';
    overlay.hidden = false;
    setTimeout(() => field.focus(), 0);
    const doConfirm = () => {
      const v = field.value.trim();
      if (!v) return;
      close();
      if (opts.confirm) opts.confirm(v);
    };
    field.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doConfirm(); } };
    $('quickInputConfirm').onclick = doConfirm;
    $('quickInputCancel').onclick = close;
    $('quickInputClose').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
  }

  function renderDetail() {
    const body = $('detailCardBody');
    const overlay = $('detailOverlay');

    if (!sel.kind) {
      body.innerHTML = '';
      overlay.hidden = true;
      return;
    }

    overlay.hidden = false;
    const tabTitle = $('detailTabTitle');
    if (sel.kind === 'list') {
      const l = Store.list(sel.listId);
      tabTitle.textContent = l ? `${l.emoji} ${l.name}` : '任务表';
    } else if (sel.kind === 'task') {
      const t = Store.task(sel.taskId);
      tabTitle.textContent = t ? t.title : '任务';
    } else if (sel.kind === 'step') {
      const t = Store.task(sel.taskId);
      const s = t ? Store.step(t.id, sel.stepId) : null;
      tabTitle.textContent = s ? s.title : '步骤';
    } else if (sel.kind === 'substep') {
      const t = Store.task(sel.taskId);
      const s = t ? Store.step(t.id, sel.stepId) : null;
      const sub = s ? Store.subStep(t.id, s.id, sel.subStepId) : null;
      tabTitle.textContent = sub ? sub.title : '子步骤';
    }

    if (sel.kind === 'list') {
      const l = Store.list(sel.listId);
      if (!l) { closeDetail(); return; }
      const tasks = Store.tasksOf(l.id);
      const doneN = tasks.filter((t) => t.done).length;
      body.innerHTML = `
        <div class="detail-head">
          <span class="detail-kind">任务表</span>
          <div style="flex:1"></div>
        </div>
        <textarea class="detail-title-input" rows="1" data-title="list">${esc(l.name)}</textarea>
        <div class="field">
          <div class="field-label"><span>外观</span></div>
          <div class="row-inline">
            <input class="inp" style="width:70px;text-align:center" data-emoji="list" value="${esc(l.emoji)}" maxlength="4" />
            <div class="color-picker" data-colors="list">
              ${Store.LIST_COLORS.map((c) => `<span class="color-dot ${c === l.color ? 'active' : ''}" data-color="${c}" style="background:${c}"></span>`).join('')}
            </div>
          </div>
        </div>
        ${sectionNoteFilesLinks(l, 'list')}
        <div class="meta-line">共 ${tasks.length} 个任务 · 已完成 ${doneN} 个<br/>创建于 ${new Date(l.createdAt).toLocaleString('zh-CN')}</div>
        <div class="detail-foot">
          <button class="btn danger" data-dellist="${l.id}">删除任务表</button>
        </div>
        ${renderCover(l, 'list', 'bottom')}`;
      bindDetail();
      return;
    }

    if (sel.kind === 'task') {
      const t = Store.task(sel.taskId);
      if (!t) { closeDetail(); return; }
      const l = Store.list(t.listId);
      const doneSteps = t.steps.filter((s) => s.done).length;
      body.innerHTML = `
        <div class="detail-head">
          <span class="detail-kind">任务</span>
          <div style="flex:1"></div>
          <button class="icon-btn" data-pomo="${t.id}" title="开始番茄钟">🍅</button>
        </div>
        <textarea class="detail-title-input" rows="1" data-title="task">${esc(t.title)}</textarea>

        <div class="field">
          <div class="row-inline">
            <button class="btn sm ${t.done ? 'primary' : ''}" data-toggledone="${t.id}">${t.done ? '✓ 已完成' : '标记完成'}</button>
            <button class="btn sm ${t.star ? 'primary' : ''}" data-togglestar="${t.id}">${t.star ? '★ 重要' : '☆ 重要'}</button>
            <select class="sel" style="flex:1" data-movelist="${t.id}">
              ${D().lists.map((x) => `<option value="${x.id}" ${x.id === t.listId ? 'selected' : ''}>${esc(x.emoji + ' ' + x.name)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="field">
          <div class="field-label"><span>优先级</span></div>
          <div class="chip-row" data-priority="${t.id}">
            <span class="chip ${t.priority === 0 ? 'active' : ''}" data-p="0">普通</span>
            <span class="chip p-mid ${t.priority === 1 ? 'active' : ''}" data-p="1">中</span>
            <span class="chip p-high ${t.priority === 2 ? 'active' : ''}" data-p="2">高</span>
          </div>
        </div>

        ${renderReminderSection(t, t.id)}

        <div class="field">
          <div class="field-label"><span>重复</span></div>
          <select class="sel" data-repeat="${t.id}">
            <option value="none" ${t.repeat === 'none' ? 'selected' : ''}>不重复</option>
            <option value="daily" ${t.repeat === 'daily' ? 'selected' : ''}>每天重复</option>
            <option value="weekly" ${t.repeat === 'weekly' ? 'selected' : ''}>每周重复</option>
            <option value="monthly" ${t.repeat === 'monthly' ? 'selected' : ''}>每月重复</option>
            <option value="manual" ${t.repeat === 'manual' ? 'selected' : ''}>手动重复</option>
          </select>
        </div>

        <div class="field">
          <div class="field-label"><span>解决步骤 ${t.steps.length ? `(${doneSteps}/${t.steps.length})` : ''}</span></div>
          ${t.steps.length ? `
          <div class="detail-step-cards" data-steparea="${t.id}">
            ${t.steps.map((s) => {
              const stepCoverStyle = s.cover ? `--step-cover:url('${esc(s.cover).replace(/'/g, "\\'")}');` : '';
              return `
              <div class="step-card detail-step-card ${s.done ? 'done' : ''} ${s.cover ? 'has-cover' : ''} ${sel.stepId === s.id ? 'active' : ''}" data-dstep="${s.id}" draggable="true" style="${stepCoverStyle}">
                <span class="step-check ${s.done ? 'checked' : ''}" data-stepcheck="${s.id}"></span>
                <span class="step-title" data-stepopen="${s.id}">${esc(s.title)}</span>
                <div class="step-card-meta">
                  ${s.note ? '<span class="attach-mini">📝</span>' : ''}
                  ${s.files.length ? `<span class="attach-mini">📎${s.files.length}</span>` : ''}
                  ${s.links.length ? `<span class="attach-mini">🔗${s.links.length}</span>` : ''}
                </div>
                ${subStepsRowHTML(s)}
                <span class="icon-btn" data-stepedit="${s.id}" title="编辑步骤">✏</span>
                <span class="icon-btn" data-stepdel="${s.id}" title="删除步骤">🗑</span>
              </div>`;
            }).join('')}
          </div>` : ''}
        </div>

        ${sectionNoteFilesLinks(t, 'task')}

        <div class="meta-line">
          所属任务表：${l ? esc(l.emoji + ' ' + l.name) : '-'}<br/>
          已投入番茄钟：${t.pomodoros || 0} 个<br/>
          创建于 ${new Date(t.createdAt).toLocaleString('zh-CN')}
          ${t.done && t.doneAt ? '<br/>完成于 ' + new Date(t.doneAt).toLocaleString('zh-CN') : ''}
        </div>
        <div class="detail-foot">
          <button class="btn danger" data-deltask="${t.id}">删除任务</button>
          <button class="btn" data-duptask="${t.id}">复制任务</button>
        </div>
        ${renderCover(t, 'task', 'bottom')}`;
      bindDetail();
      body.querySelectorAll('.substep-icons-row').forEach(enableDragScroll);
      return;
    }

    if (sel.kind === 'step') {
      const t = Store.task(sel.taskId);
      const s = t ? Store.step(t.id, sel.stepId) : null;
      if (!s) { sel.kind = 'task'; renderDetail(); return; }
      body.innerHTML = `
        <div class="step-detail-card">
          <div class="detail-head">
            <span class="detail-kind">步骤</span>
            <div style="flex:1"></div>
            <button class="icon-btn" data-coverupload="step" title="上传步骤背景">📷</button>
            <button class="icon-btn" data-coverclear="step" ${s.cover ? '' : 'hidden'} title="清除步骤背景">🧽</button>
            <button class="icon-btn" data-pomo-step="${s.id}" data-pomo-task="${t.id}" title="开始番茄钟">🍅</button>
            <button class="icon-btn" data-backtask="${t.id}" title="返回任务">↩</button>
          </div>
          <input type="file" accept="image/*" data-coverfile="step" style="display:none">
          <div class="step-icon-edit" title="点击上传图片">
            <button class="step-icon-preview" data-stepicon="${s.id}">${stepIconPreview(s)}</button>
            <button class="btn" data-stepiconfile="${s.id}">上传图片</button>
            <input type="file" accept="image/*" data-stepiconfileinput="${s.id}" style="display:none">
          </div>
          <textarea class="detail-title-input" rows="1" data-title="step">${esc(s.title)}</textarea>
          <div class="field">
            <div class="row-inline">
              <button class="btn sm ${s.done ? 'primary' : ''}" data-stepcheck="${s.id}">${s.done ? '✓ 已完成' : '标记完成'}</button>
              <span style="font-size:12px;color:var(--text-3)">所属任务：${esc(t.title)}</span>
            </div>
          </div>
          ${renderReminderSection(s, 'step')}
          ${s.subSteps.length ? `
          <div class="field">
            <div class="field-label"><span>子步骤 (${s.subSteps.filter((x) => x.done).length}/${s.subSteps.length})</span></div>
            ${subStepCardsHTML(s)}
          </div>
          ` : ''}
          ${sectionNoteFilesLinks(s, 'step')}
          <div class="meta-line">已投入番茄钟：${s.pomodoros || 0} 个 · 所属任务：${esc(t.title)}</div>
        </div>`;
      bindDetail();
      body.querySelectorAll('.substep-icons-row').forEach(enableDragScroll);
      return;
    }

    if (sel.kind === 'substep') {
      const t = Store.task(sel.taskId);
      const s = t ? Store.step(t.id, sel.stepId) : null;
      const sub = s ? Store.subStep(t.id, s.id, sel.subStepId) : null;
      if (!sub) { sel.kind = 'step'; sel.subStepId = null; renderDetail(); return; }
      body.innerHTML = `
        <div class="step-detail-card">
          <div class="detail-head">
            <span class="detail-kind">子步骤</span>
            <div style="flex:1"></div>
            <button class="icon-btn" data-coverupload="substep" title="上传子步骤背景">📷</button>
            <button class="icon-btn" data-coverclear="substep" ${sub.cover ? '' : 'hidden'} title="清除子步骤背景">🧽</button>
            <button class="icon-btn" data-pomo-substep="${sub.id}" data-pomo-step="${s.id}" data-pomo-task="${t.id}" title="开始番茄钟">🍅</button>
            <button class="icon-btn" data-backstep="${s.id}" title="返回步骤">↩</button>
          </div>
          <input type="file" accept="image/*" data-coverfile="substep" style="display:none">
          <div class="step-icon-edit" title="点击上传图片">
            <button class="step-icon-preview" data-substepicon="${sub.id}">${subStepIconContent(sub)}</button>
            <button class="btn" data-substepiconfile="${sub.id}">上传图片</button>
            <input type="file" accept="image/*" data-substepiconfileinput="${sub.id}" style="display:none">
          </div>
          <textarea class="detail-title-input" rows="1" data-title="substep">${esc(sub.title)}</textarea>
          <div class="field">
            <div class="row-inline">
              <button class="btn sm ${sub.done ? 'primary' : ''}" data-substepcheck="${sub.id}">${sub.done ? '✓ 已完成' : '标记完成'}</button>
              <span style="font-size:12px;color:var(--text-3)">所属步骤：${esc(s.title)} · 所属任务：${esc(t.title)}</span>
            </div>
          </div>
          ${renderReminderSection(sub, 'substep')}
          ${sectionNoteFilesLinks(sub, 'substep')}
          <div class="detail-foot">
            <button class="btn danger" data-substepdel="${sub.id}">删除子步骤</button>
          </div>
          <div class="meta-line">已投入番茄钟：${sub.pomodoros || 0} 个 · 所属步骤：${esc(s.title)} · 所属任务：${esc(t.title)}</div>
        </div>`;
      bindDetail();
      return;
    }
  }

  function closeDetail() {
    sel.kind = null; sel.taskId = null; sel.stepId = null; sel.subStepId = null; sel.listId = null;
    $('detailOverlay').hidden = true;
    $('detailCardBody').innerHTML = '';
    applyDetailPanel();
    renderTasks();
  }

  /* ---------------- 详情面板事件绑定 ---------------- */
  function ownerObj(owner) {
    if (owner === 'list') return Store.list(sel.listId);
    if (owner === 'task') return Store.task(sel.taskId);
    if (owner === 'step') return Store.step(sel.taskId, sel.stepId);
    if (owner === 'substep') {
      const s = Store.step(sel.taskId, sel.stepId);
      return s ? Store.subStep(sel.taskId, sel.stepId, sel.subStepId) : null;
    }
    // 任务详情面板中的 data-due / data-repeat / data-remind 直接传入了任务 id，
    // 这里兜底按 id 解析，保证这些字段在任务详情里的修改能正确保存。
    return Store.task(owner);
  }

  function autoGrow(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(220, ta.scrollHeight) + 'px';
  }

  function bindDetail() {
    const body = $('detailCardBody');

    body.querySelectorAll('textarea').forEach((ta) => { autoGrow(ta); ta.addEventListener('input', () => autoGrow(ta)); });

    // 标题
    const titleEl = body.querySelector('[data-title]');
    if (titleEl) {
      titleEl.addEventListener('input', () => {
        const kind = titleEl.dataset.title;
        const v = titleEl.value.replace(/\n/g, '').trim() || '未命名';
        const o = ownerObj(kind);
        if (!o) return;
        if (kind === 'list') o.name = v; else o.title = v;
        Store.save();
        renderTasks();
      });
      titleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } });
    }

    // 备注
    const noteEl = body.querySelector('[data-note]');
    if (noteEl) {
      noteEl.addEventListener('input', () => {
        const o = ownerObj(noteEl.dataset.note);
        if (!o) return;
        o.note = noteEl.value;
        Store.save();
      });
      noteEl.addEventListener('blur', () => {
        const o = ownerObj(noteEl.dataset.note);
        if (o && !(o.note || '').trim()) { editingNoteOwner = ''; renderDetail(); }
        renderTasks();
      });
    }

    // 任务表 emoji
    const emojiEl = body.querySelector('[data-emoji]');
    if (emojiEl) emojiEl.addEventListener('input', () => {
      const l = Store.list(sel.listId); if (!l) return;
      l.emoji = emojiEl.value || '📋';
      Store.save(); renderTasks();
    });

    // 颜色
    body.querySelectorAll('[data-colors] .color-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        const l = Store.list(sel.listId); if (!l) return;
        l.color = dot.dataset.color;
        Store.save(); renderDetail(); renderTasks();
      });
    });

    // 优先级
    body.querySelectorAll('[data-priority] .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const t = Store.task(sel.taskId); if (!t) return;
        t.priority = parseInt(chip.dataset.p, 10);
        Store.save(); renderDetail(); renderTasks();
      });
    });

    // 截止时间
    const dueEl = body.querySelector('[data-due]');
    if (dueEl) dueEl.addEventListener('change', () => {
      const owner = dueEl.dataset.due;
      const o = ownerObj(owner);
      if (!o) return;
      o.due = fromLocalInput(dueEl.value);
      o.notified = false;
      Store.save(); renderDetail(); renderTasks();
      if (o.due) toast('已设置提醒时间：' + fmtDue(o.due));
    });

    const remindEl = body.querySelector('[data-remind]');
    if (remindEl) remindEl.addEventListener('change', () => {
      const owner = remindEl.dataset.remind;
      const o = ownerObj(owner);
      if (!o) return;
      const v = parseInt(remindEl.value, 10);
      o.remindBefore = Number.isNaN(v) ? 0 : v;
      o.notified = false;
      Store.save(); renderDetail();
    });

    const repeatEl = body.querySelector('[data-repeat]');
    if (repeatEl) repeatEl.addEventListener('change', () => {
      const owner = repeatEl.dataset.repeat;
      const o = ownerObj(owner);
      if (!o) return;
      o.repeat = repeatEl.value;
      Store.save(); renderDetail(); renderTasks();
    });

    const dueRepeatEl = body.querySelector('[data-due-repeat]');
    if (dueRepeatEl) dueRepeatEl.addEventListener('change', () => {
      const owner = dueRepeatEl.dataset.dueRepeat;
      const o = ownerObj(owner);
      if (!o) return;
      o.dueRepeat = dueRepeatEl.value;
      o.notified = false;
      Store.save(); renderDetail(); renderTasks();
    });

    // 额外提醒：新增
    body.querySelectorAll('[data-rem-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const o = ownerObj(btn.dataset.remAdd); if (!o) return;
        if (!Array.isArray(o.reminders)) o.reminders = [];
        o.reminders.push({ due: Date.now() + 3600000, remindBefore: 0, dueRepeat: 'none', notified: false, remindAt: null });
        Store.save(); renderDetail();
      });
    });
    // 额外提醒：删除
    body.querySelectorAll('[data-rem-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [key, idxStr] = btn.dataset.remDel.split('::');
        const o = ownerObj(key); if (!o || !o.reminders) return;
        o.reminders.splice(parseInt(idxStr, 10), 1);
        Store.save(); renderDetail();
      });
    });
    // 额外提醒：时间
    body.querySelectorAll('[data-rem-due]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const [key, idx] = inp.dataset.remDue.split('::');
        const o = ownerObj(key); if (!o || !o.reminders) return;
        const r = o.reminders[+idx]; if (!r) return;
        r.due = fromLocalInput(inp.value); r.notified = false; Store.save(); renderDetail(); renderTasks();
      });
    });
    // 额外提醒：提前量
    body.querySelectorAll('[data-rem-remind]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const [key, idx] = sel.dataset.remRemind.split('::');
        const o = ownerObj(key); if (!o || !o.reminders) return;
        const r = o.reminders[+idx]; if (!r) return;
        const v = parseInt(sel.value, 10); r.remindBefore = Number.isNaN(v) ? 0 : v; r.notified = false; Store.save(); renderDetail();
      });
    });
    // 额外提醒：重复
    body.querySelectorAll('[data-rem-repeat]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const [key, idx] = sel.dataset.remRepeat.split('::');
        const o = ownerObj(key); if (!o || !o.reminders) return;
        const r = o.reminders[+idx]; if (!r) return;
        r.dueRepeat = sel.value; r.notified = false; Store.save(); renderDetail();
      });
    });

    const moveEl = body.querySelector('[data-movelist]');
    if (moveEl) moveEl.addEventListener('change', () => {
      const t = Store.task(sel.taskId); if (!t) return;
      t.listId = moveEl.value;
      Store.save(); renderTasks();
      toast('已移动到 ' + (Store.list(t.listId) || {}).name);
    });

    // 步骤/子步骤输入已改为“添加模块 → 台前调度浮层”，不再绑定行内输入框

    // 拖拽材料
    body.querySelectorAll('[data-drop]').forEach((dz) => {
      dz.addEventListener('click', () => addFilesTo(dz.dataset.drop));
      dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('over'));
      dz.addEventListener('drop', async (e) => {
        e.preventDefault(); dz.classList.remove('over');
        const paths = [];
        for (const f of e.dataTransfer.files) {
          const p = window.api.pathForFile(f);
          if (p) paths.push(p);
        }
        if (!paths.length) return;
        const imported = await window.api.importFiles(paths);
        const o = ownerObj(dz.dataset.drop);
        if (o) { o.files = o.files.concat(imported); Store.save(); renderDetail(); renderTasks(); toast(`已添加 ${imported.length} 个材料`); }
      });
    });

    // 步骤图标上传图片
    body.querySelectorAll('[data-stepiconfileinput]').forEach((input) => {
      input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const s = Store.step(sel.taskId, sel.stepId);
          if (!s) return;
          s.icon = reader.result;
          Store.save(); renderDetail(); renderTasks(); toast('已更新步骤图标');
        };
        reader.readAsDataURL(file);
      });
    });

    // 子步骤图标上传图片
    body.querySelectorAll('[data-substepiconfileinput]').forEach((input) => {
      input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const sub = Store.subStep(sel.taskId, sel.stepId, sel.subStepId);
          if (!sub) return;
          sub.icon = reader.result;
          Store.save(); renderDetail(); renderTasks(); toast('已更新子步骤图标');
        };
        reader.readAsDataURL(file);
      });
    });

    // 封面背景上传图片
    body.querySelectorAll('[data-coverfile]').forEach((input) => {
      input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setCover(input.dataset.coverfile, reader.result);
        reader.readAsDataURL(file);
      });
    });

    // 详情面板步骤卡片拖拽排序
    body.querySelectorAll('[data-steparea]').forEach((area) => {
      if (area.dataset.stepSortBound) return;
      area.dataset.stepSortBound = '1';
      let srcStepId = null;
      area.addEventListener('dragstart', (e) => {
        // 子步骤图标行内的拖动用于横向滚动，不应触发整个步骤卡片被拖拽。
        // 这里必须用 elementsFromPoint，因为当子元素 draggable=false 时浏览器会把父元素(data-dstep)作为可拖源，
        // e.target 是步骤卡片而不是子步骤图标，closest() 找不到子步骤图标。
        const under = document.elementsFromPoint(e.clientX, e.clientY);
        const onSubstepIcon = under.some((el) => el.classList && el.classList.contains('substep-icon'));
        const onSubstepRow = under.some((el) => el.classList && el.classList.contains('substep-icons-row'));
        if (onSubstepIcon || onSubstepRow) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        const card = e.target.closest('[data-dstep]');
        if (!card) return;
        srcStepId = card.dataset.dstep;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', srcStepId); } catch (_) {}
      }, true);
      area.addEventListener('dragend', (e) => {
        const card = e.target.closest('[data-dstep]');
        if (card) card.classList.remove('dragging');
        srcStepId = null;
        area.querySelectorAll('[data-dstep]').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
      });
      area.addEventListener('dragover', (e) => {
        if (!srcStepId) return;
        const card = e.target.closest('[data-dstep]');
        if (!card || card.dataset.dstep === srcStepId) return;
        e.preventDefault();
        const r = card.getBoundingClientRect();
        const before = e.clientY < r.top + r.height / 2;
        area.querySelectorAll('[data-dstep]').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
        card.classList.add(before ? 'drop-before' : 'drop-after');
      });
      area.addEventListener('drop', (e) => {
        if (!srcStepId) return;
        const card = e.target.closest('[data-dstep]');
        if (!card || card.dataset.dstep === srcStepId) { srcStepId = null; return; }
        e.preventDefault();
        const t = Store.task(sel.taskId);
        const steps = t ? t.steps : [];
        const srcIdx = steps.findIndex((s) => s.id === srcStepId);
        const dstIdx = steps.findIndex((s) => s.id === card.dataset.dstep);
        if (srcIdx >= 0 && dstIdx >= 0) {
          const r = card.getBoundingClientRect();
          const before = e.clientY < r.top + r.height / 2;
          const [src] = steps.splice(srcIdx, 1);
          const insertIdx = dstIdx < srcIdx
            ? (before ? dstIdx : dstIdx + 1)
            : (before ? dstIdx - 1 : dstIdx);
          steps.splice(Math.max(0, insertIdx), 0, src);
          Store.save(); renderTasks(); renderDetail();
          toast('已调整步骤顺序');
        }
        srcStepId = null;
        area.querySelectorAll('[data-dstep]').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
      });
    });

    // 通用按钮（委托）
    body.onclick = async (e) => {
      const el = e.target.closest('[data-close],[data-add-modules],[data-addfile],[data-addlink],[data-note-add],[data-clearnote],[data-reminder-start],[data-reminder-cancel],[data-stepicon],[data-stepiconfile],[data-substepicon],[data-substepiconfile],[data-coverupload],[data-coverclear],[data-openfile],[data-revealfile],[data-delfile],[data-openlink],[data-editlink],[data-dellink],[data-dellist],[data-deltask],[data-duptask],[data-toggledone],[data-togglestar],[data-stepcheck],[data-stepdel],[data-stepedit],[data-stepopen],[data-dstep],[data-substepcheck],[data-substepdel],[data-substepedit],[data-substepopen],[data-backtask],[data-backstep],[data-cleardue],[data-pomo],[data-pomo-step],[data-pomo-substep]');
      if (!el) return;
      const d = el.dataset;

      if (d.close !== undefined) return closeDetail();
      if (d.backtask) { sel.kind = 'task'; sel.stepId = null; sel.subStepId = null; renderDetail(); return; }
      if (d.backstep) { sel.kind = 'step'; sel.subStepId = null; renderDetail(); return; }
      if (d.pomo) { Pomodoro.open(d.pomo); return; }
      if (d.pomoStep) { Pomodoro.open(d.pomoTask, d.pomoStep); return; }
      if (d.pomoSubstep) { Pomodoro.open(d.pomoTask, d.pomoStep, d.pomoSubstep); return; }

      if (d.addModules) { openAddModulesOverlay(d.addModules); return; }
      if (d.noteAdd) {
        editingNoteOwner = d.noteAdd;
        renderDetail();
        setTimeout(() => { const ta = $('detailCardBody').querySelector('[data-note]'); if (ta) ta.focus(); }, 0);
        return;
      }
      if (d.clearnote) {
        e.stopPropagation();
        const o = ownerObj(d.clearnote);
        if (!o) return;
        confirmBox('清空备注', '确定要清空这条备注吗？', () => {
          o.note = '';
          if (editingNoteOwner === d.clearnote) editingNoteOwner = '';
          Store.save();
          renderDetail();
          renderTasks();
          toast('备注已清空');
        });
        return;
      }
      if (d.coverupload) {
        e.stopPropagation();
        const input = body.querySelector(`[data-coverfile="${d.coverupload}"]`);
        if (input) input.click();
        return;
      }
      if (d.coverclear) {
        e.stopPropagation();
        const o = ownerObj(d.coverclear);
        if (!o || !o.cover) return;
        confirmBox('清除背景', '确定要移除这张背景图片吗？', () => setCover(d.coverclear, ''));
        return;
      }
      if (d.addfile) return addFilesTo(d.addfile);
      if (d.addlink) return promptLink(d.addlink);

      if (d.openfile) { const r = await window.api.openFile(d.openfile); if (!r.ok) toast('无法打开文件，可能已被移动'); return; }
      if (d.revealfile) { e.stopPropagation(); return void window.api.revealFile(d.revealfile); }
      if (d.delfile) {
        e.stopPropagation();
        const o = ownerObj(d.owner); if (!o) return;
        const f = o.files.find((x) => x.id === d.delfile);
        o.files = o.files.filter((x) => x.id !== d.delfile);
        if (f) window.api.deleteFile(f.path);
        Store.save(); renderDetail(); renderTasks(); toast('已移除材料');
        return;
      }
      if (d.openlink) {
        const u = String(d.openlink).trim();
        if (isLocalPath(u)) {
          window.api.openFile(localPathFromUrl(u));   // 本地文件/快捷方式 → 系统打开
        } else {
          openInlineBrowser(u);                        // 网页链接 → 内置浏览器
        }
        return;
      }
      if (d.editlink) {
        e.stopPropagation();
        const o = ownerObj(d.owner); if (!o) return;
        const link = o.links.find((x) => x.id === d.editlink);
        if (link) promptLink(d.owner, link, o.cover || '');
        return;
      }
      if (d.dellink) {
        e.stopPropagation();
        const o = ownerObj(d.owner); if (!o) return;
        const link = o.links.find((x) => x.id === d.dellink);
        if (!link) return;
        confirmBox('移除超链接', `确定要移除「${link.title || link.url}」吗？此操作不可撤销。`, () => {
          o.links = o.links.filter((x) => x.id !== d.dellink);
          Store.save(); renderDetail(); renderTasks();
          toast('已移除超链接');
        }, o.cover || '');
        return;
      }

      if (d.reminderCancel) {
        const o = ownerObj(d.reminderCancel); if (!o) return;
        o.due = null; o.remindBefore = -1; o.dueRepeat = 'none'; o.notified = false; o.reminders = []; editingReminderTaskId = ''; Store.save(); renderDetail(); renderTasks(); return;
      }
      if (d.reminderStart) {
        editingReminderTaskId = d.reminderStart;
        renderDetail();
        setTimeout(() => { const inp = $('detailCardBody').querySelector('[data-due]'); if (inp) inp.focus(); }, 0);
        return;
      }
      if (d.stepicon || d.stepiconfile) {
        const id = d.stepicon || d.stepiconfile;
        const fileInp = $('detailCardBody').querySelector(`[data-stepiconfileinput="${id}"]`);
        if (fileInp) fileInp.click();
        return;
      }
      if (d.substepicon || d.substepiconfile) {
        const id = d.substepicon || d.substepiconfile;
        const fileInp = $('detailCardBody').querySelector(`[data-substepiconfileinput="${id}"]`);
        if (fileInp) fileInp.click();
        return;
      }
      if (d.toggledone) { toggleTask(d.toggledone); renderDetail(); return; }
      if (d.togglestar) {
        const t = Store.task(d.togglestar); if (!t) return;
        t.star = !t.star; Store.save(); renderDetail(); renderTasks(); return;
      }
      if (d.stepcheck) { toggleStep(sel.taskId, d.stepcheck, e); renderDetail(); return; }
      if (d.substepedit) {
        e.stopPropagation();
        sel.kind = 'substep';
        sel.subStepId = d.substepedit;
        renderDetail(); renderTasks();
        return;
      }
      if (d.substepcheck || d.substepopen) {
        e.stopPropagation();
        const isIcon = el.classList.contains('substep-icon');
        const subStepId = d.substepcheck || d.substepopen;
        // 子步骤复选框或详情面板的「标记完成」按钮：仅切换完成状态，不进入详情
        if (d.substepcheck && !isIcon) {
          const subStepCard = el.closest('[data-step]') || el.closest('[data-dstep]');
          const stepId = subStepCard ? (subStepCard.dataset.step || subStepCard.dataset.dstep) : sel.stepId;
          const taskId = el.closest('[data-task]') ? el.closest('[data-task]').dataset.task : sel.taskId;
          const sub = Store.subStep(taskId, stepId, subStepId);
          if (sub) {
            sub.done = !sub.done;
            Store.save(); renderDetail(); renderTasks();
            if (sub.done) {
              const s = D().settings;
              if (s.soundEnabled && s.stepSound) Sound.step();
            }
          }
          return;
        }
        // 子步骤图标/卡片：无备注且仅有一个链接时直接打开链接
        const subStepCard = el.closest('[data-step]') || el.closest('[data-dstep]');
        const stepId = subStepCard ? (subStepCard.dataset.step || subStepCard.dataset.dstep) : sel.stepId;
        const sub = Store.subStep(sel.taskId, stepId, subStepId);
        if (sub && !sub.note && Array.isArray(sub.links) && sub.links.length === 1) {
          const u = String(sub.links[0].url || '').trim();
          if (u) {
            if (isLocalPath(u)) window.api.openFile(localPathFromUrl(u));
            else openInlineBrowser(u);
            return;
          }
        }
        // 否则进入子步骤详情
        sel.kind = 'substep';
        sel.stepId = stepId;
        sel.subStepId = subStepId;
        renderDetail(); renderTasks();
        return;
      }
      if (d.substepdel) {
        e.stopPropagation();
        const step = Store.step(sel.taskId, sel.stepId);
        const sub = Store.subStep(sel.taskId, sel.stepId, d.substepdel);
        confirmBox('删除子步骤', `确定删除子步骤「${sub ? esc(sub.title) : ''}」吗？`, () => {
          Store.removeSubStep(sel.taskId, sel.stepId, d.substepdel);
          if (sel.subStepId === d.substepdel) { sel.kind = 'step'; sel.subStepId = null; }
          renderDetail(); renderTasks(); toast('已删除子步骤');
        }, step ? step.cover : '');
        return;
      }
      if (d.stepdel) {
        e.stopPropagation();
        const task = Store.task(sel.taskId);
        const step = task ? Store.step(task.id, d.stepdel) : null;
        confirmBox('删除步骤', `确定删除步骤「${step ? esc(step.title) : ''}」吗？`, () => {
          Store.removeStep(sel.taskId, d.stepdel);
          if (sel.stepId === d.stepdel) { sel.kind = 'task'; sel.stepId = null; }
          renderDetail(); renderTasks();
          toast('已删除步骤');
        }, task ? task.cover : '');
        return;
      }
      if (d.stepedit) {
        e.stopPropagation();
        sel.kind = 'step';
        sel.stepId = d.stepedit;
        renderDetail(); renderTasks();
        return;
      }
      if (d.stepopen) {
        e.stopPropagation();
        const step = Store.step(sel.taskId, d.stepopen);
        if (step && !step.note && Array.isArray(step.links) && step.links.length === 1) {
          const u = String(step.links[0].url || '').trim();
          if (u) {
            if (isLocalPath(u)) window.api.openFile(localPathFromUrl(u));
            else openInlineBrowser(u);
            return;
          }
        }
        sel.kind = 'step';
        sel.stepId = d.stepopen;
        renderDetail();
        return;
      }
      if (d.dstep) {
        e.stopPropagation();
        const step = Store.step(sel.taskId, d.dstep);
        if (step && !step.note && Array.isArray(step.links) && step.links.length === 1) {
          const u = String(step.links[0].url || '').trim();
          if (u) {
            if (isLocalPath(u)) window.api.openFile(localPathFromUrl(u));
            else openInlineBrowser(u);
            return;
          }
        }
        sel.kind = 'step';
        sel.stepId = d.dstep;
        renderDetail();
        return;
      }

      if (d.dellist) {
        const l = Store.list(d.dellist);
        confirmBox('删除任务表', `确定删除「${l.name}」吗？该表下的 ${Store.tasksOf(l.id).length} 个任务也会一并删除，且无法恢复。`, () => {
          Store.removeList(d.dellist);
          if (view.type === 'list' && view.key === d.dellist) { view.type = 'smart'; view.key = 'today'; }
          closeDetail(); renderTasks(); toast('已删除任务表');
        });
        return;
      }
      if (d.deltask) {
        Store.removeTask(d.deltask);
        closeDetail(); renderTasks(); toast('已删除任务');
        return;
      }
      if (d.duptask) {
        const t = Store.task(d.duptask); if (!t) return;
        const copy = JSON.parse(JSON.stringify(t));
        copy.id = Store.uid(); copy.title = t.title + '（副本）';
        copy.done = false; copy.doneAt = null; copy.notified = false; copy.pomodoros = 0;
        copy.createdAt = Date.now(); copy.order = t.order + 0.5;
        copy.steps.forEach((s) => { s.id = Store.uid(); s.done = false; });
        D().tasks.push(copy);
        normalizeOrders(copy.listId);
        Store.save(); sel.taskId = copy.id; renderDetail(); renderTasks();
        toast('已复制任务');
        return;
      }
    };
  }

  function normalizeOrders(listId) {
    Store.tasksOf(listId).sort((a, b) => a.order - b.order).forEach((t, i) => { t.order = i; });
  }

  async function addFilesTo(owner) {
    const files = await window.api.pickFiles();
    if (!files || !files.length) return;
    const o = ownerObj(owner);
    if (!o) return;
    o.files = o.files.concat(files);
    Store.save(); renderDetail(); renderTasks();
    toast(`已添加 ${files.length} 个材料`);
  }

  function promptLink(owner, existing, cover) {
    const isEdit = !!(existing && existing.id);
    const card = $('modalCard');
    card.className = 'modal-card' + (cover ? ' has-cover' : '');
    card.style.cssText = cover ? `--confirm-cover:url('${esc(cover).replace(/'/g, "\\'")}');` : '';
    modal(`
      <div class="modal-title">${isEdit ? '编辑超链接' : '添加超链接'}</div>
      <div class="field"><div class="field-label"><span>标题</span></div>
        <input class="inp" id="mLinkTitle" placeholder="例如：需求文档 / 参考资料" /></div>
      <div class="field"><div class="field-label"><span>链接地址</span></div>
        <div class="link-url-row">
          <input class="inp" id="mLinkUrl" placeholder="https://... 或本地路径，如 C:\\Users\\...\\Desktop\\xxx.lnk" />
          <button class="btn ghost sm" id="mLinkBrowse" type="button" title="选择本地文件或快捷方式">选择文件</button>
        </div>
        <div class="hint-text">网页链接会在内置浏览器打开；本地文件 / 桌面快捷方式会用系统默认程序打开</div>
      </div>
      <div class="modal-actions">
        <button class="btn" data-cancel="1">取消</button>
        <button class="btn primary" id="mLinkOk">${isEdit ? '保存' : '添加'}</button>
      </div>`, () => {
      const titleEl = $('mLinkTitle');
      const urlEl = $('mLinkUrl');
      if (isEdit) { titleEl.value = existing.title || ''; urlEl.value = existing.url || ''; }
      urlEl.focus();
      const ok = () => {
        const url = urlEl.value.trim();
        if (!url) { toast('请输入链接地址'); return; }
        const o = ownerObj(owner);
        if (!o) return;
        if (isEdit) {
          const link = o.links.find((x) => x.id === existing.id);
          if (link) { link.title = titleEl.value.trim() || url; link.url = url; }
        } else {
          o.links.push({ id: Store.uid(), title: titleEl.value.trim() || url, url });
        }
        Store.save(); closeModal(); renderDetail(); renderTasks();
        toast(isEdit ? '已保存修改' : '已添加超链接');
      };
      $('mLinkOk').onclick = ok;
      urlEl.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
      $('mLinkBrowse').onclick = async () => {
        try {
          const r = await window.api.pickLink();
          if (r && r.ok) urlEl.value = r.path;
        } catch (_) {}
      };
      titleEl.onkeydown = (e) => { if (e.key === 'Enter') urlEl.focus(); };
    });
  }

  /* ---------------- 完成任务 / 步骤 ---------------- */
  function toggleTask(id, evt) {
    const t = Store.task(id);
    if (!t) return;
    const s = D().settings;

    if (!t.done) {
      // 重复任务：滚动到下一周期而不是永久完成（手动重复不自动推进，等一键重置）
      if (['daily', 'weekly', 'monthly'].includes(t.repeat) && t.due) {
        const next = Store.nextDue(t.due, t.repeat);
        t.due = next; t.notified = false;
        t.steps.forEach((st) => { st.done = false; (st.subSteps || []).forEach((sub) => { sub.done = false; }); });
        Store.save();
        if (s.soundEnabled) Sound.complete();
        if (evt) confetti(evt.clientX, evt.clientY);
        toast('🔁 已完成本次，下次：' + fmtDue(next));
        renderTasks(); renderDetail();
        return;
      }
      t.done = true; t.doneAt = Date.now();
      t.steps.forEach((st) => { st.done = true; (st.subSteps || []).forEach((sub) => { sub.done = true; }); });
      if (s.soundEnabled) Sound.complete();
      if (evt) confetti(evt.clientX, evt.clientY);

      // 整表完成的庆祝音
      const siblings = Store.tasksOf(t.listId);
      if (s.celebrateSound && siblings.length > 1 && siblings.every((x) => x.done)) {
        setTimeout(() => Sound.celebrate(), 320);
        toast('🎉 任务表全部完成，太棒了！', 3200);
      } else {
        toast('已完成：' + t.title);
      }
    } else {
      t.done = false; t.doneAt = null;
      if (s.soundEnabled) Sound.uncomplete();
    }
    Store.save();
    renderTasks();
  }

  function toggleStep(taskId, stepId, evt) {
    const t = Store.task(taskId);
    const st = Store.step(taskId, stepId);
    if (!t || !st) return;
    st.done = !st.done;
    const s = D().settings;
    if (st.done && s.soundEnabled && s.stepSound) Sound.step();

    // 完成步骤的“消灭星星”消除动画
    if (st.done && evt) {
      const el = evt.target.closest('[data-stepopen], [data-stepcheck]') || evt.target;
      animateStepVanish(el, evt.clientX, evt.clientY);
    }

    // 所有步骤完成 → 自动完成任务
    if (st.done && t.steps.length && t.steps.every((x) => x.done) && !t.done) {
      Store.save();
      toggleTask(t.id, evt);
      return;
    }
    if (!st.done && t.done) { t.done = false; t.doneAt = null; }
    Store.save();
    // 延迟重绘，让消除动画先展示一帧
    if (st.done && evt) {
      setTimeout(() => { renderTasks(); if (sel.taskId === taskId) renderDetail(); }, 60);
    } else {
      renderTasks(); if (sel.taskId === taskId) renderDetail();
    }
  }

  /* ---------------- 弹窗 ---------------- */
  function modal(html, after) {
    $('modalCard').innerHTML = html;
    $('modalOverlay').hidden = false;
    $('modalCard').querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', closeModal));
    if (after) after();
  }
  function closeModal() {
    $('modalOverlay').hidden = true;
    $('modalCard').innerHTML = '';
    $('modalCard').style.cssText = '';
    $('modalCard').className = 'modal-card';
  }

  function confirmBox(title, text, onOk, cover) {
    const card = $('modalCard');
    card.className = 'modal-card' + (cover ? ' has-cover' : '');
    card.style.cssText = cover ? `--confirm-cover:url('${esc(cover).replace(/'/g, "\\'")}');` : '';
    modal(`
      <div class="modal-title">${esc(title)}</div>
      <div style="font-size:13.5px;color:var(--text-2);line-height:1.7">${esc(text)}</div>
      <div class="modal-actions">
        <button class="btn" data-cancel="1">取消</button>
        <button class="btn danger" id="mOk">确定删除</button>
      </div>`, () => { $('mOk').onclick = () => { closeModal(); onOk(); }; });
  }

  /* ---------------- 一键重置重复任务 ---------------- */
  function recurringTasksInView() {
    const { active, done } = viewTasks();
    return active.concat(done).filter((t) => t.repeat && t.repeat !== 'none');
  }

  function repeatLabel(r) {
    return ({ daily: '每天重复', weekly: '每周重复', monthly: '每月重复', manual: '手动重复' }[r]) || '';
  }

  function resetRecurringModal() {
    const tasks = recurringTasksInView();
    if (!tasks.length) {
      modal(`
        <div class="modal-title">🔄 一键重置重复任务</div>
        <div class="modal-desc">当前任务表里没有需要重复的任务，无需重置。</div>
        <div class="modal-actions"><button class="btn primary" data-cancel="1">知道了</button></div>`);
      return;
    }

    const rows = tasks.map((t) => {
      const l = Store.list(t.listId);
      const sub = [
        repeatLabel(t.repeat),
        view.type !== 'list' && l ? l.emoji + ' ' + l.name : '',
        t.due ? '下次 ' + fmtDue(t.due) : '无截止时间'
      ].filter(Boolean).join(' · ');
      const badge = t.done
        ? '<span class="reset-badge done">已完成</span>'
        : '<span class="reset-badge active">进行中</span>';
      return `<label class="reset-item">
        <input type="checkbox" class="reset-chk" data-id="${t.id}" checked />
        <span class="reset-main">
          <span class="reset-title">${esc(t.title)}</span>
          <span class="reset-sub">${esc(sub)}</span>
        </span>
        ${badge}
      </label>`;
    }).join('');

    modal(`
      <div class="modal-title">🔄 一键重置重复任务</div>
      <div class="modal-desc">勾选需要重置的重复任务，未勾选的将保持原样。重置后任务会恢复为「未完成」、推进到下一个周期，并清空已完成步骤。</div>
      <div class="reset-toolbar">
        <label class="chk-all"><input type="checkbox" id="resetSelectAll" checked /> 全选</label>
        <span class="reset-count" id="resetCount"></span>
      </div>
      <div class="reset-list">${rows}</div>
      <div class="modal-actions">
        <button class="btn" data-cancel="1">取消</button>
        <button class="btn primary" id="mResetOk">确认重置 (<span id="resetNum">0</span>)</button>
      </div>`, () => {
      const card = $('modalCard');
      const chks = () => Array.from(card.querySelectorAll('.reset-chk'));
      const update = () => {
        const all = chks();
        const sel = all.filter((c) => c.checked).length;
        $('resetCount').textContent = `已选 ${sel} / ${all.length}`;
        $('resetNum').textContent = sel;
        $('resetSelectAll').checked = sel === all.length;
      };
      chks().forEach((c) => c.addEventListener('change', update));
      $('resetSelectAll').addEventListener('change', (e) => {
        chks().forEach((c) => { c.checked = e.target.checked; });
        update();
      });
      update();

      $('mResetOk').onclick = () => {
        const ids = chks().filter((c) => c.checked).map((c) => c.dataset.id);
        if (!ids.length) { toast('请至少选择一个要重置的任务'); return; }
        let n = 0;
        ids.forEach((id) => {
          const t = Store.task(id);
          if (!t || t.repeat === 'none') return;
          t.done = false; t.doneAt = null; t.notified = false;
          t.steps.forEach((st) => { st.done = false; (st.subSteps || []).forEach((sub) => { sub.done = false; }); });
          if (t.due && ['daily', 'weekly', 'monthly'].includes(t.repeat)) t.due = Store.nextDue(t.due, t.repeat);
          n++;
        });
        Store.save();
        closeModal(); renderTasks(); renderDetail();
        toast(`🔄 已重置 ${n} 个重复任务`);
      };
    });
  }

  const EMOJIS = ['📋', '💼', '🏠', '🎯', '📚', '💡', '🛒', '💪', '🌿', '🎨', '✈️', '💰', '🔧', '❤️', '🍀', '⭐'];

  function newListModal() {
    modal(`
      <div class="modal-title">新建任务表</div>
      <div class="field"><div class="field-label"><span>名称</span></div>
        <input class="inp" id="mName" placeholder="例如：产品迭代 / 家务清单" /></div>
      <div class="field"><div class="field-label"><span>图标</span></div>
        <div class="emoji-pick" id="mEmoji">${EMOJIS.map((e, i) => `<span class="emoji-opt ${i === 0 ? 'active' : ''}" data-e="${e}">${e}</span>`).join('')}</div></div>
      <div class="field"><div class="field-label"><span>颜色</span></div>
        <div class="color-picker" id="mColor">${Store.LIST_COLORS.map((c, i) => `<span class="color-dot ${i === 0 ? 'active' : ''}" data-c="${c}" style="background:${c}"></span>`).join('')}</div></div>
      <div class="modal-actions">
        <button class="btn" data-cancel="1">取消</button>
        <button class="btn primary" id="mOk">创建</button>
      </div>`, () => {
      let emoji = EMOJIS[0], color = Store.LIST_COLORS[0];
      $('mName').focus();
      $('mEmoji').onclick = (e) => {
        const s = e.target.closest('[data-e]'); if (!s) return;
        emoji = s.dataset.e;
        $('mEmoji').querySelectorAll('.emoji-opt').forEach((x) => x.classList.toggle('active', x === s));
      };
      $('mColor').onclick = (e) => {
        const s = e.target.closest('[data-c]'); if (!s) return;
        color = s.dataset.c;
        $('mColor').querySelectorAll('.color-dot').forEach((x) => x.classList.toggle('active', x === s));
      };
      const ok = () => {
        const name = $('mName').value.trim();
        if (!name) { toast('请输入任务表名称'); return; }
        const l = Store.addList(name, emoji, color);
        closeModal();
        view.type = 'list'; view.key = l.id;
        sel.kind = 'list'; sel.listId = l.id;
        renderTasks(); renderDetail();
        toast('已创建任务表');
      };
      $('mOk').onclick = ok;
      $('mName').onkeydown = (e) => { if (e.key === 'Enter') ok(); };
    });
  }

  function showListContextMenu(listId, x, y) {
    const existing = document.querySelector('.context-menu'); if (existing) existing.remove();
    const l = Store.list(listId); if (!l) return;
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = Math.min(x, window.innerWidth - 150) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - 90) + 'px';
    menu.innerHTML = `
      <button data-edit>✏️ 编辑任务表</button>
      <button data-archive>📦 存档任务表</button>
      <button data-delete class="danger">🗑 删除任务表</button>
    `;
    document.body.appendChild(menu);
    const close = () => { menu.remove(); document.removeEventListener('click', close); document.removeEventListener('keydown', close); };
    setTimeout(() => { document.addEventListener('click', close); document.addEventListener('keydown', close); }, 0);
    menu.querySelector('[data-edit]').onclick = () => {
      close();
      sel.kind = 'list'; sel.listId = listId;
      view.type = 'list'; view.key = listId;
      renderTasks(); renderDetail();
    };
    menu.querySelector('[data-archive]').onclick = () => {
      close();
      Store.archiveList(listId);
      if (view.type === 'list' && view.key === listId) { view.type = 'smart'; view.key = 'today'; }
      renderTasks(); toast('已存档任务表');
    };
    menu.querySelector('[data-delete]').onclick = () => {
      close();
      const list = Store.list(listId);
      confirmBox('删除任务表', `确定删除「${list.name}」吗？该表下的 ${Store.tasksOf(listId).length} 个任务也会一并删除，且无法恢复。`, () => {
        Store.removeList(listId);
        if (view.type === 'list' && view.key === listId) { view.type = 'smart'; view.key = 'today'; }
        closeDetail(); renderTasks(); toast('已删除任务表');
      });
    };
  }

  function showArchiveContextMenu(listId, x, y) {
    const existing = document.querySelector('.context-menu'); if (existing) existing.remove();
    const l = Store.list(listId); if (!l) return;
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = Math.min(x, window.innerWidth - 150) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - 90) + 'px';
    menu.innerHTML = `
      <button data-open>📂 打开任务表</button>
      <button data-unarchive>↩️ 移出存档</button>
      <button data-delete class="danger">🗑 删除任务表</button>
    `;
    document.body.appendChild(menu);
    const close = () => { menu.remove(); document.removeEventListener('click', close); document.removeEventListener('keydown', close); };
    setTimeout(() => { document.addEventListener('click', close); document.addEventListener('keydown', close); }, 0);
    menu.querySelector('[data-open]').onclick = () => { close(); view.type = 'list'; view.key = listId; renderTasks(); };
    menu.querySelector('[data-unarchive]').onclick = () => { close(); unarchiveList(listId); };
    menu.querySelector('[data-delete]').onclick = () => { close(); deleteArchivedList(listId); };
  }

  function newTaskModal() {
    const lists = D().lists.filter((l) => !l.archived);
    let defaultListId = view.type === 'list' ? view.key : (lists[0] && lists[0].id);
    if (!defaultListId && lists.length) defaultListId = lists[0].id;

    modal(`
      <div class="modal-title">添加新任务</div>
      <div class="field">
        <div class="field-label"><span>任务标题</span></div>
        <input class="inp" id="mTaskTitle" placeholder="要做什么？" />
      </div>
      <div class="field">
        <div class="field-label"><span>优先级</span></div>
        <div class="chip-row" id="mTaskPriority">
          <span class="chip active" data-p="0">普通</span>
          <span class="chip p-mid" data-p="1">中</span>
          <span class="chip p-high" data-p="2">高</span>
        </div>
      </div>
      <div class="field">
        <div class="field-label"><span>所属任务表</span></div>
        <select class="sel" id="mTaskList">${lists.map((l) => `<option value="${l.id}" ${l.id === defaultListId ? 'selected' : ''}>${esc(l.emoji + ' ' + l.name)}</option>`).join('')}</select>
      </div>
      <div class="field">
        <div class="field-label"><span>截止时间</span></div>
        <input type="datetime-local" class="inp" id="mTaskDue" />
      </div>
      <div class="row2">
        <div class="field">
          <div class="field-label"><span>提醒</span></div>
          <select class="sel" id="mTaskRemind">
            <option value="-1">不提醒</option>
            <option value="0">准时提醒</option>
            <option value="5">提前 5 分钟</option>
            <option value="15">提前 15 分钟</option>
            <option value="30">提前 30 分钟</option>
            <option value="60">提前 1 小时</option>
            <option value="1440">提前 1 天</option>
          </select>
        </div>
        <div class="field">
          <div class="field-label"><span>重复</span></div>
          <select class="sel" id="mTaskRepeat">
            <option value="none">不重复</option>
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
            <option value="manual">手动</option>
          </select>
        </div>
      </div>
      <div class="field">
        <div class="field-label"><span>提醒重复</span></div>
        <select class="sel" id="mTaskDueRepeat">
          <option value="none">不重复提醒</option>
          <option value="daily">每日提醒</option>
          <option value="weekly">每周提醒</option>
          <option value="monthly">每月提醒</option>
        </select>
      </div>
      <div class="field">
        <div class="field-label"><span>备注</span></div>
        <textarea class="txt" id="mTaskNote" placeholder="补充说明、背景信息…" style="min-height:60px"></textarea>
      </div>
      <div class="field">
        <div class="field-label"><span>初始步骤</span></div>
        <div id="mTaskSteps" style="display:flex;flex-direction:column;gap:5px"></div>
        <input type="text" class="inp" id="mTaskStepInput" placeholder="输入步骤后回车添加" style="margin-top:6px" />
      </div>
      <div class="modal-actions">
        <button class="btn" data-cancel="1">取消</button>
        <button class="btn primary" id="mTaskOk">创建任务</button>
      </div>`, () => {
      let priority = 0;
      const steps = [];
      const refreshSteps = () => {
        $('mTaskSteps').innerHTML = steps.map((s, i) => `
          <div class="mini-item" style="cursor:default">
            <span class="mini-ico">☑</span>
            <span class="mini-text"><div class="mini-name">${esc(s)}</div></span>
            <span class="icon-btn" data-rmstep="${i}" title="移除">✕</span>
          </div>`).join('');
        $('mTaskSteps').querySelectorAll('[data-rmstep]').forEach((b) => {
          b.onclick = () => { steps.splice(parseInt(b.dataset.rmstep), 1); refreshSteps(); };
        });
      };
      $('mTaskPriority').onclick = (e) => {
        const s = e.target.closest('[data-p]'); if (!s) return;
        priority = parseInt(s.dataset.p, 10);
        $('mTaskPriority').querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === s));
      };
      $('mTaskStepInput').onkeydown = (e) => {
        if (e.key !== 'Enter') return;
        const v = $('mTaskStepInput').value.trim(); if (!v) return;
        steps.push(v); $('mTaskStepInput').value = ''; refreshSteps();
      };
      const create = () => {
        const title = $('mTaskTitle').value.trim();
        if (!title) { toast('请输入任务标题'); return; }
        const listId = $('mTaskList').value || defaultListId;
        if (!listId) { toast('请先创建一个任务表'); closeModal(); return; }
        const dueVal = $('mTaskDue').value;
        const remindVal = parseInt($('mTaskRemind').value, 10);
        const opts = {
          priority,
          note: $('mTaskNote').value.trim(),
          due: dueVal ? new Date(dueVal).getTime() : null,
          remindBefore: Number.isNaN(remindVal) ? 0 : remindVal,
          repeat: $('mTaskRepeat').value,
          dueRepeat: $('mTaskDueRepeat') ? $('mTaskDueRepeat').value : 'none'
        };
        const t = Store.addTask(listId, title, opts);
        steps.forEach((st) => Store.addStep(t.id, st));
        closeModal(); renderTasks();
        if (sel.taskId === t.id) renderDetail();
        const node = document.querySelector(`[data-task="${t.id}"]`);
        if (node) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        toast('已创建任务');
      };
      $('mTaskOk').onclick = create;
      $('mTaskTitle').onkeydown = (e) => { if (e.key === 'Enter') create(); };
      setTimeout(() => $('mTaskTitle').focus(), 30);
    });
  }

  function settingsModal() {
    const s = D().settings;
    modal(`
      <div class="modal-title">设置</div>
      <div class="setting-row">
        <div><div class="setting-label">深色模式</div><div class="setting-desc">保护眼睛，夜间使用更舒适</div></div>
        <label class="switch"><input type="checkbox" id="sTheme" ${s.theme === 'dark' ? 'checked' : ''}><span class="slider-t"></span></label>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">完成提示音</div><div class="setting-desc">完成任务 / 步骤时播放音效</div></div>
        <label class="switch"><input type="checkbox" id="sSound" ${s.soundEnabled ? 'checked' : ''}><span class="slider-t"></span></label>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">音效风格</div><div class="setting-desc">点击右侧按钮试听</div></div>
        <div class="row-inline">
          <select class="sel" id="sStyle" style="width:104px">
            <option value="chime" ${s.soundStyle === 'chime' ? 'selected' : ''}>清脆和弦</option>
            <option value="bell" ${s.soundStyle === 'bell' ? 'selected' : ''}>钟声</option>
            <option value="ding" ${s.soundStyle === 'ding' ? 'selected' : ''}>叮咚</option>
            <option value="pop" ${s.soundStyle === 'pop' ? 'selected' : ''}>气泡</option>
          </select>
          <button class="btn sm" id="sTry">试听</button>
        </div>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">音量</div><div class="setting-desc"><span id="sVolText">${Math.round(s.volume * 100)}</span>%</div></div>
        <input type="range" id="sVol" min="0" max="100" value="${Math.round(s.volume * 100)}" />
      </div>
      <div class="setting-row">
        <div><div class="setting-label">步骤勾选音</div><div class="setting-desc">勾选子步骤时的轻音效</div></div>
        <label class="switch"><input type="checkbox" id="sStep" ${s.stepSound ? 'checked' : ''}><span class="slider-t"></span></label>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">全部完成庆祝音</div><div class="setting-desc">任务表全部完成时播放</div></div>
        <label class="switch"><input type="checkbox" id="sCele" ${s.celebrateSound ? 'checked' : ''}><span class="slider-t"></span></label>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">系统通知</div><div class="setting-desc">定时提醒与番茄钟结束时弹出通知</div></div>
        <label class="switch"><input type="checkbox" id="sNotify" ${s.notifyEnabled ? 'checked' : ''}><span class="slider-t"></span></label>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">默认提前提醒</div><div class="setting-desc">新任务设置截止时间时的默认值</div></div>
        <select class="sel" id="sRemind" style="width:120px">
          <option value="0" ${s.defaultRemindBefore === 0 ? 'selected' : ''}>准时</option>
          <option value="5" ${s.defaultRemindBefore === 5 ? 'selected' : ''}>提前 5 分钟</option>
          <option value="15" ${s.defaultRemindBefore === 15 ? 'selected' : ''}>提前 15 分钟</option>
          <option value="30" ${s.defaultRemindBefore === 30 ? 'selected' : ''}>提前 30 分钟</option>
          <option value="60" ${s.defaultRemindBefore === 60 ? 'selected' : ''}>提前 1 小时</option>
        </select>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">关闭窗口时最小化到托盘</div><div class="setting-desc">后台继续提醒，右下角托盘可恢复</div></div>
        <label class="switch"><input type="checkbox" id="sTray" ${s.minimizeToTray ? 'checked' : ''}><span class="slider-t"></span></label>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">数据管理</div><div class="setting-desc" id="sPath">本地存储，完全离线</div></div>
        <div class="row-inline">
          <button class="btn sm" id="sExport">导出备份</button>
          <button class="btn sm" id="sImport">导入</button>
          <button class="btn sm" id="sOpenDir">目录</button>
        </div>
      </div>
      <div class="modal-actions"><button class="btn primary" data-cancel="1">完成</button></div>`, () => {
      const save = () => { Store.save(); applySettings(); };
      $('sTheme').onchange = (e) => { s.theme = e.target.checked ? 'dark' : 'light'; save(); };
      $('sSound').onchange = (e) => { s.soundEnabled = e.target.checked; save(); if (s.soundEnabled) Sound.preview('complete'); };
      $('sStyle').onchange = (e) => { s.soundStyle = e.target.value; save(); Sound.preview('complete'); };
      $('sTry').onclick = () => Sound.preview('complete');
      $('sVol').oninput = (e) => { s.volume = e.target.value / 100; $('sVolText').textContent = e.target.value; Sound.config({ volume: s.volume }); };
      $('sVol').onchange = () => { save(); Sound.preview('step'); };
      $('sStep').onchange = (e) => { s.stepSound = e.target.checked; save(); };
      $('sCele').onchange = (e) => { s.celebrateSound = e.target.checked; save(); };
      $('sNotify').onchange = (e) => { s.notifyEnabled = e.target.checked; save(); };
      $('sRemind').onchange = (e) => { s.defaultRemindBefore = parseInt(e.target.value, 10); save(); };
      $('sTray').onchange = (e) => { s.minimizeToTray = e.target.checked; save(); };
      $('sExport').onclick = async () => {
        const r = await window.api.exportBackup(D());
        toast(r.ok ? '已导出备份' : '已取消');
      };
      $('sImport').onclick = async () => {
        const r = await window.api.importBackup();
        if (!r.ok) { toast(r.error || '已取消'); return; }
        confirmBox('导入备份', '导入将覆盖当前所有数据，确定继续吗？', () => {
          Store.replaceAll(r.data);
          applySettings(); closeDetail(); renderTasks();
          toast('已导入备份数据');
        });
      };
      $('sOpenDir').onclick = () => window.api.openUserDir();
      window.api.appInfo().then((i) => { $('sPath').textContent = 'v' + i.version + ' · ' + i.dataFile; });
    });
  }

  function statsModal() {
    const tasks = D().tasks;
    const doneN = tasks.filter((t) => t.done).length;
    const today = Store.todayPomodoro();
    const hist = D().pomodoro.history;
    let weekCount = 0, weekMin = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const p = (n) => String(n).padStart(2, '0');
      const k = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      if (hist[k]) { weekCount += hist[k].count; weekMin += hist[k].minutes; }
    }
    const lists = D().lists.map((l) => {
      const ts = Store.tasksOf(l.id);
      const dn = ts.filter((t) => t.done).length;
      const pct = ts.length ? Math.round((dn / ts.length) * 100) : 0;
      return `<div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
          <span>${esc(l.emoji + ' ' + l.name)}</span><span style="color:var(--text-3)">${dn}/${ts.length} · ${pct}%</span></div>
        <div style="height:6px;background:var(--surface-3);border-radius:6px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${esc(l.color)}"></div></div>
      </div>`;
    }).join('') || '<div class="hint-empty">暂无任务表</div>';

    modal(`
      <div class="modal-title">数据统计</div>
      <div class="pomo-stats" style="border-top:none;padding-top:0">
        <div><b>${tasks.length - doneN}</b><span>待办任务</span></div>
        <div><b>${doneN}</b><span>已完成</span></div>
        <div><b>${D().lists.length}</b><span>任务表</span></div>
      </div>
      <div class="pomo-stats">
        <div><b>${today.count}</b><span>今日番茄</span></div>
        <div><b>${weekCount}</b><span>近 7 天番茄</span></div>
        <div><b>${weekMin}</b><span>近 7 天分钟</span></div>
      </div>
      <div class="field" style="margin-top:16px">
        <div class="field-label"><span>各任务表进度</span></div>
        ${lists}
      </div>
      <div class="modal-actions"><button class="btn primary" data-cancel="1">关闭</button></div>`);
  }

  /* ---------------- 定时提醒 ---------------- */
  function checkReminders() {
    const s = D().settings;
    const now = Date.now();
    let changed = false;

    function fire(title, rem, isDone) {
      if (!rem.due || rem.notified || rem.remindBefore === -1) return false;
      const at = rem.due - (rem.remindBefore || 0) * 60000;
      // 已完成任务的二次检查：已设提醒且提醒时间未超过 7 天前才弹，避免远古历史任务集中弹出
      if (isDone && (now - at) > 7 * 86400000) return false;
      if (now >= at) {
        rem.notified = true;
        const late = now > rem.due + 60000;
        const doneTag = isDone ? '（已完成，请二次确认）' : '';
        const body = (late ? '已超时：' : '截止时间：') + fmtDue(rem.due) + doneTag;
        if (s.notifyEnabled) window.api.notify({ title: '⏰ ' + title, body, silent: true });
        if (s.soundEnabled) Sound.reminder();
        window.api.flash();
        toast('⏰ 提醒：' + title + doneTag, 4000);
        // 提醒重复：若设置了 dueRepeat 且（任务本身没有 repeat）则推进到下一周期并重置通知
        if (rem.dueRepeat && rem.dueRepeat !== 'none' && (!rem.repeat || rem.repeat === 'none')) {
          const next = Store.nextDue(rem.due, rem.dueRepeat);
          if (next) { rem.due = next; rem.notified = false; }
        }
        return true;
      }
      return false;
    }

    D().tasks.forEach((t) => {
      if (fire(t.title, t, t.done)) changed = true;
      (t.reminders || []).forEach((r) => { if (fire(`${t.title} · 额外提醒`, r, false)) changed = true; });
      t.steps.forEach((st) => {
        if (fire(`${t.title} · ${st.title}`, st, st.done)) changed = true;
        (st.reminders || []).forEach((r) => { if (fire(`${t.title} · ${st.title} · 额外提醒`, r, false)) changed = true; });
        st.subSteps.forEach((sub) => {
          if (fire(`${t.title} · ${st.title} · ${sub.title}`, sub, sub.done)) changed = true;
          (sub.reminders || []).forEach((r) => { if (fire(`${t.title} · ${st.title} · ${sub.title} · 额外提醒`, r, false)) changed = true; });
        });
      });
    });
    if (changed) { Store.save(); renderTasks(); }
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindGlobal() {
    // 智能视图
    $('smartViews').addEventListener('click', (e) => {
      const b = e.target.closest('.nav-item'); if (!b) return;
      if (b.dataset.view === 'archived') { view.type = 'archive'; }
      else { view.type = 'smart'; view.key = b.dataset.view; }
      renderTasks();
    });

    // 左侧边栏收起/展开
    const toggleSidebarCollapse = () => {
      D().settings.sidebarCollapsed = !D().settings.sidebarCollapsed;
      Store.save(); applySidebarCollapse();
    };
    $('btnCollapseSidebar').addEventListener('click', toggleSidebarCollapse);

    // 右侧详情面板收起/展开（独立把手）
    const toggleDetailPanel = () => {
      const app = $('app');
      const open = app.classList.toggle('detail-open');
      applyDetailPanel();
      if (open && !sel.kind) renderDetail();
    };
    const btnExpandSidebar = $('btnExpandSidebar');
    if (btnExpandSidebar) btnExpandSidebar.addEventListener('click', toggleDetailPanel);

    // 任务表导航
    $('listNav').addEventListener('click', (e) => {
      const edit = e.target.closest('[data-editlist]');
      if (edit) {
        e.stopPropagation();
        sel.kind = 'list'; sel.listId = edit.dataset.editlist;
        view.type = 'list'; view.key = edit.dataset.editlist;
        renderTasks(); renderDetail();
        return;
      }
      const li = e.target.closest('[data-list]'); if (!li) return;
      view.type = 'list'; view.key = li.dataset.list;
      renderTasks();
    });

    // 任务表右键菜单
    $('listNav').addEventListener('contextmenu', (e) => {
      const li = e.target.closest('[data-list]'); if (!li) return;
      e.preventDefault();
      showListContextMenu(li.dataset.list, e.clientX, e.clientY);
    });

    // 任务表拖拽排序
    let dragListId = null;
    const clearListNavDrop = () => {
      $('listNav').querySelectorAll('li[data-list]').forEach((x) => x.classList.remove('drag-over', 'drop-before', 'drop-after'));
    };
    $('listNav').addEventListener('dragstart', (e) => {
      const li = e.target.closest('[data-list]'); if (!li) return;
      dragListId = li.dataset.list;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragListId); } catch (_) {}
    });
    $('listNav').addEventListener('dragend', (e) => {
      dragListId = null;
      const li = e.target.closest('[data-list]'); if (li) li.classList.remove('dragging');
      clearListNavDrop();
    });
    $('listNav').addEventListener('dragover', (e) => {
      const li = e.target.closest('[data-list]');
      if (!li) return;
      // 移动任务到任务表：整行高亮
      if (dragTaskId && li) {
        e.preventDefault();
        clearListNavDrop();
        li.classList.add('drag-over');
        return;
      }
      // 排序任务表：上下插入指示线
      if (dragListId && li && li.dataset.list !== dragListId) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const r = li.getBoundingClientRect();
        const before = e.clientY < r.top + r.height / 2;
        clearListNavDrop();
        li.classList.add(before ? 'drop-before' : 'drop-after');
      }
    });
    $('listNav').addEventListener('dragleave', (e) => {
      const li = e.target.closest('[data-list]');
      if (li && !li.contains(e.relatedTarget)) clearListNavDrop();
    });
    $('listNav').addEventListener('drop', (e) => {
      const li = e.target.closest('[data-list]'); if (!li) return;
      e.preventDefault();

      // 移动任务到任务表
      if (dragTaskId) {
        clearListNavDrop();
        const t = Store.task(dragTaskId);
        if (t && t.listId !== li.dataset.list) {
          t.listId = li.dataset.list;
          normalizeOrders(t.listId);
          Store.save(); renderTasks();
          toast('已移动到 ' + Store.list(li.dataset.list).name);
        }
        return;
      }

      // 排序任务表
      if (dragListId && li.dataset.list !== dragListId) {
        const lists = D().lists.filter((l) => !l.archived).sort((a, b) => a.order - b.order);
        const srcIdx = lists.findIndex((x) => x.id === dragListId);
        const dstIdx = lists.findIndex((x) => x.id === li.dataset.list);
        if (srcIdx < 0 || dstIdx < 0) { clearListNavDrop(); return; }
        const r = li.getBoundingClientRect();
        const before = e.clientY < r.top + r.height / 2;
        const [src] = lists.splice(srcIdx, 1);
        lists.splice(dstIdx + (before ? 0 : 1), 0, src);
        const archived = D().lists.filter((l) => l.archived).sort((a, b) => a.order - b.order);
        lists.concat(archived).forEach((l, i) => { l.order = i; });
        Store.save(); renderTasks();
        toast('已调整任务表顺序');
      }
      clearListNavDrop();
    });

    $('btnAddList').addEventListener('click', newListModal);
    $('btnSettings').addEventListener('click', settingsModal);
    $('btnStats').addEventListener('click', statsModal);
    $('btnPomodoro').addEventListener('click', () => Pomodoro.open(sel.kind === 'task' ? sel.taskId : ''));
    $('miniPomo').addEventListener('click', () => Pomodoro.open());

    $('btnToolbox').addEventListener('click', openToolbox);
    $('toolboxClose').addEventListener('click', closeToolbox);
    if ($('toolboxBgBtn')) $('toolboxBgBtn').addEventListener('click', openToolboxBackground);
    $('toolboxOverlay').addEventListener('click', (e) => { if (e.target === $('toolboxOverlay')) closeToolbox(); });
    $('toolboxCategories').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      switchToolboxCategory(b.dataset.cat);
    });
    $('toolboxGrid').addEventListener('click', (e) => {
      const addBtn = e.target.closest('[data-tb-add]');
      if (addBtn) return openAddToolboxLink();
      const menuBtn = e.target.closest('[data-tb-menu]');
      if (menuBtn) {
        e.stopPropagation();
        const [cat, idx] = menuBtn.dataset.tbMenu.split(':');
        return openToolboxMenu(cat, +idx);
      }
      const b = e.target.closest('[data-tool]');
      if (!b) return;
      const [cat, idx] = b.dataset.tool.split(':');
      const it = getToolboxItem(cat, +idx);
      if (it) openToolboxLink(it);
    });

    $('btnTheme').addEventListener('click', () => {
      D().settings.theme = D().settings.theme === 'dark' ? 'light' : 'dark';
      Store.save(); applySettings();
    });

    $('btnToggleDone').addEventListener('click', () => {
      D().settings.showDone = !D().settings.showDone;
      Store.save(); applySettings(); renderTasks();
      toast(D().settings.showDone ? '显示已完成任务' : '隐藏已完成任务');
    });

    $('btnListInfo').addEventListener('click', () => {
      if (view.type !== 'list') return;
      sel.kind = 'list'; sel.listId = view.key;
      renderDetail(); renderTasks();
    });

    $('btnResetRecurring').addEventListener('click', resetRecurringModal);

    $('btnSort').addEventListener('click', () => {
      const opts = [
        ['manual', '手动排序（可拖拽）'], ['due', '按截止时间'], ['priority', '按优先级'],
        ['created', '按创建时间'], ['title', '按名称']
      ];
      modal(`<div class="modal-title">排序方式</div>
        <div class="mini-list">${opts.map(([k, n]) => `<div class="mini-item" data-sort="${k}">
          <span class="mini-ico">${D().settings.sortBy === k ? '✅' : '⬜'}</span>
          <span class="mini-text"><div class="mini-name">${n}</div></span></div>`).join('')}</div>
        <div class="modal-actions"><button class="btn" data-cancel="1">关闭</button></div>`, () => {
        $('modalCard').querySelectorAll('[data-sort]').forEach((el) => {
          el.onclick = () => { D().settings.sortBy = el.dataset.sort; Store.save(); closeModal(); renderTasks(); };
        });
      });
    });

    // 搜索
    $('searchInput').addEventListener('input', (e) => { search = e.target.value.trim(); renderTasks(); });

    // 添加任务（台前调度弹窗）
    $('btnAddTask').addEventListener('click', newTaskModal);

    // 任务列表交互
    const listEl = $('taskList');
    listEl.addEventListener('click', (e) => {
      const el = e.target.closest('[data-check],[data-expand],[data-star],[data-del],[data-pomo],[data-stepcheck],[data-stepdel],[data-stepopen],[data-substepopen],[data-open],[data-archivelist],[data-unarchive],[data-delarchivelist]');
      if (!el) return;
      const d = el.dataset;
      const taskId = el.closest('[data-task]') ? el.closest('[data-task]').dataset.task : null;

      if (d.unarchive) { e.stopPropagation(); return unarchiveList(d.unarchive); }
      if (d.delarchivelist) { e.stopPropagation(); return deleteArchivedList(d.delarchivelist); }
      if (d.archivelist) {
        e.stopPropagation();
        view.type = 'list'; view.key = d.archivelist;
        renderTasks();
        return;
      }
      if (d.check) { e.stopPropagation(); return toggleTask(d.check, e); }
      if (d.star) {
        e.stopPropagation();
        const t = Store.task(d.star); t.star = !t.star; Store.save(); renderTasks();
        if (sel.taskId === t.id) renderDetail();
        return;
      }
      if (d.del) {
        e.stopPropagation();
        const t = Store.task(d.del);
        confirmBox('删除任务', `确定删除「${t.title}」吗？`, () => {
          Store.removeTask(d.del);
          if (sel.taskId === d.del) closeDetail();
          renderTasks(); toast('已删除任务');
        });
        return;
      }
      if (d.pomo) { e.stopPropagation(); return Pomodoro.open(d.pomo); }
      if (d.stepcheck) { e.stopPropagation(); return toggleStep(taskId, d.stepcheck, e); }
      if (d.stepdel) {
        e.stopPropagation();
        const task = Store.task(taskId);
        const step = task ? Store.step(task.id, d.stepdel) : null;
        confirmBox('删除步骤', `确定删除步骤「${step ? esc(step.title) : ''}」吗？`, () => {
          Store.removeStep(taskId, d.stepdel);
          renderTasks(); if (sel.taskId === taskId) renderDetail();
          toast('已删除步骤');
        }, task ? task.cover : '');
        return;
      }
      if (d.stepopen) {
        e.stopPropagation();
        const task = Store.task(taskId);
        const step = task ? Store.step(task.id, d.stepopen) : null;
        // 无子步骤且只有一个超链接时，点击图标直接打开链接
        const links = Array.isArray(step && step.links) ? step.links : [];
        if (step && (!step.subSteps || !step.subSteps.length) && links.length === 1) {
          const u = String((links[0] && links[0].url) || '').trim();
          if (u) {
            if (isLocalPath(u)) window.api.openFile(localPathFromUrl(u));
            else openInlineBrowser(u);
            return;
          }
        }
        sel.kind = 'step'; sel.taskId = taskId; sel.stepId = d.stepopen;
        renderDetail(); renderTasks();
        return;
      }
      if (d.substepopen) {
        e.stopPropagation();
        const stepCard = el.closest('[data-step]');
        const stepId = stepCard ? stepCard.dataset.step : null;
        const sub = stepId ? Store.subStep(taskId, stepId, d.substepopen) : null;
        if (sub) {
          sub.done = !sub.done;
          Store.save();
          renderTasks();
          if (sel.taskId === taskId && sel.stepId === stepId) renderDetail();
        }
        return;
      }
      if (d.open) {
        sel.kind = 'task'; sel.taskId = d.open; sel.stepId = null;
        renderDetail(); renderTasks();
      }
    });

    // 右键点击步骤图标：快捷完成/取消完成步骤
    listEl.addEventListener('contextmenu', (e) => {
      const icon = e.target.closest('[data-stepopen]');
      if (!icon) return;
      const taskEl = icon.closest('[data-task]');
      if (!taskEl) return;
      e.preventDefault();
      e.stopPropagation();
      toggleStep(taskEl.dataset.task, icon.dataset.stepopen, e);
    });

    // 步骤内联添加
    listEl.addEventListener('keydown', (e) => {
      const inp = e.target.closest('[data-stepadd]');
      if (!inp || e.key !== 'Enter') return;
      const v = inp.value.trim(); if (!v) return;
      const tid = inp.dataset.stepadd;
      Store.addStep(tid, v);
      renderTasks();
      if (sel.taskId === tid) renderDetail();
      const again = document.querySelector(`[data-stepadd="${tid}"]`);
      if (again) again.focus();
    });

    // 拖拽排序（任务 + 步骤）
    listEl.addEventListener('dragstart', (e) => {
      const stepIcon = e.target.closest('[data-stepmove]');
      if (stepIcon) {
        const taskEl = stepIcon.closest('[data-task]');
        dragMoveStepId = stepIcon.dataset.stepmove;
        dragMoveStepTaskId = taskEl ? taskEl.dataset.task : null;
        dragSortStepIconId = stepIcon.dataset.stepmove;
        dragSortStepIconTaskId = taskEl ? taskEl.dataset.task : null;
        stepIcon.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', dragMoveStepId); } catch (_) {}
        e.stopPropagation();
        return;
      }
      if (dragFromStepRow || e.target.closest('.step-icons-row') || e.target.closest('.substep-icons-row')) {
        dragFromStepRow = false;
        e.preventDefault(); e.stopPropagation(); return;
      }
      // 优先判断步骤卡片拖拽
      const stepCard = e.target.closest('[data-step]');
      if (stepCard) {
        const taskEl = stepCard.closest('[data-task]');
        dragStepId = stepCard.dataset.step;
        dragStepTaskId = taskEl ? taskEl.dataset.task : null;
        stepCard.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', dragStepId); } catch (_) {}
        e.stopPropagation();
        return;
      }
      const item = e.target.closest('[data-task]'); if (!item) return;
      dragTaskId = item.dataset.task;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragTaskId); } catch (_) {}
    });
    listEl.addEventListener('dragend', (e) => {
      const stepCard = e.target.closest('[data-step]');
      if (stepCard) stepCard.classList.remove('dragging');
      const item = e.target.closest('[data-task]');
      if (item) item.classList.remove('dragging', 'drop-before', 'drop-after');
      e.target.closest('.step-icon')?.classList.remove('dragging');
      listEl.querySelectorAll('.step-icon').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
      dragTaskId = null;
      dragStepId = null;
      dragStepTaskId = null;
      dragMoveStepId = null;
      dragMoveStepTaskId = null;
      dragSortStepIconId = null;
      dragSortStepIconTaskId = null;
      listEl.querySelectorAll('.step-card').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
      listEl.querySelectorAll('.task-item').forEach((x) => x.classList.remove('drop-target'));
    });
    listEl.addEventListener('dragover', (e) => {
      // 横向图标行内拖拽排序（同任务内）
      if (dragSortStepIconId && dragSortStepIconTaskId) {
        const icon = e.target.closest('.step-icon');
        if (icon) {
          const taskEl = icon.closest('[data-task]');
          if (taskEl && taskEl.dataset.task === dragSortStepIconTaskId && icon.dataset.stepmove !== dragSortStepIconId) {
            e.preventDefault();
            const r = icon.getBoundingClientRect();
            const before = e.clientX < r.left + r.width / 2;
            listEl.querySelectorAll('.step-icon').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
            icon.classList.add(before ? 'drop-before' : 'drop-after');
            return;
          }
        }
        // 目标是其他任务或空白处：交给下方"拖出到其他任务"逻辑处理，不在此 return
      }
      // 从图标拖出步骤，准备移动到其他任务
      if (dragMoveStepId && dragMoveStepTaskId) {
        const item = e.target.closest('[data-task]');
        if (!item || item.dataset.task === dragMoveStepTaskId) {
          listEl.querySelectorAll('.task-item').forEach((x) => x.classList.remove('drop-target'));
          return;
        }
        e.preventDefault();
        listEl.querySelectorAll('.task-item').forEach((x) => x.classList.remove('drop-target'));
        item.classList.add('drop-target');
        return;
      }
      // 步骤排序
      if (dragStepId && dragStepTaskId) {
        const stepCard = e.target.closest('[data-step]');
        if (!stepCard) return;
        const taskEl = stepCard.closest('[data-task]');
        if (!taskEl || taskEl.dataset.task !== dragStepTaskId) return;
        if (stepCard.dataset.step === dragStepId) return;
        e.preventDefault();
        const r = stepCard.getBoundingClientRect();
        const before = e.clientY < r.top + r.height / 2;
        listEl.querySelectorAll('.step-card').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
        stepCard.classList.add(before ? 'drop-before' : 'drop-after');
        return;
      }
      // 任务排序
      if (!dragTaskId) return;
      const item = e.target.closest('[data-task]'); if (!item || item.dataset.task === dragTaskId) return;
      e.preventDefault();
      const r = item.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      listEl.querySelectorAll('.task-item').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
      item.classList.add(before ? 'drop-before' : 'drop-after');
    });
    listEl.addEventListener('drop', (e) => {
      // 横向图标行内拖拽排序（同任务内）
      if (dragSortStepIconId && dragSortStepIconTaskId) {
        const icon = e.target.closest('.step-icon');
        if (icon) {
          const taskEl = icon.closest('[data-task]');
          if (taskEl && taskEl.dataset.task === dragSortStepIconTaskId && icon.dataset.stepmove !== dragSortStepIconId) {
            e.preventDefault();
            const t = Store.task(dragSortStepIconTaskId);
            const steps = t ? t.steps : [];
            const srcIdx = steps.findIndex((s) => s.id === dragSortStepIconId);
            const dstIdx = steps.findIndex((s) => s.id === icon.dataset.stepmove);
            if (srcIdx >= 0 && dstIdx >= 0) {
              const r = icon.getBoundingClientRect();
              const before = e.clientX < r.left + r.width / 2;
              const [src] = steps.splice(srcIdx, 1);
              const insertIdx = dstIdx < srcIdx
                ? (before ? dstIdx : dstIdx + 1)
                : (before ? dstIdx - 1 : dstIdx);
              steps.splice(Math.max(0, insertIdx), 0, src);
              Store.save();
              renderTasks();
              if (sel.taskId === dragSortStepIconTaskId) renderDetail();
              toast('已调整步骤顺序');
            }
            dragSortStepIconId = null; dragSortStepIconTaskId = null;
            listEl.querySelectorAll('.step-icon').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'dragging'));
            return;
          }
        }
        // 不是同任务内排序：交给下方"拖出到其他任务"逻辑处理
      }
      // 从图标拖出步骤，移动到另一个任务
      if (dragMoveStepId && dragMoveStepTaskId) {
        const item = e.target.closest('[data-task]');
        if (item && item.dataset.task !== dragMoveStepTaskId) {
          e.preventDefault();
          const srcTask = Store.task(dragMoveStepTaskId);
          const dstTask = Store.task(item.dataset.task);
          if (srcTask && dstTask) {
            const srcIdx = srcTask.steps.findIndex((s) => s.id === dragMoveStepId);
            if (srcIdx >= 0) {
              const [step] = srcTask.steps.splice(srcIdx, 1);
              dstTask.steps.push(step);
              Store.save();
              if (sel.taskId === dragMoveStepTaskId || sel.taskId === dstTask.id) renderDetail();
              renderTasks();
              toast(`已把步骤「${step.title}」移动到「${dstTask.title}」`);
            }
          }
        }
        dragMoveStepId = null; dragMoveStepTaskId = null;
        listEl.querySelectorAll('.task-item').forEach((x) => x.classList.remove('drop-target'));
        return;
      }
      // 步骤排序
      if (dragStepId && dragStepTaskId) {
        const stepCard = e.target.closest('[data-step]');
        if (stepCard) {
          const taskEl = stepCard.closest('[data-task]');
          if (taskEl && taskEl.dataset.task === dragStepTaskId && stepCard.dataset.step !== dragStepId) {
            e.preventDefault();
            const t = Store.task(dragStepTaskId);
            const steps = t ? t.steps : [];
            const srcIdx = steps.findIndex((s) => s.id === dragStepId);
            const dstIdx = steps.findIndex((s) => s.id === stepCard.dataset.step);
            if (srcIdx >= 0 && dstIdx >= 0) {
              const r = stepCard.getBoundingClientRect();
              const before = e.clientY < r.top + r.height / 2;
              const [src] = steps.splice(srcIdx, 1);
              const insertIdx = dstIdx < srcIdx
                ? (before ? dstIdx : dstIdx + 1)
                : (before ? dstIdx - 1 : dstIdx);
              steps.splice(Math.max(0, insertIdx), 0, src);
              Store.save(); renderTasks(); if (sel.taskId === dragStepTaskId) renderDetail();
              toast('已调整步骤顺序');
            }
          }
        }
        dragStepId = null; dragStepTaskId = null;
        listEl.querySelectorAll('.step-card').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
        return;
      }
      // 任务排序
      if (!dragTaskId) return;
      const item = e.target.closest('[data-task]'); if (!item) return;
      e.preventDefault();
      const src = Store.task(dragTaskId), dst = Store.task(item.dataset.task);
      if (!src || !dst || src.id === dst.id) return;
      const r = item.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      if (src.listId !== dst.listId) src.listId = dst.listId;
      src.order = dst.order + (before ? -0.5 : 0.5);
      normalizeOrders(dst.listId);
      if (D().settings.sortBy !== 'manual') {
        D().settings.sortBy = 'manual';
        toast('已切换为手动排序');
      }
      Store.save(); renderTasks();
    });

    // 存档任务表拖拽排序
    listEl.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.archive-list-card');
      if (!card || view.type !== 'archive') return;
      dragArchiveId = card.dataset.archivelist;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragArchiveId); } catch (_) {}
    });
    listEl.addEventListener('dragend', (e) => {
      const card = e.target.closest('.archive-list-card');
      if (card) card.classList.remove('dragging');
      listEl.querySelectorAll('.archive-list-card').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
      dragArchiveId = null;
    });
    listEl.addEventListener('dragover', (e) => {
      if (!dragArchiveId) return;
      const card = e.target.closest('.archive-list-card');
      if (!card || card.dataset.archivelist === dragArchiveId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const r = card.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      listEl.querySelectorAll('.archive-list-card').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
      card.classList.add(before ? 'drop-before' : 'drop-after');
    });
    listEl.addEventListener('drop', (e) => {
      if (!dragArchiveId) return;
      const card = e.target.closest('.archive-list-card');
      e.preventDefault();
      listEl.querySelectorAll('.archive-list-card').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
      if (!card || card.dataset.archivelist === dragArchiveId) { dragArchiveId = null; return; }
      const r = card.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      reorderArchiveLists(dragArchiveId, card.dataset.archivelist, before);
      dragArchiveId = null;
    });
    // 存档任务表右键菜单
    listEl.addEventListener('contextmenu', (e) => {
      const card = e.target.closest('.archive-list-card');
      if (!card || view.type !== 'archive') return;
      e.preventDefault();
      showArchiveContextMenu(card.dataset.archivelist, e.clientX, e.clientY);
    });

    // 弹窗遮罩
    $('modalOverlay').addEventListener('mousedown', (e) => { if (e.target === $('modalOverlay')) closeModal(); });

    // 台前调度任务详情
    $('detailClose').addEventListener('click', closeDetail);
    $('detailOverlay').addEventListener('mousedown', (e) => { if (e.target === $('detailOverlay')) closeDetail(); });

    // 台前调度浏览器
    $('browserClose').addEventListener('click', closeInlineBrowser);
    $('browserPomodoro').addEventListener('click', () => {
      Pomodoro.open(sel.kind === 'task' ? sel.taskId : '');
    });
    $('browserOpenExternal').addEventListener('click', () => {
      const url = $('browserWebview').src;
      if (url && url !== 'about:blank') window.api.openLink(url);
    });
    $('browserOverlay').addEventListener('mousedown', (e) => { if (e.target === $('browserOverlay')) closeInlineBrowser(); });
    $('browserWebview').addEventListener('new-window', (e) => { e.preventDefault(); if (e.url) window.api.openLink(e.url); });

    // 快捷键
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!$('browserOverlay').hidden) return closeInlineBrowser();
        if (!$('modalOverlay').hidden) return closeModal();
        if (!$('pomodoroOverlay').hidden) return void ($('pomodoroOverlay').hidden = true);
        if (sel.kind) return closeDetail();
      }
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); $('searchInput').focus(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); newTaskModal(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); newListModal(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'p') { e.preventDefault(); Pomodoro.open(sel.kind === 'task' ? sel.taskId : ''); }
      if (!typing && e.key === '/') { e.preventDefault(); $('searchInput').focus(); }
    });

    if (window.api.onTrayPomodoro) window.api.onTrayPomodoro(() => Pomodoro.open());
  }

  /* ---------------- 番茄钟 → 浏览器弹窗倒计时联动 ---------------- */
  function updateBrowserPomo(st) {
    const elx = $('browserPomoTime');
    if (!elx) return;
    if (st && st.running) {
      const m = Math.floor(st.remaining / 60), s = st.remaining % 60;
      const txt = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      elx.textContent = (st.mode === 'work' ? '🍅 ' : '☕ ') + txt;
      elx.classList.toggle('break', st.mode !== 'work');
      elx.hidden = false;
    } else {
      elx.hidden = true;
    }
  }

  /* ---------------- 启动 ---------------- */
  async function init() {
    await Store.load();
    applySettings();
    bindGlobal();
    Pomodoro.init(() => { renderTasks(); if (sel.kind === 'task') renderDetail(); });
    Pomodoro.onTick(updateBrowserPomo);
    updateBrowserPomo(Pomodoro.getState());
    renderTasks();
    renderDetail();
    applyDetailPanel();

    checkReminders();
    setInterval(checkReminders, 15000);
    // 跨天时刷新（更新“今天”视图）
    setInterval(() => renderTasks(), 5 * 60 * 1000);

    window.addEventListener('beforeunload', () => Store.save(true));
  }

  document.addEventListener('DOMContentLoaded', init);

  return { toast, renderTasks, renderDetail };
})();
