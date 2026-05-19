FROM continuumio/miniconda3:latest

WORKDIR /app

RUN conda install -c cadquery -c conda-forge cadquery=2.4 -y && \
    conda clean -afy

COPY pyproject.toml .
RUN pip install -e ".[dev]" --no-deps 2>/dev/null || pip install fastapi uvicorn[standard] websockets pydantic pydantic-settings numpy trimesh pygltflib sqlalchemy[asyncio] aiosqlite alembic httpx anthropic openai python-multipart Pillow

COPY src/ ./src/

RUN mkdir -p /app/generated

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
