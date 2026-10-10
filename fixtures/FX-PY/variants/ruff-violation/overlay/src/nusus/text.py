"""أدوات نصوص عربية صغيرة."""

from __future__ import annotations

import os
import re
import unicodedata
from collections import Counter

_TASHKEEL = re.compile("[\u064b-\u065f\u0670]")
_ALEF_FORMS = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا"})
_WORD = re.compile(r"\w+")


def strip_tashkeel(text: str) -> str:
    """يزيل علامات التشكيل والتطويل."""
    return _TASHKEEL.sub("", text).replace("\u0640", "")


def normalize(text: str) -> str:
    """يطبّع Unicode إلى NFC، ويزيل التشكيل، ويوحّد صور الألف."""
    return strip_tashkeel(unicodedata.normalize("NFC", text)).translate(_ALEF_FORMS)


def words(text: str) -> list[str]:
    """كلمات النص بعد التطبيع."""
    return _WORD.findall(normalize(text))


def word_frequencies(text: str) -> Counter[str]:
    """تكرار كل كلمة بعد التطبيع."""
    return Counter(words(text))


def slugify(text: str) -> str:
    """معرّف صالح للروابط: كلمات النص مفصولة بشرطات."""
    return "-".join(words(text))
