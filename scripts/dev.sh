#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# Check for .env
if [ ! -f ".env" ]; then
    echo "No .env file found. Copying from .env.example..."
    cp .env.example .env
    echo "Please edit .env and add your ANTHROPIC_API_KEY, then re-run."
    exit 1
fi

echo "Starting CAD AI Studio in development mode..."
echo ""

# Start backend via Docker (CadQuery needs conda)
echo "Starting backend (Docker container)..."
docker compose -f docker-compose.dev.yml up -d --build backend

echo "Waiting for backend..."
for i in $(seq 1 30); do
    if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
        echo "Backend ready at http://localhost:8000"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "Backend failed to start. Check: docker compose -f docker-compose.dev.yml logs backend"
        exit 1
    fi
    sleep 1
done

# Start frontend (local Vite)
echo ""
echo "Starting frontend (Vite dev server)..."
cd packages/frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop."

cleanup() {
    kill $FRONTEND_PID 2>/dev/null
    cd "$ROOT_DIR"
    docker compose -f docker-compose.dev.yml down
}
trap cleanup EXIT
wait
