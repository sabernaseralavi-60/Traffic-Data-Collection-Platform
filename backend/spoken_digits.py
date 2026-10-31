"""Spoken Persian digits -> a three-digit suffix. Pure Python, no machine learning, no dependencies.

The speech recogniser (any: the browser, Vosk, ...) only produces WORDS; this module turns the words into digits and refuses to
guess: anything that is not exactly three digits returns None.

Accepted styles (an observer may speak either):
  digit by digit : "سه هشت هفت" -> 387, "صفر چهار دو" -> 042, colloquial "چار شیش یه" -> 461, Persian/Arabic/Latin digit characters
  number words   : "سیصد و هشتاد و هفت" -> 387 (only values of 100 or more: "سی و هشت" is NOT taken as 038)
"""
from __future__ import annotations

import re
from typing import Iterable, Optional

DIGIT_WORDS = {
    "صفر": 0, "زیرو": 0, "یک": 1, "یه": 1, "دو": 2, "سه": 3, "چهار": 4, "چار": 4, "پنج": 5, "شش": 6, "شیش": 6, "هفت": 7, "هشت": 8, "نه": 9,
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
}
TEENS = {"ده": 10, "یازده": 11, "دوازده": 12, "سیزده": 13, "چهارده": 14, "پانزده": 15, "شانزده": 16, "هفده": 17, "هجده": 18, "نوزده": 19}
TENS = {"بیست": 20, "سی": 30, "چهل": 40, "پنجاه": 50, "شصت": 60, "هفتاد": 70, "هشتاد": 80, "نود": 90}
HUNDREDS = {"صد": 100, "یکصد": 100, "دویست": 200, "سیصد": 300, "چهارصد": 400, "پانصد": 500, "ششصد": 600, "شیشصد": 600, "هفتصد": 700, "هشتصد": 800, "نهصد": 900}

_FA = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def normalize_token(tok: str) -> str:
    """Arabic letter forms -> Persian, zero-width characters removed, lower case for Latin words."""
    tok = tok.replace("ي", "ی").replace("ك", "ک").replace("‌", "").replace("‍", "").strip().lower()
    return tok


def _digit_string(tokens: list[str]) -> Optional[str]:
    out = ""
    for tok in tokens:
        t = tok.translate(_FA)
        if t.isdigit():
            out += t
        elif tok in DIGIT_WORDS:
            out += str(DIGIT_WORDS[tok])
        else:
            return None
    return out


def _number_words(tokens: list[str]) -> Optional[int]:
    """hundreds + (teen | tens + unit | unit) in that order; every word at most once per slot. None if the words do not form such a number."""
    value, stage = 0, 0  # stage 0: expecting hundreds, 1: tens/teens, 2: unit, 3: done
    for tok in tokens:
        if tok in HUNDREDS and stage == 0:
            value += HUNDREDS[tok]
            stage = 1
        elif tok in TEENS and stage <= 1:
            value += TEENS[tok]
            stage = 3
        elif tok in TENS and stage <= 1:
            value += TENS[tok]
            stage = 2
        elif tok in DIGIT_WORDS and 1 <= DIGIT_WORDS[tok] <= 9 and stage <= 2:
            value += DIGIT_WORDS[tok]
            stage = 3
        else:
            return None
    return value if tokens else None


def parse_digits(words: Iterable[str] | str, allow_longer: bool = False) -> Optional[str]:
    """Words (or one transcript string) -> exactly three digits as text ("042"), else None. With allow_longer the LAST three digits of a
    longer digit-by-digit sequence are used (the observer may have said the whole plate number)."""
    if isinstance(words, str):
        words = re.split(r"[\s,،.\-_/]+", words.strip())
    tokens = [normalize_token(w) for w in words if w and w.strip()]
    tokens = [t for t in tokens if t and t != "و" and t != "[unk]" and t != "<unk>"] if not any(t in ("[unk]", "<unk>") for t in tokens) else []
    if not tokens:
        return None
    digits = _digit_string(tokens)
    if digits is not None:
        if len(digits) == 3:
            return digits
        if allow_longer and len(digits) > 3:
            return digits[-3:]
        return None
    value = _number_words(tokens)
    if value is not None and 100 <= value <= 999:
        return str(value).zfill(3)
    return None
