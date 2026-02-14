FROM python:3.11-slim

WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY radtriage_pipeline.py .
COPY app.py .

# HuggingFace Spaces expects port 7860
EXPOSE 7860

# Run Gradio app
CMD ["python", "app.py"]
