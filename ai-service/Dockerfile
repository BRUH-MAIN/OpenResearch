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
RUN uv pip install --system --no-cache -r requirements.txt

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
