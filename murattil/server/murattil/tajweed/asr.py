"""Quran-aware speech recognition with a CTC acoustic model in ONNX format.

Default model: the Quran-trained FastConformer CTC from the Tilawa project
(https://github.com/yazinsai/tilawa, release v0.2.0, MIT / NVIDIA CC-BY-4.0):
  fastconformer_full_mixed.onnx  — raw 16 kHz audio in, per-frame log posteriors out
  vocab.json                     — {id: token}, SentencePiece-style pieces with "▁" word prefix
  quran_ctc_tokens.json          — {"surah:ayah": [token ids]}, the reference tokenisation of every ayah
scripts/fetch_models.py downloads them into models/asr/.

The model's input signature is inspected at load time: raw-waveform models get audio directly;
models that expect 80-bin log-mel features get NeMo-style features computed here.
"""
from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path

import numpy as np

from ..config import settings
from ..quran import normalize
from .ctc import log_softmax

log = logging.getLogger(__name__)

MODEL_FILE = "fastconformer_full_mixed.onnx"
VOCAB_FILE = "vocab.json"
TOKENS_FILE = "quran_ctc_tokens.json"
WORD = "▁"
SR = 16000
# one-to-one letter folding applied to token text so it lines up with quran.normalize()
_CHARMAP = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي", "ؤ": "و", "ئ": "ي"})


class AsrUnavailable(RuntimeError):
    pass


def model_dir() -> Path:
    return settings.models_dir / "asr"


def status() -> dict:
    d = model_dir()
    missing = [f for f in (MODEL_FILE, VOCAB_FILE) if not (d / f).is_file()]
    return {"available": not missing and _error is None,
            "reason": (f"model files not installed: {', '.join(missing)}" if missing else _error),
            "name": "Quran FastConformer CTC (Tilawa)", "referenceTokens": (d / TOKENS_FILE).is_file()}


@dataclass
class Recognition:
    logp: np.ndarray        # (T, V) log posteriors
    frame_s: float          # seconds per output frame
    blank: int


class CtcModel:
    def __init__(self, session, vocab: dict[int, str], verse_tokens: dict[str, list[int]] | None):
        self.session = session
        self.vocab = vocab
        self.verse_tokens = verse_tokens or {}
        inp = session.get_inputs()
        self.input_names = [i.name for i in inp]
        self.raw_audio = len(inp[0].shape) == 2
        self.blank = self._blank_id()
        self.piece_to_id = {v: k for k, v in vocab.items()}
        self._lock = threading.Lock()

    def _blank_id(self) -> int:
        for k, v in self.vocab.items():
            if v in ("<blank>", "<blk>", "<pad>"):
                return k
        out_dim = self.session.get_outputs()[0].shape[-1]
        if isinstance(out_dim, int) and out_dim == len(self.vocab) + 1:
            return out_dim - 1
        return max(self.vocab)

    # -------------------------------------------------------------- inference

    def recognize(self, wav16k: np.ndarray) -> Recognition:
        x = np.ascontiguousarray(wav16k, dtype=np.float32)
        if self.raw_audio:
            feeds = {self.input_names[0]: x[None]}
            n_in = x.size
        else:
            feats = nemo_logmel(x)
            feeds = {self.input_names[0]: feats[None]}
            n_in = feats.shape[1] * 160
        if len(self.input_names) > 1:
            length = feeds[self.input_names[0]].shape[-1]
            feeds[self.input_names[1]] = np.array([length], dtype=np.int64)
        with self._lock:
            out = self.session.run(None, feeds)[0]
        lp = np.asarray(out[0], dtype=np.float32)
        if lp.ndim != 2:
            raise RuntimeError(f"unexpected ASR output shape {out.shape}")
        if np.abs(np.exp(lp).sum(axis=1) - 1).max() > 1e-2:
            lp = log_softmax(lp)
        frame_s = (n_in / SR) / max(lp.shape[0], 1)
        return Recognition(logp=lp, frame_s=frame_s, blank=self.blank)

    def recognize_long(self, wav16k: np.ndarray, chunk_s: float = 30.0, overlap_s: float = 4.0) -> Recognition:
        """Recognise audio of any length in overlapping chunks (attention memory grows with the
        square of the length). Each output frame is taken from the chunk where it lies furthest
        from a chunk edge."""
        n = wav16k.size
        if n <= (chunk_s + overlap_s) * SR:
            return self.recognize(wav16k)
        hop = int((chunk_s - overlap_s) * SR)
        size = int(chunk_s * SR)
        first = self.recognize(wav16k[:size])
        frame_s = first.frame_s
        total = int(np.ceil(n / SR / frame_s)) + 2
        out = np.full((total, first.logp.shape[1]), np.nan, dtype=np.float32)
        dist = np.full(total, -1.0)
        start = 0
        rec = first
        while True:
            m = rec.logp.shape[0]
            g0 = int(round(start / SR / frame_s))
            for i in range(m):
                g = g0 + i
                if g >= total:
                    break
                # distance to the nearest *artificial* chunk edge (the recording's own start and end are not)
                lead = i if start > 0 else 10 ** 6
                tail = (m - 1 - i) if start + size < n else 10 ** 6
                d = min(lead, tail)
                if d > dist[g]:
                    dist[g] = d
                    out[g] = rec.logp[i]
            if start + size >= n:
                break
            start += hop
            rec = self.recognize(wav16k[start:start + size])
        valid = ~np.isnan(out[:, 0])
        last = int(np.flatnonzero(valid)[-1]) + 1 if valid.any() else 0
        lp = out[:last]
        lp[np.isnan(lp[:, 0])] = np.log(np.full(lp.shape[1], 1e-6) + np.eye(1, lp.shape[1], self.blank)[0])
        return Recognition(logp=lp, frame_s=frame_s, blank=self.blank)

    def words_with_times(self, rec: Recognition) -> list[dict]:
        """Greedy transcript as words with start/end times (seconds)."""
        from .ctc import greedy
        out: list[dict] = []
        for tid, a, b in greedy(rec.logp, rec.blank):
            piece = self.vocab.get(tid, "")
            if piece in ("<unk>", "<blank>"):
                continue
            if piece.startswith(WORD) or not out:
                out.append({"raw": "", "start": a * rec.frame_s, "end": (b + 1) * rec.frame_s})
            out[-1]["raw"] += piece
            out[-1]["end"] = (b + 1) * rec.frame_s
        for w in out:
            w["text"] = normalize(w["raw"].replace(WORD, " "))
        return [w for w in out if w["text"]]

    # -------------------------------------------------------------- text <-> tokens

    def decode_text(self, ids: list[int]) -> str:
        s = "".join(self.vocab.get(i, "") for i in ids if i != self.blank and self.vocab.get(i) not in ("<unk>", "<blank>"))
        return normalize(s.replace(WORD, " "))

    def ayah_tokens(self, surah: int, ayah: int) -> list[int] | None:
        """Reference tokens of one ayah. The Tilawa table is keyed "surah:from:to"; older exports
        used "surah:ayah". The first ayah of a surah includes the basmalah, which is stripped."""
        ids = self.verse_tokens.get(f"{surah}:{ayah}:{ayah}") or self.verse_tokens.get(f"{surah}:{ayah}")
        if ids is None:
            return None
        ids = list(ids)
        if ayah == 1 and surah not in (1, 9):
            bas = self.basmalah_tokens()
            if bas and ids[: len(bas)] == bas:
                ids = ids[len(bas):]
        return ids

    def basmalah_tokens(self) -> list[int]:
        ids = self.verse_tokens.get("1:1:1") or self.verse_tokens.get("1:1")
        return list(ids) if ids else self.tokenize("بسم الله الرحمن الرحيم")

    def passage_tokens(self, surah: int, a_from: int, a_to: int, words: list[dict],
                       include_basmalah: bool = False) -> tuple[list[int], list[int]]:
        """Token ids for the passage and, for each token, the index into `words` it belongs to.
        `words` must already start with the basmalah words when include_basmalah is set."""
        per_ayah = [self.ayah_tokens(surah, a) for a in range(a_from, a_to + 1)]
        if all(t is not None for t in per_ayah):
            ids = (self.basmalah_tokens() if include_basmalah else []) + [i for t in per_ayah for i in t]
        else:
            ids = self.tokenize(" ".join(w["norm"] for w in words))
        unk = {k for k, v in self.vocab.items() if v == "<unk>"}
        ids = [i for i in ids if i not in unk and i != self.blank]
        return ids, self.map_tokens_to_words(ids, words)

    def tokenize(self, text: str) -> list[int]:
        """Greedy longest-match segmentation into vocabulary pieces (fallback when the reference
        tokenisation is not installed)."""
        ids = []
        pieces = sorted(self.piece_to_id, key=len, reverse=True)
        for w in normalize(text).split():
            s = WORD + w
            i = 0
            while i < len(s):
                for p in pieces:
                    if p and s.startswith(p, i):
                        ids.append(self.piece_to_id[p])
                        i += len(p)
                        break
                else:
                    i += 1  # character missing from the vocabulary: skip it
        return ids

    def map_tokens_to_words(self, ids: list[int], words: list[dict]) -> list[int]:
        """Assign each token to one of our (KFGQPC) words by aligning the characters of the
        decoded token string with the characters of the normalised passage words."""
        tok_text = [self.vocab.get(i, "").replace(WORD, " ").translate(_CHARMAP) for i in ids]
        flat = "".join(tok_text)
        char_tok = [k for k, t in enumerate(tok_text) for _ in t]
        ours = ""
        char_word = []
        for wi, w in enumerate(words):
            if ours:
                ours += " "
                char_word.append(wi)
            ours += w["norm"]
            char_word += [wi] * len(w["norm"])
        sm = SequenceMatcher(None, flat, ours, autojunk=False)
        tok_word = [-1] * len(ids)
        for a, b, size in sm.get_matching_blocks():
            for k in range(size):
                ti = char_tok[a + k] if a + k < len(char_tok) else None
                if ti is not None and tok_word[ti] == -1 and ours[b + k] != " ":
                    tok_word[ti] = char_word[b + k]
        # tokens with no matched character (e.g. a lone "▁") inherit their neighbour's word
        last = 0
        for k in range(len(tok_word)):
            if tok_word[k] == -1:
                nxt = next((tok_word[j] for j in range(k + 1, len(tok_word)) if tok_word[j] != -1), last)
                tok_word[k] = nxt if tok_text[k].startswith(" ") else last
            last = tok_word[k]
        return tok_word


def nemo_logmel(x: np.ndarray, n_mels: int = 80) -> np.ndarray:
    """Log-mel features as NeMo's AudioToMelSpectrogramPreprocessor computes them by default
    (25 ms Hann window, 10 ms hop, n_fft 512, preemphasis 0.97, log with 2^-24 guard,
    per-feature normalisation)."""
    import librosa
    x = np.append(x[0], x[1:] - 0.97 * x[:-1]).astype(np.float32)
    S = np.abs(librosa.stft(x, n_fft=512, hop_length=160, win_length=400, window="hann", center=True)) ** 2
    mel = librosa.filters.mel(sr=SR, n_fft=512, n_mels=n_mels, fmin=0, fmax=8000, norm="slaney")
    m = np.log(mel @ S + 2 ** -24)
    m = (m - m.mean(axis=1, keepdims=True)) / (m.std(axis=1, keepdims=True) + 1e-5)
    return m.astype(np.float32)


_model: CtcModel | None = None
_error: str | None = None
_load_lock = threading.Lock()


def load() -> CtcModel:
    global _model, _error
    with _load_lock:
        if _model is not None:
            return _model
        d = model_dir()
        if not (d / MODEL_FILE).is_file() or not (d / VOCAB_FILE).is_file():
            raise AsrUnavailable(status()["reason"])
        try:
            import onnxruntime as ort
            so = ort.SessionOptions()
            so.intra_op_num_threads = max(1, settings.torch_threads)
            sess = ort.InferenceSession(str(d / MODEL_FILE), sess_options=so, providers=["CPUExecutionProvider"])
            vocab = {int(k): v for k, v in json.loads((d / VOCAB_FILE).read_text("utf-8")).items()}
            vt = None
            if (d / TOKENS_FILE).is_file():
                vt = {k: [int(i) for i in v] for k, v in json.loads((d / TOKENS_FILE).read_text("utf-8")).items()}
            _model = CtcModel(sess, vocab, vt)
        except Exception as e:  # pragma: no cover - depends on installed files
            _error = f"failed to load ASR model: {e}"
            log.exception("ASR load failed")
            raise AsrUnavailable(_error) from e
        return _model


def set_model_for_tests(m: CtcModel | None) -> None:
    global _model, _error
    _model, _error = m, None
