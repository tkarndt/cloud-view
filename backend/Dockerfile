FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Install dependencies before copying source so this layer is cached
COPY pyproject.toml .
RUN uv sync --no-dev

COPY src/ src/

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "cloud_view.main:app", \
     "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
