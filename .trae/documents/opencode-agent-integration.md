# 用 opencode 替换 Agent 模式（后端代理方案）

## Context（背景与目标）

当前 Agent 模式 [agent.py](file:///Users/bytedance/code/CAD-studio/packages/backend/src/api/agent.py) 是一套**自建的 in-process agent 循环**：用 `anthropic` SDK 直连 Mimo/DeepSeek 端点，自己维护多轮历史（`_histories`/`_trim_history`）、工具循环（`read_cad`/`write_cad`/`render_cad`）、流式翻译和自动修复。

用户希望**直接复用开源项目 [opencode](https://github.com/anomalyco/opencode)** 作为 Agent 引擎，借助它成熟的 agent 能力（规划、文件编辑、上下文管理），而不再自己维护这套循环。

经确认的三项决策：
1. **拓扑：后端代理**。后端拉起/连接 opencode 的 headless server，把它的 SSE 事件翻译成现有 `agent_*` WebSocket 协议。**前端 [AgentPanel.tsx](file:///Users/bytedance/code/CAD-studio/packages/frontend/src/components/chat/AgentPanel.tsx) 不改动**。
2. **渲染反馈：复用后端执行 + 外层修复**。opencode 只负责改 `cadquery.py`；后端在每轮结束后调用现有 [execute_cadquery](file:///Users/bytedance/code/CAD-studio/packages/backend/src/services/cad/executor.py#L145) 渲染，失败则把错误作为新 prompt 发回 opencode 修复（最多 2 轮）。
3. **权限：严格限制到 cadquery.py**。用 opencode 的 `permission` 配置禁掉 shell/webfetch，编辑只允许 `**/cadquery.py`，保留现有沙箱语义。

预期结果：Agent 模式行为对用户基本无感（同样的流式思考/工具/渲染/自动修复 UI），但底层引擎换成 opencode。

---

## 关键外部事实（已核实）

- opencode server：`opencode serve --port 4096 --hostname 127.0.0.1`，暴露 OpenAPI 3.1（`/doc`）。
- 核心端点：
  - `POST /session` body `{ parentID?, title? }` → 返回 `Session`（含 `id`）。
  - `POST /session/:id/prompt_async` body `{ model?, agent?, system?, parts }` → `204`，**不阻塞**，结果通过 SSE 推送。`model` 形如 `"<providerID>/<modelID>"`，`parts` 形如 `[{ "type": "text", "text": "..." }]`。
  - `GET /event` → 全局 SSE 事件流，首事件 `server.connected`，随后是 bus 事件。
  - `POST /session/:id/abort` → 中断。
- 请求级目录隔离：多数端点支持 `directory` 查询参数（也可用 `x-opencode-directory` header）把操作限定到 project 下的子目录。
- SSE 关键事件（字段以 `/doc` 实际为准，实现时对照 `http://127.0.0.1:4096/doc` 校验）：
  - `message.part.updated`：携带 `part`，`part.type ∈ {text, reasoning, tool}`、`part.sessionID`、`part.messageID`、`part.id`。text/reasoning 为**全量快照**（需自行 diff 出增量）；tool 含 `state`（`pending`/`running`/`completed`/`error`）、`tool`（工具名）、`input`、`output`。
  - `session.idle`：该 session 一轮结束。
  - `session.error`：出错。
- 配置文件 `opencode.json`：自定义 provider 用 `@ai-sdk/*` npm 包 + `options.baseURL/apiKey`；`permission` 支持按 glob 控制 `edit`，以及 `bash`/`webfetch` 等开关。
- 本地安装：`npm install -g opencode-ai@latest` 或 `brew install anomalyco/tap/opencode`。
- 存在第三方 Python SDK（`ai4pa-opencode-sdk`），但**本方案不依赖它**——直接用项目已有的 `httpx` 调 HTTP + SSE，避免新增不可控依赖。

---

## 实施步骤

### 1. 配置项（[config.py](file:///Users/bytedance/code/CAD-studio/packages/backend/src/config.py) + `.env.example`）

在 `Settings` 增加：
```python
opencode_enabled: bool = True          # 开关：True 用 opencode，False 回退旧 in-process 循环
opencode_base_url: str = "http://127.0.0.1:4096"
opencode_provider_id: str = "cadgw"    # opencode.json 里自定义 provider 的 id
```
Provider 的 baseURL/key/model 复用现有字段：`agent_base_url`、`anthropic_api_key or gateway_api_key`、`default_model`。在 `.env.example` 补充注释说明这三项新配置。

### 2. 生成 opencode 运行目录与配置（新模块 `services/opencode/provision.py`）

opencode server 启动时 rooted 在某个 **project 根目录**。设根目录为 `generated/agent_sessions/`（复用现有 [_session_dir](file:///Users/bytedance/code/CAD-studio/packages/backend/src/api/agent.py#L71) 的父目录），每个会话是其下子目录 `<conversation_id>/`。

提供函数：
- `opencode_root() -> Path`：返回 `generated/agent_sessions/`，确保存在。
- `write_root_config()`：把 `opencode.json` 写到根目录（**启动时从 `.env` 生成，不入库**）：
  ```json
  {
    "$schema": "https://opencode.ai/config.json",
    "provider": {
      "<opencode_provider_id>": {
        "npm": "@ai-sdk/anthropic",
        "options": { "baseURL": "<agent_base_url>", "apiKey": "<key>" },
        "models": { "<default_model>": {} }
      }
    },
    "model": "<opencode_provider_id>/<default_model>",
    "permission": {
      "edit": { "**/cadquery.py": "allow", "**": "deny" },
      "bash": "deny",
      "webfetch": "deny"
    }
  }
  ```
  > Mimo/DeepSeek 都是 Anthropic 兼容端点，故用 `@ai-sdk/anthropic`。若后续换 OpenAI 兼容端点，则改 `@ai-sdk/openai-compatible`。
- `ensure_session_assets(conversation_id)`：在子目录写入 `AGENTS.md`（由现有 [system_cad_agent.md](file:///Users/bytedance/code/CAD-studio/packages/backend/src/services/ai/prompts/system_cad_agent.md) 内容改写，强调"只编辑本目录 cadquery.py，把最终模型赋值给 `result`"）并用 [_ensure_cadquery_file](file:///Users/bytedance/code/CAD-studio/packages/backend/src/api/agent.py#L75) 等价逻辑保证 `cadquery.py` 存在。返回该 `cadquery.py` 路径。

### 3. opencode 客户端封装（新模块 `services/opencode/client.py`）

基于 `httpx.AsyncClient`，封装：
- `create_session(directory) -> session_id`：`POST /session?directory=<dir>`。
- `prompt(session_id, text, directory)`：`POST /session/:id/prompt_async?directory=<dir>`，body `{ "model": "<provider>/<model>", "parts": [{"type":"text","text":text}] }`。
- `abort(session_id)`。
- `events()`：异步生成器，`GET /event` 流式读取 SSE，逐条 `yield` 解析后的事件 dict。

会话映射：模块级 `_sessions: dict[str, str]`（`conversation_id -> opencode session_id`），复用 opencode 自身的多轮记忆，**移除**旧的 `_histories`/`_trim_history`/`MAX_HISTORY_MESSAGES`。

### 4. 重写 Agent WebSocket 处理（[agent.py](file:///Users/bytedance/code/CAD-studio/packages/backend/src/api/agent.py)）

保留 `/ws` 入口、`agent_request` 协议、心跳、`_send_status` 和**所有 `agent_*` 事件名**。把 `_run_agent_turn` 内部改为 opencode 流程：

1. `settings.opencode_enabled` 为 False 时走旧逻辑（保留旧函数做回退）。
2. 准备：`write_root_config()` 已在启动时跑过；`ensure_session_assets(conversation_id)` 得到 `cad_file`；取/建 opencode session。
3. 发 `agent_start`，起心跳任务（复用现有 `send_heartbeat`）。
4. 订阅 `events()`，再 `prompt(...)`，进入事件循环直到收到本 session 的 `session.idle`/`session.error`：
   - 维护 `dict[part_id -> last_text]` 做增量 diff。
   - `message.part.updated` + `text` → 计算增量发 `agent_text_delta`；part 结束时发 `agent_text_done`。
   - `message.part.updated` + `reasoning` → 增量发 `agent_thinking_delta`。
   - `message.part.updated` + `tool`：`state=running/pending` 首次出现 → `agent_tool_use`（`name`=工具名，`input`=part.input）；`state=completed/error` → `agent_tool_result`（`output`、`is_error`）。**工具名映射**：在后端把 opencode 的 `write`/`edit`/`read` 等映射成现有 `write_cad`/`read_cad` 风格 label（或直接透传，前端 `TOOL_LABELS` 缺失时回退原名）。当检测到编辑了 `cadquery.py` 的工具完成时，读文件内容发 `agent_code`，保持代码面板实时更新。
   - `session.error` → `agent_error` 并结束本轮。
5. `session.idle` 后：调用**复用**的 [_render_cadquery_file](file:///Users/bytedance/code/CAD-studio/packages/backend/src/api/agent.py#L487)（发 `agent_code`/`agent_cad_executing`/`agent_cad_result`/`agent_cad_error`）。
6. 渲染失败 → 改造后的 `_auto_render_and_repair`：把错误文本作为新 `prompt(...)` 发给同一 opencode session（替代原 anthropic 循环），再次等 `session.idle` 后重渲染，最多 `MAX_CAD_REPAIR_TURNS`(=2) 轮。发 `agent_repair_start`。
7. 收尾发 `agent_done`（`return_code` 0/1）。断连时 `abort` 当前 session。

> `execute_cadquery`、`_render_cadquery_file`、`_send_status`、心跳、`_safe_conversation_id`、`_session_dir` 全部复用，不重写。

### 5. opencode 进程（本地手动跑 + 启动校验）

- 用户决定本地手动运行，因此**不改 Docker**。新增 [scripts/opencode.sh](file:///Users/bytedance/code/CAD-studio/scripts)：`cd packages/backend/generated/agent_sessions && opencode serve --port 4096 --hostname 127.0.0.1 --cors http://localhost:5173`（端口/CORS 从环境变量读，带默认值）。
- 后端启动时（[main.py](file:///Users/bytedance/code/CAD-studio/packages/backend/src/main.py) lifespan 或 startup）调用 `write_root_config()`，并对 `opencode_base_url + /global/health` 做一次探活：不可达只打 warning（不阻塞启动），Agent 首次请求若连不上则发 `agent_error` 提示"请先运行 scripts/opencode.sh"。
- README 增补一节"Agent 模式依赖 opencode"：安装命令、启动脚本、provider 说明。

### 6. 前端

无需改动即可工作。可选增强：给 [AgentPanel.tsx](file:///Users/bytedance/code/CAD-studio/packages/frontend/src/components/chat/AgentPanel.tsx#L54) 的 `TOOL_LABELS` 补充 opencode 工具名（如 `write`/`edit`/`read`/`bash`）的中文 label。若步骤 4 已在后端做名称映射，则前端可不动。

---

## 关键改动文件清单

| 文件 | 改动 |
|---|---|
| [config.py](file:///Users/bytedance/code/CAD-studio/packages/backend/src/config.py) | 新增 `opencode_enabled`/`opencode_base_url`/`opencode_provider_id` |
| `services/opencode/provision.py` | 新建：生成根 `opencode.json`、会话目录与 `AGENTS.md` |
| `services/opencode/client.py` | 新建：httpx 封装 session/prompt/abort + SSE `events()` |
| [agent.py](file:///Users/bytedance/code/CAD-studio/packages/backend/src/api/agent.py) | 重写 `_run_agent_turn`/`_auto_render_and_repair` 为 opencode 流程；保留协议、心跳、渲染复用；移除 `_histories` 系列；保留旧逻辑做回退 |
| [main.py](file:///Users/bytedance/code/CAD-studio/packages/backend/src/main.py) | 启动时 `write_root_config()` + opencode 探活 |
| `scripts/opencode.sh` | 新建：本地启动 opencode serve |
| `.env.example` / README | 新增配置与运行说明 |
| [AgentPanel.tsx](file:///Users/bytedance/code/CAD-studio/packages/frontend/src/components/chat/AgentPanel.tsx) | 可选：补充工具名 label |

---

## 验证方式（端到端）

1. **安装**：`npm install -g opencode-ai@latest`，`opencode --version` 确认。
2. **起 opencode**：`bash scripts/opencode.sh`，浏览器开 `http://127.0.0.1:4096/doc` 确认 OpenAPI 可访问；`curl http://127.0.0.1:4096/global/health` 返回 `{healthy:true,...}`。
3. **起后端 + 前端**：照现有 [scripts/dev.sh](file:///Users/bytedance/code/CAD-studio/scripts/dev.sh) 启动。
4. **golden path**：切到「代码智能体」面板，发"做一个带四个安装孔的法兰盘"。预期：看到思考流 → 工具调用（编辑 cadquery.py）→ 代码面板更新 → 自动渲染 → 3D 视口出现模型、参数面板出现滑块。
5. **修复路径**：发一个易出错需求（如"圆角半径设成 999 的盒子"）触发渲染失败，确认出现 `agent_repair_start` 且 opencode 自动修复后重渲成功。
6. **沙箱校验**：发"用 shell 列出当前目录文件"或"读取 ../.env"，确认 opencode 因 permission 拒绝（不应执行 bash、不应编辑非 cadquery.py 文件）。
7. **多轮记忆**：连续两条指令（先建盒子，再"把高度改成 2 倍"），确认第二条基于第一条结果修改。
8. **回退开关**：设 `OPENCODE_ENABLED=false` 重启后端，确认旧 in-process 循环仍可用。
9. **断连**：运行中关闭前端标签页，确认后端 `abort` 了 opencode session（不残留运行）。

## 风险与注意

- **SSE 字段名跨版本差异**：`message.part.updated` 的 part 结构需对照实际 `/doc` 校验；实现时先 `curl -N http://127.0.0.1:4096/event` 抓一轮真实事件再定字段。
- **provider 包**：Mimo/DeepSeek 是 Anthropic 兼容 → `@ai-sdk/anthropic`；若端点实为 OpenAI 兼容会鉴权失败，需改 `@ai-sdk/openai-compatible`。首次联调要确认。
- **directory 隔离**：若目标 opencode 版本不支持 `directory` 查询参数按子目录隔离，退化方案为"每会话独立 server 进程"或"单一工作目录 + 会话切换前同步 cadquery.py"；首次联调用 `?directory=` 验证。
- **key 泄露**：`opencode.json` 含明文 key，写在 `generated/`（应在 `.gitignore` 内），确认不被提交。
