"""شبح كلاسيكي بتفرع مزدوج: الأب يخرج، والابن يفتح جلسة جديدة (setsid) ويتفرع ثانية، والحفيد يسجل رقمه وينام.

يعيد الحفيد توجيه الواصفات القياسية إلى /dev/null كما يفعل أي شبح سليم، وإلا بقيت أنابيب الأب مفتوحة وعلّق مستدعيه.
"""
import os
import time


def main() -> None:
    pid_file = os.environ["FX_PROC_PIDS"]
    if os.fork() > 0:
        return  # الأب (الاختبار يتابع عمله)
    os.setsid()
    if os.fork() > 0:
        os._exit(0)
    os.chdir("/")
    null = os.open(os.devnull, os.O_RDWR)
    for fd in (0, 1, 2):
        os.dup2(null, fd)
    with open(pid_file, "a", encoding="utf-8") as fh:
        fh.write(f"{os.getpid()}\n")
    time.sleep(600)


main()
