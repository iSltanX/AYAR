"""مكتبة النصوص: تطبيع النص العربي وعدّ كلماته."""

from nusus.text import normalize, slugify, strip_tashkeel, word_frequencies, words

__all__ = ["normalize", "slugify", "strip_tashkeel", "word_frequencies", "words"]
