# Murattil — single container: FastAPI server + built web app.
# NOTE: written for deployment but not built in the development sandbox (no Docker daemon there).
#
#   docker build -t murattil .
#   docker run -p 8000:8000 -v murattil-var:/srv/var -v murattil-models:/srv/server/models murattil
#   docker exec <container> python server/scripts/fetch_models.py   # once, downloads ~1.4 GB of weights

FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg build-essential \
    && rm -rf /var/lib/apt/lists/*
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
    PYTHONUNBUFFERED=1
WORKDIR /srv/server
EXPOSE 8000
CMD ["uvicorn", "murattil.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
