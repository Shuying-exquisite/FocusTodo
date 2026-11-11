/* 验证：① 右键菜单关闭机制（捕获阶段 / 排除菜单内部 / Esc / 旧菜单清理）
         ② 分组右键菜单全部取消 + 任务卡新增 🗂/↩️ 按钮入口
   运行： node verify_context_menu.js                                          */
const fs = require('fs');
const src = fs.readFileSync('src/js/app.js', 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail !== undefined ? '  -> ' + JSON.stringify(detail) : ''}`); }
}

/* ---------- A. 静态结构断言 ---------- */
console.log('\n[A] 右键「创建分组」已恢复 / 卡片右侧按钮已移除');
check('showTaskContextMenu 已恢复（精简版）', src.includes('function showTaskContextMenu(taskId, x, y)'));
check('菜单项为 🗂 创建分组', src.includes('<button data-mkgroup>🗂 创建分组（合并卡片）</button>'));
check('已在分组内的任务不弹此菜单', src.includes('if (!t || t.groupId) return;'));
check('contextmenu handler 调用 showTaskContextMenu',
  src.includes('showTaskContextMenu(taskEl.dataset.task, e.clientX, e.clientY);'));
check('taskHTML 不再输出 🗂 创建分组按钮', !src.includes('data-groupcreate="${t.id}"'));
check('click 委托选择器不再含 data-groupcreate', !src.includes('[data-groupcreate]'));
check('click 委托不再有 groupcreate 分支', !src.includes('if (d.groupcreate)'));
check('组内成员卡仍保留 ↩️ 移出分组按钮', src.includes('data-groupleave="${t.id}"'));
check('↩️ 按钮不再是常驻 group-entry', !src.includes('icon-btn group-entry'));
check('click 委托有 removeFromGroup 分支', src.includes('if (d.groupleave) { e.stopPropagation(); return removeFromGroup(d.groupleave); }'));

console.log('\n[B] 所有菜单统一走 mountContextMenu');
check('5 个菜单函数都调用 mountContextMenu', (src.match(/const close = mountContextMenu\(menu\);/g) || []).length === 5,
  (src.match(/const close = mountContextMenu\(menu\);/g) || []).length);
check('旧的冒泡阶段 click 关闭模板已清零', !src.includes("document.addEventListener('click', close)"));
check('关闭监听注册在捕获阶段', src.includes("document.addEventListener('pointerdown', onDown, true)"));
check('支持 Esc 关闭', src.includes("if (e.key === 'Escape') close();"));
check('菜单内部点击不自动关闭', src.includes('if (!menu.contains(e.target)) close();'));

/* ---------- C. 真实函数行为（模拟 DOM） ---------- */
console.log('\n[C] mountContextMenu 行为（真实函数 + 模拟 DOM）');
const s0 = src.indexOf('  function dismissContextMenus()');
const e0 = src.indexOf('  function showGroupContextMenu', s0);
if (s0 < 0 || e0 < 0) throw new Error('无法定位菜单 helper');
const fnSrc = src.slice(s0, e0);

const listeners = [];
const doc = {
  _menus: [],
  querySelectorAll(sel) { return sel === '.context-menu' ? this._menus.slice() : []; },
  body: {
    appendChild(m) { doc._menus.push(m); m._inBody = true; }
  },
  addEventListener(type, fn, capture) { listeners.push({ type, fn, capture, active: true }); },
  removeEventListener(type, fn, capture) {
    const l = listeners.find((x) => x.type === type && x.fn === fn && x.capture === capture && x.active);
    if (l) l.active = false;
  }
};
const makeMenu = () => ({
  _removed: false, _inBody: false, _dismiss: null,
  contains(target) { return !!(target && target._owner === this); },
  remove() {
    this._removed = true;
    const i = doc._menus.indexOf(this); if (i >= 0) doc._menus.splice(i, 1);
  }
});
const { mountContextMenu, dismissContextMenus } = new Function(
  'document', 'setTimeout', fnSrc + '\nreturn { mountContextMenu, dismissContextMenus };'
)(doc, (fn) => fn());   // setTimeout 同步执行，便于断言

const active = (type) => listeners.filter((l) => l.type === type && l.active);
const fireDown = (target) => active('pointerdown').forEach((l) => l.fn({ target }));
const fireKey = (key) => active('keydown').forEach((l) => l.fn({ key }));

{
  const m = makeMenu();
  const close = mountContextMenu(m);
  check('菜单挂载到 body', m._inBody && doc._menus.includes(m));
  check('pointerdown 监听是捕获阶段（true）', active('pointerdown').length === 1 && active('pointerdown')[0].capture === true,
    active('pointerdown').map((l) => l.capture));
  check('keydown 监听是捕获阶段（true）', active('keydown').length === 1 && active('keydown')[0].capture === true);
  check('_dismiss 已挂在菜单上', m._dismiss === close);

  fireDown({ _owner: m });
  check('点击菜单内部不会关闭', !m._removed);
  fireKey('a');
  check('按普通键不会关闭', !m._removed);

  fireDown({});   // 点击外部
  check('点击外部立即关闭（不受 stopPropagation 影响）', m._removed);
  check('关闭后 pointerdown 监听已解绑', active('pointerdown').length === 0);
  check('关闭后 keydown 监听已解绑', active('keydown').length === 0);
}
{
  const m = makeMenu();
  mountContextMenu(m);
  fireKey('Escape');
  check('Esc 可关闭菜单', m._removed);
}
{
  const a = makeMenu(), b = makeMenu();
  mountContextMenu(a);
  mountContextMenu(b);
  check('挂载新菜单时旧菜单被关闭', a._removed && !b._removed);
  check('body 里只剩新菜单', doc._menus.length === 1 && doc._menus[0] === b);
  dismissContextMenus();
  check('dismissContextMenus 清掉当前菜单', b._removed && doc._menus.length === 0);
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
