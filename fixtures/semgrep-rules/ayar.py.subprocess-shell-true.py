# Test project of ayar.py.subprocess-shell-true.
import subprocess


def run(cmd: str) -> int:
    # ruleid: ayar.py.subprocess-shell-true
    return subprocess.call(cmd, shell=True)


def run_more(name: str) -> None:
    # ruleid: ayar.py.subprocess-shell-true
    subprocess.run(f"ls {name}", shell=True, check=True)


def safe(name: str) -> None:
    # ok: ayar.py.subprocess-shell-true
    subprocess.run(["ls", name], check=True)
    # ok: ayar.py.subprocess-shell-true
    subprocess.run("ls -la", shell=True)
