"""Improvement loop: word matching robustness, attempt comparison, the personalised plan and the
technique job's honest failure when the recogniser is not installed."""
import json
import sqlite3
import uuid

from test_api import H, client, upload

from murattil import db, jobs, progress
from murattil.tajweed import coach


def test_recogniser_stutter_and_split_words_still_match():
    assert coach._dedup("عليكمكم") == "عليكم"
    assert coach._dedup("وسسووفف") == "وسوف"
    assert coach.match_cost("عليكم", "عليكمكم") <= 0.05
    assert coach.match_cost("يوسوس", "يوسوس") == 0.0          # a real repetition in the text is untouched
    assert coach.match_cost("الحمد", "الرحيم") > 0.25          # a different word is still different
    exp = ["وهو", "العلي", "العظيم"]
    hyp = ["وهو", "العلي", "الع", "ظيم"]
    ops = coach.refine_ops(coach.edit_ops(exp, hyp, sub_cost=coach.word_cost), exp, hyp)
    last = next(o for o in ops if o[1] == 2)
    assert last[0] == "match" and last[2] == (2, 3)
    assert not any(o[0] == "ins" for o in ops)


def test_word_verdict_thresholds():
    assert coach.word_verdict("match", 0.0, 0.9, 0.5) == "ok"
    assert coach.word_verdict("sub", 0.6, 0.1, 0.5) == "substituted"
    assert coach.word_verdict("del", None, 0.0, 0.0) == "missed"


def _details(statuses, rules=None, ups=4.0):
    words = [[1, i + 1, st, f"w{i + 1}"] for i, st in enumerate(statuses)]
    return {"words": words, "wordAccuracy": statuses.count("ok") / len(statuses), "meanConfidence": 0.7,
            "fluency": {"unitsPerSecond": ups, "pausesOffWaqfMarks": 1, "repeats": 0}, "rules": rules or {}, "findings": {}}


def test_attempt_comparison_lists_fixed_still_and_new():
    prev = _details(["ok", "substituted", "missed", "ok"], {"madd-muttasil": {"checked": 2, "flagged": 2}})
    cur = _details(["ok", "ok", "missed", "unclear"], {"madd-muttasil": {"checked": 2, "flagged": 0}}, ups=3.5)
    c = progress.compare_attempts(prev, cur, 123.0)
    assert [x["word"] for x in c["fixed"]] == [2]
    assert [x["word"] for x in c["still"]] == [3]
    assert [x["word"] for x in c["new"]] == [4]
    assert c["deltas"]["wordAccuracy"] == 0.0 and c["deltas"]["unitsPerSecond"] == -0.5
    assert c["rules"]["madd-muttasil"] == {"before": 1.0, "after": 0.0}


def _uid(c):
    return c.get("/api/session").json()["user"]["id"]


def _practice(uid, s, a0, a1, details, t):
    db.run("INSERT INTO practice(id, user_id, surah, ayah_from, ayah_to, word_accuracy, errors, warnings, tajweed_flags,"
           " confidence, mode, created_at, details) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
           uuid.uuid4().hex, uid, s, a0, a1, details["wordAccuracy"], 1, 0, 0, 0.7, "full", t, json.dumps(details))


def test_plan_starts_from_nothing_then_follows_results():
    c = client()
    p = c.get("/api/plan").json()
    assert [i["type"] for i in p["items"]] == ["start"] and p["basedOn"]["attempts"] == 0

    uid = _uid(c)
    now = db.now()
    _practice(uid, 112, 1, 4, _details(["ok"] * 8, {"qalqalah-sughra": {"checked": 2, "flagged": 1}}), now - 5 * 86400)
    _practice(uid, 113, 1, 2, _details(["ok", "substituted", "ok", "ok"], {"qalqalah-sughra": {"checked": 2, "flagged": 2}}), now - 60)
    c.put("/api/favorites/nufais", headers=H)
    p = c.get("/api/plan").json()
    kinds = [i["type"] for i in p["items"]]
    assert kinds[0] == "fix" and p["items"][0]["words"] == [{"ayah": 1, "word": 2, "text": "w2"}]
    rule = next(i for i in p["items"] if i["type"] == "rule")
    assert rule["hukm"] == "qalqalah-sughra" and rule["checks"] == 4 and rule["rate"] == 0.75
    imitate = next(i for i in p["items"] if i["type"] == "imitate")
    assert imitate["reciterId"] == "nufais" and imitate["focus"] is None   # no technique result yet: nothing invented
    assert any(i["type"] == "review" and i["surah"] == 112 for i in p["items"])

    db.run("INSERT INTO technique(id, user_id, surah, ayah_from, ayah_to, reciter_id, overall, scores, pace_ratio, created_at)"
           " VALUES (?,?,?,?,?,?,?,?,?,?)", uuid.uuid4().hex, uid, 113, 1, 2, "nufais", 60,
           json.dumps({"pace": 80, "breath": None, "melody": 35, "madd": 70, "tone": 75}), 1.1, now)
    imitate = next(i for i in c.get("/api/plan").json()["items"] if i["type"] == "imitate")
    assert imitate["focus"] == "melody" and imitate["score"] == 35
    prog = c.get("/api/progress").json()
    assert prog["technique"][0]["scores"]["melody"] == 35
    assert prog["rules"][0]["hukm"] == "qalqalah-sughra" and prog["rules"][0]["checks"] == 4
    assert prog["trend"][-1]["unitsPerSecond"] == 4.0


def test_technique_job_without_recogniser_fails_honestly(fake_reference):
    c = client()
    rec = upload(c).json()
    j = c.post("/api/voice/technique", headers=H, json={"recordingId": rec["id"], "reciterId": "husary",
                                                        "surah": 1, "ayahFrom": 1, "ayahTo": 2}).json()
    assert j["kind"] == "technique"
    jobs.run_pending_now()
    j = c.get(f"/api/jobs/{j['id']}").json()
    assert j["status"] == "failed" and "speech-recognition model" in j["error"]
    assert c.get("/api/session").json()["usage"]["analysis"]["used"] == 0     # refunded
    assert c.get(f"/api/jobs/{j['id']}/reference").status_code == 404
    bad = c.post("/api/voice/technique", headers=H, json={"recordingId": rec["id"], "reciterId": "husary",
                                                          "surah": 2, "ayahFrom": 1, "ayahTo": 20})
    assert bad.status_code == 422


def test_migration_adds_columns_to_an_old_database(tmp_path):
    c = sqlite3.connect(tmp_path / "old.sqlite3")
    c.execute("CREATE TABLE practice (id TEXT PRIMARY KEY, user_id TEXT, created_at REAL)")
    db._migrate(c)
    assert "details" in {r[1] for r in c.execute("PRAGMA table_info(practice)")}
    db._migrate(c)  # idempotent
