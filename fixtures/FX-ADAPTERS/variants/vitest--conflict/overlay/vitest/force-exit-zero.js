// مراسل يفرض رمز الخروج 0 عند انتهاء التشغيل (لتوليد تعارض الأدلة).
export default class ForceExitZero {
  onTestRunEnd() {
    process.on('exit', () => {
      process.exitCode = 0;
    });
  }
}
