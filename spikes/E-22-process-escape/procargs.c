// E-22: هل تُقرأ بيئة عملية أخرى للمستخدم نفسه عبر sysctl(KERN_PROCARGS2) (وهو ما تعتمده ps -E)؟
// يطبع لكل pid: عدد بايتات الوسائط والبيئة، وهل ظهر المتغير المطلوب فيها. الاستخدام: procargs <VAR> <pid> [pid ...]
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/sysctl.h>
#include <errno.h>

int main(int argc, char **argv) {
  if (argc < 3) { fprintf(stderr, "usage: procargs VAR pid...\n"); return 2; }
  const char *var = argv[1];
  size_t varlen = strlen(var);
  for (int i = 2; i < argc; i++) {
    int pid = atoi(argv[i]);
    int mib[3] = { CTL_KERN, KERN_PROCARGS2, pid };
    size_t size = 0;
    if (sysctl(mib, 3, NULL, &size, NULL, 0) != 0) { printf("pid=%d error=%s\n", pid, strerror(errno)); continue; }
    char *buf = malloc(size + 1);
    if (sysctl(mib, 3, buf, &size, NULL, 0) != 0) { printf("pid=%d error=%s\n", pid, strerror(errno)); free(buf); continue; }
    // التخطيط: int argc، ثم مسار الملف التنفيذي، ثم أصفار، ثم argv ثم envp كسلاسل منتهية بصفر
    int nargs = *(int *)buf;
    char *p = buf + sizeof(int);
    char *end = buf + size;
    // تخطي مسار الملف التنفيذي والحشو
    while (p < end && *p != '\0') p++;
    while (p < end && *p == '\0') p++;
    int seen = 0, found = 0, envCount = 0;
    char *exe = buf + sizeof(int);
    while (p < end) {
      size_t len = strnlen(p, end - p);
      if (seen >= nargs) { envCount++; if (len > varlen && strncmp(p, var, varlen) == 0 && p[varlen] == '=') found = 1; }
      seen++;
      p += len + 1;
    }
    printf("pid=%d exe=%s bytes=%zu argc=%d env_strings=%d %s_present=%d\n", pid, exe, size, nargs, envCount, var, found);
    free(buf);
  }
  return 0;
}
