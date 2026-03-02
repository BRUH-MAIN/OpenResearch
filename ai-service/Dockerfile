# AI Service Dockerfile

# Stage 1: Model cache — reuses the existing image's cached models to avoid
# re-downloading 4GB+ of ML models on every code change.
# To refresh models, rebuild with: docker compose build --no-cache ai-service
FROM openresearch-ai-service:latest AS model-cache

# Stage 2: Build the application
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies and UV
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    curl \
    && curl -LsSf https://astral.sh/uv/install.sh | sh \
    && rm -rf /var/lib/apt/lists/*

# Add UV to PATH (installed to /root/.local/bin)
ENV PATH="/root/.local/bin:$PATH"

# Copy dependency files first for better caching
COPY pyproject.toml .
COPY requirements.txt .

# Install Python dependencies with UV
RUN uv pip install --system --no-cache --index-strategy unsafe-best-match -r requirements.txt

# Copy pre-downloaded ML models from the existing image (avoids re-download)
COPY --from=model-cache /root/.cache/huggingface /root/.cache/huggingface

# Copy application code
COPY app/ ./app/

# Set environment variables
ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
