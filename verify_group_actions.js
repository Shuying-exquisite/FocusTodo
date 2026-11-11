/* 验证合并卡片新增能力：封面/星标/操作按钮/拖动位标记，以及整格同步重排算法。
   运行： node verify_group_actions.js                                          */
const fs = require('fs');
const src = fs.readFileSync('src/js/app.js', 'utf8');

/* ---------- 抽取真实 groupMergedHTML ---------- */
const s0 = src.indexOf('  function groupMergedHTML');
const e0 = src.indexOf('\n  // 展开态', s0);
if (s0 < 0 || e0 < 0) throw new Error('无法定位 groupMergedHTML');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stepIconContent = (s) => s.done ? '✓' : (s.icon || Array.from(s.title)[0] || '·');
const render = new Function('esc', 'stepIconContent', 'groupAggTags', 'resolveGroupColor', 'sel',
  src.slice(s0, e0) + '\nreturn groupMergedHTML;')(
  esc, stepIconContent, () => [], () => '#4f6ef7', { taskId: null }
);

/* ---------- 抽取真实 reorderGroupStepSlots ---------- */
const s1 = src.indexOf('  function reorderGroupStepSlots');
const e1 = src.indexOf('\n  function ', s1 + 10);
if (s1 < 0 || e1 < 0) throw new Error('无法定位 reorderGroupStepSlots');
const makeReorder = (Store) => new Function('Store',
  src.slice(s1, e1) + '\nreturn reorderGroupStepSlots;')(Store);

const mkSteps = (p, n, done = []) => Array.from({ length: n }, (_, i) => ({
  id: `${p}${i}`, title: `${p}-步骤${i + 1}`, icon: '', done: done.includes(i)
}));
const mkTask = (id, n, done = [], cover = '') => ({ id, title: id, groupId: 'G1', listId: 'L1', done: false, cover, steps: mkSteps(id, n, done) });
const mkGroup = (extra = {}) => ({ id: 'G1', name: '签到任务一', color: '#4f6ef7', collapsed: true, star: false, ...extra });

function makeStore(A, B) {
  const data = { tasks: [A, B], groups: [mkGroup()] };
  return {
    data, saves: 0,
    group(id) { return data.groups.find((g) => g.id === id) || null; },
    membersOf(id) { return data.tasks.filter((t) => t.groupId === id); },
    save() { this.saves++; }
  };
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail !== undefined ? '  -> ' + JSON.stringify(detail) : ''}`); }
}

/* ---------- [1] 操作按钮：取消上传背景 / 展开箭头 ---------- */
{
  const html = render(mkGroup(), [mkTask('A', 5), mkTask('B', 5)]);
  console.log('\n[1] 合并卡片按钮');
  check('已取消 📷 上传背景按钮', !html.includes('data-groupcover='));
  check('已取消 🧽 清除背景按钮', !html.includes('data-groupcoverclear='));
  check('已取消 ▸ 展开分组按钮', !html.includes('group-caret'));
  check('保留 ⭐ 标记重要', html.includes('data-groupstar="G1"'));
  check('保留 🍅 番茄钟', html.includes('data-grouppomo="G1"'));
  check('保留 💨 解散分组', html.includes('data-groupdisband="G1"'));
  check('点卡片仍可展开（data-grouptoggle 在 task-head）', html.includes('data-grouptoggle="G1"'));
  check('没有删除任务按钮', !html.includes('data-del='));
}

/* ---------- [2] 分组背景 = 成员任务封面拼接 ---------- */
{
  const A = mkTask('A', 5, [], 'data:image/png;base64,AAA');
  const B = mkTask('B', 5, [], 'data:image/png;base64,BBB');
  const html = render(mkGroup({ star: true }), [A, B]);
  console.log('\n[2] 分组背景由成员封面按 1/n 高度拼接');
  check('卡片带 group-has-cover', html.includes('group-collapsed group-has-cover'), html.slice(0, 220));
  check('2 个封面切片', (html.match(/class="group-cover-slice"/g) || []).length === 2, (html.match(/class="group-cover-slice"/g) || []).length);
  check('上半来自任务 A 的封面', html.includes("clip-path:inset(0.0000% 0 50.0000% 0);background-image:url('data:image/png;base64,AAA')"));
  check('下半来自任务 B 的封面', html.includes("clip-path:inset(50.0000% 0 0.0000% 0);background-image:url('data:image/png;base64,BBB')"));
  check('不再注入 --task-cover（分组无自有封面）', !html.includes('--task-cover'), html.slice(0, 260));
  check('星标仍正常（实心 ★）', html.includes('star-btn on') && html.includes('>★<'));
}
{
  const onlyA = render(mkGroup(), [mkTask('A', 5, [], 'data:image/png;base64,AAA'), mkTask('B', 5)]);
  console.log('\n[2b] 只有部分成员设了封面');
  check('只生成 1 个切片', (onlyA.match(/class="group-cover-slice"/g) || []).length === 1);
  check('仍按 2 个成员算条带（A 占上半 0/50）', onlyA.includes('clip-path:inset(0.0000% 0 50.0000% 0)'));
  check('卡片仍标记 group-has-cover', onlyA.includes('group-has-cover'));
}
{
  const three = render(mkGroup(), [
    mkTask('A', 5, [], 'data:image/png;base64,AAA'),
    mkTask('B', 5, [], 'data:image/png;base64,BBB'),
    mkTask('C', 5, [], 'data:image/png;base64,CCC')
  ]);
  console.log('\n[2c] 3 个成员各占 1/3');
  check('3 个切片', (three.match(/class="group-cover-slice"/g) || []).length === 3);
  check('0/66.67、33.33/33.33、66.67/0',
    three.includes('clip-path:inset(0.0000% 0 66.6667% 0)') &&
    three.includes('clip-path:inset(33.3333% 0 33.3333% 0)') &&
    three.includes('clip-path:inset(66.6667% 0 0.0000% 0)'));
}
{
  const none = render(mkGroup(), [mkTask('A', 5), mkTask('B', 5)]);
  console.log('\n[2d] 成员都没有封面');
  check('不生成 group-cover', !none.includes('class="group-cover"'));
  check('不标记 group-has-cover', !none.includes('group-has-cover'));
}

/* ---------- [3] 可拖动的图标位标记 ---------- */
{
  const html = render(mkGroup(), [mkTask('A', 5), mkTask('B', 5)]);
  console.log('\n[3] 图标位拖动标记');
  check('5 个可拖图标位', (html.match(/data-groupstep="G1"/g) || []).length === 5, (html.match(/data-groupstep="G1"/g) || []).length);
  check('slot 为 0..4', ['0', '1', '2', '3', '4'].every((n) => html.includes(`data-slot="${n}"`)));
  check('可拖位 draggable=true', (html.match(/class="step-icon stacked " draggable="true"/g) || []).length === 5);

  const partial = render(mkGroup(), [mkTask('A', 5, [0]), mkTask('B', 5)]);
  console.log('\n[3b] 部分完成时完成图标不可拖');
  check('完成图标无 data-groupstep', (partial.match(/class="step-icon stacked done" draggable="false"/g) || []).length === 1);
  check('其余 5 个正常位可拖', (partial.match(/data-groupstep="G1"/g) || []).length === 5);
}

/* ---------- [4] 整格同步重排 ---------- */
{
  const A = mkTask('A', 5), B = mkTask('B', 5);
  const st = makeStore(A, B);
  const reorder = makeReorder(st);
  const ids = (t) => t.steps.map((s) => s.id).join(',');
  console.log('\n[4] 拖整格 → 所有成员任务同步移动，拼接位序保持对齐');
  const n = reorder('G1', 0, 3, false);
  check('两个成员都被改动', n === 2, n);
  check('A: A0 移到索引 3', ids(A) === 'A1,A2,A3,A0,A4', ids(A));
  check('B: B0 同步移到索引 3', ids(B) === 'B1,B2,B3,B0,B4', ids(B));
  check('位序仍对齐（A[i] 与 B[i] 序号一致）',
    A.steps.every((s, i) => s.id.slice(1) === B.steps[i].id.slice(1)), [ids(A), ids(B)]);
  check('触发保存', st.saves === 1, st.saves);
}

/* ---------- [5] before / 反向 / 步骤数不等 ---------- */
{
  const A = mkTask('A', 5), B = mkTask('B', 5);
  const reorder = makeReorder(makeStore(A, B));
  console.log('\n[5] before=true 与反向拖动');
  reorder('G1', 0, 3, true);
  check('A: A0 落在索引 2', A.steps.map((s) => s.id).join(',') === 'A1,A2,A0,A3,A4', A.steps.map((s) => s.id).join(','));
  const A2 = mkTask('A', 5), B2 = mkTask('B', 5);
  makeReorder(makeStore(A2, B2))('G1', 4, 1, true);
  check('反向：A4 落在索引 1', A2.steps.map((s) => s.id).join(',') === 'A0,A4,A1,A2,A3', A2.steps.map((s) => s.id).join(','));

  const A3 = mkTask('A', 5), B3 = mkTask('B', 3);
  const st3 = makeStore(A3, B3);
  const changed3 = makeReorder(st3)('G1', 4, 0, true);
  console.log('\n[5b] 步骤数不等（5 步 vs 3 步）');
  check('只有 A 被改动', changed3 === 1, changed3);
  check('A0..A4 完整保留', A3.steps.map((s) => s.id).join(',') === 'A4,A0,A1,A2,A3', A3.steps.map((s) => s.id).join(','));
  check('B 原样不动', B3.steps.map((s) => s.id).join(',') === 'B0,B1,B2', B3.steps.map((s) => s.id).join(','));
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
