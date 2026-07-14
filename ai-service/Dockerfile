# AI Service Dockerfile
#
# No local ML models: embeddings come from the Gemini API and PDFs are built
# with reportlab, so this image needs neither torch nor a TeX distribution.
FROM python:3.12-slim

WORKDIR /app

# curl is used by the compose healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Run as a non-root user
RUN useradd --create-home --uid 1001 appuser \
    && mkdir -p /app/reports \
    && chown -R appuser:appuser /app
USER appuser

ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
