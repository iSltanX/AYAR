# E-02 — المعمارية وأدنى نظام

**المعيار (الخطة 22):** arm64 فقط إن كانت أجهزة المالك كلها Apple Silicon، وعام إن وُجد Intel. والأدنى 13 أو ما يفرضه Electron.

## الإعادة

```bash
uname -m
sw_vers
sysctl -n machdep.cpu.brand_string
sysctl -n hw.optional.arm64
sysctl -n sysctl.proc_translated
/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' \
  spikes/E-01-electron-forge/node_modules/electron/dist/Electron.app/Contents/Info.plist
```

السطر الأخير يحتاج تثبيت E-01 أولًا (انظر `spikes/E-01-electron-forge/README.md`).

## النتيجة (2026-10-09)

- الخرج الخام في [output.txt](output.txt): `arm64`، وApple M4، وmacOS 27.0.1، و`sysctl.proc_translated` = 0 (ليس Rosetta).
- جواب المالك (2026-10-09): «جهاز واحد: هذا الـ M4».
- Electron 44.7.0 يعلن `LSMinimumSystemVersion` = `13.0`.

## القرار

- **هدف البناء:** `darwin-arm64` وحده، لا بناء عام.
- **أدنى نظام:** macOS 13.0، كما يفرضه Electron 44.7.0 ويطابق D-18. يُعاد قراءته من `Info.plist` عند كل ترقية لـ Electron.
