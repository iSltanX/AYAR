# Test project of ayar.py.os-system-dynamic.
import os


def run(name: str) -> None:
    # ruleid: ayar.py.os-system-dynamic
    os.system("rm " + name)
    # ruleid: ayar.py.os-system-dynamic
    os.popen(name)


def safe() -> None:
    # ok: ayar.py.os-system-dynamic
    os.system("ls")
