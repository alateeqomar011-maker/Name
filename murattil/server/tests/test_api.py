"""API tests: sessions, privacy, CSRF, uploads, quotas, jobs and account deletion."""
import pytest
from conftest import FIXTURES
from fastapi.testclient import TestClient

from murattil import jobs, quotas, storage
from murattil.main import app

H = {"X-Requested-With": "murattil"}


def client() -> TestClient:
    c = TestClient(app)
    r = c.get("/api/session")
    assert r.status_code == 200
    return c


def upload(c, name="speaker_a.ogg", **form):
    data = {"kind": "practice", **{k: str(v) for k, v in form.items()}}
    return c.post("/api/recordings", headers=H, data=data,
                  files={"file": (name, (FIXTURES / name).read_bytes(), "audio/ogg")})


def test_session_creates_private_anonymous_account():
    c = client()
    s = c.get("/api/session").json()
    assert s["user"]["anonymous"] is True
    assert s["plan"]["name"] == "free" and s["usage"]["analysis"]["used"] == 0
    assert "murattil_session" in c.cookies


def test_state_changing_requests_need_header():
    c = client()
    r = c.put("/api/favorites/alafasy")
    assert r.status_code == 403
    assert c.put("/api/favorites/alafasy", headers=H).json() == {"favorites": ["alafasy"]}


def test_quran_endpoints():
    c = TestClient(app)
    assert c.get("/api/quran/meta").json()["ayahCount"] == 6236
    s = c.get("/api/quran/surah/112").json()
    assert len(s["ayahs"]) == 4
    assert c.get("/api/quran/surah/115").status_code == 404
    assert len(c.get("/api/quran/rules").json()) > 40


def test_reciter_catalogue():
    c = TestClient(app)
    rs = c.get("/api/reciters").json()["reciters"]
    ids = {r["id"] for r in rs}
    for rid in ["nufais", "alafasy", "sudais", "muaiqly", "dosari", "sobhi", "minshawi", "husary", "abdulbasit",
                "ghamdi", "qatami", "baleela"]:
        assert rid in ids
    assert all(r["voiceModel"] is None and r["styleTransfer"] == "style-inspired" for r in rs)
    d = c.get("/api/reciters/husary").json()
    assert [x["style"] for x in d["recordings"]][:3] == ["murattal", "muallim", "mujawwad"]
    assert len(d["similar"]) == 4 and d["similar"][0]["basis"] in ("shared style tags", "measured voice profile")


def test_recordings_are_private_and_deletable():
    alice, bob = client(), client()
    r = upload(alice, title="Fatiha attempt", surah=1, ayah_from=1, ayah_to=7)
    assert r.status_code == 200, r.text
    rec = r.json()
    assert abs(rec["duration"] - 16.7) < 0.2 and rec["peaks"]
    assert alice.get(f"/api/recordings/{rec['id']}/audio").status_code == 200
    assert bob.get(f"/api/recordings/{rec['id']}/audio").status_code == 404
    assert bob.delete(f"/api/recordings/{rec['id']}", headers=H).status_code == 404
    dl = alice.get(f"/api/recordings/{rec['id']}/download")
    assert dl.status_code == 200 and dl.content == (FIXTURES / "speaker_a.ogg").read_bytes()
    folder = storage.rec_dir(alice.get("/api/session").json()["user"]["id"], rec["id"])
    assert folder.is_dir()
    assert alice.delete(f"/api/recordings/{rec['id']}", headers=H).json()["deleted"] is True
    assert not folder.exists()
    assert alice.get(f"/api/recordings/{rec['id']}").status_code == 404


def test_upload_rejects_non_audio():
    c = client()
    r = c.post("/api/recordings", headers=H, data={"kind": "practice"},
               files={"file": ("x.mp3", b"definitely not audio", "audio/mpeg")})
    assert r.status_code == 422


def test_tajweed_job_without_asr_model_reports_limited_mode():
    c = client()
    rec = upload(c).json()
    j = c.post("/api/tajweed/analyze", headers=H, json={"recordingId": rec["id"], "surah": 1, "ayahFrom": 1, "ayahTo": 4}).json()
    assert j["status"] == "queued"
    jobs.run_pending_now()
    j = c.get(f"/api/jobs/{j['id']}").json()
    assert j["status"] == "done"
    assert j["result"]["mode"] == "limited" and j["result"]["findings"] == []
    assert c.get("/api/session").json()["usage"]["analysis"]["used"] == 1
    prog = c.get("/api/progress").json()
    assert prog["sessions"] == 1 and prog["streak"] == 1


def test_transform_job_end_to_end(fake_reference):
    c = client()
    rec = upload(c).json()
    j = c.post("/api/voice/transform", headers=H, json={"recordingId": rec["id"], "reciterId": "minshawi",
                                                        "neuralMode": "off"}).json()
    jobs.run_pending_now()
    j = c.get(f"/api/jobs/{j['id']}").json()
    assert j["status"] == "done", j["error"]
    out = c.get(f"/api/recordings/{j['outputRecordingId']}").json()
    assert out["kind"] == "transform" and out["engine"] == "style" and out["sourceRecordingId"] == rec["id"]
    assert "inspired" in out["title"]
    assert c.get(f"/api/recordings/{out['id']}/audio").status_code == 200
    assert c.get("/api/session").json()["usage"]["transform"]["used"] == 1


def test_failed_job_refunds_quota(fake_reference, monkeypatch):
    from murattil import reciters
    c = client()
    rec = upload(c).json()
    monkeypatch.setattr(reciters, "EVERYAYAH", "http://127.0.0.1:9/{folder}/{s}{a}.mp3")
    monkeypatch.setattr(reciters, "allowed_reference_url", lambda u: True)
    (storage.settings.cache_dir / "profiles" / "qatami.json").unlink(missing_ok=True)
    j = c.post("/api/voice/transform", headers=H, json={"recordingId": rec["id"], "reciterId": "qatami"}).json()
    jobs.run_pending_now()
    j = c.get(f"/api/jobs/{j['id']}").json()
    assert j["status"] == "failed" and "could not be loaded" in j["error"]
    assert c.get("/api/session").json()["usage"]["transform"]["used"] == 0


def test_daily_quota_enforced(monkeypatch):
    c = client()
    rec = upload(c).json()
    uid = c.get("/api/session").json()["user"]["id"]
    from murattil.config import FREE_PLAN
    for _ in range(FREE_PLAN.voice_transforms_per_day):
        quotas.reserve(uid, FREE_PLAN, "transform")
    r = c.post("/api/voice/transform", headers=H, json={"recordingId": rec["id"], "reciterId": "alafasy"})
    assert r.status_code == 429 and "resets" in r.json()["detail"]


def test_cancel_queued_job_refunds():
    c = client()
    rec = upload(c).json()
    j = c.post("/api/tajweed/analyze", headers=H, json={"recordingId": rec["id"], "surah": 112, "ayahFrom": 1, "ayahTo": 4}).json()
    assert c.delete(f"/api/jobs/{j['id']}", headers=H).json()["status"] == "cancelled"
    assert c.get("/api/session").json()["usage"]["analysis"]["used"] == 0


def test_register_login_logout_and_delete_account():
    c = client()
    upload(c)
    r = c.post("/api/auth/register", headers=H, json={"email": "Reader@example.com", "password": "correct horse battery"})
    assert r.status_code == 200 and r.json()["user"]["email"] == "reader@example.com"
    assert c.post("/api/auth/register", headers=H, json={"email": "x@example.com", "password": "short"}).status_code in (409, 422)
    other = client()
    assert other.post("/api/auth/login", headers=H, json={"email": "reader@example.com", "password": "wrong password!"}).status_code == 401
    r = other.post("/api/auth/login", headers=H, json={"email": "reader@example.com", "password": "correct horse battery"})
    assert r.status_code == 200
    assert len(other.get("/api/recordings").json()["recordings"]) == 1
    uid = r.json()["user"]["id"]
    assert other.delete("/api/account", headers=H).json()["deleted"] is True
    assert not (storage.settings.recordings_dir / uid).exists()
    assert other.get("/api/recordings").status_code == 401


def test_settings_validation():
    c = client()
    assert c.patch("/api/settings", headers=H, json={"theme": "dark", "language": "ar"}).json()["theme"] == "dark"
    assert c.patch("/api/settings", headers=H, json={"theme": "neon"}).status_code == 422
    assert c.patch("/api/settings", headers=H, json={"isAdmin": True}).status_code == 422


def test_bookmarks():
    c = client()
    assert c.put("/api/bookmarks/2/255", headers=H, json={"note": "Ayat al-Kursi"}).json()["bookmarks"][0]["ayah"] == 255
    assert c.put("/api/bookmarks/2/999", headers=H, json={}).status_code == 404
    assert c.delete("/api/bookmarks/2/255", headers=H).json()["bookmarks"] == []


def test_unknown_api_path():
    assert TestClient(app).get("/api/nope").status_code == 404


@pytest.mark.parametrize("path", ["/api/recordings/../../etc/passwd", "/%2e%2e/%2e%2e/etc/passwd",
                                  "/assets/..%2f..%2f..%2f..%2fetc%2fpasswd", "/..%5c..%5cetc%5cpasswd"])
def test_path_traversal_never_serves_outside_files(path):
    r = TestClient(app).get(path)
    assert "root:" not in r.text
    assert r.status_code in (200, 401, 404)  # 200 only ever means the app's own index.html
    if r.status_code == 200:
        assert r.text.lstrip().lower().startswith("<!doctype html")


def test_oversized_upload_rejected_before_reading():
    c = client()
    r = c.post("/api/recordings", headers={**H, "Content-Length": str(500 * 1024 * 1024)}, content=b"x")
    assert r.status_code == 413
