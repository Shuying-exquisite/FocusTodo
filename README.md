# FocusTodo · 待办清单

多任务表 · 步骤化拆解 · 番茄钟 · 常用工具箱，一款本地优先的桌面待办应用。

数据全部保存在本机，不上传云端，隐私可控。

## 功能特性

- **多任务表**：支持建立多个任务表，列表可拖拽排序。
- **步骤化拆解**：任务可拆成步骤（Steps），步骤下再细分小步骤（SubSteps），进度一目了然。
- **重复提醒**：任务支持「每天 / 每周 / 每月」重复，列表自动显示 🔁 标记。
- **富内容任务**：任务与步骤可添加超链接、备注图片，重要信息一眼可见。
- **番茄钟**：内置番茄钟，专注计时与任务联动。
- **常用工具箱**：收藏网页与本地程序（exe / lnk），支持三种图标（网页 favicon / 上传图片 / Emoji），可分组、拖拽排序、**跨分组拖拽**，并能自定义图标与背景。
- **本地存储**：所有数据保存在本机 `%APPDATA%/FocusTodo/data.json`，无账号、无联网。

## 技术栈

- [Electron](https://www.electronjs.org/) 31.x（桌面运行时）
- [electron-builder](https://www.electron.build/) 24.x（Windows NSIS 安装包）
- 原生 HTML / CSS / JavaScript（渲染进程，无前端框架）
- Node.js

## 目录结构

```
FocusTodo/
├── build/                  # 打包资源
│   ├── appRunning.nsh      # 安装/卸载前结束旧进程的 NSIS 脚本
│   ├── icon.ico            # 应用图标
│   └── gen_icon.py         # 图标生成脚本
├── src/                    # 应用源码
│   ├── main.js             # Electron 主进程
│   ├── preload.js          # 预加载脚本（暴露本地能力给渲染进程）
│   ├── index.html          # 入口页面
│   ├── styles.css          # 样式
│   ├── assets/             # 静态资源（图标等）
│   └── js/
│       ├── app.js          # 渲染进程主逻辑（UI / 交互 / 工具箱）
│       ├── state.js        # 数据层（任务表、任务、步骤、子步骤）
│       ├── pomodoro.js     # 番茄钟
│       └── audio.js        # 提示音
├── package.json
├── .gitignore
├── LICENSE
└── README.md
```

## 环境要求

- Node.js 18+（开发/打包依赖）
- Windows 10/11（当前提供 Windows 安装包；Electron 本身支持跨平台，如需 macOS / Linux 可自行调整打包配置）

## 本地运行（开发模式）

```bash
npm install
npm start
```

## 打包安装程序

```bash
npm run dist
```

打包完成后，安装程序位于 `dist/FocusTodo-Setup-<version>.exe`，便携版解压目录位于 `dist/win-unpacked/`。

> 打包前请确保已退出正在运行的 FocusTodo（含系统托盘图标），避免 `dist` 目录被占用导致构建失败。

## 数据存储位置

- 运行数据：`%APPDATA%/FocusTodo/data.json`
- 卸载时默认保留用户数据（`deleteAppDataOnUninstall: false`），如需彻底清除请手动删除该目录。

## 许可证

[MIT](./LICENSE) © 2026 shuyingynag
