# Murattil — single container: FastAPI server + built web app + model weights.
#
#   docker build -t murattil .
#   docker run -p 8000:8000 -v murattil-var:/srv/var murattil
#
# The model weights (~1.4 GB: Quran recogniser, kNN-VC) are downloaded while building, so the
# container works on first start. Build with --build-arg FETCH_MODELS=0 to skip them and run
# `python scripts/fetch_models.py` inside the container later.
# Needs about 4 GB of RAM when the neural voice blend is used (2 GB without it).

FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.13-slim
ARG FETCH_MODELS=1
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg build-essential \
    && rm -rf /var/lib/apt/lists/*
# runs as an unprivileged user (uid 1000, which hosted platforms such as Hugging Face Spaces expect)
RUN useradd -m -u 1000 murattil
WORKDIR /srv
COPY server/requirements.txt server/requirements.txt
# CPU-only torch keeps the image ~3 GB smaller than the default CUDA build
RUN pip install --no-cache-dir torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r server/requirements.txt
COPY server/ server/
COPY --from=web /web/dist web/dist
ENV MURATTIL_VAR_DIR=/srv/var \
    MURATTIL_MODELS_DIR=/srv/server/models \
    MURATTIL_WEB_DIST=/srv/web/dist \
    PYTHONUNBUFFERED=1 \
    PORT=8000
WORKDIR /srv/server
RUN if [ "$FETCH_MODELS" = "1" ]; then python scripts/fetch_models.py; fi \
    && mkdir -p /srv/var /srv/server/models && chown -R murattil:murattil /srv/var /srv/server/models
USER murattil
EXPOSE 8000
CMD ["sh", "-c", "uvicorn murattil.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
