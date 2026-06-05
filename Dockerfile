# PriceStalk production image.
FROM python:3.12-slim

# curl_cffi needs libcurl at runtime; build tools help wheels that lack binaries.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libcurl4 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Fly maps this; gunicorn binds to it.
ENV PORT=8080
EXPOSE 8080

# 1 worker so the APScheduler job runs once (not per-worker). 2 threads for I/O.
CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 2 --timeout 120"]
