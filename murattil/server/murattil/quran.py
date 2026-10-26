"""Access to the bundled Quran text, tajweed spans and rule metadata (built by
scripts/build_quran_data.py), plus Arabic normalisation used for matching recitations to text."""
from __future__ import annotations

import json
import re
from functools import lru_cache

from .config import DATA_DIR

QDIR = DATA_DIR / "quran"


@lru_cache(maxsize=1)
def meta() -> dict:
    return json.loads((QDIR / "meta.json").read_text("utf-8"))


@lru_cache(maxsize=1)
def rules() -> list[dict]:
    return json.loads((QDIR / "rules.json").read_text("utf-8"))


@lru_cache(maxsize=16)
def surah_raw(n: int) -> str:
    if not 1 <= n <= 114:
        raise KeyError(n)
    return (QDIR / "surah" / f"{n:03d}.json").read_text("utf-8")


@lru_cache(maxsize=32)
def surah(n: int) -> dict:
    return json.loads(surah_raw(n))


def surah_meta(n: int) -> dict:
    return meta()["surahs"][n - 1]


def ayah(s: int, a: int) -> dict:
    d = surah(s)
    if not 1 <= a <= len(d["ayahs"]):
        raise KeyError(f"{s}:{a}")
    return d["ayahs"][a - 1]


def valid_range(s: int, a_from: int, a_to: int) -> bool:
    try:
        n = surah_meta(s)["ayahs"]
    except (IndexError, KeyError):
        return False
    return 1 <= a_from <= a_to <= n


# --------------------------------------------------------------------- normalisation

_DIACRITICS = re.compile("[ؐ-ًؚ-ٰٟۖ-ۭـ࣓-ࣿ]")
_MAP = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي", "ؤ": "و", "ئ": "ي", "ۥ": "", "ۦ": ""})


def normalize(text: str) -> str:
    """Undotted-vowel, unified-alef form used for comparing recognised speech with the mushaf."""
    t = text.replace("﻿", "")
    t = _DIACRITICS.sub("", t).translate(_MAP)
    return " ".join(t.split())


def passage_words(s: int, a_from: int, a_to: int) -> list[dict]:
    """Every word of a passage with its location and normalised form (division marks excluded)."""
    out = []
    for a in range(a_from, a_to + 1):
        for tok in ayah(s, a)["tokens"]:
            if tok.get("d"):
                continue
            out.append({"surah": s, "ayah": a, "word": tok["w"], "text": tok["t"],
                        "norm": normalize(tok["t"]), "start": tok["s"]})
    return out
