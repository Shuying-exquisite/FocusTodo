/* ================= 数据层：结构、持久化、查询 ================= */
'use strict';

window.Store = (function () {
  const LIST_COLORS = ['#4f6ef7', '#22a06b', '#f2a63b', '#e5484d', '#8b6cf7', '#0ea5e9', '#ec4899', '#64748b'];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function defaultSettings() {
    return {
      theme: 'light',
      soundEnabled: true,
      volume: 0.7,
      soundStyle: 'chime',       // chime | bell | ding | pop
      stepSound: true,
      celebrateSound: true,
      notifyEnabled: true,
      showDone: true,
      sortBy: 'manual',          // manual | due | priority | created | title
      defaultRemindBefore: 0,    // 提前提醒分钟数
      minimizeToTray: true,
      sidebarCollapsed: false,
      toolboxLinks: [],            // 用户自定义工具箱链接 { id, name, url, emoji, category }
      toolboxHidden: [],            // 被隐藏的预设工具箱链接 id
      toolboxBackground: ''         // 工具箱弹窗背景：空=默认，颜色值，或 base64 图片
    };
  }

  function defaultPomodoro() {
    return {
      work: 25, short: 5, long: 15, rounds: 4,
      autoNext: false, topMost: false, tickSound: true,
      history: {}   // { 'YYYY-MM-DD': { count: n, minutes: m } }
    };
  }

  function sampleData() {
    const now = Date.now();
    const l1 = uid(), l2 = uid();
    const today = new Date(); today.setHours(18, 0, 0, 0);
    return {
      version: 1,
      lists: [
        { id: l1, name: '工作项目', emoji: '💼', color: '#4f6ef7', note: '本季度重点推进的工作事项。\n可以在这里写任务表级别的说明、目标、验收标准。', files: [], links: [], createdAt: now, order: 0 },
        { id: l2, name: '个人生活', emoji: '🌿', color: '#22a06b', note: '', files: [], links: [], createdAt: now, order: 1 }
      ],
      tasks: [
        {
          id: uid(), listId: l1, title: '完成产品需求文档', done: false, doneAt: null,
          star: true, priority: 2, due: today.getTime(), remindBefore: 15, remindAt: null,
          notified: false, repeat: 'none',
          note: '这是任务备注：可以记录背景、思路、注意事项。\n右侧还能添加「材料」文件与「超链接」。',
          files: [], links: [{ id: uid(), title: '需求模板参考', url: 'https://www.example.com' }],
          steps: [
            { id: uid(), title: '收集用户反馈', done: true, note: '已整理 32 条反馈', files: [], links: [] },
            { id: uid(), title: '梳理功能列表', done: false, note: '', files: [], links: [] },
            { id: uid(), title: '评审并定稿', done: false, note: '', files: [], links: [] }
          ],
          pomodoros: 1, createdAt: now, order: 0
        },
        {
          id: uid(), listId: l1, title: '整理本周会议纪要', done: false, doneAt: null,
          star: false, priority: 1, due: null, remindBefore: 0, remindAt: null,
          notified: false, repeat: 'weekly', note: '', files: [], links: [], steps: [],
          pomodoros: 0, createdAt: now, order: 1
        },
        {
          id: uid(), listId: l2, title: '每天运动 30 分钟', done: false, doneAt: null,
          star: false, priority: 0, due: null, remindBefore: 0, remindAt: null,
          notified: false, repeat: 'daily', note: '', files: [], links: [], steps: [],
          pomodoros: 0, createdAt: now, order: 0
        }
      ],
      settings: defaultSettings(),
      pomodoro: defaultPomodoro(),
      groups: []
    };
  }

  /* ---------- 规范化：兼容旧数据 / 缺字段 ---------- */
  function normalize(d) {
    const data = d && typeof d === 'object' ? d : {};
    data.version = 1;
    data.lists = Array.isArray(data.lists) ? data.lists : [];
    data.tasks = Array.isArray(data.tasks) ? data.tasks : [];
    data.settings = Object.assign(defaultSettings(), data.settings || {});
    data.pomodoro = Object.assign(defaultPomodoro(), data.pomodoro || {});
    if (!data.pomodoro.history || typeof data.pomodoro.history !== 'object') data.pomodoro.history = {};

    /* 任务分组：{ id, name, color, star, collapsed, createdAt, order }
       分组没有自己的封面；合并卡片背景由各成员任务的 cover 拼接而成 */
    data.groups = (Array.isArray(data.groups) ? data.groups : []).filter((g) => g && typeof g === 'object').map((g, i) => ({
      id: g.id || uid(),
      name: g.name || '未命名分组',
      color: g.color || '',
      star: !!g.star,
      collapsed: g.collapsed === undefined ? true : !!g.collapsed,
      createdAt: g.createdAt || Date.now(),
      order: typeof g.order === 'number' ? g.order : i
    }));

    data.lists.forEach((l, i) => {
      l.id = l.id || uid();
      l.name = l.name || '未命名任务表';
      l.emoji = l.emoji || '📋';
      l.color = l.color || LIST_COLORS[i % LIST_COLORS.length];
      l.cover = l.cover || '';
      l.note = l.note || '';
      l.files = Array.isArray(l.files) ? l.files : [];
      l.links = Array.isArray(l.links) ? l.links : [];
      l.createdAt = l.createdAt || Date.now();
      if (typeof l.order !== 'number') l.order = i;
      l.archived = !!l.archived;
    });

    data.tasks.forEach((t, i) => {
      t.id = t.id || uid();
      t.title = t.title || '未命名任务';
      t.groupId = typeof t.groupId === 'string' ? t.groupId : '';
      t.done = !!t.done;
      t.doneAt = t.doneAt || null;
      t.star = !!t.star;
      t.priority = [0, 1, 2].includes(t.priority) ? t.priority : 0;
      t.due = typeof t.due === 'number' ? t.due : null;
      t.remindBefore = typeof t.remindBefore === 'number' ? t.remindBefore : 0;
      t.remindAt = typeof t.remindAt === 'number' ? t.remindAt : null;
      t.notified = !!t.notified;
      t.repeat = ['none', 'daily', 'weekly', 'monthly', 'manual'].includes(t.repeat) ? t.repeat : 'none';
      t.dueRepeat = ['none', 'daily', 'weekly', 'monthly'].includes(t.dueRepeat) ? t.dueRepeat : 'none';
      t.reminders = Array.isArray(t.reminders) ? t.reminders.map((r) => ({
        due: typeof r.due === 'number' ? r.due : null,
        remindBefore: typeof r.remindBefore === 'number' ? r.remindBefore : 0,
        dueRepeat: ['none', 'daily', 'weekly', 'monthly'].includes(r.dueRepeat) ? r.dueRepeat : 'none',
        notified: !!r.notified,
        remindAt: typeof r.remindAt === 'number' ? r.remindAt : null
      })) : [];
      t.note = t.note || '';
      t.files = Array.isArray(t.files) ? t.files : [];
      t.links = Array.isArray(t.links) ? t.links : [];
      t.steps = Array.isArray(t.steps) ? t.steps : [];
      t.pomodoros = t.pomodoros || 0;
      t.cover = t.cover || '';
      t.createdAt = t.createdAt || Date.now();
      if (typeof t.order !== 'number') t.order = i;
      t.steps.forEach((s) => {
        s.id = s.id || uid();
        s.title = s.title || '未命名步骤';
        s.icon = s.icon || '';
        s.done = !!s.done;
        s.note = s.note || '';
        s.files = Array.isArray(s.files) ? s.files : [];
        s.links = Array.isArray(s.links) ? s.links : [];
        s.subSteps = Array.isArray(s.subSteps) ? s.subSteps : [];
        s.pomodoros = s.pomodoros || 0;
        s.cover = s.cover || '';
        s.due = typeof s.due === 'number' ? s.due : null;
      s.remindBefore = typeof s.remindBefore === 'number' ? s.remindBefore : 0;
      s.remindAt = typeof s.remindAt === 'number' ? s.remindAt : null;
      s.notified = !!s.notified;
      s.repeat = ['none', 'daily', 'weekly', 'monthly', 'manual'].includes(s.repeat) ? s.repeat : 'none';
      s.dueRepeat = ['none', 'daily', 'weekly', 'monthly'].includes(s.dueRepeat) ? s.dueRepeat : 'none';
      s.reminders = Array.isArray(s.reminders) ? s.reminders.map((r) => ({
        due: typeof r.due === 'number' ? r.due : null,
        remindBefore: typeof r.remindBefore === 'number' ? r.remindBefore : 0,
        dueRepeat: ['none', 'daily', 'weekly', 'monthly'].includes(r.dueRepeat) ? r.dueRepeat : 'none',
        notified: !!r.notified,
        remindAt: typeof r.remindAt === 'number' ? r.remindAt : null
      })) : [];
        s.subSteps.forEach((sub) => {
          sub.id = sub.id || uid();
          sub.title = sub.title || '未命名子步骤';
          sub.icon = sub.icon || '';
          sub.done = !!sub.done;
          sub.note = sub.note || '';
          sub.files = Array.isArray(sub.files) ? sub.files : [];
          sub.links = Array.isArray(sub.links) ? sub.links : [];
          sub.pomodoros = sub.pomodoros || 0;
          sub.cover = sub.cover || '';
          sub.due = typeof sub.due === 'number' ? sub.due : null;
          sub.remindBefore = typeof sub.remindBefore === 'number' ? sub.remindBefore : 0;
          sub.remindAt = typeof sub.remindAt === 'number' ? sub.remindAt : null;
          sub.notified = !!sub.notified;
          sub.repeat = ['none', 'daily', 'weekly', 'monthly', 'manual'].includes(sub.repeat) ? sub.repeat : 'none';
          sub.dueRepeat = ['none', 'daily', 'weekly', 'monthly'].includes(sub.dueRepeat) ? sub.dueRepeat : 'none';
          sub.reminders = Array.isArray(sub.reminders) ? sub.reminders.map((r) => ({
            due: typeof r.due === 'number' ? r.due : null,
            remindBefore: typeof r.remindBefore === 'number' ? r.remindBefore : 0,
            dueRepeat: ['none', 'daily', 'weekly', 'monthly'].includes(r.dueRepeat) ? r.dueRepeat : 'none',
            notified: !!r.notified,
            remindAt: typeof r.remindAt === 'number' ? r.remindAt : null
          })) : [];
        });
      });
      // 孤儿任务归入第一个表
      if (!data.lists.some((l) => l.id === t.listId)) {
        if (!data.lists.length) {
          data.lists.push({ id: uid(), name: '我的任务', emoji: '📋', color: LIST_COLORS[0], note: '', files: [], links: [], createdAt: Date.now(), order: 0 });
        }
        t.listId = data.lists[0].id;
      }
    });

    /* 校验 groupId 指向的分组存在；清掉空分组 */
    const groupIds = new Set(data.groups.map((g) => g.id));
    data.tasks.forEach((t) => { if (t.groupId && !groupIds.has(t.groupId)) t.groupId = ''; });
    data.groups = data.groups.filter((g) => data.tasks.some((t) => t.groupId === g.id));

    return data;
  }

  /* 重排所有任务表顺序：活动表在前（按 order），存档表在后（按 order） */
  function reassignListOrder() {
    const active = S.data.lists.filter((l) => !l.archived).sort((a, b) => a.order - b.order);
    const archived = S.data.lists.filter((l) => l.archived).sort((a, b) => a.order - b.order);
    active.concat(archived).forEach((l, i) => { l.order = i; });
  }

  const S = {
    data: null,
    LIST_COLORS,
    uid,
    defaultSettings,
    defaultPomodoro,

    async load() {
      let raw = null;
      try { raw = await window.api.loadData(); } catch (e) { console.error(e); }
      S.data = raw ? normalize(raw) : normalize(sampleData());
      return S.data;
    },

    _timer: null,
    save(immediate) {
      if (!S.data) return;
      if (S._timer) clearTimeout(S._timer);
      const doSave = () => { window.api.saveData(JSON.parse(JSON.stringify(S.data))); };
      if (immediate) doSave();
      else S._timer = setTimeout(doSave, 350);
    },

    replaceAll(newData) {
      S.data = normalize(newData);
      S.save(true);
    },

    /* ---------- 查询 ---------- */
    list(id) { return S.data.lists.find((l) => l.id === id) || null; },
    task(id) { return S.data.tasks.find((t) => t.id === id) || null; },
    step(taskId, stepId) {
      const t = S.task(taskId);
      return t ? (t.steps.find((s) => s.id === stepId) || null) : null;
    },
    subStep(taskId, stepId, subStepId) {
      const s = S.step(taskId, stepId);
      return s ? (s.subSteps.find((x) => x.id === subStepId) || null) : null;
    },
    parentTaskOfStep(stepId) {
      return S.data.tasks.find((t) => t.steps.some((s) => s.id === stepId)) || null;
    },
    parentStepOfSubStep(subStepId) {
      for (const t of S.data.tasks) {
        for (const s of t.steps) {
          if (s.subSteps.some((sub) => sub.id === subStepId)) return { task: t, step: s };
        }
      }
      return null;
    },
    tasksOf(listId) { return S.data.tasks.filter((t) => t.listId === listId); },

    /* ---------- 任务分组 ---------- */
    group(id) { return (S.data.groups || []).find((g) => g.id === id) || null; },
    membersOf(groupId) { return S.data.tasks.filter((t) => t.groupId === groupId); },
    addGroup(name, color) {
      const g = {
        id: uid(), name: name || '新分组', color: color || '', collapsed: true,
        star: false,
        createdAt: Date.now(), order: (S.data.groups || []).length
      };
      if (!Array.isArray(S.data.groups)) S.data.groups = [];
      S.data.groups.push(g);
      return g;
    },
    removeGroup(id) {
      // 解散：成员脱离分组（任务保留），分组定义删除
      S.data.tasks.forEach((t) => { if (t.groupId === id) t.groupId = ''; });
      S.data.groups = (S.data.groups || []).filter((g) => g.id !== id);
    },
    cleanupGroups() {
      // 成员被删光后自动移除空分组
      if (!Array.isArray(S.data.groups)) S.data.groups = [];
      S.data.groups = S.data.groups.filter((g) => S.data.tasks.some((t) => t.groupId === g.id));
    },

    /* ---------- 增删改 ---------- */
    addList(name, emoji, color) {
      const l = {
        id: uid(), name: name || '新任务表', emoji: emoji || '📋',
        color: color || LIST_COLORS[S.data.lists.length % LIST_COLORS.length],
        note: '', files: [], links: [], createdAt: Date.now(),
        order: S.data.lists.length, archived: false
      };
      S.data.lists.push(l);
      S.save();
      return l;
    },
    removeList(id) {
      S.data.lists = S.data.lists.filter((l) => l.id !== id);
      S.data.tasks = S.data.tasks.filter((t) => t.listId !== id);
      S.cleanupGroups();
      S.save();
    },

    /* 存档 / 取消存档：重排全局顺序，活动表在前、存档表在后 */
    archiveList(id) {
      const l = S.list(id); if (!l || l.archived) return;
      l.archived = true;
      reassignListOrder();
      S.save();
    },
    unarchiveList(id) {
      const l = S.list(id); if (!l || !l.archived) return;
      l.archived = false;
      reassignListOrder();
      S.save();
    },

    addTask(listId, title, opts) {
      const orders = S.tasksOf(listId).map((t) => t.order);
      const t = Object.assign({
        id: uid(), listId, title: title || '新任务', done: false, doneAt: null,
        star: false, priority: 0, due: null,
        remindBefore: S.data.settings.defaultRemindBefore || 0,
        remindAt: null, notified: false, repeat: 'none', dueRepeat: 'none',
        reminders: [],
        note: '', files: [], links: [], steps: [], pomodoros: 0,
        createdAt: Date.now(),
        order: orders.length ? Math.max.apply(null, orders) + 1 : 0
      }, opts || {});
      S.data.tasks.push(t);
      S.save();
      return t;
    },
    removeTask(id) {
      S.data.tasks = S.data.tasks.filter((t) => t.id !== id);
      S.cleanupGroups();
      S.save();
    },

    addStep(taskId, title) {
      const t = S.task(taskId);
      if (!t) return null;
      const s = {
        id: uid(), title: title || '新步骤', icon: '', done: false,
        note: '', files: [], links: [], subSteps: [], pomodoros: 0, cover: '',
        due: null, remindBefore: S.data.settings.defaultRemindBefore || 0,
        remindAt: null, notified: false, repeat: 'none', dueRepeat: 'none',
        reminders: []
      };
      t.steps.push(s);
      S.save();
      return s;
    },
    removeStep(taskId, stepId) {
      const t = S.task(taskId);
      if (!t) return;
      t.steps = t.steps.filter((s) => s.id !== stepId);
      S.save();
    },

    addSubStep(taskId, stepId, title) {
      const s = S.step(taskId, stepId);
      if (!s) return null;
      const sub = {
        id: uid(), title: title || '新子步骤', icon: '', done: false,
        note: '', files: [], links: [], pomodoros: 0, cover: '',
        due: null, remindBefore: S.data.settings.defaultRemindBefore || 0,
        remindAt: null, notified: false, repeat: 'none', dueRepeat: 'none',
        reminders: []
      };
      s.subSteps.push(sub);
      S.save();
      return sub;
    },
    removeSubStep(taskId, stepId, subStepId) {
      const s = S.step(taskId, stepId);
      if (!s) return;
      s.subSteps = s.subSteps.filter((x) => x.id !== subStepId);
      S.save();
    },

    /* ---------- 重复任务：计算下一次到期 ---------- */
    nextDue(ts, repeat) {
      if (!ts || repeat === 'none') return null;
      const d = new Date(ts);
      const now = Date.now();
      let guard = 0;
      do {
        if (repeat === 'daily') d.setDate(d.getDate() + 1);
        else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
        else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
        else return null;
        guard++;
      } while (d.getTime() <= now && guard < 500);
      return d.getTime();
    },

    /* ---------- 番茄钟统计 ---------- */
    todayKey() {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    },
    addPomodoroRecord(minutes) {
      const k = S.todayKey();
      const h = S.data.pomodoro.history;
      if (!h[k]) h[k] = { count: 0, minutes: 0 };
      h[k].count += 1;
      h[k].minutes += minutes;
      S.save();
      return h[k];
    },
    todayPomodoro() {
      return S.data.pomodoro.history[S.todayKey()] || { count: 0, minutes: 0 };
    }
  };

  return S;
})();
