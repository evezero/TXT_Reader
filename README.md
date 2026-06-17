# TXT Reader (摸鱼阅读器) 🐟

一个专为 PC 端沉浸式阅读和“摸鱼”打造的极简 TXT 电子书阅读器。基于 [Tauri v2](https://v2.tauri.app/) 和 React + Vite 构建，拥有极高的性能、极小的体积和原生的桌面体验。

## ✨ 核心特性 (Features)

1. **📚 智能书架系统 (Bookshelf)**
   - 自动记录阅读历史与进度，下次打开无缝续读。
   - 支持创建无限层级的文件夹，分门别类管理你的小说库。
   - 面包屑导航与一键返回上一级。

2. **📖 沉浸式阅读体验 (Immersive Reading)**
   - 自动解析章节目录（支持“第X章”、“Volume”等常见网文格式），生成侧边栏大纲。
   - 自定义阅读样式：包括字号、行距、字体、段落缩进等。
   - 多种主题无缝切换（包含暗黑模式、羊皮纸等护眼模式）。
   - 高性能虚拟滚动技术，几十 MB、上百万字的超大 TXT 文件也能秒开无卡顿。

3. **✍️ 所见即所得编辑 (Live Edit)**
   - 发现错别字？直接鼠标点击文中的任意段落，像记事本一样原地修改！
   - 失去焦点后，软件会在后台自动将修改静默保存回硬盘中的原 txt 文件。

4. **🐟 终极摸鱼模式 (Boss Key)**
   - 点击顶部工具栏最右侧的 `🐟` 按钮进入摸鱼模式。
   - 窗口瞬间缩小至单行文字大小（支持拖拽调整）。
   - 隐藏一切边框、状态栏、工具栏，仅保留纯文本。
   - **自动置顶**，绝不会被其他工作软件遮挡。
   - 老板来了？只需轻按 `Esc` 键，瞬间恢复原状并退出置顶！

5. **📦 极致单文件 (Single Executable)**
   - 无需繁琐的安装包，开箱即用。
   - 编译后仅为一个十几 MB 的单执行文件，完全绿色便携。

## 🛠️ 构建指引 (Build Instructions)

本项目使用 Tauri 框架，如果你想要自己克隆源码并编译：

### 1. 环境准备
你需要安装以下环境：
- [Node.js](https://nodejs.org/) (推荐 v18+)
- [Rust](https://www.rust-lang.org/) (推荐最新 stable)
- 对于 Windows 用户，还需要安装 C++ 编译工具链 (Visual Studio C++ Build Tools)

### 2. 安装依赖
```bash
npm install
```

### 3. 本地运行调试
```bash
npm run tauri dev
```

### 4. 编译打包 (生成单文件 exe)
```bash
npm run tauri build
```
编译完成后，生成的可执行文件位于：`src-tauri/target/release/txt-reader.exe`

## 🗂️ 项目结构 (Project Structure)
- `src/`: React 前端代码，包含所有界面组件、虚拟滚动、阅读器核心逻辑。
- `src-tauri/`: Rust 后端代码，包含与操作系统的交互逻辑（如文件读写、修改原文件、窗口权限配置等）。
- `src/utils/structureParser.ts`: 核心正则解析模块，用于对 txt 文本进行章节拆分。

## 📄 许可证 (License)
MIT License
