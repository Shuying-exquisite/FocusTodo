'use strict';

const {
  app, BrowserWindow, ipcMain, dialog, shell,
  Notification, Tray, Menu, nativeImage
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// 禁用硬件加速，提升在远程桌面 / 无独立显卡 / 部分旧显卡环境的兼容性
app.disableHardwareAcceleration();

const isDev = !app.isPackaged;

let mainWindow = null;
let tray = null;
let forceQuit = false;

/* ---------------- 存储路径 ---------------- */
const USER_DIR = app.getPath('userData');
const DATA_FILE = path.join(USER_DIR, 'data.json');
const ATTACH_DIR = path.join(USER_DIR, 'attachments');

function readDataSync() {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) { return null; }
}

function ensureDirs() {
  try {
    if (!fs.existsSync(USER_DIR)) fs.mkdirSync(USER_DIR, { recursive: true });
    if (!fs.existsSync(ATTACH_DIR)) fs.mkdirSync(ATTACH_DIR, { recursive: true });
  } catch (e) {
    console.error('创建目录失败', e);
  }
}

/* ---------------- 应用图标 ---------------- */
function getIcon() {
  const icoPath = path.join(__dirname, '..', 'build', 'icon.ico');
  const pngPath = path.join(__dirname, 'assets', 'icon.png');
  if (fs.existsSync(icoPath)) return nativeImage.createFromPath(icoPath);
  if (fs.existsSync(pngPath)) return nativeImage.createFromPath(pngPath);
  return undefined;
}

/* ---------------- 主窗口 ---------------- */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: '#f6f7fb',
    title: 'FocusTodo 待办清单',
    icon: getIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      webviewTag: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // 外部链接用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (e) => {
    if (!forceQuit && tray) {
      const data = readDataSync();
      const minimizeToTray = data && data.settings ? data.settings.minimizeToTray : true;
      if (minimizeToTray) {
        e.preventDefault();
        mainWindow.hide();
        return;
      }
    }
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.webContents.on('before-input-event', (_e, input) => {
      if (input.key === 'F12') mainWindow.webContents.toggleDevTools();
    });
  }
}

/* ---------------- 托盘 ---------------- */
function createTray() {
  const icon = getIcon();
  if (!icon || icon.isEmpty()) return;
  try {
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
  } catch (e) {
    return;
  }
  const menu = Menu.buildFromTemplate([
    { label: '打开 FocusTodo', click: () => showMain() },
    { label: '快速开始番茄钟', click: () => { showMain(); send('tray:pomodoro'); } },
    { type: 'separator' },
    { label: '退出', click: () => { forceQuit = true; app.quit(); } }
  ]);
  tray.setToolTip('FocusTodo 待办清单');
  tray.setContextMenu(menu);
  tray.on('double-click', () => showMain());
}

function showMain() {
  if (!mainWindow) createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

/* ---------------- 单实例 ---------------- */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMain());

  app.whenReady().then(() => {
    ensureDirs();
    if (process.platform === 'win32') app.setAppUserModelId('com.focustodo.app');
    createWindow();
    createTray();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => { forceQuit = true; });

/* ---------------- IPC：数据读写 ---------------- */
ipcMain.handle('data:load', async () => {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('读取数据失败', e);
    // 损坏时备份
    try {
      fs.copyFileSync(DATA_FILE, DATA_FILE + '.broken-' + Date.now());
    } catch (_) {}
    return null;
  }
});

ipcMain.handle('data:save', async (_e, data) => {
  try {
    ensureDirs();
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
    return { ok: true };
  } catch (e) {
    console.error('保存失败', e);
    return { ok: false, error: String(e) };
  }
});

/* ---------------- IPC：附件（材料） ---------------- */
function safeName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
}

function importFile(srcPath) {
  ensureDirs();
  const base = safeName(path.basename(srcPath));
  const id = crypto.randomBytes(6).toString('hex');
  const destName = `${id}__${base}`;
  const dest = path.join(ATTACH_DIR, destName);
  fs.copyFileSync(srcPath, dest);
  let size = 0;
  try { size = fs.statSync(dest).size; } catch (_) {}
  return {
    id,
    name: base,
    path: dest,
    ext: path.extname(base).replace('.', '').toLowerCase(),
    size,
    addedAt: Date.now()
  };
}

ipcMain.handle('file:pick', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择材料文件',
    properties: ['openFile', 'multiSelections']
  });
  if (res.canceled) return [];
  return res.filePaths.map((p) => {
    try { return importFile(p); } catch (e) { return null; }
  }).filter(Boolean);
});

ipcMain.handle('file:import', async (_e, paths) => {
  const list = Array.isArray(paths) ? paths : [paths];
  return list.map((p) => {
    try { return importFile(p); } catch (e) { return null; }
  }).filter(Boolean);
});

ipcMain.handle('file:open', async (_e, p) => {
  if (!p) return { ok: false };
  const r = await shell.openPath(p);
  return { ok: !r, error: r };
});

// 仅选择本地文件/快捷方式并返回路径（用于超链接，不复制进附件）
ipcMain.handle('link:browse', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择本地文件或快捷方式',
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return { ok: false };
  return { ok: true, path: res.filePaths[0] };
});

ipcMain.handle('file:reveal', async (_e, p) => {
  if (p && fs.existsSync(p)) shell.showItemInFolder(p);
  return { ok: true };
});

ipcMain.handle('file:delete', async (_e, p) => {
  try {
    if (p && p.startsWith(ATTACH_DIR) && fs.existsSync(p)) fs.unlinkSync(p);
    return { ok: true };
  } catch (e) {
    return { ok: false };
  }
});

ipcMain.handle('link:open', async (_e, url) => {
  if (!url) return { ok: false };
  let u = String(url).trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
  if (!/^(https?|mailto|ftp|file):/i.test(u)) return { ok: false };
  await shell.openExternal(u);
  return { ok: true };
});

/* ---------------- IPC：图标（网页 favicon / 本地图片） ---------------- */
function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method: opts.method || 'GET', timeout: opts.timeout || 12000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(new URL(res.headers.location, u).href, opts).then(resolve).catch(reject);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function fetchFaviconBase64(pageUrl) {
  try {
    let u = String(pageUrl).trim();
    if (!u) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
    const page = new URL(u);
    if (!/^(https?):/i.test(page.protocol)) return null;

    // 1. 先取页面 HTML，解析 link[rel*="icon"]
    try {
      const { buffer, headers } = await fetchUrl(page.href, { timeout: 8000 });
      const html = buffer.toString('utf8');
      const ct = (headers['content-type'] || '').toLowerCase();
      if (ct.includes('text/html')) {
        const m = html.match(/<link[^>]*rel=["']?([^"'>\s]*icon[^"'>\s]*)["']?[^>]*>/i)
                 || html.match(/<link[^>]*[^>]*rel=["']?shortcut icon["']?[^>]*>/i);
        if (m && m[0]) {
          const hrefm = m[0].match(/href=["']([^"']+)["']/i);
          if (hrefm && hrefm[1]) {
            const iconUrl = new URL(hrefm[1], page).href;
            const { buffer: ibuf, headers: ihdr } = await fetchUrl(iconUrl, { timeout: 8000 });
            const mime = ihdr['content-type'] || 'image/x-icon';
            if (ibuf.length > 0) return `data:${mime};base64,${ibuf.toString('base64')}`;
          }
        }
      }
    } catch (_) {}

    // 2. 回退到 /favicon.ico
    try {
      const iconUrl = new URL('/favicon.ico', page).href;
      const { buffer: ibuf, headers: ihdr } = await fetchUrl(iconUrl, { timeout: 8000 });
      if (ibuf.length > 0) {
        const mime = ihdr['content-type'] || 'image/x-icon';
        return `data:${mime};base64,${ibuf.toString('base64')}`;
      }
    } catch (_) {}
  } catch (_) {}
  return null;
}

ipcMain.handle('icon:favicon', async (_e, url) => {
  const dataUrl = await fetchFaviconBase64(url);
  return { ok: !!dataUrl, dataUrl };
});

ipcMain.handle('icon:pick', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择图标图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp'] }]
  });
  if (res.canceled || !res.filePaths.length) return { ok: false };
  return { ok: true, path: res.filePaths[0] };
});

/* ---------------- IPC：通知 / 窗口 ---------------- */
ipcMain.handle('notify:show', async (_e, { title, body, silent }) => {
  if (!Notification.isSupported()) return { ok: false };
  const n = new Notification({
    title: title || 'FocusTodo',
    body: body || '',
    silent: silent !== false,
    icon: getIcon()
  });
  n.on('click', () => showMain());
  n.show();
  return { ok: true };
});

ipcMain.handle('win:flash', async () => {
  if (mainWindow) {
    mainWindow.flashFrame(true);
    setTimeout(() => mainWindow && mainWindow.flashFrame(false), 4000);
  }
  return { ok: true };
});

ipcMain.handle('win:show', async () => { showMain(); return { ok: true }; });
ipcMain.handle('win:minimize', async () => { mainWindow && mainWindow.minimize(); return { ok: true }; });
ipcMain.handle('win:maximize', async () => {
  if (!mainWindow) return { ok: false };
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  return { ok: true };
});
ipcMain.handle('win:setAlwaysOnTop', async (_e, flag) => {
  if (mainWindow) mainWindow.setAlwaysOnTop(!!flag);
  return { ok: true };
});

/* ---------------- IPC：备份 / 恢复 ---------------- */
ipcMain.handle('backup:export', async (_e, data) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: '导出备份',
    defaultPath: `focustodo-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (res.canceled || !res.filePath) return { ok: false };
  fs.writeFileSync(res.filePath, JSON.stringify(data, null, 2), 'utf8');
  return { ok: true, path: res.filePath };
});

ipcMain.handle('backup:import', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '导入备份',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (res.canceled || !res.filePaths[0]) return { ok: false };
  try {
    const data = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8'));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: '文件解析失败' };
  }
});

ipcMain.handle('app:info', async () => ({
  version: app.getVersion(),
  userDir: USER_DIR,
  dataFile: DATA_FILE
}));

ipcMain.handle('app:openUserDir', async () => {
  await shell.openPath(USER_DIR);
  return { ok: true };
});
