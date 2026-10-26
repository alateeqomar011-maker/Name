import unicodedata

from murattil import quran


def test_counts():
    m = quran.meta()
    assert m["ayahCount"] == 6236
    assert len(m["surahs"]) == 114
    assert sum(s["ayahs"] for s in m["surahs"]) == 6236
    assert m["surahs"][0]["ayahs"] == 7 and m["surahs"][1]["ayahs"] == 286 and m["surahs"][113]["ayahs"] == 6
    # every surah has a basmalah header except al-Fatihah (where it is ayah 1) and at-Tawbah
    assert [s["n"] for s in m["surahs"] if not s["basmalah"]] == [1, 9]
    assert len(m["juzStarts"]) == 30 and m["juzStarts"][0] == [1, 1, 1] and m["juzStarts"][29][1] == 78


def _nfc(s):
    # the KFGQPC text writes shaddah before its vowel; compare canonically equivalent forms
    return unicodedata.normalize("NFC", s)


def test_known_ayahs():
    assert _nfc(quran.ayah(1, 1)["text"]) == _nfc("بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ")
    assert _nfc(quran.ayah(112, 1)["text"]) == _nfc("قُلۡ هُوَ ٱللَّهُ أَحَدٌ")
    assert quran.normalize(quran.ayah(1, 2)["text"]) == "الحمد لله رب العلمين"
    assert quran.ayah(1, 1)["page"] == 1 and quran.ayah(114, 6)["page"] == 604
    assert quran.ayah(2, 255)["juz"] == 3


def test_verification_recorded():
    v = quran.meta()["verification"]
    assert v["tanzilSkeletonExact"] == 6236
    assert v["ayahsWithoutTajweed"] == ["20:1", "27:20"]


def test_tokens_cover_text():
    for s in (1, 2, 36, 114):
        for a in quran.surah(s)["ayahs"]:
            text = a["text"]
            for t in a["tokens"]:
                assert text[t["s"]:t["s"] + len(t["t"])] == t["t"]


def test_tajweed_spans_snap_to_letters():
    for s in (1, 2, 18, 55, 112):
        for a in quran.surah(s)["ayahs"]:
            cps = list(a["text"])
            for st, en, r in a["tj"]:
                assert 0 <= st < en <= len(cps)
                assert unicodedata.category(cps[st]) not in ("Mn", "Me"), (s, a["a"], st)
                assert en == len(cps) or unicodedata.category(cps[en]) not in ("Mn", "Me")
                assert 0 <= r < len(quran.rules())


def test_passage_words():
    w = quran.passage_words(1, 1, 7)
    assert len(w) == 29
    assert w[-1]["norm"] == "الضالين"
