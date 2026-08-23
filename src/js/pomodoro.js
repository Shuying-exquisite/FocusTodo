/* ================= 番茄时钟模块 ================= */
'use strict';

window.Pomodoro = (function () {
  const RING = 666; // 2 * PI * 106

  const el = {};
  let mode = 'work';          // work | short | long
  let running = false;
  let remaining = 0;          // 秒
  let total = 0;              // 秒
  let round = 0;              // 已完成的专注轮次
  let timer = null;
    let linkedTaskId = '';
  let linkedStepId = '';
  let linkedSubStepId = '';
  let onChange = null;        // 外部刷新回调
  let onTickCb = null;        // 外部每帧刷新回调（如浏览器弹窗倒计时）

  const LABEL = { work: '专注中', short: '短休息', long: '长休息' };

  function cfg() { return Store.data.pomodoro; }

  function minutesFor(m) {
    const c = cfg();
    return m === 'work' ? c.work : m === 'short' ? c.short : c.long;
  }

  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function q(id) { return document.getElementById(id); }

  function cacheEls() {
    el.overlay = q('pomodoroOverlay');
    el.time = q('pomoTime');
    el.state = q('pomoState');
    el.ring = q('ringFg');
    el.ringWrap = document.querySelector('.pomo-ring-wrap');
    el.start = q('pomoStart');
    el.reset = q('pomoReset');
    el.skip = q('pomoSkip');
    el.close = q('pomoClose');
    el.modes = Array.prototype.slice.call(document.querySelectorAll('.pomo-mode'));
    el.taskSelect = q('pomoTaskSelect');
    el.todayCount = q('pomoTodayCount');
    el.todayMin = q('pomoTodayMin');
    el.round = q('pomoRound');
    el.setWork = q('setWork');
    el.setShort = q('setShort');
    el.setLong = q('setLong');
    el.setRounds = q('setRounds');
    el.setAutoNext = q('setAutoNext');
    el.setTopMost = q('setTopMost');
    el.mini = q('miniPomo');
    el.miniTime = q('miniPomoTime');
  }

  function renderTime() {
    el.time.textContent = fmt(remaining);
    const ratio = total > 0 ? remaining / total : 1;
    el.ring.style.strokeDashoffset = String(RING * (1 - ratio));
    el.ringWrap.classList.toggle('break', mode !== 'work');
    el.state.textContent = running
      ? LABEL[mode]
      : (remaining === total ? '准备开始 · ' + minutesFor(mode) + ' 分钟' : '已暂停');
    el.start.textContent = running ? '暂停' : (remaining < total ? '继续' : (mode === 'work' ? '开始专注' : '开始休息'));

    // 迷你计时器 + 窗口标题
    if (running) {
      el.mini.hidden = false;
      el.miniTime.textContent = fmt(remaining);
      document.title = fmt(remaining) + ' · ' + LABEL[mode] + ' - FocusTodo';
    } else {
      el.mini.hidden = true;
      document.title = 'FocusTodo 待办清单';
    }
    el.round.textContent = (round % cfg().rounds) + '/' + cfg().rounds;
    if (onTickCb) onTickCb({ running, remaining, mode, total, label: LABEL[mode] });
  }

  function renderStats() {
    const t = Store.todayPomodoro();
    el.todayCount.textContent = t.count;
    el.todayMin.textContent = t.minutes;
  }

  function renderSettings() {
    const c = cfg();
    el.setWork.value = c.work;
    el.setShort.value = c.short;
    el.setLong.value = c.long;
    el.setRounds.value = c.rounds;
    el.setAutoNext.checked = !!c.autoNext;
    el.setTopMost.checked = !!c.topMost;
  }

  function renderTaskOptions() {
    const cur = el.taskSelect.value || linkedTaskId;
    const opts = ['<option value="">（不关联任务）</option>'];
    Store.data.lists.forEach((l) => {
      const tasks = Store.tasksOf(l.id).filter((t) => !t.done);
      if (!tasks.length) return;
      opts.push('<optgroup label="' + esc(l.emoji + ' ' + l.name) + '">');
      tasks.forEach((t) => {
        opts.push('<option value="' + t.id + '">' + esc(t.title) + '</option>');
      });
      opts.push('</optgroup>');
    });
    el.taskSelect.innerHTML = opts.join('');
    if (cur && Store.task(cur)) el.taskSelect.value = cur;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function setMode(m, keepRunning) {
    mode = m;
    total = minutesFor(m) * 60;
    remaining = total;
    el.modes.forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
    if (!keepRunning) stopTimer();
    renderTime();
  }

  function stopTimer() {
    running = false;
    if (timer) { clearInterval(timer); timer = null; }
    if (window.api && window.api.setAlwaysOnTop) window.api.setAlwaysOnTop(false);
  }

  function start() {
    if (running) { pause(); return; }
    running = true;
    if (remaining <= 0) { remaining = total; }
    if (cfg().topMost && window.api.setAlwaysOnTop) window.api.setAlwaysOnTop(true);
    linkedTaskId = el.taskSelect.value || linkedTaskId || '';
    timer = setInterval(tick, 1000);
    renderTime();
    // 开始后将番茄钟弹窗收起，让用户回到（内置浏览器等）原弹窗查看实时倒计时
    el.overlay.hidden = true;
  }

  function pause() {
    stopTimer();
    renderTime();
  }

  function reset() {
    stopTimer();
    remaining = total;
    renderTime();
  }

  function tick() {
    remaining -= 1;
    if (remaining <= 3 && remaining > 0 && cfg().tickSound) Sound.tick();
    if (remaining <= 0) {
      finish();
      return;
    }
    renderTime();
  }

  function finish() {
    stopTimer();
    const finishedMode = mode;
    const minutes = minutesFor(finishedMode);

    if (finishedMode === 'work') {
      round += 1;
      Store.addPomodoroRecord(minutes);
      // 累计到关联任务/步骤/子步骤
      const t = linkedTaskId ? Store.task(linkedTaskId) : null;
      if (t) { t.pomodoros = (t.pomodoros || 0) + 1; }
      if (linkedStepId && t) {
        const s = Store.step(t.id, linkedStepId);
        if (s) { s.pomodoros = (s.pomodoros || 0) + 1; }
        if (linkedSubStepId && s) {
          const sub = s.subSteps.find((x) => x.id === linkedSubStepId);
          if (sub) { sub.pomodoros = (sub.pomodoros || 0) + 1; }
        }
      }
      if (t) Store.save();
      Sound.pomodoroEnd();
      let name = t ? '「' + t.title + '」' : '';
      if (linkedStepId && t) {
        const s = Store.step(t.id, linkedStepId);
        if (s) name += ' 的步骤「' + s.title + '」';
      }
      if (linkedSubStepId && t) {
        const s = Store.step(t.id, linkedStepId);
        const sub = s ? s.subSteps.find((x) => x.id === linkedSubStepId) : null;
        if (sub) name += ' 的子步骤「' + sub.title + '」';
      }
      notify('🍅 专注结束', name + '完成一个番茄钟（' + minutes + ' 分钟），休息一下吧！');
      if (window.api.flash) window.api.flash();
      const nextMode = (round % cfg().rounds === 0) ? 'long' : 'short';
      setMode(nextMode);
      toast('🍅 完成一个番茄钟！进入' + (nextMode === 'long' ? '长休息' : '短休息'));
    } else {
      Sound.breakEnd();
      notify('休息结束', '准备好开始下一个番茄钟了吗？');
      if (window.api.flash) window.api.flash();
      setMode('work');
      toast('休息结束，开始新的专注吧');
    }

    renderStats();
    if (onChange) onChange();
    if (cfg().autoNext) setTimeout(() => { if (!running) start(); }, 1200);
  }

  function notify(title, body) {
    if (Store.data.settings.notifyEnabled && window.api.notify) {
      window.api.notify({ title, body, silent: true });
    }
  }

  function toast(msg) {
    if (window.App && App.toast) App.toast(msg);
  }

  function bindSettings() {
    const numBind = (input, key, min, max) => {
      input.addEventListener('change', () => {
        let v = parseInt(input.value, 10);
        if (isNaN(v)) v = cfg()[key];
        v = Math.min(max, Math.max(min, v));
        input.value = v;
        cfg()[key] = v;
        Store.save();
        if (!running) setMode(mode);
        renderTime();
      });
    };
    numBind(el.setWork, 'work', 1, 180);
    numBind(el.setShort, 'short', 1, 60);
    numBind(el.setLong, 'long', 1, 120);
    numBind(el.setRounds, 'rounds', 1, 12);
    el.setAutoNext.addEventListener('change', () => { cfg().autoNext = el.setAutoNext.checked; Store.save(); });
    el.setTopMost.addEventListener('change', () => {
      cfg().topMost = el.setTopMost.checked;
      Store.save();
      if (running && window.api.setAlwaysOnTop) window.api.setAlwaysOnTop(cfg().topMost);
    });
  }

  return {
    init(changeCb) {
      onChange = changeCb;
      cacheEls();
      el.ring.style.strokeDasharray = String(RING);
      setMode('work');
      renderStats();
      renderSettings();

      el.start.addEventListener('click', start);
      el.reset.addEventListener('click', reset);
      el.skip.addEventListener('click', () => { remaining = 1; tick(); });
      el.close.addEventListener('click', () => { el.overlay.hidden = true; });
      el.overlay.addEventListener('mousedown', (e) => { if (e.target === el.overlay) el.overlay.hidden = true; });
      el.modes.forEach((b) => b.addEventListener('click', () => {
        if (running && !confirm('计时进行中，确定切换模式吗？')) return;
        setMode(b.dataset.mode);
      }));
      el.taskSelect.addEventListener('change', () => { linkedTaskId = el.taskSelect.value; linkedStepId = ''; linkedSubStepId = ''; });
      bindSettings();
    },

    open(taskId, stepId, subStepId) {
      renderTaskOptions();
      renderStats();
      renderSettings();
      if (taskId) { linkedTaskId = taskId; el.taskSelect.value = taskId; }
      linkedStepId = stepId || '';
      linkedSubStepId = subStepId || '';
      el.overlay.hidden = false;
      renderTime();
    },

    startFor(taskId) {
      this.open(taskId);
      if (!running) { if (mode !== 'work') setMode('work'); start(); }
    },

    get isRunning() { return running; },
    refreshStats: renderStats,
    onTick(cb) { onTickCb = cb; },
    getState() { return { running, remaining, mode, total, label: LABEL[mode] }; }
  };
})();
