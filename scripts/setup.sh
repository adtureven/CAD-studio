#!/bin/bash
# Setup development environment

set -e

echo "=== CAD AI Studio Setup ==="
echo ""

# Frontend
echo "[1/3] Installing frontend dependencies..."
cd packages/frontend
npm install
cd ../..

# Backend
echo "[2/3] Setting up backend Python environment..."
cd packages/backend
python -m venv .venv
source .venv/bin/activate
pip install -e "." 2>/dev/null || pip install fastapi uvicorn[standard] websockets pydantic pydantic-settings numpy trimesh httpx anthropic openai python-multipart Pillow aiosqlite sqlalchemy alembic
cd ../..

# Environment
echo "[3/3] Setting up environment..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env file - please add your API keys."
else
  echo ".env already exists."
fi

echo ""
echo "=== Setup complete! ==="
echo ""
echo "To install CadQuery (requires conda):"
echo "  conda install -c cadquery -c conda-forge cadquery"
echo ""
echo "To start development:"
echo "  ./scripts/dev.sh"
