# DramaFork Creative Workspace (Replica)

全栈可运行的互动内容创作工作台，包含 **Chat 创意讨论（SSE 流式）**、**Brief 结构化简报**、**Studio 分支剧本编辑与实时 AI 试玩**，以及本地 Node API 代理与数据持久化。

## 快速启动

### 方式一：生产模式一键运行（已含预构建 `dist/`，无需额外依赖）
```bash
node server/index.mjs
```
启动后直接浏览器访问：`http://127.0.0.1:3001`

### 方式二：开发模式（热更新）
```bash
npm install
npm run dev
```
开发模式下访问：`http://127.0.0.1:5173`（`/api` 自动代理至 `http://127.0.0.1:3001`）

## 接入真实大模型

1. 点击工作台右上角 **Connect AI / 配置大模型** 或左下角齿轮图标。
2. 选择预设服务商（OpenAI、DeepSeek、OpenRouter、通义千问 Qwen、硅基流动 SiliconFlow、本地 Ollama 或自定义 OpenAI 兼容接口）。
3. 填入 API Key，点击 **Test connection** 验证通过后保存即可。
4. 配置保存在本地 `data/config.json`，项目历史保存在 `data/workspace-db.json`。

## 目录结构

```text
├── server/index.mjs       # 本地 Node 后端（API 代理、SSE 流式、静态托管、文件持久化）
├── src/
│   ├── api/client.ts      # 前后端接口与 SSE 客户端
│   ├── components/        # Sidebar / ChatPanel / BriefPanel / StudioPanel / SettingsModal
│   ├── data/              # 3 种创作类型 Brief Schema 与中英双语字典
│   └── styles/            # 暗夜紫调工作台样式系统
├── dist/                  # 预构建的前端静态产物
└── package.json
```
