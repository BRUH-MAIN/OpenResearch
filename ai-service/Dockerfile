# AI Service Dockerfile
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

# Copy application code
COPY app/ ./app/

# Accept HF_TOKEN for authenticated model downloads (higher rate limits)
ARG HF_TOKEN
ENV HF_TOKEN=${HF_TOKEN}

# Pre-download ML models during build for fast startup.
# Use --progress=plain when building to see live download output:
#   docker compose build --progress=plain ai-service
RUN python -u -m app.download_models

# Set environment variables
ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
