import pytest
from hypothesis import given
from hypothesis import strategies as st

from nusus import normalize, slugify, strip_tashkeel, word_frequencies, words


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("أحمد", "احمد"),
        ("إبراهيم", "ابراهيم"),
        ("آمن", "امن"),
        ("مُحَمَّد", "محمد"),
        ("كـــتاب", "كتاب"),
    ],
)
def test_normalize(raw: str, expected: str) -> None:
    assert normalize(raw) == expected


def test_strip_tashkeel_keeps_letters() -> None:
    assert strip_tashkeel("الْعَرَبِيَّةُ") == "العربية"


def test_words_splits_on_punctuation() -> None:
    assert words("ذهب أحمد، ثم عاد.") == ["ذهب", "احمد", "ثم", "عاد"]


def test_word_frequencies_counts_after_normalizing() -> None:
    counts = word_frequencies("أحمد احمد إحمد")
    assert counts["احمد"] == 3


def test_slugify() -> None:
    assert slugify("مكتبة النصوص العربية") == "مكتبة-النصوص-العربية"


@given(st.text())
def test_normalize_is_idempotent(text: str) -> None:
    once = normalize(text)
    assert normalize(once) == once
