"""Reciter Voice Studio engine: the full transformation pipeline behind one job.

  decode + trim  →  reference recitation  →  analysis (user, reference)  →  DTW alignment (same
  passage only)  →  prosody/timbre style transfer (WORLD)  →  optional neural stage (kNN-VC blend
  or authorised voice model)  →  identity guard  →  output + report

Every result says exactly which stages ran. When the neural stage is unavailable or rejected, the
output is labelled as a signal-processing transformation — it is never presented as AI output.
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Callable

import numpy as np

from .. import reciters, reference
from ..audio import analysis, style, world
from ..audio.align import align_recordings, dtw
from ..audio.io import AudioError, decode, encode_wav, loudness_normalize, peaks, resample
from ..audio.vad import trim
from ..config import settings
from . import identity, neural, registry

log = logging.getLogger(__name__)

SR = 24000
BLEND_CAP = 0.5        # maximum neural blend toward a reciter who has not authorised a voice model
DEFAULT_BLEND = 0.35
MIN_SECONDS = 1.5


class TransformError(RuntimeError):
    """A failure whose message is safe to show to the user."""


@dataclass
class TransformRequest:
    reciter_id: str
    surah: int | None = None
    ayah_from: int | None = None
    ayah_to: int | None = None
    controls: dict | None = None        # StyleControls fields; None = suggested from the reference
    strength: float = 0.6               # how far suggestions move toward the reference style
    neural_mode: str = "auto"           # auto | off | blend | authorized
    neural_strength: float = DEFAULT_BLEND
    voice_model_id: str | None = None
    recording_key: str | None = None    # which of the reciter's recordings to use as reference
    max_seconds: float = 45


@dataclass
class TransformResult:
    wav: bytes
    report: dict
    audio: np.ndarray
    sr: int = SR
    peaks: list = field(default_factory=list)


def engine_status() -> dict:
    n = neural.status()
    return {
        "style": {"available": True, "name": "WORLD vocoder prosody & timbre transfer"},
        "neural": {"available": n.available, "name": "kNN-VC (WavLM-Large + HiFi-GAN)", "reason": n.reason,
                   "blendCap": BLEND_CAP},
        "identityGuard": {"available": identity.available(), "name": "Resemblyzer speaker encoder"},
        "authorizedVoiceModels": [m.public() for m in registry.load_all()],
    }


def _reciter_name(rid: str) -> dict:
    r = reciters.get(rid)
    return r["name"] if r else {"en": rid, "ar": rid}


def reference_profile(reciter_id: str) -> tuple[analysis.VoiceProfile, np.ndarray]:
    """Cached style profile of a reciter from their short-surah material (and the material itself)."""
    material = reference.profile_material(reciter_id, SR, max_seconds=150)
    d = settings.cache_dir / "profiles"
    d.mkdir(parents=True, exist_ok=True)
    p = d / f"{reciter_id}.json"
    if p.is_file():
        try:
            return analysis.VoiceProfile(**json.loads(p.read_text())), material
        except (TypeError, ValueError):
            pass
    prof = analysis.profile(material, SR, params=world.analyze(material, SR, accurate=False))
    p.write_text(json.dumps(prof.to_dict()))
    return prof, material


def cached_reference_descriptors() -> dict[str, dict]:
    d = settings.cache_dir / "profiles"
    out = {}
    if d.is_dir():
        for p in d.glob("*.json"):
            try:
                out[p.stem] = analysis.descriptors(analysis.VoiceProfile(**json.loads(p.read_text())))
            except (TypeError, ValueError):
                continue
    return out


def run(audio: bytes, req: TransformRequest, progress: Callable[[str, int], None] | None = None) -> TransformResult:
    prog = progress or (lambda stage, pct: None)
    t0 = time.time()
    notes: list[str] = []
    rname = _reciter_name(req.reciter_id)
    if reciters.get(req.reciter_id) is None:
        raise TransformError("Unknown reciter.")

    # 1. the user's recording
    prog("decoding", 5)
    try:
        y = decode(audio, sr=SR, max_seconds=req.max_seconds)
    except AudioError as e:
        raise TransformError(str(e)) from e
    y, _ = trim(y, SR)
    if y.size < MIN_SECONDS * SR:
        raise TransformError("The recording has too little recitation to transform (at least 1.5 s needed).")
    y = loudness_normalize(y, SR, -18.0)

    # 2. reference recitation
    prog("reference", 12)
    ref_passage = None
    ref_info = None
    if req.surah and req.ayah_from and req.ayah_to:
        try:
            ref_passage, ref_info = reference.passage(req.reciter_id, req.surah, req.ayah_from, req.ayah_to, SR,
                                                      recording_key=req.recording_key)
        except reference.ReferenceUnavailable as e:
            notes.append(f"reference_passage_unavailable: {e}")
    try:
        ref_prof, ref_material = reference_profile(req.reciter_id)
    except reference.ReferenceUnavailable as e:
        if ref_passage is None:
            raise TransformError(f"The reference reciter's audio could not be loaded: {e}") from e
        ref_material = ref_passage
        ref_prof = analysis.profile(ref_passage, SR, params=world.analyze(ref_passage, SR, accurate=False))
        notes.append("reference_profile_from_passage_only")

    # 3. analysis
    prog("analysis", 25)
    up = world.analyze(y, SR, accurate=True)
    try:
        user_prof = analysis.profile(y, SR, params=up)
    except ValueError as e:
        raise TransformError(str(e)) from e

    # 4. alignment with the same passage (enables melody and timing transfer)
    alignment = None
    align_basis = None
    ref_params = None
    if ref_passage is not None:
        prog("alignment", 38)
        ref_y = loudness_normalize(ref_passage, SR, -18.0)
        try:
            alignment, align_basis = _align(y, ref_y)
            if alignment.plausible:
                ref_params = world.analyze(ref_y, SR, accurate=False)
            else:
                notes.append("alignment_implausible")
        except ValueError:
            notes.append("alignment_failed")

    # 5. controls
    suggested, targets = style.suggest(user_prof, ref_prof, strength=req.strength)
    controls = style.StyleControls.from_dict({**suggested.to_dict(), **(req.controls or {})})

    # 6. style stage
    prog("style", 50)
    styled, srep = style.transfer(y, SR, controls, targets=targets, params=up, ref_params=ref_params,
                                  alignment=alignment)

    # 7. neural stage
    final = styled
    engine = "style"
    neural_info: dict = {"requested": req.neural_mode, "used": False}
    ident = None
    mode = req.neural_mode
    voice_model = None
    if mode == "authorized":
        voice_model = registry.get(req.voice_model_id or "")
        if voice_model is None:
            raise TransformError("That authorised voice model is not available.")
    if mode in ("auto", "blend", "authorized"):
        st = neural.status()
        if not st.available:
            neural_info["unavailableReason"] = st.reason
            notes.append("neural_engine_unavailable")
        else:
            prog("neural", 62)
            try:
                y16 = resample(styled, SR, neural.SR)
                if voice_model is not None:
                    ms = voice_model.matching_set()
                    lam = float(min(1.0, max(0.0, req.neural_strength)))
                else:
                    rec_key = req.recording_key or "default"
                    ms = neural.cached_matching_set(
                        f"{req.reciter_id}:{rec_key}:v1",
                        lambda: neural.matching_set_from_audio([resample(ref_material, SR, neural.SR)]))
                    lam = float(min(BLEND_CAP, max(0.0, req.neural_strength)))
                conv = neural.convert(y16, ms, lam)
                if voice_model is None and not identity.available():
                    # without the speaker encoder the blend cannot be verified: do not ship it
                    notes.append("identity_guard_unavailable_neural_output_withheld")
                    conv = None
                elif voice_model is None:
                    # identity guard: the output must remain recognisably the user's own voice
                    prog("identity", 80)
                    ue = identity.embed(y, SR)
                    re_ = identity.embed(ref_material[: SR * 60], SR)
                    ident = identity.check(identity.embed(conv, neural.SR), ue, re_)
                    while not ident.passed and lam > 0.15:
                        lam = round(lam - 0.1, 3)
                        conv = neural.convert(y16, ms, lam)
                        ident = identity.check(identity.embed(conv, neural.SR), ue, re_)
                    if not ident.passed:
                        notes.append("identity_guard_rejected_neural_output")
                        conv = None
                if conv is not None:
                    final = loudness_normalize(resample(conv, neural.SR, SR), SR, -18.0)
                    engine = "authorized" if voice_model is not None else "blend"
                    neural_info.update({"used": True, "blend": lam, "bandwidthHz": neural.SR // 2})
            except neural.NeuralUnavailable as e:
                neural_info["unavailableReason"] = str(e)
                notes.append("neural_engine_unavailable")
            except reference.ReferenceUnavailable as e:
                notes.append(f"neural_reference_unavailable: {e}")
    if ident is None and identity.available():
        prog("identity", 85)
        ue = identity.embed(y, SR)
        ident = identity.check(identity.embed(final, SR), ue, identity.embed(ref_material[: SR * 60], SR))

    # 8. measurements of the result
    prog("measuring", 90)
    try:
        out_prof = analysis.profile(final, SR, params=world.analyze(final, SR, accurate=False))
        out_desc = analysis.descriptors(out_prof)
    except ValueError:
        out_prof, out_desc = None, None

    label = _labels(engine, rname, voice_model)
    comment = f"Murattil · {label['en']}. {label['disclaimer_en']}"
    wav = encode_wav(final, SR, comment=comment)
    report = {
        "engine": engine,
        "label": label,
        "reciter": {"id": req.reciter_id, "name": rname},
        "passage": ({"surah": req.surah, "from": req.ayah_from, "to": req.ayah_to} if req.surah else None),
        "reference": {"recording": (ref_info or {}).get("recording"), "passageUsed": ref_passage is not None,
                      "ayahs": (ref_info or {}).get("ayahs")},
        "alignment": None if alignment is None else {"cost": round(alignment.cost, 3), "costRatio": round(alignment.cost_ratio, 3),
                                                      "plausible": alignment.plausible, "basis": align_basis},
        "controls": controls.to_dict(),
        "suggested": suggested.to_dict(),
        "styleApplied": srep.applied,
        "neural": neural_info,
        "identity": ident.to_dict() if ident else None,
        "profiles": {"user": user_prof.to_dict(), "reference": ref_prof.to_dict(),
                     "output": out_prof.to_dict() if out_prof else None},
        "descriptors": {"user": analysis.descriptors(user_prof), "reference": analysis.descriptors(ref_prof),
                        "output": out_desc},
        "comparison": analysis.compare(user_prof, ref_prof),
        "durations": {"input": round(y.size / SR, 2), "output": round(final.size / SR, 2)},
        "notes": notes + srep.notes,
        "processingSeconds": round(time.time() - t0, 1),
    }
    prog("done", 100)
    return TransformResult(wav=wav, report=report, audio=final, peaks=peaks(final))


def _align(y: np.ndarray, ref_y: np.ndarray):
    """Align user and reference. With the Quran recogniser installed, align its phonetic posteriors
    (speaker independent); otherwise fall back to normalised MFCCs."""
    from ..tajweed import asr
    try:
        model = asr.load()
    except asr.AsrUnavailable:
        return align_recordings(y, ref_y, SR), "mfcc"
    ra = model.recognize(resample(y, SR, asr.SR))
    rb = model.recognize(resample(ref_y, SR, asr.SR))
    return dtw(np.exp(ra.logp), np.exp(rb.logp), hop_s=rb.frame_s), "asr-posteriorgram"


def _labels(engine: str, rname: dict, voice_model) -> dict:
    if engine == "authorized":
        vm = voice_model.display_name
        return {
            "en": f"Authorised voice model: {vm['en']} (kNN-VC neural voice conversion)",
            "ar": f"نموذج صوت مأذون: {vm.get('ar', vm['en'])} (تحويل صوتي عصبي kNN-VC)",
            "disclaimer_en": f"Converted with the documented consent of the voice owner ({voice_model.consent['grantedBy']}).",
            "disclaimer_ar": "حُوِّل بموافقة موثقة من صاحب الصوت.",
        }
    common_en = (f"This is your own recitation, transformed to be inspired by the style of {rname['en']}. "
                 f"It is not {rname['en']}'s voice and must not be presented as their recitation.")
    common_ar = (f"هذه تلاوتك أنت، حُوِّلت لتستلهم أسلوب {rname['ar']}. "
                 f"ليست صوت {rname['ar']} ولا يجوز نسبتها إليه.")
    if engine == "blend":
        return {"en": f"Style-inspired AI voice blend · inspired by {rname['en']} (kNN-VC neural conversion + prosody transfer)",
                "ar": f"مزج صوتي بالذكاء الاصطناعي مستلهم من أسلوب {rname['ar']} (تحويل عصبي kNN-VC ونقل الأداء)",
                "disclaimer_en": common_en, "disclaimer_ar": common_ar}
    return {"en": f"Style-inspired transformation · inspired by {rname['en']} (signal processing: WORLD vocoder prosody & timbre transfer — no neural voice conversion)",
            "ar": f"تحويل مستلهم من أسلوب {rname['ar']} (معالجة إشارة: نقل اللحن والنبرة عبر WORLD — دون تحويل صوتي عصبي)",
            "disclaimer_en": common_en, "disclaimer_ar": common_ar}
