/* 从真实 app.js 中抽取 groupMergedHTML，注入最小依赖，验证合并卡片的图标拼接逻辑。
   运行： node verify_group_render.js                                        */
const fs = require('fs');

const src = fs.readFileSync('src/js/app.js', 'utf8');
const start = src.indexOf('  function groupMergedHTML');
const end = src.indexOf('\n  // 展开态', start);
if (start < 0 || end < 0) throw new Error('无法定位 groupMergedHTML');
const fnSrc = src.slice(start, end);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stepIconContent = (s) => s.done ? '✓' : (s.icon || Array.from(s.title)[0] || '·');
const groupAggTags = () => [];
const resolveGroupColor = () => '#4f6ef7';
const sel = { taskId: null };

const groupMergedHTML = new Function(
  'esc', 'stepIconContent', 'groupAggTags', 'resolveGroupColor', 'sel',
  fnSrc + '\nreturn groupMergedHTML;'
)(esc, stepIconContent, groupAggTags, resolveGroupColor, sel);

const mkTask = (id, title, count, doneIdx = []) => ({
  id, title, listId: 'L1', done: false,
  steps: Array.from({ length: count }, (_, i) => ({
    id: `${id}-s${i}`, title: `${title}-步骤${i + 1}`, icon: '', done: doneIdx.includes(i)
  }))
});
const g = { id: 'G1', name: '签到任务一', color: '#4f6ef7', collapsed: true };

function parse(html) {
  return html.split('<span class="step-icon stacked').slice(1).map((seg) => ({
    done: /^\s+done/.test(seg),
    slices: (seg.match(/class="icon-slice/g) || []).length,
    clips: [...seg.matchAll(/clip-path:inset\(([^)]*)\)/g)].map((m) => m[1]),
    checks: (seg.match(/✓/g) || []).length
  }));
}

const HALF_TOP = '0.0000% 0 50.0000% 0';
const HALF_BOT = '50.0000% 0 0.0000% 0';
const FULL = '0.0000% 0 0.0000% 0';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + JSON.stringify(detail) : ''}`); }
}

// 场景 1：两个任务各 5 步，全未完成 → 5 个图标位，每个上下各半
{
  const r = parse(groupMergedHTML(g, [mkTask('t1', '任务一', 5), mkTask('t2', '任务二', 5)]));
  console.log('\n[1] 2 任务 x 5 步，全未完成');
  check('图标位 = 5', r.length === 5, r.length);
  check('每位 2 个切片', r.every((x) => x.slices === 2), r.map((x) => x.slices));
  check('每位上/下半各 1/2', r.every((x) => x.clips[0] === HALF_TOP && x.clips[1] === HALF_BOT), r[0].clips);
  check('无完成图标', r.every((x) => !x.done), r.map((x) => x.done));
}

// 场景 2：任务一 4 步、任务二 5 步，多出来的第 5 格不切割
{
  const r = parse(groupMergedHTML(g, [mkTask('t1', '任务一', 4), mkTask('t2', '任务二', 5)]));
  console.log('\n[2] 4 步 vs 5 步，多出的图标不切割');
  check('图标位 = 5', r.length === 5, r.length);
  check('前 4 位仍是上下拼接', r.slice(0, 4).every((x) => x.slices === 2), r.slice(0, 4).map((x) => x.slices));
  check('第 5 位只有 1 个切片', r[4].slices === 1, r[4].slices);
  check('第 5 位占满整格（不切割）', r[4].clips[0] === FULL, r[4].clips);
}

// 场景 3：任务一第 1 步完成、任务二第 1 步未完成
{
  const r = parse(groupMergedHTML(g, [mkTask('t1', '任务一', 5, [0]), mkTask('t2', '任务二', 5)]));
  console.log('\n[3] 部分完成：任务一第1步完成、任务二第1步未完成');
  check('共 6 个图标（5 正常 + 1 完成）', r.length === 6, r.length);
  check('第 1 格由未完成步骤独占且占满', r[0].slices === 1 && r[0].clips[0] === FULL && !r[0].done, r[0]);
  check('中间 4 格仍上下拼接', r.slice(1, 5).every((x) => x.slices === 2), r.slice(1, 5).map((x) => x.slices));
  check('完成图标独占一格并显示 ✓', r[5].done && r[5].slices === 1 && r[5].checks === 1, r[5]);
  check('完成图标排在最末尾', r[5].done && r.slice(0, 5).every((x) => !x.done), r.map((x) => x.done));
}

// 场景 4：两个任务的第 1 步都完成 → 重新合并成一个完成图标并排末尾
{
  const r = parse(groupMergedHTML(g, [mkTask('t1', '任务一', 5, [0]), mkTask('t2', '任务二', 5, [0])]));
  console.log('\n[4] 全部完成：两位都完成，重新合并成一个完成图标');
  check('共 5 个图标（4 正常 + 1 合并完成）', r.length === 5, r.length);
  check('前 4 格上下拼接', r.slice(0, 4).every((x) => x.slices === 2), r.slice(0, 4).map((x) => x.slices));
  check('末尾是 1 个合并完成图标', r[4].done, r[4]);
  check('合并图标内含 2 个切片（各自可点击）', r[4].slices === 2, r[4].slices);
  check('合并图标显示 2 个 ✓', r[4].checks === 2, r[4].checks);
  check('合并图标排在最末尾', r.slice(0, 4).every((x) => !x.done), r.map((x) => x.done));
}

// 场景 5：三个任务各 5 步，全未完成 → 每格上/中/下各 1/3
{
  const r = parse(groupMergedHTML(g, [mkTask('t1', '任务一', 5), mkTask('t2', '任务二', 5), mkTask('t3', '任务三', 5)]));
  console.log('\n[5] 3 任务：每格各 1/3');
  check('图标位 = 5', r.length === 5, r.length);
  check('每位 3 个切片', r.every((x) => x.slices === 3), r.map((x) => x.slices));
  check('切片为 0/66.67、33.33/33.33、66.67/0',
    r[0].clips[0] === '0.0000% 0 66.6667% 0' &&
    r[0].clips[1] === '33.3333% 0 33.3333% 0' &&
    r[0].clips[2] === '66.6667% 0 0.0000% 0', r[0].clips);
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
