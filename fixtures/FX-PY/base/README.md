# النصوص (`nusus`)

مكتبة صغيرة لتطبيع النصوص العربية وعدّ كلماتها. هذا مشروع اختبار لعِيَار (FX-PY)، لا يُنشر.

```python
from nusus import normalize, word_frequencies

normalize("أَحمد")          # "احمد"
word_frequencies("ذهب أحمد إلى المدرسة").most_common(1)
```

للتشغيل والاختبار انظر [pyproject.toml](pyproject.toml).
