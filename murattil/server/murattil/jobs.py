"""Background job queue for AI work (voice transformation, Tajweed analysis, voice comparison).

Jobs are rows in SQLite, so they survive restarts: anything left "running" when the process died is
re-queued on startup. Worker threads claim jobs atomically, report progress (stage + percent) that
the UI polls, and honour cancellation between stages.
"""
from __future__ import annotations

import logging
import threading
import time
import traceback
import uuid

from . import db, quotas, storage
from .config import settings

log = logging.getLogger(__name__)

QUOTA_KIND = {"transform": "transform", "tajweed": "analysis", "compare": "analysis", "segment": None}
MAX_ACTIVE_PER_USER = 2


class Cancelled(Exception):
    pass


class UserFacingError(Exception):
    """Failure whose message can be shown to the user as-is."""


_wake = threading.Event()
_threads: list[threading.Thread] = []
_stop = threading.Event()


def enqueue(user_id: str, kind: str, payload: dict, recording_id: str | None, quota_day: str | None) -> str:
    jid = uuid.uuid4().hex
    db.run("INSERT INTO jobs(id, user_id, kind, status, stage, progress, input, recording_id, quota_day, created_at)"
           " VALUES (?,?,?,?,?,?,?,?,?,?)", jid, user_id, kind, "queued", "queued", 0, db.jdump(payload),
           recording_id, quota_day, db.now())
    _wake.set()
    return jid


def active_count(user_id: str) -> int:
    return db.one("SELECT COUNT(*) AS n FROM jobs WHERE user_id = ? AND status IN ('queued','running')", user_id)["n"]


def queue_length() -> int:
    return db.one("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','running')")["n"]


def queue_position(job_id: str) -> int | None:
    row = db.one("SELECT created_at, status FROM jobs WHERE id = ?", job_id)
    if row is None or row["status"] != "queued":
        return None
    return db.one("SELECT COUNT(*) AS n FROM jobs WHERE status = 'queued' AND created_at < ?", row["created_at"])["n"] + 1


def get(user_id: str, job_id: str) -> dict | None:
    row = db.one("SELECT * FROM jobs WHERE id = ? AND user_id = ?", job_id, user_id)
    if row is None:
        return None
    return public(dict(row))


def public(j: dict) -> dict:
    return {
        "id": j["id"], "kind": j["kind"], "status": j["status"], "stage": j["stage"], "progress": j["progress"],
        "input": db.jload(j["input"], {}), "result": db.jload(j["result"]), "error": j["error"],
        "recordingId": j["recording_id"], "outputRecordingId": j["output_recording_id"],
        "createdAt": j["created_at"], "startedAt": j["started_at"], "finishedAt": j["finished_at"],
        "queuePosition": queue_position(j["id"]) if j["status"] == "queued" else None,
    }


def cancel(user_id: str, job_id: str) -> bool:
    row = db.one("SELECT status, quota_day, kind FROM jobs WHERE id = ? AND user_id = ?", job_id, user_id)
    if row is None:
        return False
    if row["status"] == "queued":
        n = db.run("UPDATE jobs SET status = 'cancelled', stage = 'cancelled', finished_at = ? WHERE id = ? AND status = 'queued'",
                   db.now(), job_id)
        if n and row["quota_day"]:
            quotas.refund(user_id, QUOTA_KIND[row["kind"]], row["quota_day"])
    elif row["status"] == "running":
        db.run("UPDATE jobs SET cancel_requested = 1 WHERE id = ?", job_id)
    return True


def _claim() -> dict | None:
    rows = db.conn().execute(
        "UPDATE jobs SET status = 'running', started_at = ?, stage = 'starting' WHERE id = ("
        " SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1) RETURNING *", (db.now(),)).fetchall()
    return dict(rows[0]) if rows else None


def _progress_fn(job_id: str):
    last = [0.0]

    def fn(stage: str, pct: int) -> None:
        t = time.time()
        if t - last[0] > 0.4 or pct >= 100:
            last[0] = t
            db.run("UPDATE jobs SET stage = ?, progress = ? WHERE id = ?", stage, int(pct), job_id)
            row = db.one("SELECT cancel_requested FROM jobs WHERE id = ?", job_id)
            if row and row["cancel_requested"]:
                raise Cancelled()
    return fn


def _run_one(job: dict) -> None:
    from .handlers import HANDLERS
    jid = job["id"]
    payload = db.jload(job["input"], {})
    try:
        result, output_id = HANDLERS[job["kind"]](job, payload, _progress_fn(jid))
        db.run("UPDATE jobs SET status = 'done', stage = 'done', progress = 100, result = ?, output_recording_id = ?,"
               " finished_at = ? WHERE id = ?", db.jdump(result), output_id, db.now(), jid)
    except Cancelled:
        db.run("UPDATE jobs SET status = 'cancelled', stage = 'cancelled', finished_at = ? WHERE id = ?", db.now(), jid)
        _refund(job)
    except UserFacingError as e:
        db.run("UPDATE jobs SET status = 'failed', stage = 'failed', error = ?, finished_at = ? WHERE id = ?",
               str(e), db.now(), jid)
        _refund(job)
    except Exception:
        log.error("job %s failed:\n%s", jid, traceback.format_exc())
        db.run("UPDATE jobs SET status = 'failed', stage = 'failed', error = ?, finished_at = ? WHERE id = ?",
               "Processing failed because of a server error. Your allowance was not used; please try again.",
               db.now(), jid)
        _refund(job)


def _refund(job: dict) -> None:
    if job.get("quota_day") and QUOTA_KIND.get(job["kind"]):
        quotas.refund(job["user_id"], QUOTA_KIND[job["kind"]], job["quota_day"])


def _worker() -> None:
    while not _stop.is_set():
        try:
            job = _claim()
        except Exception:  # database busy etc.
            log.exception("claim failed")
            job = None
        if job is None:
            _wake.wait(timeout=2.0)
            _wake.clear()
            continue
        _run_one(job)


def recover() -> int:
    """Re-queue jobs interrupted by a restart."""
    return db.run("UPDATE jobs SET status = 'queued', stage = 'queued', progress = 0 WHERE status = 'running'")


def start() -> None:
    if _threads:
        return
    recover()
    for i in range(max(1, settings.workers)):
        t = threading.Thread(target=_worker, name=f"murattil-worker-{i}", daemon=True)
        t.start()
        _threads.append(t)


def run_pending_now() -> None:
    """Process the queue synchronously (tests)."""
    while True:
        job = _claim()
        if job is None:
            return
        _run_one(job)


def cleanup(max_age_days: int = 30) -> None:
    db.run("DELETE FROM jobs WHERE finished_at IS NOT NULL AND finished_at < ?", db.now() - max_age_days * 86400)


__all__ = ["enqueue", "get", "cancel", "start", "Cancelled", "UserFacingError", "storage"]
