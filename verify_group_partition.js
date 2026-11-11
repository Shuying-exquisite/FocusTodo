/* 从真实 app.js 抽取 viewTasks() 与分组渲染段，注入最小依赖，验证「分组不拆开 / 全部完成再挪到最后」。
   运行： node verify_group_partition.js                                            */
const fs = require('fs');
const src = fs.readFileSync('src/js/app.js', 'utf8');

const vStart = src.indexOf('  function viewTasks() {');
const vEnd = src.indexOf('\n  function viewMeta()', vStart);
const rStart = src.indexOf('    // 按分组渲染：分组作为一个整体');
const rEnd = src.indexOf("\n    $('taskList').innerHTML = html;", rStart);
if ([vStart, vEnd, rStart, rEnd].some((x) => x < 0)) throw new Error('无法定位待测代码段');
const viewTasksSrc = src.slice(vStart, vEnd);
const renderSrc = src.slice(rStart, rEnd);

const startOfDay = (ts) => Math.floor(ts / 86400000) * 86400000;
const Store = { list: (id) => ({ id, archived: false }) };
const makeViewTasks = new Function('D', 'view', 'search', 'Store', 'startOfDay',
  viewTasksSrc + '\nreturn viewTasks;');
const makeRender = new Function('D', 'pool', 'active', 'done', 'showDone', 'view',
  'taskHTML', 'groupMergedHTML', 'groupExpandedHTML', renderSrc + '\nreturn html;');

const taskHTML = (t) => `<T:${t.id}>`;
const groupMergedHTML = (g, m) => `<G:${g.id}:${m.map((x) => x.id).join('+')}>`;
const groupExpandedHTML = (g, m) => `<GE:${g.id}:${m.map((x) => x.id).join('+')}>`;

const mkTask = (id, groupId, done, order, due = null) => ({
  id, groupId, done, order, due,
  doneAt: done ? 1000 + order : null,
  title: id, note: '', links: [], files: [], steps: [], listId: 'L1',
  star: false, repeat: 'none'
});
const groups = [{ id: 'G1', name: '签到任务一', collapsed: true }];

function run(tasks, view = { type: 'list', key: 'L1' }, settings = { sortBy: 'manual', showDone: true }) {
  const D = () => ({ tasks, groups, settings });
  const vt = makeViewTasks(D, view, '', Store, startOfDay)();
  const showDone = settings.showDone || view.key === 'done';
  const html = makeRender(D, vt.pool, vt.active, vt.done, showDone, view,
    taskHTML, groupMergedHTML, groupExpandedHTML);
  return { html, ...vt };
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail !== undefined ? '  -> ' + JSON.stringify(detail) : ''}`); }
}
const countG = (h) => (h.match(/<G:G1/g) || []).length;

// 场景 1：任务1 全部完成、任务2 未完成 → 分组不拆开
{
  const t1 = mkTask('t1', 'G1', true, 1);
  const t2 = mkTask('t2', 'G1', false, 2);
  const t3 = mkTask('t3', '', false, 3);
  const r = run([t1, t2, t3]);
  console.log('\n[1] 任务1 全完成、任务2 未完成（+1 个独立任务）');
  check('pool 含全部 3 个任务', r.pool.length === 3, r.pool.length);
  check('active = t2+t3，done = t1', r.active.map((x) => x.id).join(',') === 't2,t3' && r.done.map((x) => x.id).join(',') === 't1');
  check('只渲染 1 张分组卡（没被拆成两张）', countG(r.html) === 1, r.html);
  check('分组卡包含两个成员 t1+t2', r.html.includes('<G:G1:t1+t2>'), r.html);
  check('已完成任务 t1 没有被单独渲染', !r.html.includes('<T:t1>'), r.html);
  check('独立任务 t3 正常显示', r.html.includes('<T:t3>'), r.html);
  check('分组卡留在待办区（在「已完成」标题之前）', r.html.indexOf('<G:G1') < r.html.indexOf('已完成'), r.html);
}

// 场景 2：两个任务都完成 → 整张分组卡移到已完成区（列表最后）
{
  const t1 = mkTask('t1', 'G1', true, 1);
  const t2 = mkTask('t2', 'G1', true, 2);
  const t3 = mkTask('t3', '', false, 3);
  const r = run([t1, t2, t3]);
  console.log('\n[2] 组内全部完成 → 整卡挪到列表最后');
  check('只渲染 1 张分组卡', countG(r.html) === 1, r.html);
  check('分组卡仍包含两个成员', r.html.includes('<G:G1:t1+t2>'), r.html);
  check('分组卡出现在「已完成」区之后', r.html.indexOf('<G:G1') > r.html.indexOf('已完成'), r.html);
  check('待办区只剩独立任务 t3', r.html.indexOf('<T:t3>') < r.html.indexOf('已完成'), r.html);
}

// 场景 3：完成状态变化不改变成员顺序（图标拼接位序稳定）
{
  const a = run([mkTask('t1', 'G1', false, 1), mkTask('t2', 'G1', false, 2)]);
  const b = run([mkTask('t1', 'G1', true, 1), mkTask('t2', 'G1', false, 2)]);
  const c = run([mkTask('t1', 'G1', true, 1), mkTask('t2', 'G1', true, 2)]);
  console.log('\n[3] 成员顺序按 order 固定');
  check('未完成时为 t1+t2', a.html.includes('<G:G1:t1+t2>'), a.html);
  check('部分完成时仍为 t1+t2', b.html.includes('<G:G1:t1+t2>'), b.html);
  check('全部完成时仍为 t1+t2', c.html.includes('<G:G1:t1+t2>'), c.html);
}

// 场景 4：已完成视图下不显示「半个分组」，也不破坏一键重置的行为
{
  const t1 = mkTask('t1', 'G1', true, 1);
  const t2 = mkTask('t2', 'G1', false, 2);
  const rPartial = run([t1, t2], { type: 'smart', key: 'done' });
  const rAll = run([t1, mkTask('t2', 'G1', true, 2)], { type: 'smart', key: 'done' });
  console.log('\n[4] 已完成视图');
  check('done 视图下 active 仍为空（未破坏原有过滤）', rPartial.active.length === 0, rPartial.active.length);
  check('pool 仍含未完成的同组成员 t2', rPartial.pool.some((x) => x.id === 't2'), rPartial.pool.map((x) => x.id));
  check('未全完成时不显示半个分组', countG(rPartial.html) === 0 && !rPartial.html.includes('<T:t1>'), rPartial.html);
  check('全完成时显示完整分组卡', rAll.html.includes('<G:G1:t1+t2>'), rAll.html);
}

// 场景 5：智能视图过滤导致组内可见成员不足时，不得误删 groupId
{
  const t1 = mkTask('t1', 'G1', false, 1, Date.now() - 86400000);
  const t2 = mkTask('t2', 'G1', false, 2, null);
  run([t1, t2], { type: 'smart', key: 'today' });
  console.log('\n[5] 视图过滤导致成员不足');
  check('t1.groupId 仍保留（分组关系未被破坏）', t1.groupId === 'G1', t1.groupId);
  check('t2.groupId 仍保留', t2.groupId === 'G1', t2.groupId);
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
