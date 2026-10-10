# Test project of ayar.py.eval-dynamic.
def run(code: str):
    # ruleid: ayar.py.eval-dynamic
    eval(code)
    # ruleid: ayar.py.eval-dynamic
    exec(code, {})


def constant():
    # ok: ayar.py.eval-dynamic
    return eval("1 + 1")
