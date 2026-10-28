"""Job handlers: each takes (job row, payload, progress) and returns (result, output_recording_id)."""
from __future__ import annotations

import uuid

from . import db, quran, reciters, reference, storage
from .audio import analysis, style, world
from .audio.io import AudioError, decode
from .audio.vad import trim
from .jobs import UserFacingError
from .tajweed import coach
from .voice import engine, identity


def _input_audio(job: dict) -> tuple[dict, bytes]:
    rec = storage.get(job["user_id"], job["recording_id"])
    if rec is None:
        raise UserFacingError("The recording was deleted before processing started.")
    return rec, storage.original_path(rec).read_bytes()


def run_transform(job: dict, p: dict, progress):
    rec, data = _input_audio(job)
    req = engine.TransformRequest(
        reciter_id=p["reciterId"], surah=p.get("surah"), ayah_from=p.get("ayahFrom"), ayah_to=p.get("ayahTo"),
        controls=p.get("controls"), strength=float(p.get("strength", 0.6)),
        neural_mode=p.get("neuralMode", "auto"), neural_strength=float(p.get("neuralStrength", engine.DEFAULT_BLEND)),
        voice_model_id=p.get("voiceModelId"), recording_key=p.get("recordingKey"),
        max_seconds=float(p["maxSeconds"]),
    )
    try:
        res = engine.run(data, req, progress)
    except engine.TransformError as e:
        raise UserFacingError(str(e)) from e
    rname = reciters.get(req.reciter_id)["name"]["en"]
    where = ""
    if req.surah:
        sm = quran.surah_meta(req.surah)
        where = f" · {sm['en']} {req.ayah_from}–{req.ayah_to}" if req.ayah_from != req.ayah_to else f" · {sm['en']} {req.ayah_from}"
    title = f"{rname}-inspired style{where}"
    out = storage.save_generated(
        job["user_id"], "transform", res.wav, res.audio, res.sr, title=title, surah=req.surah,
        ayah_from=req.ayah_from, ayah_to=req.ayah_to, reciter_id=req.reciter_id, source_recording_id=rec["id"],
        meta={"peaks": res.peaks, "engine": res.report["engine"], "label": res.report["label"],
              "jobId": job["id"]})
    return res.report, out["id"]


def run_tajweed(job: dict, p: dict, progress):
    rec, data = _input_audio(job)
    try:
        report = coach.analyze(data, int(p["surah"]), int(p["ayahFrom"]), int(p["ayahTo"]),
                               max_seconds=float(p["maxSeconds"]), progress=progress)
    except coach.CoachError as e:
        raise UserFacingError(str(e)) from e
    errors = sum(1 for f in report["findings"] if f["severity"] == "error")
    warns = sum(1 for f in report["findings"] if f["severity"] == "warning")
    db.run("INSERT INTO practice(id, user_id, surah, ayah_from, ayah_to, job_id, recording_id, word_accuracy, errors,"
           " warnings, tajweed_flags, confidence, mode, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
           uuid.uuid4().hex, job["user_id"], int(p["surah"]), int(p["ayahFrom"]), int(p["ayahTo"]), job["id"], rec["id"],
           report["scores"]["wordAccuracy"], errors, warns, report["scores"]["tajweedFlags"],
           report["summary"]["confidence"], report["mode"], db.now())
    return report, None


def run_compare(job: dict, p: dict, progress):
    """Measure the user's voice against a reciter's style profile (no transformation)."""
    _, data = _input_audio(job)
    progress("decoding", 10)
    try:
        y = decode(data, sr=engine.SR, max_seconds=float(p["maxSeconds"]))
    except AudioError as e:
        raise UserFacingError(str(e)) from e
    y, _ = trim(y, engine.SR)
    progress("reference", 25)
    try:
        ref_prof, material = engine.reference_profile(p["reciterId"])
    except reference.ReferenceUnavailable as e:
        raise UserFacingError(f"The reference reciter's audio could not be loaded: {e}") from e
    progress("analysis", 50)
    try:
        user_prof = analysis.profile(y, engine.SR, params=world.analyze(y, engine.SR, accurate=y.size / engine.SR < 60))
    except ValueError as e:
        raise UserFacingError(str(e)) from e
    progress("identity", 80)
    sim = identity.similarity(identity.embed(y, engine.SR), identity.embed(material[: engine.SR * 60], engine.SR))
    suggested, _ = style.suggest(user_prof, ref_prof)
    progress("done", 100)
    return {
        "reciter": {"id": p["reciterId"], "name": reciters.get(p["reciterId"])["name"]},
        "profiles": {"user": user_prof.to_dict(), "reference": ref_prof.to_dict()},
        "descriptors": {"user": analysis.descriptors(user_prof), "reference": analysis.descriptors(ref_prof)},
        "comparison": analysis.compare(user_prof, ref_prof),
        "voiceSimilarity": None if sim is None else round(sim, 3),
        "suggested": suggested.to_dict(),
    }, None


def run_segment(job: dict, p: dict, progress):
    progress("reference", 10)
    try:
        t = reference.surah_timings(p["server"], int(p["surah"]))
    except reference.ReferenceUnavailable as e:
        raise UserFacingError(str(e)) from e
    if not t:
        raise UserFacingError("Ayah timings could not be computed for this recording.")
    progress("done", 100)
    return {"surah": int(p["surah"]), "ayahs": len(t), "unreliable": [x["ayah"] for x in t if not x["reliable"]]}, None


HANDLERS = {"transform": run_transform, "tajweed": run_tajweed, "compare": run_compare, "segment": run_segment}
