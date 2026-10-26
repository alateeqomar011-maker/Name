"""Neural voice conversion with kNN-VC (WavLM-Large layer-6 features + HiFi-GAN vocoder).

kNN-VC replaces every frame of the source's self-supervised speech representation with the average
of its k nearest frames from a *matching set* of target-speaker audio, then vocodes the result.
Because the representation keeps phonetic content, the words and their pronunciation come from the
user's recording; the timbre comes from the matched frames.

Murattil uses it in two ways:
  * blend mode — features are interpolated: (1 - λ)·user + λ·kNN(reciter). λ is capped for
    reciters who have not authorised a voice model, and an identity check (see identity.py) makes
    sure the result is still recognisably the user's own voice. This is the "style-inspired" path.
  * authorised voice model — full conversion (λ up to 1) toward a voice bank whose owner gave
    documented consent (see registry.py). None ship with the code.

Weights are not bundled. scripts/fetch_models.py downloads the original checkpoints released by the
kNN-VC authors.
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ..config import settings

log = logging.getLogger(__name__)

SR = 16000
HOP = 320  # WavLM frame hop at 16 kHz (20 ms)
FEATURE_LAYER = 6
WAVLM_FILE = "WavLM-Large.pt"
VOCODER_FILE = "prematch_g_02500000.pt"
MODEL_DIR_NAME = "knnvc"

# Hyper-parameters of WavLM-Large, used only to build a randomly initialised model in tests.
WAVLM_LARGE_CFG = {
    "extractor_mode": "layer_norm", "encoder_layers": 24, "encoder_embed_dim": 1024,
    "encoder_ffn_embed_dim": 4096, "encoder_attention_heads": 16, "layer_norm_first": True,
    "conv_bias": True, "normalize": True, "relative_position_embedding": True, "num_buckets": 320,
    "max_distance": 800, "gru_rel_pos": True, "dropout": 0.0, "attention_dropout": 0.0,
    "activation_dropout": 0.0, "encoder_layerdrop": 0.0, "dropout_input": 0.0, "dropout_features": 0.0,
}


class NeuralUnavailable(RuntimeError):
    """The neural engine cannot run on this server (weights missing or failed to load)."""


@dataclass
class EngineStatus:
    available: bool
    reason: str | None
    model_dir: str


def model_dir() -> Path:
    return settings.models_dir / MODEL_DIR_NAME


def status() -> EngineStatus:
    d = model_dir()
    missing = [f for f in (WAVLM_FILE, VOCODER_FILE) if not (d / f).is_file()]
    if missing:
        return EngineStatus(False, f"model files not installed: {', '.join(missing)}", str(d))
    if _load_error:
        return EngineStatus(False, _load_error, str(d))
    return EngineStatus(True, None, str(d))


_lock = threading.Lock()
_models: tuple | None = None
_load_error: str | None = None


def _build(wavlm_state: dict | None, vocoder_state: dict | None):
    import torch

    from .knnvc.hifigan.models import Generator
    from .knnvc.hifigan.utils import AttrDict
    from .knnvc.wavlm.WavLM import WavLM, WavLMConfig

    cfg_path = Path(__file__).parent / "knnvc" / "hifigan" / "config_v1_wavlm.json"
    h = AttrDict(json.loads(cfg_path.read_text()))
    gen = Generator(h)
    if vocoder_state is not None:
        gen.load_state_dict(vocoder_state["generator"])
    gen.eval()
    gen.remove_weight_norm()

    cfg = WavLMConfig(wavlm_state["cfg"] if wavlm_state is not None else WAVLM_LARGE_CFG)
    wavlm = WavLM(cfg)
    if wavlm_state is not None:
        wavlm.load_state_dict(wavlm_state["model"])
    wavlm.eval()
    torch.set_num_threads(max(1, settings.torch_threads))
    return wavlm, gen, h


def load(random_weights_for_tests: bool = False):
    """Load (once) and return (wavlm, vocoder, cfg). Raises NeuralUnavailable."""
    global _models, _load_error
    with _lock:
        if _models is not None:
            return _models
        if random_weights_for_tests:
            _models = _build(None, None)
            return _models
        st = status()
        if not st.available:
            raise NeuralUnavailable(st.reason)
        import torch
        try:
            d = model_dir()
            wavlm_state = torch.load(d / WAVLM_FILE, map_location="cpu", weights_only=True)
            vocoder_state = torch.load(d / VOCODER_FILE, map_location="cpu", weights_only=True)
            _models = _build(wavlm_state, vocoder_state)
        except Exception as e:  # pragma: no cover - depends on installed files
            _load_error = f"failed to load kNN-VC weights: {e}"
            log.exception("kNN-VC load failed")
            raise NeuralUnavailable(_load_error) from e
        return _models


def unload_for_tests() -> None:
    global _models, _load_error
    with _lock:
        _models = None
        _load_error = None


def features(wav16k: np.ndarray, chunk_s: float = 20.0, overlap_s: float = 1.0) -> np.ndarray:
    """WavLM layer-6 features, (T, 1024) float32, 20 ms hop. Long audio is processed in overlapping
    chunks (self-attention memory grows quadratically) and cross-faded."""
    import torch
    wavlm, _, _ = load()
    x = np.ascontiguousarray(wav16k, dtype=np.float32)
    n_frames = max(1, x.size // HOP)
    chunk = int(chunk_s * SR)
    ov = int(overlap_s * SR)
    out = np.zeros((n_frames, 1024), dtype=np.float32)
    weight = np.zeros((n_frames, 1), dtype=np.float32)
    start = 0
    with torch.inference_mode():
        while True:
            end = min(x.size, start + chunk)
            seg = x[start:end]
            if seg.size < 400:  # shorter than one conv receptive field
                seg = np.pad(seg, (0, 400 - seg.size))
            f = wavlm.extract_features(torch.from_numpy(seg)[None], output_layer=FEATURE_LAYER,
                                       ret_layer_results=False)[0][0].numpy()
            f0 = start // HOP
            m = min(len(f), n_frames - f0)
            if m <= 0:
                break
            w = np.ones((m, 1), dtype=np.float32)
            ovf = ov // HOP
            if start > 0 and ovf > 0:
                ramp = np.linspace(0, 1, min(ovf, m), dtype=np.float32)[:, None]
                w[: len(ramp)] = ramp
            out[f0:f0 + m] += f[:m] * w
            weight[f0:f0 + m] += w
            if end >= x.size:
                break
            start = end - ov
    return out / np.maximum(weight, 1e-6)


def vocode(feats: np.ndarray) -> np.ndarray:
    import torch
    _, gen, _ = load()
    with torch.inference_mode():
        y = gen(torch.from_numpy(np.ascontiguousarray(feats, dtype=np.float32))[None]).squeeze().numpy()
    return y.astype(np.float32)


def knn_match(query: np.ndarray, matching_set: np.ndarray, k: int = 4, block: int = 2048) -> np.ndarray:
    """Mean of the k nearest (cosine) matching-set frames for every query frame."""
    ms = matching_set.astype(np.float32)
    ms_n = ms / (np.linalg.norm(ms, axis=1, keepdims=True) + 1e-8)
    out = np.empty_like(query, dtype=np.float32)
    for a in range(0, len(query), block):
        q = query[a:a + block]
        qn = q / (np.linalg.norm(q, axis=1, keepdims=True) + 1e-8)
        sim = qn @ ms_n.T
        kk = min(k, ms.shape[0])
        idx = np.argpartition(-sim, kk - 1, axis=1)[:, :kk]
        out[a:a + block] = ms[idx].mean(axis=1)
    return out


def convert(wav16k: np.ndarray, matching_set: np.ndarray, blend: float, k: int = 4) -> np.ndarray:
    """Convert `wav16k`. blend=0 resynthesises the user's own features, blend=1 is full kNN-VC."""
    q = features(wav16k)
    lam = float(min(1.0, max(0.0, blend)))
    target = knn_match(q, matching_set, k=k) if lam > 0 else q
    mixed = (1 - lam) * q + lam * target
    y = vocode(mixed)
    n = wav16k.size
    return y[:n] if y.size >= n else np.pad(y, (0, n - y.size))


def matching_set_from_audio(wavs16k: list[np.ndarray]) -> np.ndarray:
    from ..audio.vad import speech_segments
    feats = []
    for w in wavs16k:
        segs = speech_segments(w, SR)
        for a, b in segs:
            seg = w[int(a * SR):int(b * SR)]
            if seg.size > SR // 2:
                feats.append(features(seg))
    if not feats:
        raise ValueError("no speech found in the reference audio")
    return np.concatenate(feats, axis=0)


def cached_matching_set(key: str, build) -> np.ndarray:
    """Matching sets are expensive (minutes of audio through WavLM); cache them on disk."""
    d = settings.cache_dir / "matching_sets"
    d.mkdir(parents=True, exist_ok=True)
    path = d / (hashlib.sha1(key.encode()).hexdigest() + ".npy")
    if path.is_file():
        return np.load(path)
    ms = build()
    tmp = path.with_suffix(".tmp.npy")
    np.save(tmp, ms.astype(np.float16))
    tmp.replace(path)
    return ms
