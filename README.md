# CAD AI Studio

AI-powered parametric 3D modeling system. Describe a shape in natural language, get precise CadQuery geometry rendered in the browser.

![Stack](https://img.shields.io/badge/React_19-TypeScript-blue) ![Stack](https://img.shields.io/badge/FastAPI-CadQuery-green) ![Stack](https://img.shields.io/badge/Three.js-STEP_Rendering-orange)

## Features

- **AI Chat** - Describe a 3D model in text; AI generates parametric CadQuery code and renders it.
- **Code Agent** - Agent mode runs opencode as a local headless server against an isolated per-conversation `cadquery.py` file, using an OpenAI-compatible gateway.
- **Agent Image Input** - Agent prompts can include uploaded reference images. The app forwards them to opencode as input-only file parts.
- **CAD Execution Feedback** - Agent-generated CadQuery is executed by the backend; failures are fed back into the same agent session for automatic repair.
- **CAD Skill Quality Gates** - The bundled `cadquery-studio` opencode skill enforces requirement coverage, parameter safety, geometry stability, and render-based repair.
- **Collapsed Long Output** - Long chat, Agent, tool, and thinking outputs are previewed by default and can be expanded on demand.
- **STEP Rendering** - Industrial-grade B-Rep geometry via OpenCascade, parsed client-side with `occt-import-js` (WASM).
- **Face Hover Highlight** - Hover model faces to see boundary edges and face info.
- **Parameter Editing** - Sliders and inputs tweak model dimensions in real time.
- **Code Editor** - View, edit, and execute CadQuery code directly (`Ctrl+Enter`).
- **View Controls** - Quick direction buttons: Front/Back/Left/Right/Top/Bottom/Iso.
- **Model History** - Generated models appear in the sidebar for quick access.
- **Runtime Settings** - Configure API URL, key, and models from the UI.
- **Export** - Download models as STEP files; screenshot viewport as PNG.

## Architecture

Normal chat flow:

```text
User prompt -> AI chat provider -> CadQuery Python code
    -> Backend executes in subprocess -> STEP file exported
    -> Frontend fetches STEP -> occt-import-js parses -> Three.js renders
```

Agent flow:

```text
User prompt -> /api/agent/ws -> backend proxy -> opencode headless server
    -> OpenAI-compatible gateway
    -> isolated generated/agent_sessions/<conversation>/cadquery.py
    -> Backend executes cadquery.py -> success renders STEP
    -> failure is sent back into the agent loop for repair, then re-executed
```

The Agent directory is intentionally separate from this repository's source tree. In opencode mode, the agent is permitted to edit only the session `cadquery.py` file.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4 |
| 3D | Three.js via `@react-three/fiber` + drei, `occt-import-js` (WASM) |
| State | Zustand |
| Backend | Python 3.12+, FastAPI, WebSocket |
| CAD Kernel | CadQuery 2.7 / OpenCascade |
| AI Chat | OpenAI-compatible gateway |
| Code Agent | opencode headless server with OpenAI-compatible provider config |

## Quick Start

### Prerequisites

- **Node.js** 20+
- **Python** 3.12+ (3.13 is also OK if CadQuery/OCP installs cleanly)
- **CadQuery** with OpenCascade/OCP
- An **OpenAI-compatible API key** for normal chat and Agent mode

Agent mode uses opencode as a local headless server. No Claude Code CLI is required.

### 1. Clone

```bash
git clone <repo-url> cad
cd cad
```

### 2. Backend Setup

```bash
cd packages/backend

# Option A: conda, usually the easiest path for CadQuery
conda create -n cad python=3.12 -y
conda activate cad
conda install -c cadquery cadquery=2.7 -y
pip install fastapi "uvicorn[standard]" websockets pydantic pydantic-settings \
    httpx python-multipart aiosqlite sqlalchemy anthropic

# Option B: venv + pip
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi "uvicorn[standard]" websockets pydantic pydantic-settings \
    httpx python-multipart aiosqlite sqlalchemy anthropic cadquery
```

### 3. Configure API

```bash
cp .env.example packages/backend/.env
```

Edit `packages/backend/.env`.

For normal chat through an OpenAI-compatible gateway:

```env
GATEWAY_URL=https://api.openai.com/v1
GATEWAY_API_KEY=sk-your-key-here
GATEWAY_MODELS=gpt-4o
```

For Agent mode, opencode also uses an OpenAI-compatible gateway. By default it
uses `GATEWAY_URL`, then `AGENT_BASE_URL`, then
`https://token-plan-sgp.xiaomimimo.com/v1`. Set the first model in
`GATEWAY_MODELS`, or set `DEFAULT_MODEL` explicitly.

```env
GATEWAY_URL=https://token-plan-sgp.xiaomimimo.com/v1
GATEWAY_MODELS=mimo-v2.5-pro
DEFAULT_MODEL=mimo-v2.5-pro
```

Provide the key using either variable:

```env
ANTHROPIC_API_KEY=your-mimo-key
# or
GATEWAY_API_KEY=your-mimo-key
```

Agent mode uses `ANTHROPIC_API_KEY` first, then falls back to `GATEWAY_API_KEY`.

### 4. Frontend Setup

```bash
cd packages/frontend
npm install
```

### 5. Run

Open two terminals for the base app:

```bash
# Terminal 1: Backend, port 8000
cd packages/backend
# --reload-dir src 很重要：仅监视源码目录，避免 agent 写 generated/ 产物时误触发重启而断开 WebSocket
uvicorn src.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir src
```

```bash
# Terminal 2: Frontend, port 5173
cd packages/frontend
npm run dev
```

For Agent mode, start opencode in a third terminal:

```bash
# Terminal 3: opencode server, port 4096
bash scripts/opencode.sh
```

Open:

```text
http://127.0.0.1:5173/
```

Using `127.0.0.1` avoids browser WebSocket ambiguity around `0.0.0.0`.

### Docker (alternative)

```bash
cp .env.example packages/backend/.env
# edit packages/backend/.env with your API key
docker compose up
```

## Usage

| Action | How |
|--------|-----|
| Generate model with chat | Use the `CAD` tab and type a model description |
| Use the code agent | Switch to `Agent`, describe the CAD change, and optionally upload reference images |
| Continue an Agent session | Keep chatting in the same Agent conversation; it resumes the same agent history and `cadquery.py` |
| Expand long output | Long content is collapsed by default; click `展开全部` / `收起` |
| Adjust parameters | Drag sliders in the right panel |
| Edit code manually | Switch to Code tab, modify, press `Ctrl+Enter` |
| Change view angle | Click direction buttons or drag to orbit |
| Highlight face | Hover over model faces |
| Export STEP | Click Export in the bottom toolbar |
| Screenshot | Click Screenshot in the bottom toolbar |
| Configure API | Click the gear icon in the top-right |

## Agent Mode Notes

Agent mode is powered by [opencode](https://github.com/anomalyco/opencode), an
open-source coding agent, running as a local headless server. The backend proxies
opencode's event stream into the existing `agent_*` WebSocket protocol, so the UI
is unchanged.

### Running opencode

1. Install: `npm install -g opencode-ai@latest` (verify with `opencode --version`).
2. Start the server (host side): `bash scripts/opencode.sh` — it runs
   `opencode serve` rooted at `packages/backend/generated/agent_sessions`.
3. `scripts/opencode.sh` writes `opencode.json` to that root, generated from
   `packages/backend/.env`. The provider points at `OPENCODE_PROVIDER_BASE_URL`,
   then `GATEWAY_URL`, then `AGENT_BASE_URL`. Permissions allow editing only
   `**/cadquery.py`, allow the `cadquery-studio` skill, and deny
   `bash`/`webfetch`, preserving the sandbox.

Config (`.env`):

- `OPENCODE_ENABLED` — set `false` to fall back to the legacy in-process loop.
- `OPENCODE_BASE_URL` — backend-to-opencode server URL. Use
  `http://127.0.0.1:4096` when the backend runs directly on the host; use
  `http://host.docker.internal:4096` when the backend runs in Docker.
- `OPENCODE_PROVIDER_BASE_URL` — optional model gateway override for opencode;
  leave empty to use `GATEWAY_URL` or `AGENT_BASE_URL`.
- `OPENCODE_PROVIDER_ID` — provider key written into `opencode.json`, default
  `cadgw`.
- `OPENCODE_HOST_ROOT` — host-side absolute path of `agent_sessions`, used to
  translate container paths to host paths (the directory is bind-mounted).

### CAD skill

The project includes `.opencode/skills/cadquery-studio/SKILL.md` and
`.opencode/skills/cadquery-studio/references/quality-gates.md`. The skill tells
opencode how to create robust CadQuery files for this app:

- Build a short CAD brief before coding.
- Map every requested feature to a parameter, sketch, or solid operation.
- Keep `params` and optional single-line `# PARAMETER_DEFS:` metadata stable.
- Guard derived dimensions so parameter edits do not create invalid geometry.
- Use conservative CadQuery operations, then rely on backend render feedback for
  repair.

### How it works

- Each conversation gets a directory under `packages/backend/generated/agent_sessions/`.
- The session file is `cadquery.py`; opencode edits only that file, and the
  backend renders from it after each turn.
- Multi-turn memory is owned by the opencode session (mapped per conversation).
- If CadQuery execution fails, the backend sends the error back to the same
  opencode session for up to 2 repair turns.
- Uploaded images are forwarded to opencode as `file` parts for input only.

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| WS | `/api/chat/ws` | Streaming AI chat + CAD execution |
| WS | `/api/agent/ws` | opencode CAD agent session over WebSocket |
| POST | `/api/cad/execute` | Execute CadQuery code directly |
| POST | `/api/cad/update-params` | Re-execute with modified parameters |
| GET | `/api/chat/models` | List available AI models |
| GET | `/api/settings` | Get current API configuration |
| PUT | `/api/settings` | Update API configuration at runtime |
| GET | `/api/health` | Health check |
| GET | `/assets/*` | Serve generated STEP/glTF files |

## Troubleshooting

### `ModuleNotFoundError: No module named 'pydantic_settings'`

Install backend dependencies inside the active environment:

```bash
cd packages/backend
source .venv/bin/activate
pip install pydantic-settings
```

### Agent shows `Connecting`

Check the backend, frontend, and opencode services:

```bash
curl http://127.0.0.1:8000/api/health
curl -I http://127.0.0.1:5173/
curl http://127.0.0.1:4096/global/health
```

Use `http://127.0.0.1:5173/` in the browser and hard-refresh if the frontend bundle is stale.

### Agent stays on `Agent is working`

If tool calls are appearing, the agent loop is still working. Agent turns can take longer than normal chat because the agent may inspect, edit, execute, receive CAD errors, and repair. If it runs for several minutes with no new tool events, check the backend terminal logs.

### Agent API returns `404 Not Found`

Check that the model gateway URL is the OpenAI-compatible base URL, for example:

```env
GATEWAY_URL=https://token-plan-sgp.xiaomimimo.com/v1
```

Do not set the model gateway to an Anthropic message path such as
`/anthropic/messages`. `OPENCODE_BASE_URL` is only for the local opencode server;
use `GATEWAY_URL` or `OPENCODE_PROVIDER_BASE_URL` for the model provider.

### Stop the servers

Press `Ctrl+C` in the backend and frontend terminals.

If a process is still bound to a port:

```bash
lsof -i :8000 -sTCP:LISTEN
lsof -i :5173 -sTCP:LISTEN
```

Then stop the listed PID if needed:

```bash
kill <PID>
```

## Project Structure

```text
cad/
├── packages/
│   ├── frontend/              # React 19 + Vite + TypeScript
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── layout/       TopNav, AppShell, Sidebar, RightPanel, MainViewport
│   │   │   │   ├── viewport/     Canvas3D, ModelViewer
│   │   │   │   ├── chat/         ChatPanel, ChatMessage, ChatInput, AgentPanel, collapsed output
│   │   │   │   ├── parameters/   ParameterPanel, ParameterField
│   │   │   │   └── common/       SettingsModal
│   │   │   ├── stores/           Zustand stores
│   │   │   ├── hooks/            useWebSocket
│   │   │   ├── services/         stepLoader
│   │   │   └── types/            TypeScript interfaces
│   │   └── public/               occt-import-js WASM files
│   └── backend/               # Python FastAPI
│       ├── generated/            STEP outputs, Agent sessions
│       └── src/
│           ├── api/              chat, agent, cad, settings, health
│           ├── services/
│           │   ├── ai/           gateway/openai/claude providers + prompts
│           │   ├── cad/          executor subprocess + STEP export
│           │   └── opencode/     opencode config, session assets, HTTP/SSE client
│           ├── models/           Pydantic schemas
│           └── config.py         Settings
├── docker-compose.yml
├── .opencode/skills/           # project opencode skills
└── .env.example
```

## Update Log

### 2026-06-24

- Added opencode Agent integration updates for CAD generation, including per-conversation `cadquery.py` sessions, root config generation, health checking, and backend repair feedback.
- Added project opencode skills for stricter CadQuery generation and image/drawing brief extraction:
  - `.opencode/skills/cadquery-studio/`
  - `.opencode/skills/cad-vision-brief/`
- Improved multimodal input handling. Uploaded images can be forwarded to the Agent/opencode path and are preserved in chat history where applicable.
- Improved frontend chat usability:
  - User-sent images now remain visible in the conversation after sending.
  - Long markdown, thinking text, tool output, and generated content are collapsible to avoid freezing or overflowing the chat panel.
  - Agent status, connection state, tool calls, repair status, and completion state are shown more clearly.
- Improved CAD viewport behavior and STEP/glTF loading, including face/highlight related robustness work and loading/error state handling.
- Updated prompts and quality instructions to prefer precise, stable CadQuery models over fast approximate generation, with stronger validation expectations.
- Updated environment, Docker, CORS/WebSocket, and README configuration for the Agent workflow.

## License

MIT
