"""Server-side retrieval of reference recitations for analysis (style profiles, melody alignment,
kNN-VC matching sets). Only allow-listed HTTPS hosts are contacted, responses are size-capped and
cached on disk, and nothing fetched here is ever served back to users as a download."""
from __future__ import annotations

import hashlib
import json
import logging
import threading

import httpx
import numpy as np

from . import quran, reciters
from .audio.io import AudioError, decode, resample
from .config import settings

log = logging.getLogger(__name__)

MAX_BYTES = 40 * 1024 * 1024
GAP_S = 0.25
# Short, frequently recited surahs used to build a reciter's style profile and matching set.
PROFILE_PASSAGES = [(1, 1, 7), (112, 1, 4), (113, 1, 5), (114, 1, 6), (103, 1, 3), (108, 1, 3), (110, 1, 3)]

_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


class ReferenceUnavailable(RuntimeError):
    """The reference recitation could not be obtained; the message is safe to show to users."""


def _lock_for(key: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(key, threading.Lock())


def fetch(url: str) -> bytes:
    if not reciters.allowed_reference_url(url):
        raise ReferenceUnavailable("Reference audio host is not allowed.")
    d = settings.cache_dir / "reference"
    d.mkdir(parents=True, exist_ok=True)
    path = d / (hashlib.sha1(url.encode()).hexdigest() + ".bin")
    with _lock_for(url):
        if path.is_file():
            return path.read_bytes()
        try:
            with httpx.Client(timeout=settings.http_timeout, follow_redirects=False,
                              headers={"User-Agent": "Murattil/0.1 (Quran recitation practice)"}) as c:
                target = url
                for _ in range(4):  # follow redirects by hand so every hop is checked against the allow-list
                    with c.stream("GET", target) as r:
                        if r.is_redirect:
                            target = str(r.url.join(r.headers.get("location", "")))
                            if not reciters.allowed_reference_url(target):
                                raise ReferenceUnavailable("Reference audio redirected to a host that is not allowed.")
                            continue
                        if r.status_code != 200:
                            raise ReferenceUnavailable(f"The reference audio source answered HTTP {r.status_code}.")
                        buf = bytearray()
                        for chunk in r.iter_bytes():
                            buf += chunk
                            if len(buf) > MAX_BYTES:
                                raise ReferenceUnavailable("Reference audio file is unexpectedly large.")
                        break
                else:
                    raise ReferenceUnavailable("Too many redirects from the reference audio source.")
        except httpx.HTTPError as e:
            raise ReferenceUnavailable("The reference audio source could not be reached.") from e
        tmp = path.with_suffix(".tmp")
        tmp.write_bytes(bytes(buf))
        tmp.replace(path)
        return bytes(buf)


def _decode(data: bytes, sr: int) -> np.ndarray:
    try:
        return decode(data, sr=sr)
    except AudioError as e:
        raise ReferenceUnavailable("The reference audio could not be decoded.") from e


def passage(reciter_id: str, surah: int, a_from: int, a_to: int, sr: int,
            recording_key: str | None = None) -> tuple[np.ndarray, dict]:
    """Reference recitation of surah:a_from..a_to as one waveform, with per-ayah boundaries."""
    rec = reciters.get(reciter_id)
    if rec is None:
        raise ReferenceUnavailable("Unknown reciter.")
    n_ayahs = quran.surah_meta(surah)["ayahs"]
    if not (1 <= a_from <= a_to <= n_ayahs):
        raise ReferenceUnavailable("Invalid ayah range.")
    if a_to - a_from > 40:
        raise ReferenceUnavailable("Choose at most 40 ayahs for a reference passage.")
    recs = reciters.recordings(rec, reciters.mp3quran_index())
    if recording_key:
        recs = [r for r in recs if r["key"] == recording_key] or recs
    errors = []
    for r in recs:
        try:
            if r["kind"] == "ayah":
                parts, bounds, t = [], [], 0.0
                gap = np.zeros(int(GAP_S * sr), dtype=np.float32)
                for a in range(a_from, a_to + 1):
                    y = _decode(fetch(reciters.ayah_url(r["folder"], surah, a)), sr)
                    parts += [y, gap]
                    bounds.append({"ayah": a, "start": t, "end": t + y.size / sr})
                    t += y.size / sr + GAP_S
                return np.concatenate(parts[:-1]), {"recording": r["key"], "ayahs": bounds}
            if r["kind"] == "surah" and surah in (r.get("surahs") or [surah]):
                url = f"{r['server']}{surah:03d}.mp3"
                y = _decode(fetch(url), sr)
                timings = reciters.mp3quran_timings(r["server"], surah) or surah_timings(r["server"], surah, y, sr)
                whole = a_from == 1 and a_to == n_ayahs
                if not timings:
                    if whole:
                        return y, {"recording": r["key"], "ayahs": None}
                    errors.append("ayah timings are not available for this recording")
                    continue
                tm = {x["ayah"]: x for x in timings}
                if a_from not in tm or a_to not in tm:
                    errors.append("ayah timings incomplete")
                    continue
                a0, a1 = tm[a_from]["start"], tm[a_to]["end"]
                seg = y[int(a0 * sr):int(a1 * sr)]
                bounds = [{"ayah": a, "start": tm[a]["start"] - a0, "end": tm[a]["end"] - a0}
                          for a in range(a_from, a_to + 1) if a in tm]
                return seg, {"recording": r["key"], "ayahs": bounds}
        except ReferenceUnavailable as e:
            errors.append(str(e))
    raise ReferenceUnavailable(
        "No reference recitation is available for this passage from this reciter"
        + (f" ({errors[0]})." if errors else "."))


MAX_SEGMENT_MINUTES = 75.0


def computed_timings_path(server: str, surah: int):
    d = settings.cache_dir / "segments"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{hashlib.sha1(server.encode()).hexdigest()[:16]}_{surah:03d}.json"


def cached_computed_timings(server: str, surah: int) -> list[dict] | None:
    p = computed_timings_path(server, surah)
    if p.is_file():
        try:
            return json.loads(p.read_text())
        except ValueError:
            return None
    return None


def surah_timings(server: str, surah: int, y: np.ndarray | None = None, sr: int = 16000) -> list[dict] | None:
    """Ayah timings for a full-surah recording that has none published, computed by aligning the
    surah text to the audio with the Quran recogniser (see tajweed/segment.py). Cached. Returns
    None when the recogniser is not installed or the recording is too long."""
    cached = cached_computed_timings(server, surah)
    if cached is not None:
        return cached or None
    from .tajweed import asr, segment
    if not asr.status()["available"]:
        return None
    with _lock_for(f"segment:{server}:{surah}"):
        cached = cached_computed_timings(server, surah)
        if cached is not None:
            return cached or None
        if y is None:
            y, sr = _decode(fetch(f"{server}{surah:03d}.mp3"), 16000), 16000
        y16 = y if sr == 16000 else resample(y, sr, 16000)
        if y16.size / 16000 > MAX_SEGMENT_MINUTES * 60:
            return None
        n = quran.surah_meta(surah)["ayahs"]
        segs = segment.segment(y16, [(surah, a) for a in range(1, n + 1)])
        out = [{"ayah": sg["ayah"], "start": sg["start"], "end": sg["end"], "reliable": sg["reliable"],
                "computed": True} for sg in segs]
        computed_timings_path(server, surah).write_text(json.dumps(out))
        return out


def profile_material(reciter_id: str, sr: int, max_seconds: float = 300) -> np.ndarray:
    """A few minutes of the reciter's voice (short surahs) for style profiles and matching sets."""
    parts: list[np.ndarray] = []
    total = 0.0
    errors = []
    for s, a0, a1 in PROFILE_PASSAGES:
        try:
            y, _ = passage(reciter_id, s, a0, a1, sr)
        except ReferenceUnavailable as e:
            errors.append(str(e))
            continue
        parts.append(y)
        total += y.size / sr
        if total >= max_seconds:
            break
    if not parts:
        raise ReferenceUnavailable(errors[0] if errors else "No reference audio available for this reciter.")
    return np.concatenate(parts)
