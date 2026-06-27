# CAD AI Studio

AI 驱动的参数化 3D 建模工具：用自然语言描述零件，由 LLM 生成 CadQuery 代码，后端执行后导出 STEP，前端在浏览器里直接渲染。

![Stack](https://img.shields.io/badge/React_19-TypeScript-blue) ![Stack](https://img.shields.io/badge/FastAPI-CadQuery-green) ![Stack](https://img.shields.io/badge/Three.js-STEP_Rendering-orange)

---

## 功能概览

- **AI 对话建模（Chat 模式）**：自然语言 → CadQuery 代码 → STEP → 浏览器渲染。
- **Agent 编码模式**：基于 [opencode](https://opencode.ai) 本地 headless server，每个对话拥有独立的 `cadquery.py`，模型只允许编辑该文件。
- **图纸/草图输入**：Agent 可接收上传图片，转发给 opencode 作为输入用 file part。
- **执行反馈闭环**：CadQuery 失败时把错误回喂给同一个 Agent 会话，最多自动修复 2 轮。
- **质量门禁 Skill**：仓库自带 `cadquery-studio` / `cad-vision-brief` 两个 opencode skill，强制做需求覆盖、参数安全、几何稳定性检查。
- **STEP 渲染**：服务端 OpenCascade 导出 → 前端 `occt-import-js`（WASM）解析 → Three.js 渲染。
- **交互特性**：面 hover 高亮、参数拖动实时改尺寸、内置代码编辑器（`Ctrl+Enter` 执行）、视角快捷键、模型历史、运行时改 API 配置、导出 STEP / 截图。

---

## 架构

普通对话流：

```text
用户输入 → Chat Provider → CadQuery 代码
       → 后端子进程执行 → 导出 STEP
       → 前端拉取 STEP → occt-import-js 解析 → Three.js 渲染
```

Agent 流：

```text
用户输入 → /api/agent/ws → 后端代理 → opencode headless server
       → OpenAI 兼容 Gateway
       → generated/agent_sessions/<conversation>/cadquery.py
       → 后端执行该文件 → 成功则渲染 STEP
       → 失败把错误回喂给同一 opencode session 自动修复
```

opencode 的工作目录与本仓库源码隔离；通过权限配置只允许编辑 `**/cadquery.py`，禁用 shell / web fetch。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19、TypeScript、Vite、Tailwind CSS 4 |
| 3D | Three.js（`@react-three/fiber` + drei）、`occt-import-js` (WASM) |
| 状态管理 | Zustand |
| 后端 | Python 3.12+、FastAPI、WebSocket |
| CAD 内核 | CadQuery 2.7 / OpenCascade |
| AI Chat | OpenAI 兼容 Gateway |
| Code Agent | opencode headless server + OpenAI 兼容 provider |

---

## 部署：本地开发模式

整个系统会同时跑 3 个本地进程：**Backend (FastAPI)**、**Frontend (Vite)**、**opencode serve**。

### 1. 前置依赖

| 工具 | 版本 | 备注 |
|---|---|---|
| Node.js | 20+ | 前端构建与 opencode 安装 |
| Python | 3.12+ | 后端 |
| Conda | 任意 | 安装 CadQuery 最稳的方式 |
| opencode | 最新 | Agent 模式必需 |
| LLM API Key | — | OpenAI 兼容（项目默认对接 mimo Gateway，可换 DeepSeek / OpenAI / Claude 兼容路由） |

安装 opencode（任选其一）：

```bash
# 推荐
curl -fsSL https://opencode.ai/install | bash

# macOS Homebrew
brew install sst/tap/opencode

# 或 npm
npm install -g opencode-ai@latest
```

校验：

```bash
opencode --version
```

### 2. 克隆仓库

```bash
git clone <repo-url> CAD-studio
cd CAD-studio
```

### 3. 后端：CadQuery + Python 依赖

CadQuery 依赖 OpenCascade，强烈推荐 conda 安装：

```bash
conda create -n cad python=3.12 -y
conda activate cad
conda install -c cadquery cadquery=2.7 -y

cd packages/backend
pip install -e .
cd ../..
```

也可以纯 pip（CadQuery 在某些平台编译会失败，仅供参考）：

```bash
cd packages/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
pip install cadquery
cd ../..
```

### 4. 前端依赖

```bash
cd packages/frontend
npm install
cd ../..
```

### 5. 配置环境变量与模型清单

```bash
cp .env.example .env
cp models.example.json models.json
```

#### 5.1 `.env`

打开根目录的 `.env`，至少改这两类：

```env
# Agent 模式连接到本地 opencode serve
OPENCODE_ENABLED=true
OPENCODE_BASE_URL=http://127.0.0.1:4096
# 本机不需要 host 路径翻译，留空即可（仅 Docker 跨进程时需要）
OPENCODE_HOST_ROOT=

# Backend
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000
DATABASE_URL=sqlite+aiosqlite:///./cad_studio.db

# Frontend dev server 通过 Vite 反代到后端，下面两项一般不用改
VITE_API_URL=http://127.0.0.1:8000
VITE_WS_URL=ws://127.0.0.1:8000
```

> 不要使用 `0.0.0.0` 作为浏览器访问地址，浏览器对它的 WebSocket 行为不一致；用 `127.0.0.1`。

#### 5.2 `models.json`（推荐）

每个模型一条记录，独立的 `base_url` 与 `api_key`，前端会把全部模型都列到下拉里，opencode 也会按它们生成 provider：

```json
{
  "default": "deepseek-v4-pro",
  "models": [
    {
      "id": "deepseek-v4-pro",
      "name": "DeepSeek V4 Pro",
      "base_url": "https://api.deepseek.com",
      "api_key": "sk-your-deepseek-key",
      "vision": true
    }
  ]
}
```

如果不写 `models.json`，会回退到 `.env` 里的 `GATEWAY_URL` / `GATEWAY_API_KEY` / `GATEWAY_MODELS` 这套单 provider 兜底配置。

### 6. 启动三件套

打开三个终端：

**Terminal 1 — 后端（端口 8000）**

```bash
cd packages/backend
conda activate cad        # 或 source .venv/bin/activate
uvicorn src.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir src
```

> `--reload-dir src` 必须保留：避免 agent 写 `generated/` 产物时误触发热重启把 WebSocket 打断。

**Terminal 2 — opencode 服务（端口 4096）**

```bash
bash scripts/opencode.sh
```

该脚本会：

1. 找到 opencode 二进制（PATH 优先，回退到 `.tools/bin/opencode`）；
2. 读取 `.env` 与 `models.json`，调用 [scripts/gen_opencode_config.py](file:///Users/bytedance/code/CAD-studio/scripts/gen_opencode_config.py) 生成 `packages/backend/generated/agent_sessions/opencode.json`；
3. 用 `OPENCODE_CONFIG` 指向该文件后启动 `opencode serve`。

**Terminal 3 — 前端（端口 5173）**

```bash
cd packages/frontend
npm run dev
```

### 7. 验证联通性

```bash
curl http://127.0.0.1:8000/api/health        # 后端
curl -I http://127.0.0.1:5173/               # 前端
curl http://127.0.0.1:4096/global/health     # opencode
```

浏览器打开：

```text
http://127.0.0.1:5173/
```

进入页面后：

- `CAD` 标签：自然语言生成 CAD 模型。
- `Agent` 标签：调用 opencode，建模过程会有工具调用、修复轮次的实时反馈。
- 右上角齿轮按钮：运行时切换 API URL / Key / 模型。

---

## 使用速查

| 操作 | 方法 |
|---|---|
| 自然语言生成模型 | `CAD` 标签 → 输入需求 |
| 调用 Agent | 切到 `Agent` → 输入需求，可附图 |
| 继续上一轮 Agent | 在同一会话里继续聊，会复用同一 `cadquery.py` 与 opencode session |
| 展开折叠的长输出 | 点击「展开全部 / 收起」 |
| 调参 | 右侧 ParameterPanel 拖动滑块 |
| 手改代码 | 切到 Code 标签，改完 `Ctrl+Enter` 执行 |
| 切换视角 | 顶部方向按钮或鼠标 orbit |
| 高亮面 | 鼠标 hover 模型表面 |
| 导出 STEP | 底部工具栏 Export |
| 截图 | 底部工具栏 Screenshot |
| 配置 API | 顶部齿轮图标 |

---

## Agent 模式细节

### 工作机制

- 每个会话在 `packages/backend/generated/agent_sessions/<conversation>/` 下有一个独立目录。
- 目录里只有一个可编辑文件：`cadquery.py`；opencode 的权限配置（写在 `opencode.json` 里）禁止写其它文件、禁止 shell、禁止 webfetch。
- 多轮记忆由 opencode session 自己保管，后端只维护 `conversation_id ↔ opencode_session_id` 的映射。
- CadQuery 执行失败时，后端把报错塞回同一个 opencode session，最多 2 轮自动修复后再渲染。
- 上传的图片以 `file` part 转发给 opencode，仅作为输入。

### 关键 `.env` 项

| Key | 含义 |
|---|---|
| `OPENCODE_ENABLED` | `false` 时回退到旧的 in-process Anthropic 循环（不推荐） |
| `OPENCODE_BASE_URL` | 后端 → opencode server 的地址。本机一律 `http://127.0.0.1:4096` |
| `OPENCODE_PROVIDER_BASE_URL` | 可选：覆盖 opencode 用的模型网关地址；留空即继承 `GATEWAY_URL` / `AGENT_BASE_URL` |
| `OPENCODE_PROVIDER_ID` | 写入 `opencode.json` 的 provider key，默认 `cadgw` |
| `OPENCODE_HOST_ROOT` | 仅当 backend 在容器、opencode 在宿主机时需要：宿主机侧 `agent_sessions` 的绝对路径 |

### Skill 文件

仓库内自带两个 opencode skill：

- [.opencode/skills/cadquery-studio/SKILL.md](file:///Users/bytedance/code/CAD-studio/.opencode/skills/cadquery-studio/SKILL.md) —— CadQuery 建模与修复的硬性约定（参数表、构造策略、质量门禁）。
- [.opencode/skills/cad-vision-brief/SKILL.md](file:///Users/bytedance/code/CAD-studio/.opencode/skills/cad-vision-brief/SKILL.md) —— 把图纸/截图/草图整理成结构化 CAD brief。

opencode 启动时会自动加载它们，无需额外注册。

---

## API 一览

| Method | Path | 说明 |
|---|---|---|
| WS | `/api/chat/ws` | Chat 流式输出 + CAD 执行 |
| WS | `/api/agent/ws` | opencode 驱动的 Agent 会话 |
| POST | `/api/cad/execute` | 直接执行 CadQuery 代码 |
| POST | `/api/cad/update-params` | 用新参数重新执行 |
| GET | `/api/chat/models` | 列出可用模型 |
| GET | `/api/settings` | 读取当前 API 配置 |
| PUT | `/api/settings` | 运行时更新 API 配置（写回 `.env`） |
| GET | `/api/health` | 健康检查 |
| GET | `/assets/*` | 提供生成的 STEP / glTF |

---

## 排错

### `ModuleNotFoundError: No module named 'pydantic_settings'`

后端依赖没装到当前环境：

```bash
conda activate cad   # 或 source .venv/bin/activate
cd packages/backend
pip install -e .
```

### Agent 一直在 `Connecting`

逐项检查：

```bash
curl http://127.0.0.1:8000/api/health
curl -I http://127.0.0.1:5173/
curl http://127.0.0.1:4096/global/health
```

任一失败先把对应进程修好；前端打不开就硬刷新。

### Agent 一直停在 `Agent is working`

如果 UI 还在持续打印工具调用，说明 Agent 还在跑（建模 + 渲染 + 修复链路本来就比纯聊天慢）。如果几分钟没有任何新事件，看 backend 终端的日志。

### Agent 接口返回 404

模型网关地址必须是 OpenAI 兼容的 base URL，例如：

```env
GATEWAY_URL=https://token-plan-sgp.xiaomimimo.com/v1
```

不要把它配成 Anthropic 的 `/anthropic/messages` 之类的具体路径；`OPENCODE_BASE_URL` 只是本地 opencode server 的地址，模型网关用 `GATEWAY_URL` 或 `OPENCODE_PROVIDER_BASE_URL`。

### 端口被占用

```bash
lsof -i :8000 -sTCP:LISTEN
lsof -i :5173 -sTCP:LISTEN
lsof -i :4096 -sTCP:LISTEN
kill <PID>
```

### opencode 配置生成失败

`scripts/opencode.sh` 调用 `gen_opencode_config.py` 时若提示「没有可用模型」，说明 `models.json` 里所有条目都缺 `base_url` 或 `api_key`，且 `.env` 里也没有可兜底的 `GATEWAY_*`。补好至少一个完整模型再启动。

---

## 目录结构

```text
CAD-studio/
├── .opencode/
│   └── skills/
│       ├── cadquery-studio/        CadQuery 建模/修复 skill
│       └── cad-vision-brief/       图纸 → CAD brief skill
├── packages/
│   ├── frontend/                   React 19 + Vite + TypeScript
│   │   └── src/
│   │       ├── components/
│   │       │   ├── layout/         TopNav / AppShell / Sidebar / RightPanel / MainViewport
│   │       │   ├── viewport/       Canvas3D、ModelViewer
│   │       │   ├── chat/           ChatPanel、AgentPanel、可折叠输出
│   │       │   ├── parameters/     ParameterPanel
│   │       │   └── common/         SettingsModal
│   │       ├── stores/             Zustand 状态
│   │       ├── hooks/              useWebSocket
│   │       ├── services/           stepLoader
│   │       └── types/              TS 类型
│   └── backend/                    FastAPI
│       ├── generated/              STEP / glTF 输出 + agent_sessions
│       └── src/
│           ├── api/                chat / agent / cad / settings / health
│           ├── services/
│           │   ├── ai/             gateway provider + system prompts
│           │   ├── cad/            子进程执行 + STEP 导出
│           │   └── opencode/       opencode 配置、session 资产、HTTP/SSE client
│           ├── models/             Pydantic schema
│           └── config.py
├── scripts/
│   ├── opencode.sh                 启动 opencode serve
│   └── gen_opencode_config.py      读 models.json/.env 生成 opencode.json
├── .env.example
├── models.example.json
├── docker-compose.yml              （可选，未在本 README 维护，按需自行调整）
└── README.md
```

---

## License

MIT
