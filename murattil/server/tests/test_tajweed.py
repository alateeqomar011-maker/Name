"""Tajweed coach logic, tested with a synthetic CTC recogniser whose output is known exactly.

These tests check the alignment, comparison and reporting logic. They say nothing about the
accuracy of a real acoustic model, which cannot be downloaded in the test environment."""
import numpy as np
import pytest
from conftest import FIXTURES

from murattil.tajweed import asr, checks, coach
from murattil.tajweed.ctc import char_similarity, edit_ops, forced_align, greedy, log_softmax


def test_forced_align_places_tokens():
    T, V, blank = 40, 5, 4
    lp = np.full((T, V), -6.0)
    lp[:, blank] = -0.1
    for tok, (a, b) in zip([0, 1, 1, 2], [(3, 5), (12, 14), (20, 22), (30, 33)]):
        lp[a:b + 1] = -6.0
        lp[a:b + 1, tok] = -0.05
    spans, mean_lp = forced_align(log_softmax(lp), [0, 1, 1, 2], blank)
    assert [(s.start, s.end) for s in spans] == [(3, 5), (12, 14), (20, 22), (30, 33)]
    assert [t for t, _, _ in greedy(log_softmax(lp), blank)] == [0, 1, 1, 2]


def test_forced_align_too_short():
    lp = log_softmax(np.zeros((2, 3)))
    with pytest.raises(ValueError):
        forced_align(lp, [0, 1, 0], 2)


def test_edit_ops():
    ops = edit_ops(["a", "b", "c", "d"], ["a", "c", "d", "e"])
    kinds = [o[0] for o in ops]
    assert kinds == ["match", "del", "match", "match", "ins"]
    assert char_similarity("الرحمن", "الرحيم") > 0.5


def test_moras():
    assert checks.moras("بِسۡمِ") == 2
    assert checks.moras("ٱلرَّحِيمِ") >= 4


class _Session:
    def __init__(self, v):
        self.v = v

    def get_inputs(self):
        class I:
            name = "audio_signal"
            shape = [1, "N"]

        class L:
            name = "length"
            shape = [1]
        return [I(), L()]

    def get_outputs(self):
        v = self.v

        class O:
            shape = [1, "T", v]
        return [O()]


def _fake_model(words, plan):
    vocab = {0: "<unk>"}
    for w in words:
        if "▁" + w["norm"] not in vocab.values():
            vocab[len(vocab)] = "▁" + w["norm"]
    vocab[len(vocab)] = "▁زيد"  # a word that is not in the passage
    blank = len(vocab)

    class M(asr.CtcModel):
        def recognize(self, y):
            T = int(len(y) / 16000 / 0.08)
            lp = np.full((T, blank + 1), -8.0)
            lp[:, blank] = -0.05
            per = T // len(words)
            for i, w in enumerate(words):
                tok = plan.get(i, self.piece_to_id["▁" + w["norm"]])
                if tok is None:
                    continue
                if isinstance(tok, str):
                    tok = self.piece_to_id[tok]
                a = i * per + per // 3
                lp[a:a + 3] = -8.0
                lp[a:a + 3, tok] = -0.05
            return asr.Recognition(logp=log_softmax(lp), frame_s=0.08, blank=blank)

    return M(_Session(blank + 1), vocab, None)


@pytest.fixture
def audio():
    return (FIXTURES / "speaker_a.ogg").read_bytes()


def test_coach_detects_missed_and_substituted_words(audio):
    words = coach.passage_with_rules(1, 1, 4)
    asr.set_model_for_tests(_fake_model(words, {5: None, 9: "▁زيد"}))
    try:
        r = coach.analyze(audio, 1, 1, 4)
    finally:
        asr.set_model_for_tests(None)
    by = {(w["ayah"], w["word"]): w for w in r["words"]}
    assert by[(2, 2)]["status"] == "missed"
    assert by[(3, 2)]["status"] == "substituted" and by[(3, 2)]["heard"] == "زيد"
    assert sum(1 for w in r["words"] if w["status"] == "ok") == 11
    kinds = {f["kind"] for f in r["findings"]}
    assert {"missed_word", "substituted_word"} <= kinds
    for f in r["findings"]:
        assert 0 <= f["confidence"] <= 1 and f["confidenceLabel"] in ("low", "medium", "high")
        assert f["en"] and f["ar"] and f["tipEn"] and f["tipAr"]
    assert r["summary"]["teacherReviewRecommended"] is True
    assert "perfect" not in r["summary"]["en"].lower()
    assert r["scores"]["wordAccuracy"] == pytest.approx(11 / 13, abs=1e-3)


def test_coach_skipped_ayah(audio):
    words = coach.passage_with_rules(1, 1, 3)
    plan = {i: None for i, w in enumerate(words) if w["ayah"] == 2}
    asr.set_model_for_tests(_fake_model(words, plan))
    try:
        r = coach.analyze(audio, 1, 1, 3)
    finally:
        asr.set_model_for_tests(None)
    assert any(f["kind"] == "skipped_ayah" and f["ayah"] == 2 for f in r["findings"])


def test_coach_without_model_is_honest(audio):
    asr.set_model_for_tests(None)
    r = coach.analyze(audio, 1, 1, 4)
    assert r["mode"] == "limited"
    assert r["findings"] == []
    assert r["scores"]["wordAccuracy"] is None
    assert "unavailable" in r["summary"]["en"]
    assert all(w["status"] == "unchecked" for w in r["words"])


def test_coach_rejects_bad_range(audio):
    with pytest.raises(coach.CoachError):
        coach.analyze(audio, 1, 5, 9)


def test_token_word_mapping_handles_split_pieces():
    words = coach.passage_with_rules(1, 1, 1)
    vocab = {0: "▁بس", 1: "م", 2: "▁الله", 3: "▁الرح", 4: "من", 5: "▁الرحيم"}

    class S(_Session):
        pass
    m = asr.CtcModel(S(7), vocab, None)
    ids = [0, 1, 2, 3, 4, 5]
    assert m.map_tokens_to_words(ids, words) == [0, 0, 1, 2, 2, 3]
    assert m.tokenize("بسم الله") == [0, 1, 2]
