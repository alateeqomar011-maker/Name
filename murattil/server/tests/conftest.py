import os
import tempfile

# Configure the app for tests before anything imports murattil.config.
_TMP = tempfile.mkdtemp(prefix="murattil-test-")
os.environ.setdefault("MURATTIL_VAR_DIR", os.path.join(_TMP, "var"))
os.environ.setdefault("MURATTIL_MODELS_DIR", os.path.join(_TMP, "models"))
os.environ.setdefault("MURATTIL_SECURE_COOKIES", "0")
os.environ.setdefault("MURATTIL_WORKERS", "1")
os.environ.setdefault("MURATTIL_WARM_UP", "0")

import hashlib  # noqa: E402
import threading  # noqa: E402
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer  # noqa: E402
from pathlib import Path  # noqa: E402

import numpy as np  # noqa: E402
import pytest  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str, sr: int = 16000) -> np.ndarray:
    from murattil.audio.io import decode
    return decode((FIXTURES / name).read_bytes(), sr=sr)


class _RefHandler(BaseHTTPRequestHandler):
    """Stands in for everyayah.com: /data/<folder>/<sss><aaa>.mp3 returns a slice of real speech
    (the speaker depends on the folder), encoded as WAV."""
    voices: dict = {}
    hits: list = []

    def log_message(self, *a):
        pass

    def do_GET(self):
        from murattil.audio.io import encode_wav
        parts = self.path.strip("/").split("/")
        if len(parts) != 3 or parts[0] != "data" or not parts[2].endswith(".mp3"):
            self.send_response(404)
            self.end_headers()
            return
        folder, fname = parts[1], parts[2]
        if folder.startswith("Redirect"):
            self.send_response(302)
            self.send_header("Location", "http://169.254.169.254/latest/meta-data/")
            self.end_headers()
            return
        if folder.startswith("Missing"):
            self.send_response(404)
            self.end_headers()
            return
        y = self.voices["b" if "b" in folder.lower() else "a"]
        h = int(hashlib.sha1(fname.encode()).hexdigest(), 16)
        sr = 16000
        length = int((1.5 + (h % 100) / 50.0) * sr)
        start = (h // 100) % max(1, y.size - length)
        body = encode_wav(y[start:start + length], sr)
        type(self).hits.append(self.path)
        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@pytest.fixture(scope="session")
def ref_server():
    _RefHandler.voices = {"a": load("speaker_a.ogg"), "b": load("speaker_b.ogg")}
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _RefHandler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{srv.server_address[1]}", _RefHandler
    srv.shutdown()


@pytest.fixture()
def fake_reference(ref_server, monkeypatch):
    """Point the reciter catalogue at the local reference server."""
    from murattil import reciters
    base, handler = ref_server
    monkeypatch.setattr(reciters, "EVERYAYAH", base + "/data/{folder}/{s:03d}{a:03d}.mp3")
    monkeypatch.setattr(reciters, "allowed_reference_url", lambda url: url.startswith(base))
    monkeypatch.setattr(reciters, "mp3quran_index", lambda force=False: {})
    return handler
