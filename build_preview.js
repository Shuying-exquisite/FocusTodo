/* 用真实 groupMergedHTML 生成合并卡片效果预览（自包含 HTML，内联 styles.css）。
   运行： node build_preview.js  ->  preview-group-standalone.html              */
const fs = require('fs');

/* ---------- 抽取真实渲染函数 ---------- */
const appSrc = fs.readFileSync('src/js/app.js', 'utf8');
const s0 = appSrc.indexOf('  function groupMergedHTML');
const e0 = appSrc.indexOf('\n  // 展开态', s0);
if (s0 < 0 || e0 < 0) throw new Error('无法定位 groupMergedHTML');
const fnSrc = appSrc.slice(s0, e0);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stepIconContent = (s) => {
  if (s.done) return '✓';
  const v = (s.icon || '').trim();
  if (/^data:image\//i.test(v) || /^https?:\/\//i.test(v)) return `<img src="${esc(v)}" alt="">`;
  return esc(v || Array.from(s.title)[0] || '·');
};
const groupAggTags = (g, members) => {
  const total = members.reduce((n, t) => n + t.steps.length, 0);
  const done = members.reduce((n, t) => n + t.steps.filter((s) => s.done).length, 0);
  return [`<span class="tag group-tag">👥 ${members.length} 个任务</span>`,
          `<span class="tag steps">☑ ${done}/${total}</span>`,
          '<span class="tag">🔁 手动重复</span>'];
};
const resolveGroupColor = () => '#4f6ef7';
const sel = { taskId: null };
const render = new Function(
  'esc', 'stepIconContent', 'groupAggTags', 'resolveGroupColor', 'sel',
  fnSrc + '\nreturn groupMergedHTML;'
)(esc, stepIconContent, groupAggTags, resolveGroupColor, sel);

/* ---------- 演示数据 ---------- */
const svgIcon = (c1, c2, label) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="88" height="88" rx="18" fill="url(#g)"/><text x="44" y="58" font-size="32" font-weight="700" text-anchor="middle" fill="#fff" font-family="Arial">${label}</text></svg>`
);
const PALETTE_A = [['#4a90d9', '#2f6fc0'], ['#43a047', '#2e7d32'], ['#a9713f', '#7d5128'], ['#f0a04b', '#d97b1f'], ['#e5524a', '#b9362f']];
const PALETTE_B = [['#d94b3f', '#a92f27'], ['#f08a24', '#c96a10'], ['#2f4ea8', '#1c3175'], ['#e4622a', '#b8451a'], ['#f26b3a', '#c74a20']];
const mkTask = (id, title, count, doneIdx, palette, prefix, cover = '') => ({
  id, title, listId: 'L1', done: false, cover,
  steps: Array.from({ length: count }, (_, i) => ({
    id: `${id}-s${i}`, title: `${title}-步骤${i + 1}`,
    icon: svgIcon(palette[i % palette.length][0], palette[i % palette.length][1], `${prefix}${i + 1}`),
    done: doneIdx.includes(i)
  }))
});
// 演示用的「任务卡片背景图」：宽幅渐变，右侧留白给图标区
const coverImg = (c1, c2, label) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="260"><defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="900" height="260" fill="url(#c)"/><text x="60" y="150" font-size="64" font-weight="700" fill="rgba(255,255,255,.55)" font-family="Arial">${label}</text></svg>`
);
const g = { id: 'G1', name: '签到任务一', color: '#4f6ef7', collapsed: true };
const A = (n, done = [], cover = '') => mkTask('t1', '签到任务一', n, done, PALETTE_A, 'A', cover);
const B = (n, done = [], cover = '') => mkTask('t2', '签到任务二', n, done, PALETTE_B, 'B', cover);

/* ---------- 合并前：两张独立卡片 ---------- */
const plainCard = (t) => `<div class="task-item" data-task="${t.id}">
  <div class="task-head">
    <span class="checkbox"></span>
    <div class="task-main">
      <div class="task-title-row"><div class="task-title">${t.title}</div></div>
      <div class="task-meta"><span class="tag">🔁 手动重复</span><span class="tag steps">☑ 0/${t.steps.length}</span></div>
    </div>
    <div class="step-icons-row">${t.steps.map((s) => `<span class="step-icon"><img src="${s.icon}" alt=""></span>`).join('')}</div>
    <div class="task-actions"></div>
  </div>
</div>`;

/* ---------- 页面 ---------- */
const css = fs.readFileSync('src/styles.css', 'utf8');
const demoCss = `
  body { margin: 0; padding: 34px 28px 70px; background: #f3f6fc; }
  .demo-wrap { max-width: 1040px; margin: 0 auto; }
  h1 { font-size: 19px; color: #2b3245; margin: 0 0 8px; }
  .sub { font-size: 13px; color: #6b7488; margin: 0 0 24px; line-height: 1.8; }
  .demo-label { font-size: 13px; font-weight: 700; color: #4a5470; margin: 26px 0 10px; display: flex; align-items: center; gap: 8px; }
  .demo-label b { background: #4f6ef7; color: #fff; border-radius: 5px; padding: 2px 8px; font-size: 11px; }
  .demo-stage { padding: 16px; border-radius: 16px;
    background: linear-gradient(120deg, #cfe4fa 0%, #e8f0fb 45%, #f7e6c9 100%);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.7); }
  .demo-stage .task-item + .task-item { margin-top: 12px; }
  .note { font-size: 12px; color: #7b8499; margin-top: 10px; line-height: 1.8; }
  .legend { display: flex; gap: 18px; font-size: 12px; color: #5c6579; margin: 10px 0 0; flex-wrap: wrap; }
  .legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 5px; vertical-align: -2px; }
  .zone-title { font-size: 12px; font-weight: 700; color: #6b7488; letter-spacing: .5px; margin: 0 0 9px; }
  .zone-title:not(:first-child) { margin-top: 18px; padding-top: 12px; border-top: 1px dashed rgba(80,90,120,.25); }
`;
const scene = (label, badge, html, note) => `
  <div class="demo-label"><b>${badge}</b> ${label}</div>
  <div class="demo-stage">${html}</div>
  ${note ? `<div class="note">${note}</div>` : ''}`;
const zone = (title, body) => `<div class="zone-title">${title}</div>${body || '<div class="note">（空）</div>'}`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>FocusTodo · 合并卡片图标拼接效果预览</title>
<style>${css}
${demoCss}</style>
</head>
<body>
<div class="demo-wrap">
  <h1>合并卡片 · 图标拼接效果</h1>
  <p class="sub">演示用彩色方块代替你上传的 App 图标：<b style="color:#2f6fc0">A1–A5 = 签到任务一</b>，<b style="color:#c96a10">B1–B5 = 签到任务二</b>。<br>每个图标位由同序步骤按参与数纵向切分拼接；容器单行横向滚动、不平铺。<br>卡片右侧保留 ⭐ 标记重要 / 🍅 番茄钟（选成员）/ 💨 解散分组；已取消上传背景按钮和展开箭头。分组背景由组内各任务卡片背景按 1/n 高度拼接。按住图标区空白处可拖动滚动，按住图标可拖动排序。</p>
  <div class="legend"><span><i style="background:#2f6fc0"></i>任务一图标</span><span><i style="background:#c96a10"></i>任务二图标</span><span><i style="background:#e3f6ed"></i>已完成（✓）</span></div>

  ${scene('合并前：两张独立卡片，各 5 个图标', '合并前', plainCard(A(5)) + plainCard(B(5)), '')}

  ${scene('合并后：5 个图标位，上半 A、下半 B', '目标效果', render(g, [A(5), B(5)]), '图标位数量 = 单个任务的图标数，不再把 10 个图标全部平铺。')}

  ${scene('分组背景 = 组内任务卡片背景的拼接', '背景拼接',
    render(g, [A(5, [], coverImg('#2f6fc0', '#6fb1e8', '任务一背景')), B(5, [], coverImg('#c96a10', '#f0a860', '任务二背景'))]),
    '上半是任务一的卡片背景、下半是任务二的，和图标切片用同一套 1/n 规则；三个任务时自动各占 1/3。某个成员没设背景时那一条带留空，透出卡片底色。点卡片本身仍可展开。')}

  ${scene('数量不等：4 步 vs 5 步，多出的第 5 格不切割', '逻辑 1', render(g, [A(4), B(5)]), '前 4 格仍是上下拼接；第 5 格只有任务二有，独占整格完整显示。')}

  ${scene('部分完成：A1 已完成、B1 未完成', '逻辑 2', render(g, [A(5, [0]), B(5)]), 'B1 独占原来那一格（完整图标）；A1 变成独占的绿色 ✓ 完成图标，排到图标队列最后。')}

  ${scene('全部完成：A1 与 B1 都完成', '逻辑 3', render(g, [A(5, [0]), B(5, [0])]), '两位重新合并成 1 个绿色 ✓ 完成图标并排到末尾；内部仍按 1/2 切片，保证可分别点击/右键撤销。')}

  <h1 style="margin-top:42px">分组卡片在列表中的位置</h1>
  <p class="sub">以下是<b>整张卡片</b>在任务列表里的分区，和上面「图标行内完成图标排末尾」是两回事。图标逻辑完全没改动。</p>

  ${scene('任务一全部完成、任务二还有未完成 → 分组不拆开', '列表 1',
    zone('待办', render(g, [A(5, [0, 1, 2, 3, 4]), B(5)])) +
    zone('已完成', '<div class="note">这里不会出现分组卡，也不会把任务一单独移过来。分组仍是一整张、包含两个成员。</div>'),
    '原先的实现会把同一分组在「待办」「已完成」两区各渲染一次，甚至退化成两张普通任务卡；现在整组统一判定，不拆开。')}

  ${scene('两个任务全部完成 → 整张分组卡挪到列表最后', '列表 2',
    zone('待办', '') +
    zone('已完成', render(g, [A(5, [0, 1, 2, 3, 4]), B(5, [0, 1, 2, 3, 4])])),
    '只有组内所有成员都完成，整张卡才进入已完成区。应用默认「显示已完成」是开启的；若你手动关掉这个开关，则按原有设置隐藏。')}
  <div class="note" style="margin-top:22px">交互：<b>右键普通任务卡 → 🗂 创建分组（合并卡片）</b>；右键步骤图标仍然是快捷完成 / 撤销。合并卡片右键不弹菜单，分组操作走展开态 ⋯ 菜单与卡片上的 ⭐ / 🍅 / 💨 按钮；展开态组内成员卡 hover 时可用 ↩️ 移出分组。卡片右侧不再有常驻的分组按钮。另：右键菜单「点分组卡片展开后残留不消失」的 bug 已修复（关闭监听改到捕获阶段 pointerdown，并支持 Esc 关闭）。</div>
</div>
</body>
</html>`;

fs.writeFileSync('preview-group-standalone.html', html);
console.log('preview-group-standalone.html written, bytes:', html.length);
