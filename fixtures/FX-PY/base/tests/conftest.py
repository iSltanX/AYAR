from hypothesis import settings

# لا تكتب Hypothesis قاعدة أمثلة في المستودع، وتكون التجربة حتمية (الأدلة قابلة للتكرار).
settings.register_profile("fx", database=None, derandomize=True, max_examples=50)
settings.load_profile("fx")
