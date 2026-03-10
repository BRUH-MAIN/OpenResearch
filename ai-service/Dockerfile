# AI Service Dockerfile

# Stage 1: Cache placeholder.
# Keep the Hugging Face cache path available so later COPY steps succeed even
# when there is no previously-built local image to reuse as a cache source.
FROM python:3.12-slim AS model-cache

RUN mkdir -p /root/.cache/huggingface

# Stage 2: Build the application
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies and UV
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    curl \
    texlive-base \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-fonts-recommended \
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
