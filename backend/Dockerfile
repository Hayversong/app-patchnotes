# API do Patchnotes (FastAPI). Aplica as migrations e sobe o servidor em 0.0.0.0:8000.
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    API_HOST=0.0.0.0 \
    API_PORT=8000

WORKDIR /app
RUN useradd --create-home --uid 10001 patchnotes
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY --chown=patchnotes:patchnotes . .

USER patchnotes
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --retries=10 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)" || exit 1
CMD ["sh", "-c", "python -m alembic upgrade head && python -m app"]
