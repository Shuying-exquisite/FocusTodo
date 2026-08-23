'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

function pathForFile(file) {
  try {
    if (webUtils && typeof webUtils.getPathForFile === 'function') {
      return webUtils.getPathForFile(file);
    }
  } catch (_) {}
  return file && file.path ? file.path : null;
}

contextBridge.exposeInMainWorld('api', {
  /* 数据 */
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),

  /* 材料附件 */
  pickFiles: () => ipcRenderer.invoke('file:pick'),
  importFiles: (paths) => ipcRenderer.invoke('file:import', paths),
  openFile: (p) => ipcRenderer.invoke('file:open', p),
  revealFile: (p) => ipcRenderer.invoke('file:reveal', p),
  deleteFile: (p) => ipcRenderer.invoke('file:delete', p),
  pathForFile,

  /* 超链接 */
  openLink: (url) => ipcRenderer.invoke('link:open', url),
  pickLink: () => ipcRenderer.invoke('link:browse'),

  /* 图标 */
  fetchFavicon: (url) => ipcRenderer.invoke('icon:favicon', url),
  pickIcon: () => ipcRenderer.invoke('icon:pick'),

  /* 通知与窗口 */
  notify: (opts) => ipcRenderer.invoke('notify:show', opts),
  flash: () => ipcRenderer.invoke('win:flash'),
  showWindow: () => ipcRenderer.invoke('win:show'),
  minimize: () => ipcRenderer.invoke('win:minimize'),
  maximize: () => ipcRenderer.invoke('win:maximize'),
  setAlwaysOnTop: (f) => ipcRenderer.invoke('win:setAlwaysOnTop', f),

  /* 备份 */
  exportBackup: (data) => ipcRenderer.invoke('backup:export', data),
  importBackup: () => ipcRenderer.invoke('backup:import'),

  /* 应用信息 */
  appInfo: () => ipcRenderer.invoke('app:info'),
  openUserDir: () => ipcRenderer.invoke('app:openUserDir'),

  /* 托盘事件 */
  onTrayPomodoro: (cb) => ipcRenderer.on('tray:pomodoro', () => cb())
});
