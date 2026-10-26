"""Reciter catalogue, audio source resolution and source health checks.

Two public sources are used, both streamed directly by the listener's browser (nothing is rehosted):
  * everyayah.com — one MP3 per ayah, which gives exact ayah-level sync, repeat and ranges;
  * mp3quran.net  — one MP3 per surah for reciters EveryAyah does not carry, resolved through the
                    mp3quran v3 API; ayah timings are used when that API publishes them.
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time
import unicodedata
from functools import lru_cache
from urllib.parse import urlparse

import httpx

from .config import DATA_DIR, settings

log = logging.getLogger(__name__)

EVERYAYAH = "https://everyayah.com/data/{folder}/{s:03d}{a:03d}.mp3"
MP3QURAN_RECITERS = "https://mp3quran.net/api/v3/reciters?language={lang}"
MP3QURAN_TIMING_READS = "https://mp3quran.net/api/v3/ayat_timing/reads"
MP3QURAN_TIMING = "https://mp3quran.net/api/v3/ayat_timing?surah={s}&read={read}"

_cache_lock = threading.Lock()


@lru_cache(maxsize=1)
def _raw() -> list[dict]:
    return json.loads((DATA_DIR / "reciters.json").read_text("utf-8"))["reciters"]


def get(reciter_id: str) -> dict | None:
    for r in _raw():
        if r["id"] == reciter_id:
            return r
    return None


def ayah_url(folder: str, surah: int, ayah: int) -> str:
    return EVERYAYAH.format(folder=folder, s=surah, a=ayah)


# ---------------------------------------------------------------- small JSON disk cache

def _cache_path(name: str):
    d = settings.cache_dir / "catalog"
    d.mkdir(parents=True, exist_ok=True)
    return d / name


def _cache_get(name: str, max_age: float):
    p = _cache_path(name)
    try:
        if p.is_file() and time.time() - p.stat().st_mtime < max_age:
            return json.loads(p.read_text("utf-8"))
    except (OSError, ValueError):
        pass
    return None


def _cache_put(name: str, value) -> None:
    p = _cache_path(name)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False), "utf-8")
    tmp.replace(p)


def _client() -> httpx.Client:
    return httpx.Client(timeout=settings.http_timeout, follow_redirects=True,
                        headers={"User-Agent": "Murattil/0.1 (Quran recitation practice)"})


# ---------------------------------------------------------------- mp3quran resolution

_AR_DIAC = re.compile("[ؐ-ًؚ-ٰٟـ]")


def norm_name(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "").lower()
    s = _AR_DIAC.sub("", s)
    s = s.translate(str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ة": "ه", "ى": "ي"}))
    s = re.sub(r"\b(al|el|ash|as|ad|ar)[- ]", "al", s)
    s = re.sub(r"[^\w]+", "", s)
    return s


def _pick_moshaf(moshafs: list[dict]) -> dict | None:
    """Prefer a Hafs murattal recording with all 114 surahs."""
    def score(m):
        name = m.get("name") or ""
        s = 0
        if "حفص" in name or "hafs" in name.lower():
            s += 4
        if "مرتل" in name or "murattal" in name.lower():
            s += 2
        s += min(int(m.get("surah_total") or 0), 114) / 114
        return s
    ms = [m for m in moshafs if m.get("server")]
    return max(ms, key=score) if ms else None


def mp3quran_index(force: bool = False) -> dict | None:
    """{normalised name: moshaf dict} from the mp3quran API, cached for a day. None if unreachable."""
    with _cache_lock:
        if not force:
            cached = _cache_get("mp3quran_reciters.json", 86400)
            if cached is not None:
                return cached
        index: dict[str, dict] = {}
        try:
            with _client() as c:
                for lang in ("ar", "eng"):
                    r = c.get(MP3QURAN_RECITERS.format(lang=lang))
                    r.raise_for_status()
                    for rec in r.json().get("reciters", []):
                        m = _pick_moshaf(rec.get("moshaf") or [])
                        if m:
                            index[norm_name(rec.get("name", ""))] = {
                                "reciterId": rec.get("id"), "name": rec.get("name"),
                                "moshafId": m.get("id"), "moshafName": m.get("name"),
                                "server": m["server"].rstrip("/") + "/",
                                "surahs": [int(x) for x in str(m.get("surah_list") or "").split(",") if x.strip().isdigit()],
                            }
        except (httpx.HTTPError, ValueError) as e:
            log.warning("mp3quran API unavailable: %s", e)
            stale = _cache_get("mp3quran_reciters.json", 30 * 86400)
            return stale
        _cache_put("mp3quran_reciters.json", index)
        return index


def mp3quran_for(reciter: dict, index: dict | None) -> dict | None:
    if not index or not reciter.get("mp3quran"):
        return None
    for n in reciter["mp3quran"]["names"]:
        hit = index.get(norm_name(n))
        if hit:
            return hit
    return None


def mp3quran_timings(server: str, surah: int) -> list[dict] | None:
    """Per-ayah [start, end] in seconds for a full-surah file, when mp3quran publishes them."""
    key = f"timing_{re.sub(r'[^a-z0-9]+', '_', server.lower())}_{surah}.json"
    cached = _cache_get(key, 30 * 86400)
    if cached is not None:
        return cached or None
    try:
        with _client() as c:
            reads = _cache_get("timing_reads.json", 86400)
            if reads is None:
                r = c.get(MP3QURAN_TIMING_READS)
                r.raise_for_status()
                reads = r.json()
                _cache_put("timing_reads.json", reads)
            folder = server.rstrip("/").split("//", 1)[-1]
            read_id = None
            for rd in reads if isinstance(reads, list) else []:
                fu = str(rd.get("folder_url") or "").rstrip("/").split("//", 1)[-1]
                if fu and fu == folder:
                    read_id = rd.get("id")
                    break
            if read_id is None:
                _cache_put(key, [])
                return None
            r = c.get(MP3QURAN_TIMING.format(s=surah, read=read_id))
            r.raise_for_status()
            rows = r.json()
            out = [{"ayah": int(x["ayah"]), "start": float(x["start_time"]) / 1000.0, "end": float(x["end_time"]) / 1000.0}
                   for x in rows if int(x.get("ayah", 0)) > 0]
            _cache_put(key, out)
            return out or None
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as e:
        log.info("no mp3quran timings for %s %s: %s", server, surah, e)
        return None


# ---------------------------------------------------------------- health checks

def _probe(url: str) -> bool:
    try:
        with _client() as c:
            r = c.get(url, headers={"Range": "bytes=0-1"})
            return r.status_code in (200, 206) and "text/html" not in r.headers.get("content-type", "")
    except httpx.HTTPError:
        return False


def source_health(force: bool = False) -> dict:
    """{reciter_id: {"everyayah:<folder>": bool, "mp3quran": bool}} — cached 6 h, refreshed by a
    background task. Missing keys mean "not checked yet"."""
    cached = None if force else _cache_get("health.json", 6 * 3600)
    if cached is not None:
        return cached
    index = mp3quran_index()
    out: dict[str, dict] = {}
    for r in _raw():
        h: dict[str, bool] = {}
        for s in r.get("sources", []):
            if s["kind"] == "everyayah":
                h[f"everyayah:{s['folder']}"] = _probe(ayah_url(s["folder"], 1, 1))
        m = mp3quran_for(r, index)
        if m:
            h["mp3quran"] = _probe(m["server"] + "001.mp3")
        out[r["id"]] = h
    _cache_put("health.json", out)
    return out


def cached_health() -> dict:
    return _cache_get("health.json", 7 * 86400) or {}


# ---------------------------------------------------------------- public views

def recordings(reciter: dict, index: dict | None) -> list[dict]:
    """The playable recordings of a reciter, best first."""
    out = []
    for s in reciter.get("sources", []):
        if s["kind"] == "everyayah":
            out.append({"key": f"everyayah:{s['folder']}", "kind": "ayah", "style": s.get("style"),
                        "kbps": s.get("kbps"), "folder": s["folder"], "provider": "EveryAyah",
                        "urlTemplate": EVERYAYAH.replace("{folder}", s["folder"]).replace("{s:03d}", "{surah}").replace("{a:03d}", "{ayah}")})
    m = mp3quran_for(reciter, index)
    if m:
        out.append({"key": "mp3quran", "kind": "surah", "style": "murattal", "provider": "mp3quran.net",
                    "server": m["server"], "surahs": m["surahs"], "moshafName": m.get("moshafName")})
    return out


def public_catalog() -> list[dict]:
    index = mp3quran_index()
    health = cached_health()
    out = []
    for r in _raw():
        recs = recordings(r, index)
        h = health.get(r["id"], {})
        for rec in recs:
            rec["healthy"] = h.get(rec["key"])  # None = not checked yet
        out.append({
            "id": r["id"], "name": r["name"], "country": r.get("country"), "about": r.get("about"),
            "tags": r.get("tags", []), "recordings": recs,
            "voiceModel": None,  # see voice/registry.py — none authorised
            "styleTransfer": "style-inspired",
        })
    return out


def similar(reciter_id: str, profiles: dict[str, dict] | None = None, k: int = 4) -> list[dict]:
    """Similar reciters. When measured voice profiles exist for both reciters the distance is
    acoustic (register, range, warmth, pace); otherwise it falls back to shared catalogue tags.
    Each result says which basis was used."""
    base = get(reciter_id)
    if not base:
        return []
    profiles = profiles or {}
    pb = profiles.get(reciter_id)
    scored = []
    for r in _raw():
        if r["id"] == reciter_id:
            continue
        pr = profiles.get(r["id"])
        if pb and pr:
            keys = ["pitch", "range", "melody", "warmth", "brightness", "pace"]
            vals = [(pb.get(x), pr.get(x)) for x in keys]
            vals = [(a, b) for a, b in vals if a is not None and b is not None]
            if vals:
                d = sum((a - b) ** 2 for a, b in vals) ** 0.5 / len(vals) ** 0.5
                scored.append((d / 100.0, r["id"], "measured voice profile"))
                continue
        shared = len(set(base.get("tags", [])) & set(r.get("tags", [])))
        same_country = 1 if base.get("country") and base.get("country") == r.get("country") else 0
        scored.append((1.0 - 0.2 * shared - 0.15 * same_country + 0.5, r["id"], "shared style tags"))
    scored.sort()
    return [{"id": rid, "basis": basis, "distance": round(d, 3)} for d, rid, basis in scored[:k]]


def allowed_reference_url(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return urlparse(url).scheme == "https" and host in settings.reference_hosts
