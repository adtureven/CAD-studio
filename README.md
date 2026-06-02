# CAD AI Studio

AI-powered parametric 3D modeling system. Describe a shape in natural language, get precise CadQuery geometry rendered in the browser.

![Stack](https://img.shields.io/badge/React_19-TypeScript-blue) ![Stack](https://img.shields.io/badge/FastAPI-CadQuery-green) ![Stack](https://img.shields.io/badge/Three.js-STEP_Rendering-orange)

## Features

- **AI Chat** - Describe a 3D model in text; AI generates parametric CadQuery code and renders it.
- **Code Agent** - Agent mode runs Claude Code against an isolated per-conversation `cadquery.py` file, using the Mimo Anthropic-compatible endpoint.
- **CAD Execution Feedback** - Agent-generated CadQuery is executed by the backend; failures are fed back to the same Claude Code session for automatic repair.
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
User prompt -> /api/agent/ws -> Claude Code CLI + Mimo endpoint
    -> isolated generated/agent_sessions/<conversation>/cadquery.py
    -> Backend executes cadquery.py -> success renders STEP
    -> failure is sent back to Claude Code for repair, then re-executed
```

The Agent directory is intentionally separate from this repository's source tree. Claude Code is launched with that session directory as its working directory, so its primary working file is `cadquery.py`.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4 |
| 3D | Three.js via `@react-three/fiber` + drei, `occt-import-js` (WASM) |
| State | Zustand |
| Backend | Python 3.12+, FastAPI, WebSocket |
| CAD Kernel | CadQuery 2.7 / OpenCascade |
| AI Chat | OpenAI-compatible gateway |
| Code Agent | Claude Code CLI with Mimo Anthropic-compatible API |

## Quick Start

### Prerequisites

- **Node.js** 20+
- **Python** 3.12+ (3.13 is also OK if CadQuery/OCP installs cleanly)
- **CadQuery** with OpenCascade/OCP
- An **OpenAI-compatible API key** for normal chat, or a Mimo-compatible key for Agent mode
- Optional but required for Agent mode: installed **Claude Code CLI** available as `claude`

Check Claude Code:

```bash
claude --version
```

If the binary is not on `PATH`, set `CLAUDE_CODE_BIN` before starting the backend.

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
    httpx python-multipart aiosqlite sqlalchemy

# Option B: venv + pip
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi "uvicorn[standard]" websockets pydantic pydantic-settings \
    httpx python-multipart aiosqlite sqlalchemy cadquery
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

For Agent mode with Claude Code + Mimo, the backend sets:

```text
ANTHROPIC_BASE_URL=https://token-plan-sgp.xiaomimimo.com/anthropic
ANTHROPIC_MODEL=mimo-v2.5-pro
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

Open two terminals:

```bash
# Terminal 1: Backend, port 8000
cd packages/backend
uvicorn src.main:app --host 127.0.0.1 --port 8000 --reload
```

```bash
# Terminal 2: Frontend, port 5173
cd packages/frontend
npm run dev
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
| Use Claude Code agent | Switch to `Agent` and describe the CAD change |
| Continue an Agent session | Keep chatting in the same Agent conversation; it resumes the same Claude Code session and `cadquery.py` |
| Adjust parameters | Drag sliders in the right panel |
| Edit code manually | Switch to Code tab, modify, press `Ctrl+Enter` |
| Change view angle | Click direction buttons or drag to orbit |
| Highlight face | Hover over model faces |
| Export STEP | Click Export in the bottom toolbar |
| Screenshot | Click Screenshot in the bottom toolbar |
| Configure API | Click the gear icon in the top-right |

## Agent Mode Notes

- Each conversation gets a directory under `packages/backend/generated/agent_sessions/`.
- The session file is `cadquery.py`; the backend renders from that file after Claude Code returns.
- Claude Code configuration/session data is isolated under `packages/backend/generated/claude_config/` via `CLAUDE_CONFIG_DIR`.
- The backend launches Claude Code with `--bare`, `--tools default`, and `--permission-mode bypassPermissions`.
- Because tools are not restricted, this is a trusted local development workflow, not a hard security sandbox.
- If CadQuery execution fails, the backend sends the error back to Claude Code for up to 2 repair turns.

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| WS | `/api/chat/ws` | Streaming AI chat + CAD execution |
| WS | `/api/agent/ws` | Claude Code Agent session over WebSocket |
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

Check both services:

```bash
curl http://127.0.0.1:8000/api/health
curl -I http://127.0.0.1:5173/
```

Use `http://127.0.0.1:5173/` in the browser and hard-refresh if the frontend bundle is stale.

### Agent stays on `Agent is working`

If tool calls are appearing, Claude Code/Mimo is still working. Agent turns can take longer than normal chat because Claude Code may inspect, edit, execute, receive CAD errors, and repair. If it runs for several minutes with no new tool events, check the backend terminal logs.

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
│   │   │   │   ├── chat/         ChatPanel, ChatMessage, ChatInput, AgentPanel
│   │   │   │   ├── parameters/   ParameterPanel, ParameterField
│   │   │   │   └── common/       SettingsModal
│   │   │   ├── stores/           Zustand stores
│   │   │   ├── hooks/            useWebSocket
│   │   │   ├── services/         stepLoader
│   │   │   └── types/            TypeScript interfaces
│   │   └── public/               occt-import-js WASM files
│   └── backend/               # Python FastAPI
│       ├── generated/            STEP outputs, Agent sessions, Claude config
│       └── src/
│           ├── api/              chat, agent, cad, settings, health
│           ├── services/
│           │   ├── ai/           gateway/openai/claude providers + prompts
│           │   └── cad/          executor subprocess + STEP export
│           ├── models/           Pydantic schemas
│           └── config.py         Settings
├── docker-compose.yml
└── .env.example
```

## License

MIT
