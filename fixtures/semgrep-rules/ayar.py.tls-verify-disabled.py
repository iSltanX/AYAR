# Test project of ayar.py.tls-verify-disabled.
import ssl

import requests


def insecure(url: str):
    # ruleid: ayar.py.tls-verify-disabled
    requests.get(url, verify=False)
    # ruleid: ayar.py.tls-verify-disabled
    return ssl._create_unverified_context()


def secure(url: str):
    # ok: ayar.py.tls-verify-disabled
    return requests.get(url, timeout=5)
