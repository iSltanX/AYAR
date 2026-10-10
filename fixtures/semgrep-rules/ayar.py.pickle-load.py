# Test project of ayar.py.pickle-load.
import json
import pickle


def load(data: bytes):
    # ruleid: ayar.py.pickle-load
    return pickle.loads(data)


def load_json(text: str):
    # ok: ayar.py.pickle-load
    return json.loads(text)
