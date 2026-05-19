# CAD AI Studio

AI-powered parametric 3D modeling system. Describe a shape in natural language, get precise CAD geometry rendered in the browser.

![Stack](https://img.shields.io/badge/React_19-TypeScript-blue) ![Stack](https://img.shields.io/badge/FastAPI-CadQuery-green) ![Stack](https://img.shields.io/badge/Three.js-STEP_Rendering-orange)

## Features

- **AI Chat** — Describe a 3D model in text; AI generates parametric CadQuery code and renders it
- **STEP Rendering** — Industrial-grade B-Rep geometry via OpenCascade, parsed client-side with occt-import-js (WASM)
- **Face Hover Highlight** — Hover over model faces to see boundary edges and face info tooltip
- **Parameter Editing** — Sliders and inputs to tweak model dimensions in real-time
- **Code Editor** — View, edit, and execute CadQuery code directly (Ctrl+Enter to run)
- **View Controls** — Quick-access direction buttons (Front/Back/Left/Right/Top/Bottom/Iso)
- **Model History** — Generated models appear in the sidebar for quick access
- **Multi-Model AI** — Supports any OpenAI-compatible API (DeepSeek, GPT-4o, Claude, etc.)
- **Auto-Fix** — If generated code fails, the system automatically asks the AI to fix it (up to 2 retries)
- **Runtime Settings** — Configure API URL, key, and models from the UI (no restart needed)
- **Export** — Download models as STEP files; screenshot viewport as PNG

## Architecture

```
User prompt → AI (streaming) → CadQuery Python code
    → Backend executes in subprocess → STEP file exported
    → Frontend fetches STEP → occt-import-js (WASM) parses → Three.js renders
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4 |
| 3D | Three.js via @react-three/fiber + drei, occt-import-js (WASM) |
| State | Zustand (chat, viewport, parameter, ui, library stores) |
| Backend | Python 3.12, FastAPI, WebSocket |
| CAD Kernel | CadQuery 2.7 (OpenCascade) |
| AI | OpenAI-compatible API (configurable gateway) |

## Quick Start

### Prerequisites

- **Node.js** 20+
- **Python** 3.12
- **CadQuery** (requires OpenCascade — easiest via conda, see below)
- An **OpenAI-compatible API key** (e.g. DeepSeek, GPT-4o, Claude via gateway)

### 1. Clone

```bash
git clone <repo-url> cad
cd cad
```

### 2. Backend Setup

```bash
cd packages/backend

# Option A: conda (recommended for CadQuery)
conda create -n cad python=3.12 -y
conda activate cad
conda install -c cadquery cadquery=2.7 -y
pip install fastapi "uvicorn[standard]" websockets pydantic pydantic-settings \
    httpx python-multipart aiosqlite sqlalchemy

# Option B: pip only (macOS ARM / Linux with OCP pre-built)
python3.12 -m venv .venv
source .venv/bin/activate
pip install fastapi "uvicorn[standard]" websockets pydantic pydantic-settings \
    httpx python-multipart aiosqlite sqlalchemy cadquery
```

### 3. Configure API

```bash
cp .env.example .env
```

Edit `.env`:

```env
GATEWAY_URL=https://api.openai.com/v1
GATEWAY_API_KEY=sk-your-key-here
GATEWAY_MODELS=gpt-4o
```

Or configure later from the Settings UI (gear icon, top-right).

### 4. Frontend Setup

```bash
cd packages/frontend
npm install
```

### 5. Run

Open **two terminals**:

```bash
# Terminal 1: Backend (port 8000)
cd packages/backend
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Frontend (port 5173, proxies API to backend)
cd packages/frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

### Docker (alternative)

```bash
cp .env.example .env   # edit with your API key
docker compose up
```

## Usage

| Action | How |
|--------|-----|
| Generate model | Type in chat: "Create a gear with 20 teeth" |
| Adjust parameters | Drag sliders in the right panel |
| Edit code | Switch to Code tab, modify, press Ctrl+Enter |
| Change view angle | Click direction buttons (top-right) or drag to orbit |
| Highlight face | Hover over model — see edges + face info |
| Load example | Click a model in the left sidebar |
| Revisit history | Scroll down in sidebar to "Generated" section |
| Export STEP | Click Export in bottom toolbar |
| Screenshot | Click Screenshot in bottom toolbar |
| Configure API | Click gear icon (top-right) → Settings |

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| WS | `/api/chat/ws` | Streaming AI chat + CAD execution |
| POST | `/api/cad/execute` | Execute CadQuery code directly |
| POST | `/api/cad/update-params` | Re-execute with modified parameters |
| GET | `/api/chat/models` | List available AI models |
| GET | `/api/settings` | Get current API configuration |
| PUT | `/api/settings` | Update API configuration at runtime |
| GET | `/api/health` | Health check |
| GET | `/assets/*` | Serve generated STEP/glTF files |

## Project Structure

```
cad/
├── packages/
│   ├── frontend/              # React 19 + Vite + TypeScript
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── layout/       TopNav, AppShell, Sidebar, RightPanel, MainViewport
│   │   │   │   ├── viewport/     Canvas3D, ModelViewer (STEP hover highlight)
│   │   │   │   ├── chat/         ChatPanel, ChatMessage, ChatInput
│   │   │   │   ├── parameters/   ParameterPanel, ParameterField
│   │   │   │   └── common/       SettingsModal
│   │   │   ├── stores/           Zustand stores (chat, viewport, parameter, ui, library)
│   │   │   ├── hooks/            useWebSocket
│   │   │   ├── services/         stepLoader (WASM STEP parser + face topology)
│   │   │   └── types/            TypeScript interfaces
│   │   └── public/               occt-import-js WASM files
│   └── backend/               # Python FastAPI
│       └── src/
│           ├── api/              chat (WebSocket), cad, settings, health
│           ├── services/
│           │   ├── ai/           gateway/openai/claude providers + system prompts
│           │   └── cad/          executor (sandboxed subprocess), STEP export
│           ├── models/           Pydantic schemas
│           └── config.py         Settings (env-based)
├── docker-compose.yml
└── .env.example
```

## License

MIT
