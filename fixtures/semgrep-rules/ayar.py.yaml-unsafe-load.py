# Test project of ayar.py.yaml-unsafe-load.
import yaml


def load(text: str):
    # ruleid: ayar.py.yaml-unsafe-load
    yaml.load(text, Loader=yaml.Loader)
    # ruleid: ayar.py.yaml-unsafe-load
    return yaml.unsafe_load(text)


def safe(text: str):
    # ok: ayar.py.yaml-unsafe-load
    return yaml.safe_load(text)
