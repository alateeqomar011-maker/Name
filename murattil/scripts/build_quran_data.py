#!/usr/bin/env python3
"""Build Murattil's bundled Quran data from the npm datasets installed in web/.

Inputs (installed as devDependencies of web/):
  @quran.ws/text               KFGQPC Uthmanic Hafs v3.0 text, words, waqf marks, pages, juz (CC BY 4.0)
  @quran.ws/tajwid-annotations precomputed tajweed spans for Hafs (CC BY 4.0)
  @quran.ws/tajwid-rules       the scholar-authored rule corpus the spans come from (CC BY 4.0)
  @muslims-community/quran     Tanzil Uthmani-minimal text, used only to cross-check the KFGQPC text

Outputs (server/murattil/data/quran/):
  meta.json        surahs, juz starts, provenance and verification results
  rules.json       tajweed hukm metadata (Arabic + English labels, colour group, coaching target)
  surah/NNN.json   ayahs: text (as printed, with waqf marks), word tokens, page, juz, sajdah, tajweed spans

The script refuses to write anything if an integrity check fails.
"""
from __future__ import annotations

import bisect
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NODE = ROOT / "web" / "node_modules"
OUT = ROOT / "server" / "murattil" / "data" / "quran"

TEXT_PKG = NODE / "@quran.ws" / "text"
ANN_PKG = NODE / "@quran.ws" / "tajwid-annotations"
RULES_PKG = NODE / "@quran.ws" / "tajwid-rules"
TANZIL_PKG = NODE / "@muslims-community" / "quran"

# English meanings of the surah names (as commonly translated, e.g. on Quran.com).
SURAH_MEANINGS = [
    "The Opening", "The Cow", "Family of Imran", "The Women", "The Table Spread", "The Cattle",
    "The Heights", "The Spoils of War", "The Repentance", "Jonah", "Hud", "Joseph", "The Thunder",
    "Abraham", "The Rocky Tract", "The Bee", "The Night Journey", "The Cave", "Mary", "Ta-Ha",
    "The Prophets", "The Pilgrimage", "The Believers", "The Light", "The Criterion", "The Poets",
    "The Ant", "The Stories", "The Spider", "The Romans", "Luqman", "The Prostration",
    "The Combined Forces", "Sheba", "Originator", "Ya-Sin", "Those who set the Ranks",
    "The Letter Saad", "The Troops", "The Forgiver", "Explained in Detail", "The Consultation",
    "The Ornaments of Gold", "The Smoke", "The Crouching", "The Wind-Curved Sandhills", "Muhammad",
    "The Victory", "The Rooms", "The Letter Qaf", "The Winnowing Winds", "The Mount", "The Star",
    "The Moon", "The Beneficent", "The Inevitable", "The Iron", "The Pleading Woman", "The Exile",
    "She that is to be examined", "The Ranks", "The Congregation, Friday", "The Hypocrites",
    "The Mutual Disillusion", "The Divorce", "The Prohibition", "The Sovereignty", "The Pen",
    "The Reality", "The Ascending Stairways", "Noah", "The Jinn", "The Enshrouded One",
    "The Cloaked One", "The Resurrection", "The Man", "The Emissaries", "The Tidings",
    "Those who drag forth", "He Frowned", "The Overthrowing", "The Cleaving", "The Defrauding",
    "The Sundering", "The Mansions of the Stars", "The Nightcomer", "The Most High",
    "The Overwhelming", "The Dawn", "The City", "The Sun", "The Night", "The Morning Hours",
    "The Relief", "The Fig", "The Clot", "The Power", "The Clear Proof", "The Earthquake",
    "The Courser", "The Calamity", "The Rivalry in World Increase", "The Declining Day",
    "The Traducer", "The Elephant", "Quraysh", "The Small Kindnesses", "The Abundance",
    "The Disbelievers", "The Divine Support", "The Palm Fiber", "The Sincerity", "The Daybreak",
    "Mankind",
]

# Hukm metadata used by the app. `group` drives colouring; `coach` names the acoustic check the
# Tajweed coach can attempt for spans of this hukm (None = shown as guidance only, never scored).
HUKM_INFO: dict[str, dict] = {
    # Madd
    "madd-tabee-kalimi": {"en": "Natural madd (2 counts)", "group": "madd-2", "coach": "madd", "counts": [2, 2]},
    "madd-iwad": {"en": "Madd al-ʿiwaḍ (2 counts when stopping)", "group": "madd-2", "coach": None, "counts": [2, 2]},
    "madd-silah-sughra": {"en": "Minor ṣilah (2 counts)", "group": "madd-2", "coach": None, "counts": [2, 2]},
    "seven-alefs": {"en": "The seven alifs (read short when continuing)", "group": "silent", "coach": None},
    "seven-alefs-khulf": {"en": "The seven alifs (difference of opinion)", "group": "silent", "coach": None},
    "madd-badal": {"en": "Madd al-badal (2 counts)", "group": "madd-2", "coach": "madd", "counts": [2, 2]},
    "madd-muttasil": {"en": "Obligatory connected madd (4–5 counts)", "group": "madd-wajib", "coach": "madd", "counts": [4, 5]},
    "madd-munfasil": {"en": "Permissible separated madd (4–5 counts)", "group": "madd-jaiz", "coach": "madd", "counts": [4, 5]},
    "madd-lazim-kalimi-muthaqqal": {"en": "Necessary madd, heavy (6 counts)", "group": "madd-lazim", "coach": "madd", "counts": [6, 6]},
    "madd-lazim-kalimi-mukhaffaf": {"en": "Necessary madd, light (6 counts)", "group": "madd-lazim", "coach": "madd", "counts": [6, 6]},
    "madd-lazim-harfi": {"en": "Necessary madd in disjoined letters (6 counts)", "group": "madd-lazim", "coach": None, "counts": [6, 6]},
    "leen-waw": {"en": "Līn letter wāw", "group": "none", "coach": None},
    "leen-yaa": {"en": "Līn letter yāʾ", "group": "none", "coach": None},
    # Noon sakinah and tanween
    "izhar-halqi-noon": {"en": "Iẓhār ḥalqī of nūn (clear)", "group": "izhar", "coach": None},
    "izhar-halqi-tanween": {"en": "Iẓhār ḥalqī of tanwīn (clear)", "group": "izhar", "coach": None},
    "idgham-bi-ghunnah-noon": {"en": "Idghām with ghunnah (nūn)", "group": "ghunnah", "coach": "ghunnah"},
    "idgham-bi-ghunnah-tanween": {"en": "Idghām with ghunnah (tanwīn)", "group": "ghunnah", "coach": "ghunnah"},
    "idgham-bila-ghunnah-noon": {"en": "Idghām without ghunnah (nūn)", "group": "idgham", "coach": None},
    "idgham-bila-ghunnah-tanween": {"en": "Idghām without ghunnah (tanwīn)", "group": "idgham", "coach": None},
    "idgham-kamil-noon": {"en": "Complete idghām (nūn)", "group": "idgham", "coach": None},
    "idgham-kamil-tanween": {"en": "Complete idghām (tanwīn)", "group": "idgham", "coach": None},
    "idgham-naqis-noon": {"en": "Incomplete idghām (nūn)", "group": "ghunnah", "coach": None},
    "idgham-naqis-tanween": {"en": "Incomplete idghām (tanwīn)", "group": "ghunnah", "coach": None},
    "iqlab-noon": {"en": "Iqlāb (nūn becomes mīm)", "group": "iqlab", "coach": "ghunnah"},
    "iqlab-tanween": {"en": "Iqlāb (tanwīn becomes mīm)", "group": "iqlab", "coach": "ghunnah"},
    "ikhfa-haqiqi-noon": {"en": "Ikhfāʾ (hidden nūn with ghunnah)", "group": "ikhfa", "coach": "ghunnah"},
    "ikhfa-haqiqi-tanween": {"en": "Ikhfāʾ (hidden tanwīn with ghunnah)", "group": "ikhfa", "coach": "ghunnah"},
    "izhar-mutlaq": {"en": "Absolute iẓhār", "group": "izhar", "coach": None},
    "ikhfa-ghunnah-tarqeeq": {"en": "Light (muraqqaq) ghunnah of ikhfāʾ", "group": "none", "coach": None},
    "ikhfa-ghunnah-tafkheem": {"en": "Heavy (mufakhkham) ghunnah of ikhfāʾ", "group": "none", "coach": None},
    # Meem sakinah
    "idgham-shafawi-meem": {"en": "Labial idghām (mīm)", "group": "ghunnah", "coach": "ghunnah"},
    "ikhfa-shafawi-meem": {"en": "Labial ikhfāʾ (mīm)", "group": "ikhfa", "coach": "ghunnah"},
    "izhar-shafawi-meem": {"en": "Labial iẓhār (mīm)", "group": "none", "coach": None},
    # Mushaddad
    "noon-mushaddadah": {"en": "Nūn with shaddah (ghunnah, 2 counts)", "group": "ghunnah", "coach": "ghunnah"},
    "meem-mushaddadah": {"en": "Mīm with shaddah (ghunnah, 2 counts)", "group": "ghunnah", "coach": "ghunnah"},
    # Letter relations
    "mutamathilain-idgham-kamil": {"en": "Idghām of identical letters", "group": "none", "coach": None},
    "mutamathilain-izhar": {"en": "Iẓhār of identical letters", "group": "none", "coach": None},
    "mutajanisain-idgham-naqis": {"en": "Incomplete idghām of related letters", "group": "none", "coach": None},
    "mutajanisain-ikhfa-shafawi": {"en": "Labial ikhfāʾ of related letters", "group": "none", "coach": None},
    # Qalqalah
    "qalqalah-sughra": {"en": "Minor qalqalah", "group": "qalqalah", "coach": "qalqalah"},
    "qalqalah-mutatarrifa": {"en": "Qalqalah at a word's end", "group": "qalqalah", "coach": None},
    "qalqalah-kubra": {"en": "Major qalqalah (stopping at the ayah end)", "group": "qalqalah", "coach": "qalqalah"},
    # Tafkheem / tarqeeq
    "raa-tafkheem": {"en": "Heavy rāʾ (tafkhīm)", "group": "tafkheem", "coach": None},
    "raa-tarqeeq": {"en": "Light rāʾ (tarqīq)", "group": "none", "coach": None},
    "raa-either-permissible": {"en": "Rāʾ: heavy or light both permitted", "group": "none", "coach": None},
}
for hid in [
    "tafkheem-rank-1-jazari", "tafkheem-rank-2-jazari", "tafkheem-rank-3-jazari", "tafkheem-rank-4-jazari",
    "tafkheem-rank-5-relative-jazari", "tafkheem-rank-1-tahhan", "tafkheem-rank-2-tahhan",
    "tafkheem-rank-3-relative-tahhan",
]:
    HUKM_INFO[hid] = {"en": "Rank of tafkhīm (heavy letter)", "group": "none", "coach": None}
for hid in ["always-tarqeeq", "lam-jalalah-tafkheem", "lam-jalalah-tarqeeq", "alef-tafkheem", "alef-tarqeeq"]:
    HUKM_INFO[hid] = {"en": hid.replace("-", " "), "group": "none", "coach": None}

QALQALAH = set("قطبجد")
HAMZA = set("ءأإؤئٔ")


def is_mark(ch: str) -> bool:
    return unicodedata.category(ch) in ("Mn", "Me") or ch == "ـ"


def snap(cps: list[str], start: int, end: int) -> tuple[int, int]:
    """Widen a code-point span to whole letters, so a letter is never coloured apart from its marks."""
    while start > 0 and is_mark(cps[start]):
        start -= 1
    while end < len(cps) and is_mark(cps[end]):
        end += 1
    return start, end


def span_ok(hukm: str, text: str) -> bool | None:
    """A conservative sanity check per rule family. None = no check defined for this family."""
    if hukm.startswith("qalqalah"):
        return any(c in QALQALAH for c in text)
    if hukm in ("madd-muttasil", "madd-munfasil"):
        return any(c in HAMZA for c in text)
    if hukm.endswith("-noon") and hukm.split("-")[0] in ("ikhfa", "iqlab", "idgham", "izhar"):
        return "ن" in text
    if hukm.endswith("-meem"):
        return "م" in text
    if hukm == "noon-mushaddadah":
        return "ن" in text
    if hukm == "meem-mushaddadah":
        return "م" in text
    if hukm.endswith("-tanween"):
        # tanween, or (for iqlab) a vowel followed by the small meem the KFGQPC text writes instead
        return any(c in text for c in "\u064b\u064c\u064d\u08f0\u08f1\u08f2\u06e2\u06ed")
    return None


SKELETON_DROP = re.compile("[ؐ-ًؚ-ٰٟۖ-ۭـࣰ-ࣿء]")
SKELETON_MAP = str.maketrans({"ٱ": "", "ا": "", "أ": "", "إ": "", "آ": "", "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي",
                              "ۥ": "", "ۦ": "", "ـ": ""})


def skeleton(s: str) -> str:
    s = unicodedata.normalize("NFC", s)
    s = SKELETON_DROP.sub("", s).translate(SKELETON_MAP)
    # waw/yaa are written or omitted differently between the two orthographies; drop them too
    s = s.replace("و", "").replace("ي", "")
    return re.sub(r"\s+", "", s)


def levenshtein_ratio(a: str, b: str) -> float:
    if a == b:
        return 1.0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return 1 - prev[-1] / max(len(a), len(b), 1)


def fail(msg: str) -> None:
    print(f"INTEGRITY CHECK FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    hafs = json.loads((TEXT_PKG / "data" / "hafs.json").read_text("utf-8"))
    ann = json.loads((ANN_PKG / "uthmani-hafs.json").read_text("utf-8"))
    corpus = json.loads((RULES_PKG / "rules.json").read_text("utf-8"))
    tanzil = json.loads((TANZIL_PKG / "dist" / "quran.json").read_text("utf-8"))
    text_pkg_version = json.loads((TEXT_PKG / "package.json").read_text())["version"]
    ann_pkg_version = json.loads((ANN_PKG / "package.json").read_text())["version"]

    words: list[str] = hafs["words"]
    ayah_starts: list[int] = hafs["ayah_starts"]
    if len(ayah_starts) != 6236 or hafs["counting"]["ayah_count"] != 6236:
        fail("expected 6236 ayahs")
    if len(hafs["surahs"]) != 114:
        fail("expected 114 surahs")
    if sum(s["ayah_count"] for s in hafs["surahs"]) != 6236:
        fail("surah ayah counts do not sum to 6236")
    bounds = ayah_starts + [len(words)]

    marks_by_word: dict[int, list[dict]] = {}
    for pos, t in hafs["marks"]:
        marks_by_word.setdefault(pos, []).append(hafs["mark_types"][t])

    hukm_of_rule = [re.sub(r"\.\d+$", "", r) for r in ann["ruleIds"]]
    hukm_ids = sorted(set(hukm_of_rule))
    hukm_index = {h: i for i, h in enumerate(hukm_ids)}
    corpus_hukms = {h["id"]: h for h in corpus["hukums"]}
    for h in hukm_ids:
        if h not in HUKM_INFO:
            fail(f"no metadata for hukm {h}")

    tanzil_ayahs = [a["text"] for s in tanzil["surahs"] for a in s["ayat"]]
    if len(tanzil_ayahs) != 6236:
        fail("Tanzil cross-check text does not have 6236 ayahs")

    page_starts = hafs["page_starts"]
    juz_starts = hafs["juz_starts"]

    stats = {"spans": 0, "spans_checked": 0, "ayahs_without_tajweed": [], "skeleton_exact": 0,
             "skeleton_close": 0, "skeleton_far": []}
    surah_out = []
    gi = 0  # global ayah index
    for s in hafs["surahs"]:
        n = s["number"]
        ayahs = []
        for a in range(1, s["ayah_count"] + 1):
            key = f"{n}:{a}"
            w0, w1 = bounds[gi], bounds[gi + 1]
            tokens = []
            parts = []
            offset = 0
            sajdah = False
            for w in range(w0, w1):
                mk = marks_by_word.get(w, [])
                before = [m["sign"] for m in mk if m["side"] == "before"]
                after = "".join(m["sign"] for m in mk if m["side"] == "after")
                sajdah = sajdah or any(m["kind"] == "sajdah" for m in mk)
                if before:
                    b = " ".join(before)
                    tokens.append({"t": b, "s": offset, "d": 1})
                    parts.append(b)
                    offset += len(b) + 1
                t = words[w] + after
                tokens.append({"t": t, "s": offset, "w": w - w0 + 1})
                parts.append(t)
                offset += len(t) + 1
            text = " ".join(parts)
            cps = list(text)
            if len(cps) != offset - 1:
                fail(f"offset bookkeeping broke at {key}")

            spans = []
            bad = False
            for st, en, r in ann["spans"].get(key, []):
                if not (0 <= st < en <= len(cps)):
                    bad = True
                    break
                st2, en2 = snap(cps, st, en)
                hk = hukm_of_rule[r]
                ok = span_ok(hk, "".join(cps[st:en]))
                if ok is not None:
                    stats["spans_checked"] += 1
                    if not ok:
                        bad = True
                        break
                spans.append([st2, en2, hukm_index[hk]])
            if bad or key not in ann["spans"]:
                stats["ayahs_without_tajweed"].append(key)
                spans = []
            stats["spans"] += len(spans)

            # cross-check against Tanzil (independent transcription of the same mushaf text)
            sk_a, sk_b = skeleton(" ".join(words[w0:w1])), skeleton(tanzil_ayahs[gi])
            ratio = levenshtein_ratio(sk_a, sk_b)
            if ratio == 1.0:
                stats["skeleton_exact"] += 1
            elif ratio >= 0.9:
                stats["skeleton_close"] += 1
            else:
                stats["skeleton_far"].append([key, round(ratio, 3)])

            page = bisect.bisect_right(page_starts, w0)
            juz = bisect.bisect_right(juz_starts, w0)
            ayah = {"a": a, "text": text, "tokens": tokens, "page": page, "juz": juz, "tj": spans}
            if sajdah:
                ayah["sajdah"] = True
            ayahs.append(ayah)
            gi += 1
        pages = [ayahs[0]["page"], ayahs[-1]["page"]]
        surah_out.append({
            "n": n,
            "ar": s["name_ar"],
            "en": s["name_en"],
            "meaning": SURAH_MEANINGS[n - 1],
            "revelation": s["revelation"],
            "ayahs": s["ayah_count"],
            "basmalah": bool(s["has_basmalah"]) and n != 1,
            "pages": pages,
            "data": ayahs,
        })

    # The Tanzil text follows a different orthography for a handful of words; anything below 0.9
    # similarity in an ayah would point to a real defect (shifted ayah, missing words).
    if stats["skeleton_far"]:
        fail(f"{len(stats['skeleton_far'])} ayahs differ from the Tanzil cross-check: {stats['skeleton_far'][:10]}")
    if len(stats["ayahs_without_tajweed"]) > 10:
        fail(f"too many ayahs failed tajweed span checks: {stats['ayahs_without_tajweed'][:20]}")

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "surah").mkdir(exist_ok=True)
    digest = hashlib.sha256()
    for s in surah_out:
        payload = {"n": s["n"], "ayahs": s["data"]}
        blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        digest.update(blob.encode())
        (OUT / "surah" / f"{s['n']:03d}.json").write_text(blob, "utf-8")

    rules_out = []
    for h in hukm_ids:
        info = HUKM_INFO[h]
        c = corpus_hukms.get(h, {})
        rules_out.append({
            "id": h,
            "ar": c.get("label", {}).get("ar", h),
            "en": info["en"],
            "group": info["group"],
            "coach": info["coach"],
            **({"counts": info["counts"]} if "counts" in info else {}),
            "category": c.get("category"),
        })
    (OUT / "rules.json").write_text(json.dumps(rules_out, ensure_ascii=False, indent=1), "utf-8")

    meta = {
        "riwayah": "Ḥafṣ ʿan ʿĀṣim",
        "ayahCount": 6236,
        "surahs": [{k: v for k, v in s.items() if k != "data"} for s in surah_out],
        "juzStarts": [],
        "basmalah": surah_out[0]["data"][0]["text"],
        "provenance": {
            "text": {
                "name": "KFGQPC Uthmanic Hafs v3.0 (King Fahd Glorious Quran Printing Complex)",
                "via": f"@quran.ws/text {text_pkg_version}",
                "license": "CC BY 4.0 (dataset packaging by quran.ws)",
                "sourceSha256": hafs["provenance"]["text"]["sha256"],
            },
            "tajweed": {
                "name": "quran.ws tajweed corpus",
                "via": f"@quran.ws/tajwid-annotations {ann_pkg_version} (corpus {ann['corpusVersion']})",
                "license": "CC BY 4.0",
                "source": corpus["provenance"]["url"],
                "note": "Rule corpus derived from tajweed.quranpedia.net; some rules are marked by its authors as needing review.",
            },
            "crossCheck": {
                "name": "Tanzil Project Uthmani-minimal text",
                "via": "@muslims-community/quran 1.1.0",
                "license": "CC BY 3.0",
            },
        },
        "verification": {
            "dataSha256": digest.hexdigest(),
            "tajweedSpans": stats["spans"],
            "tajweedSpansChecked": stats["spans_checked"],
            "ayahsWithoutTajweed": stats["ayahs_without_tajweed"],
            "tanzilSkeletonExact": stats["skeleton_exact"],
            "tanzilSkeletonClose": stats["skeleton_close"],
        },
    }
    for j, w in enumerate(juz_starts, 1):
        g = bisect.bisect_right(ayah_starts, w) - 1
        # map global ayah index to surah:ayah
        acc = 0
        for s in surah_out:
            if g < acc + s["ayahs"]:
                meta["juzStarts"].append([j, s["n"], g - acc + 1])
                break
            acc += s["ayahs"]
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), "utf-8")
    print(json.dumps(meta["verification"], ensure_ascii=False, indent=1))
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
