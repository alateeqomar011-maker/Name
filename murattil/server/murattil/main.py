"""HTTP API and static web app.

Run:  uvicorn murattil.main:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import logging
import re
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from . import auth, db, jobs, progress, quotas, quran, reciters, storage
from .config import FREE_PLAN, PLANS, SUPPORTER_PLAN, settings
from .tajweed import asr
from .voice import engine, registry

log = logging.getLogger("murattil")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

STATE_CHANGING = {"POST", "PUT", "PATCH", "DELETE"}
CSRF_HEADER = "x-requested-with"
CSRF_VALUE = "murattil"


def _health_refresher():
    while True:
        try:
            reciters.source_health()
        except Exception:  # network may be unavailable; try again later
            log.exception("source health refresh failed")
        time.sleep(6 * 3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.conn()
    jobs.start()
    threading.Thread(target=_health_refresher, name="murattil-health", daemon=True).start()
    yield


app = FastAPI(title="Murattil", version="0.1.0", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(GZipMiddleware, minimum_size=1024)

CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
       "font-src 'self' data:; media-src 'self' blob: https://everyayah.com https://*.mp3quran.net; "
       "connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")


@app.middleware("http")
async def security(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.method in STATE_CHANGING:
        if request.headers.get(CSRF_HEADER) != CSRF_VALUE:
            return JSONResponse({"detail": "Missing request header."}, status_code=403)
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault("Permissions-Policy", "microphone=(self), camera=(), geolocation=()")
    if not request.url.path.startswith("/api/docs"):
        response.headers.setdefault("Content-Security-Policy", CSP)
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


# ------------------------------------------------------------------ session & account

def _plan_public(p) -> dict:
    return {"name": p.name, "analysesPerDay": p.tajweed_analyses_per_day, "transformsPerDay": p.voice_transforms_per_day,
            "maxTajweedSeconds": p.max_tajweed_seconds, "maxTransformSeconds": p.max_transform_seconds,
            "maxUploadMb": p.max_upload_mb, "maxRecordings": p.max_recordings, "maxStorageMb": p.max_storage_mb}


def _session_payload(u: dict) -> dict:
    plan = auth.plan_of(u)
    return {
        "user": {"id": u["id"], "email": u.get("email"), "anonymous": not u.get("email"), "plan": plan.name,
                 "settings": db.jload(u.get("settings"), {}), "createdAt": u["created_at"]},
        "plan": _plan_public(plan),
        "plans": {"free": _plan_public(FREE_PLAN), "supporter": _plan_public(SUPPORTER_PLAN)},
        "usage": quotas.summary(u["id"], plan),
        "storage": storage.usage(u["id"]),
    }


@app.get("/api/session")
def session(request: Request, response: Response):
    u = auth.user_from_request(request)
    if u is None:
        uid = auth.create_user()
        auth.create_session(uid, response)
        u = dict(db.one("SELECT * FROM users WHERE id = ?", uid))
    return _session_payload(u)


class Credentials(BaseModel):
    email: str = Field(max_length=256)
    password: str = Field(max_length=256)


@app.post("/api/auth/register")
def register(body: Credentials, request: Request, user=Depends(auth.current_user)):
    auth.throttle(f"reg:{request.client.host if request.client else '?'}", limit=5, window=3600)
    email = auth.validate_credentials(body.email, body.password)
    if user.get("email"):
        raise HTTPException(409, "This account already has an email address.")
    if db.one("SELECT 1 FROM users WHERE email = ?", email):
        raise HTTPException(409, "An account with this email already exists. Sign in instead.")
    db.run("UPDATE users SET email = ?, password_hash = ? WHERE id = ?", email, auth.hash_password(body.password), user["id"])
    return _session_payload(dict(db.one("SELECT * FROM users WHERE id = ?", user["id"])))


@app.post("/api/auth/login")
def login(body: Credentials, request: Request, response: Response):
    email = (body.email or "").strip().lower()
    auth.throttle(f"login:{email}")
    auth.throttle(f"login-ip:{request.client.host if request.client else '?'}", limit=30)
    row = db.one("SELECT * FROM users WHERE email = ?", email)
    if row is None or not auth.verify_password(body.password, row["password_hash"]):
        raise HTTPException(401, "Email or password is incorrect.")
    auth.end_session(request, response)
    auth.create_session(row["id"], response)
    return _session_payload(dict(row))


@app.post("/api/auth/logout")
def logout(request: Request, response: Response):
    auth.end_session(request, response)
    uid = auth.create_user()
    auth.create_session(uid, response)
    return _session_payload(dict(db.one("SELECT * FROM users WHERE id = ?", uid)))


@app.delete("/api/account")
def delete_account(request: Request, response: Response, user=Depends(auth.current_user)):
    """Delete the account and every recording, job and practice record. Irreversible."""
    for j in db.all_("SELECT id FROM jobs WHERE user_id = ? AND status IN ('queued','running')", user["id"]):
        jobs.cancel(user["id"], j["id"])
    storage.delete_all(user["id"])
    db.run("DELETE FROM users WHERE id = ?", user["id"])
    response.delete_cookie(auth.COOKIE, path="/")
    return {"deleted": True}


ALLOWED_SETTINGS = {"language": {"ar", "en"}, "theme": {"light", "dark", "system"}, "tajweedColors": {True, False},
                    "translation": {True, False}, "defaultReciter": None, "fontScale": None, "showWordHints": {True, False}}


@app.patch("/api/settings")
def update_settings(body: dict, user=Depends(auth.current_user)):
    cur = db.jload(user.get("settings"), {})
    for k, v in body.items():
        if k not in ALLOWED_SETTINGS:
            raise HTTPException(422, f"Unknown setting {k}")
        allowed = ALLOWED_SETTINGS[k]
        if allowed is not None and v not in allowed:
            raise HTTPException(422, f"Invalid value for {k}")
        if k == "defaultReciter" and v is not None and reciters.get(str(v)) is None:
            raise HTTPException(422, "Unknown reciter")
        if k == "fontScale" and not (isinstance(v, (int, float)) and 0.8 <= v <= 1.8):
            raise HTTPException(422, "fontScale must be between 0.8 and 1.8")
        cur[k] = v
    db.run("UPDATE users SET settings = ? WHERE id = ?", db.jdump(cur), user["id"])
    return cur


# ------------------------------------------------------------------ Quran

@app.get("/api/quran/meta")
def quran_meta(response: Response):
    response.headers["Cache-Control"] = "public, max-age=86400"
    return quran.meta()


@app.get("/api/quran/rules")
def quran_rules(response: Response):
    response.headers["Cache-Control"] = "public, max-age=86400"
    return quran.rules()


@app.get("/api/quran/surah/{n}")
def quran_surah(n: int):
    if not 1 <= n <= 114:
        raise HTTPException(404, "No such surah")
    return Response(quran.surah_raw(n), media_type="application/json",
                    headers={"Cache-Control": "public, max-age=86400"})


# ------------------------------------------------------------------ reciters

@app.get("/api/reciters")
def list_reciters():
    return {"reciters": reciters.public_catalog()}


@app.get("/api/reciters/{rid}")
def reciter_detail(rid: str):
    r = next((x for x in reciters.public_catalog() if x["id"] == rid), None)
    if r is None:
        raise HTTPException(404, "Unknown reciter")
    r["similar"] = reciters.similar(rid, engine.cached_reference_descriptors())
    prof = engine.cached_reference_descriptors().get(rid)
    r["measuredProfile"] = prof
    return r


@app.get("/api/reciters/{rid}/timings")
def reciter_timings(rid: str, surah: int):
    r = reciters.get(rid)
    if r is None or not 1 <= surah <= 114:
        raise HTTPException(404, "Unknown reciter or surah")
    m = reciters.mp3quran_for(r, reciters.mp3quran_index())
    if not m:
        return {"timings": None}
    return {"timings": reciters.mp3quran_timings(m["server"], surah), "url": f"{m['server']}{surah:03d}.mp3"}


@app.post("/api/admin/reciters/health")
def refresh_health(request: Request):
    if not settings.admin_token or request.headers.get("authorization") != f"Bearer {settings.admin_token}":
        raise HTTPException(403, "Forbidden")
    return reciters.source_health(force=True)


# ------------------------------------------------------------------ favourites & bookmarks

@app.get("/api/favorites")
def favorites(user=Depends(auth.current_user)):
    return {"favorites": [r["reciter_id"] for r in db.all_("SELECT reciter_id FROM favorites WHERE user_id = ? ORDER BY created_at", user["id"])]}


@app.put("/api/favorites/{rid}")
def add_favorite(rid: str, user=Depends(auth.current_user)):
    if reciters.get(rid) is None:
        raise HTTPException(404, "Unknown reciter")
    db.run("INSERT OR IGNORE INTO favorites(user_id, reciter_id, created_at) VALUES (?,?,?)", user["id"], rid, db.now())
    return favorites(user)


@app.delete("/api/favorites/{rid}")
def remove_favorite(rid: str, user=Depends(auth.current_user)):
    db.run("DELETE FROM favorites WHERE user_id = ? AND reciter_id = ?", user["id"], rid)
    return favorites(user)


class BookmarkBody(BaseModel):
    note: str | None = Field(default=None, max_length=500)


@app.get("/api/bookmarks")
def bookmarks(user=Depends(auth.current_user)):
    rows = db.all_("SELECT surah, ayah, note, created_at FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC", user["id"])
    return {"bookmarks": [dict(r) for r in rows]}


@app.put("/api/bookmarks/{surah}/{ayah}")
def add_bookmark(surah: int, ayah: int, body: BookmarkBody, user=Depends(auth.current_user)):
    if not quran.valid_range(surah, ayah, ayah):
        raise HTTPException(404, "No such ayah")
    db.run("INSERT INTO bookmarks(user_id, surah, ayah, note, created_at) VALUES (?,?,?,?,?) "
           "ON CONFLICT(user_id, surah, ayah) DO UPDATE SET note = excluded.note", user["id"], surah, ayah, body.note, db.now())
    return bookmarks(user)


@app.delete("/api/bookmarks/{surah}/{ayah}")
def remove_bookmark(surah: int, ayah: int, user=Depends(auth.current_user)):
    db.run("DELETE FROM bookmarks WHERE user_id = ? AND surah = ? AND ayah = ?", user["id"], surah, ayah)
    return bookmarks(user)


# ------------------------------------------------------------------ recordings

def _rec_public(r: dict) -> dict:
    meta = r.get("meta") or {}
    return {"id": r["id"], "kind": r["kind"], "title": r["title"], "surah": r["surah"], "ayahFrom": r["ayah_from"],
            "ayahTo": r["ayah_to"], "reciterId": r["reciter_id"], "sourceRecordingId": r["source_recording_id"],
            "createdAt": r["created_at"], "duration": r["duration_s"], "sizeBytes": r["size_bytes"],
            "peaks": meta.get("peaks"), "engine": meta.get("engine"), "label": meta.get("label"),
            "jobId": meta.get("jobId")}


@app.get("/api/recordings")
def list_recordings(user=Depends(auth.current_user)):
    rows = db.all_("SELECT * FROM recordings WHERE user_id = ? ORDER BY created_at DESC", user["id"])
    out = []
    for r in rows:
        d = dict(r)
        d["meta"] = db.jload(d["meta"], {})
        out.append(_rec_public(d))
    return {"recordings": out, "storage": storage.usage(user["id"])}


@app.post("/api/recordings")
async def upload_recording(
    file: UploadFile = File(...), kind: str = Form("practice"), title: str | None = Form(None),
    surah: int | None = Form(None), ayah_from: int | None = Form(None), ayah_to: int | None = Form(None),
    user=Depends(auth.current_user),
):
    plan = auth.plan_of(user)
    if surah is not None:
        a0 = ayah_from or 1
        a1 = ayah_to or a0
        if not quran.valid_range(surah, a0, a1):
            raise HTTPException(422, "Invalid surah or ayah range.")
        ayah_from, ayah_to = a0, a1
    data = await file.read(plan.max_upload_mb * 1024 * 1024 + 1)
    try:
        rec = storage.save_upload(user["id"], plan, data, kind=kind, filename=file.filename, title=title, surah=surah,
                                  ayah_from=ayah_from, ayah_to=ayah_to)
    except storage.StorageError as e:
        raise HTTPException(422, str(e)) from e
    return _rec_public(rec)


def _own_rec(user, rid: str) -> dict:
    if not re.fullmatch(r"[0-9a-f]{32}", rid):
        raise HTTPException(404, "Recording not found")
    r = storage.get(user["id"], rid)
    if r is None:
        raise HTTPException(404, "Recording not found")
    return r


@app.get("/api/recordings/{rid}")
def get_recording(rid: str, user=Depends(auth.current_user)):
    return _rec_public(_own_rec(user, rid))


@app.get("/api/recordings/{rid}/audio")
def recording_audio(rid: str, user=Depends(auth.current_user)):
    r = _own_rec(user, rid)
    return FileResponse(storage.playback_path(r), media_type="audio/mp4", headers={"Cache-Control": "private, max-age=3600"})


@app.get("/api/recordings/{rid}/download")
def recording_download(rid: str, user=Depends(auth.current_user)):
    r = _own_rec(user, rid)
    safe = re.sub(r"[^\w\- ]+", "", (r["title"] or "recording"))[:60].strip() or "recording"
    path = storage.original_path(r)
    return FileResponse(path, filename=f"{safe}.{r['original_ext']}", media_type="application/octet-stream")


class RenameBody(BaseModel):
    title: str = Field(min_length=1, max_length=120)


@app.patch("/api/recordings/{rid}")
def rename_recording(rid: str, body: RenameBody, user=Depends(auth.current_user)):
    _own_rec(user, rid)
    db.run("UPDATE recordings SET title = ? WHERE id = ? AND user_id = ?", body.title.strip(), rid, user["id"])
    return _rec_public(storage.get(user["id"], rid))


@app.delete("/api/recordings/{rid}")
def delete_recording(rid: str, user=Depends(auth.current_user)):
    _own_rec(user, rid)
    storage.delete(user["id"], rid)
    return {"deleted": True, "storage": storage.usage(user["id"])}


# ------------------------------------------------------------------ AI jobs

def _guard_queue(user):
    if jobs.active_count(user["id"]) >= jobs.MAX_ACTIVE_PER_USER:
        raise HTTPException(429, "You already have recordings being processed. Please wait for them to finish.")
    if jobs.queue_length() >= settings.max_queue:
        raise HTTPException(503, "The server is busy right now. Please try again in a few minutes.")


class TransformBody(BaseModel):
    recordingId: str
    reciterId: str
    surah: int | None = None
    ayahFrom: int | None = None
    ayahTo: int | None = None
    controls: dict | None = None
    strength: float = Field(default=0.6, ge=0, le=1)
    neuralMode: str = Field(default="auto", pattern="^(auto|off|blend|authorized)$")
    neuralStrength: float = Field(default=engine.DEFAULT_BLEND, ge=0, le=1)
    voiceModelId: str | None = None
    recordingKey: str | None = None


@app.post("/api/voice/transform")
def voice_transform(body: TransformBody, user=Depends(auth.current_user)):
    rec = _own_rec(user, body.recordingId)
    if reciters.get(body.reciterId) is None:
        raise HTTPException(422, "Unknown reciter")
    if body.surah is not None and not quran.valid_range(body.surah, body.ayahFrom or 0, body.ayahTo or 0):
        raise HTTPException(422, "Invalid surah or ayah range.")
    if body.neuralMode == "authorized" and registry.get(body.voiceModelId or "") is None:
        raise HTTPException(422, "That authorised voice model is not available.")
    plan = auth.plan_of(user)
    if (rec["duration_s"] or 0) > plan.max_transform_seconds + 0.5:
        raise HTTPException(422, f"Voice transformation accepts recordings up to {plan.max_transform_seconds} s on your plan. "
                                 "Trim the recording or record a shorter passage.")
    _guard_queue(user)
    day = quotas.reserve(user["id"], plan, "transform")
    payload = body.model_dump()
    payload["maxSeconds"] = plan.max_transform_seconds
    jid = jobs.enqueue(user["id"], "transform", payload, rec["id"], day)
    return jobs.get(user["id"], jid)


class CompareBody(BaseModel):
    recordingId: str
    reciterId: str


@app.post("/api/voice/compare")
def voice_compare(body: CompareBody, user=Depends(auth.current_user)):
    rec = _own_rec(user, body.recordingId)
    if reciters.get(body.reciterId) is None:
        raise HTTPException(422, "Unknown reciter")
    plan = auth.plan_of(user)
    _guard_queue(user)
    day = quotas.reserve(user["id"], plan, "analysis")
    payload = body.model_dump()
    payload["maxSeconds"] = plan.max_tajweed_seconds
    return jobs.get(user["id"], jobs.enqueue(user["id"], "compare", payload, rec["id"], day))


@app.get("/api/voice/engines")
def voice_engines():
    return engine.engine_status()


class TajweedBody(BaseModel):
    recordingId: str
    surah: int
    ayahFrom: int
    ayahTo: int


@app.post("/api/tajweed/analyze")
def tajweed_analyze(body: TajweedBody, user=Depends(auth.current_user)):
    rec = _own_rec(user, body.recordingId)
    if not quran.valid_range(body.surah, body.ayahFrom, body.ayahTo):
        raise HTTPException(422, "Invalid surah or ayah range.")
    if body.ayahTo - body.ayahFrom > 30:
        raise HTTPException(422, "Choose at most 30 ayahs per analysis.")
    plan = auth.plan_of(user)
    if (rec["duration_s"] or 0) > plan.max_tajweed_seconds + 0.5:
        raise HTTPException(422, f"Tajweed analysis accepts recordings up to {plan.max_tajweed_seconds} s on your plan.")
    _guard_queue(user)
    day = quotas.reserve(user["id"], plan, "analysis")
    payload = body.model_dump()
    payload["maxSeconds"] = plan.max_tajweed_seconds
    return jobs.get(user["id"], jobs.enqueue(user["id"], "tajweed", payload, rec["id"], day))


@app.get("/api/tajweed/status")
def tajweed_status():
    return {"asr": asr.status()}


@app.get("/api/jobs")
def list_jobs(kind: str | None = None, limit: int = 20, user=Depends(auth.current_user)):
    limit = max(1, min(limit, 100))
    if kind:
        rows = db.all_("SELECT * FROM jobs WHERE user_id = ? AND kind = ? ORDER BY created_at DESC LIMIT ?", user["id"], kind, limit)
    else:
        rows = db.all_("SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", user["id"], limit)
    return {"jobs": [jobs.public(dict(r)) for r in rows]}


@app.get("/api/jobs/{jid}")
def get_job(jid: str, user=Depends(auth.current_user)):
    j = jobs.get(user["id"], jid)
    if j is None:
        raise HTTPException(404, "Job not found")
    return j


@app.delete("/api/jobs/{jid}")
def cancel_job(jid: str, user=Depends(auth.current_user)):
    if not jobs.cancel(user["id"], jid):
        raise HTTPException(404, "Job not found")
    return jobs.get(user["id"], jid)


# ------------------------------------------------------------------ progress

@app.get("/api/progress")
def get_progress(user=Depends(auth.current_user)):
    return progress.summary(user["id"])


@app.get("/api/daily")
def get_daily(user=Depends(auth.current_user)):
    return progress.daily(user["id"])


@app.get("/api/health")
def health():
    return {"ok": True, "engines": engine.engine_status(), "asr": asr.status(), "plans": list(PLANS)}


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_404(path: str):
    raise HTTPException(404, "Not found")


# ------------------------------------------------------------------ static SPA

def _dist() -> Path:
    return settings.web_dist


@app.get("/{path:path}")
def spa(path: str):
    dist = _dist()
    if not dist.is_dir():
        return JSONResponse({"detail": "Web app not built. Run `npm run build` in web/."}, status_code=404)
    target = (dist / path).resolve()
    if path and target.is_file() and dist.resolve() in target.parents:
        headers = {"Cache-Control": "public, max-age=31536000, immutable"} if "/assets/" in f"/{path}" else {}
        return FileResponse(target, headers=headers)
    return FileResponse(dist / "index.html", headers={"Cache-Control": "no-cache"})
