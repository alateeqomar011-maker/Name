"""Audio decoding/encoding. All decoding goes through ffmpeg so any browser recording format works."""
from __future__ import annotations

import io
import json
import struct
import subprocess
import wave

import numpy as np


class AudioError(ValueError):
    """Raised for audio the user supplied that we cannot use. The message is safe to show."""


def probe(data: bytes, timeout: float = 30) -> dict:
    """Return {duration, codec, sample_rate, channels} for an audio blob, or raise AudioError."""
    try:
        proc = subprocess.run(
            ["ffprobe", "-v", "error", "-protocol_whitelist", "pipe", "-select_streams", "a:0", "-show_entries",
             "stream=codec_name,sample_rate,channels:format=duration,format_name", "-of", "json", "pipe:0"],
            input=data, capture_output=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired as e:
        raise AudioError("Reading the audio file took too long.") from e
    if proc.returncode != 0:
        raise AudioError("This file could not be read as audio.")
    info = json.loads(proc.stdout or b"{}")
    streams = info.get("streams") or []
    if not streams:
        raise AudioError("This file has no audio track.")
    st = streams[0]
    dur = info.get("format", {}).get("duration")
    return {
        "duration": float(dur) if dur not in (None, "N/A") else None,
        "codec": st.get("codec_name"),
        "sample_rate": int(st.get("sample_rate") or 0),
        "channels": int(st.get("channels") or 0),
        "format": info.get("format", {}).get("format_name"),
    }


def decode(data: bytes, sr: int = 16000, max_seconds: float | None = None, timeout: float = 120) -> np.ndarray:
    """Decode any audio blob to mono float32 at `sr`. Raises AudioError on bad input."""
    # Only the pipe protocol is allowed: an uploaded "audio" file that is really a playlist (HLS, concat,
    # etc.) must not be able to make ffmpeg read local files or fetch URLs.
    args = ["ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "pipe", "-i", "pipe:0"]
    if max_seconds is not None:
        # decode slightly more than allowed so we can tell the user it was too long
        args += ["-t", f"{max_seconds + 1:.3f}"]
    args += ["-vn", "-ac", "1", "-ar", str(sr), "-f", "f32le", "pipe:1"]
    try:
        proc = subprocess.run(args, input=data, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        raise AudioError("Decoding the audio took too long.") from e
    if proc.returncode != 0:
        raise AudioError("This audio could not be decoded.")
    y = np.frombuffer(proc.stdout, dtype=np.float32).copy()
    if y.size == 0:
        raise AudioError("The recording is empty.")
    if not np.all(np.isfinite(y)):
        y = np.nan_to_num(y)
    if max_seconds is not None and y.size > (max_seconds + 0.5) * sr:
        raise AudioError(f"The recording is longer than the {int(max_seconds)} s allowed for this feature.")
    return y


def decode_file(path, sr: int = 16000, max_seconds: float | None = None) -> np.ndarray:
    with open(path, "rb") as f:
        return decode(f.read(), sr=sr, max_seconds=max_seconds)


def resample(y: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
    if sr_in == sr_out:
        return y.astype(np.float32, copy=False)
    from scipy.signal import resample_poly
    g = np.gcd(sr_in, sr_out)
    return resample_poly(y, sr_out // g, sr_in // g).astype(np.float32)


def peak_normalize(y: np.ndarray, peak_db: float = -1.0) -> np.ndarray:
    m = float(np.max(np.abs(y))) if y.size else 0.0
    if m < 1e-9:
        return y
    return (y * (10 ** (peak_db / 20) / m)).astype(np.float32)


def _k_weight(y: np.ndarray, sr: int) -> np.ndarray:
    """ITU-R BS.1770 K-weighting (pre-filter + RLB high-pass), designed for any sample rate."""
    from scipy.signal import lfilter
    # Stage 1: high-shelf (+4 dB above ~1.5 kHz)
    f0, g, q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    k = np.tan(np.pi * f0 / sr)
    vh = 10 ** (g / 20)
    vb = vh ** 0.4996667741545416
    a0 = 1 + k / q + k * k
    b = [(vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0]
    a = [1, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]
    y = lfilter(b, a, y)
    # Stage 2: high-pass at ~38 Hz
    f0, q = 38.13547087602444, 0.5003270373238773
    k = np.tan(np.pi * f0 / sr)
    a0 = 1 + k / q + k * k
    b = [1, -2, 1]
    a = [1, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]
    return lfilter(b, a, y)


def loudness_lufs(y: np.ndarray, sr: int) -> float:
    """Gated integrated loudness (BS.1770-4) of a mono signal."""
    if y.size < sr * 0.4:
        return -70.0
    z = _k_weight(y.astype(np.float64), sr)
    block, hop = int(0.4 * sr), int(0.1 * sr)
    n = 1 + (len(z) - block) // hop
    idx = np.arange(block)[None, :] + hop * np.arange(n)[:, None]
    ms = np.mean(z[idx] ** 2, axis=1)
    lk = -0.691 + 10 * np.log10(ms + 1e-12)
    ms = ms[lk > -70]
    if ms.size == 0:
        return -70.0
    rel = -0.691 + 10 * np.log10(np.mean(ms) + 1e-12) - 10
    ms2 = ms[(-0.691 + 10 * np.log10(ms + 1e-12)) > rel]
    if ms2.size == 0:
        return -70.0
    return float(-0.691 + 10 * np.log10(np.mean(ms2) + 1e-12))


def loudness_normalize(y: np.ndarray, sr: int, target_lufs: float = -18.0, peak_db: float = -1.0) -> np.ndarray:
    lufs = loudness_lufs(y, sr)
    if lufs <= -69:
        return y.astype(np.float32)
    out = y * 10 ** ((target_lufs - lufs) / 20)
    m = float(np.max(np.abs(out)))
    lim = 10 ** (peak_db / 20)
    if m > lim:
        out = out * (lim / m)
    return out.astype(np.float32)


def encode_wav(y: np.ndarray, sr: int, comment: str | None = None) -> bytes:
    """16-bit PCM WAV. `comment` is stored in a LIST/INFO ICMT chunk (shows up in most players)."""
    pcm = (np.clip(y, -1, 1) * 32767).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm)
    data = bytearray(buf.getvalue())
    if comment:
        txt = comment.encode("utf-8") + b"\x00"
        if len(txt) % 2:
            txt += b"\x00"
        sub = b"ICMT" + struct.pack("<I", len(txt)) + txt
        lst = b"LIST" + struct.pack("<I", 4 + len(sub)) + b"INFO" + sub
        data += lst
        struct.pack_into("<I", data, 4, len(data) - 8)
    return bytes(data)


def encode_m4a(y: np.ndarray, sr: int, bitrate: str = "96k", timeout: float = 120) -> bytes:
    """AAC in MP4 (plays in every browser, including Safari), used for the playback copy."""
    import os
    import tempfile
    pcm = (np.clip(y, -1, 1) * 32767).astype("<i2").tobytes()
    fd, path = tempfile.mkstemp(suffix=".m4a")
    os.close(fd)
    try:
        # MP4 needs a seekable output for the moov atom, so write to a temporary file
        proc = subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "s16le", "-ar", str(sr), "-ac", "1", "-i", "pipe:0",
             "-c:a", "aac", "-b:a", bitrate, "-movflags", "+faststart", path],
            input=pcm, capture_output=True, timeout=timeout,
        )
        if proc.returncode != 0:
            raise RuntimeError("AAC encoding failed: " + proc.stderr.decode(errors="replace")[-300:])
        with open(path, "rb") as f:
            return f.read()
    finally:
        os.unlink(path)


def peaks(y: np.ndarray, n: int = 800) -> list[float]:
    """Downsampled absolute-peak envelope for waveform drawing (values 0..1)."""
    if y.size == 0:
        return []
    n = max(1, min(n, y.size))
    edges = np.linspace(0, y.size, n + 1).astype(int)
    out = np.maximum.reduceat(np.abs(y), edges[:-1])
    m = float(out.max()) or 1.0
    return [round(float(v) / m, 3) for v in out]
