# E-08 — فاحص الأسرار: Betterleaks 1.9.x أم Gitleaks 8.30.x

**المعيار (الخطة 22):** الذي يكشف كل المزروع بإنذارات أقل وسلامة إصدار قابلة للتحقق. وعند التعادل المُصان. ولا الإصدار 2 قبل استقراره.

**ما يُفحص:** تشغيلهما على الأسرار المزروعة وعلى مدونة نظيفة فيها نصوص عربية، وقياس الكشف والإنذارات الكاذبة والزمن، والتحقق من التوقيعات. والاستدعاء كما في C-15 (`dir <root> --redact=100 --report-format json --report-path <r> --exit-code 42`)، **ولا `-v` أبدًا** (E-08).

## الملفات

| الملف | ما يفعله | النتائج |
|---|---|---|
| `download.sh` | ينزّل Betterleaks 1.9.0 وcosign 3.1.3 وGitleaks 8.30.1 (نسخة مُدارة لـ E-20) من GitHub Releases بإصدارات مثبتة، ويتحقق من SHA-256، ومن توقيع sigstore لملف checksums الخاص بـ Betterleaks بـ cosign (مع ضابط سلبي بهوية خاطئة)، ويفحص سمة الحجر والتوقيع | `results/download.txt` |
| `run.mjs` | المقارنة على ستة مواضع (أسرار مزروعة، ومدونة عربية مولَّدة من 60 تدوينة، ومستودع 50 ألف ملف) بأداة git مزيفة أول PATH ولقطة حالة قبل/بعد | `results/compare.json` |

## الإعادة

```bash
sh spikes/E-08-secret-scanner/download.sh                       # إلى ~/.cache/ayar-dev2/{betterleaks,cosign,gitleaks}
~/.nvm/versions/node/v24.16.0/bin/node spikes/E-08-secret-scanner/run.mjs
```

## النتائج (2026-10-10)

### 1. سلامة الإصدار (`results/download.txt`)

| الأداة | البصمة | التوقيع |
|---|---|---|
| Betterleaks 1.9.0 (`betterleaks_1.9.0_darwin_arm64.tar.gz`) | SHA-256 `83dd7eaa…13d3f2` مطابقة لـ `checksums.txt` | **`checksums.txt.sigstore.json` تحقق بـ cosign: «Verified OK»**، الهوية `https://github.com/betterleaks/betterleaks/.github/workflows/release.yml@refs/tags/v1.9.0` عبر `token.actions.githubusercontent.com`. والضابط السلبي بهوية gitleaks فشل كما يجب («no matching CertificateIdentity») |
| Gitleaks 8.30.1 (`gitleaks_8.30.1_darwin_arm64.tar.gz`) | SHA-256 `b40ab0ae…aeb6a5` مطابقة لـ `gitleaks_8.30.1_checksums.txt` | **لا توقيع منشور** مع الإصدار (ملف checksums فقط) |
| cosign 3.1.3 (`cosign-darwin-arm64`) | SHA-256 `5cf948c2…e92a76` مطابقة لـ `cosign_checksums.txt` | توقيع ملف checksums الخاص به دائري (يحتاج cosign)، فيُعتمد على البصمة من مصدر HTTPS الرسمي ويُذكر ذلك |

الثلاثة ملفات Mach-O **بتوقيع ad-hoc من الرابط** (`adhoc,linker-signed`) ولا سمة حجر بعد التنزيل بـ `gh` (تفصيل E-20).

### 2. الكشف والإنذارات والزمن (`results/compare.json`)

| الموضع | المزروع | Gitleaks 8.30.1 | Betterleaks 1.9.0 |
|---|---|---|---|
| FX-EXT/secret (`src/config.ts`) بإعداد fixtures وبالقواعد الافتراضية | 1 (`generic-api-key`) | **1** ✓ (42) | **1** ✓ (42) |
| FX-EXT/secret-in-test-log (`connect.test.ts:5`) | 1 | 1 ✓ | 1 ✓ |
| FX-ADAPTERS/gitleaks--bad بإعداد المشروع `gitleaks.toml` | 1 | 1 ✓ | 1 ✓ (يقبل إعداد gitleaks كما هو) |
| FX-MALICIOUS شجرة العمل (`.env` مصطنع للاكتشاف لا للفاحص، ورابط رمزي `external → ../outside`) | 0 متوقع (`expected.json`: «اجتاز») | 0 ✓، ولم يُتبع الرابط الرمزي، ولا ملف علامة | 0 ✓، نفسه |
| **مدونة عربية نظيفة** (60 تدوينة Markdown بعربية وأرقام عربية وروابط وبريد وUUID وبصمات git وصور `data:` و`package-lock.json` بـ integrity وworkflow بـ `${{ secrets.* }}` و`.env.example` بقيم نائبة) | 0 | **0** | **1 إنذار كاذب**: `generic-credential-uri` على `.env.example:2` (`postgres://user:password@localhost:5432/blog`)، بالإعدادين |
| مستودع اصطناعي 50 ألف ملف (6.7 م.ب) | 0 | 0 في **3.6 ث** | 0 في **1.5 ث** |
| زمن الإقلاع على مشروع صغير | — | 18–38 مللي ثانية | 80–250 مللي ثانية (تجميع القواعد) |
| استدعاء git في وضع dir | — | **0** | **0** |
| كتابة في شجرة المشروع | — | لا شيء | لا شيء |

**صيغة التقرير:** مصفوفة JSON بالحقول نفسها (`RuleID` و`File` و`StartLine` و`Secret` مُخفى بـ `REDACTED` و`Fingerprint` = `<file>:<rule>:<line>` …)، ويزيد Betterleaks `Attributes` و`CaptureGroups`. و**`-v` في كليهما verbose** (لا تحقق حي) في هذين الإصدارين، وBetterleaks 2.0.0-rc.2 (2026-10-07) ما زال مرشحًا فلا يُعتمد.

**ملاحظة للمحول (DEV-6):** `Fingerprint` و`File` يتبعان المسار كما مُرّر: تمرير الجذر مطلقًا يجعلهما مطلقين، فيُشغَّل الفاحص بـ `dir .` ومجلد العمل = جذر المشروع حتى تطابق البصمات ملفات `.gitleaksignore` النسبية وتُطبَّع المسارات.

## القرار

تعادل في الكشف (كل المزروع في الاثنين)، وينفرد Gitleaks بصفر إنذارات على المدونة مقابل إنذار واحد من قاعدة عامة في Betterleaks (على قيمة نائبة في `.env.example`، وهو ما يصنفه الكتالوج 10.3 «يحتاج مراجعة» لا إخفاقًا)، وينفرد Betterleaks بسلامة إصدار **قابلة للتحقق بالتوقيع** (sigstore) بينما Gitleaks ببصمة فقط. فالمعياران الثاني والثالث متعادلان، ويحسم التعادل **المُصان**: Gitleaks معلن مكتمل الميزات بإصلاحات أمنية فقط (S-37)، وBetterleaks نشط.

- **المختار: Betterleaks 1.9.0** فاحصًا مُدارًا (يؤيد الافتراض A-07)، بالاستدعاء `betterleaks dir . --redact=100 --no-banner --report-format json --report-path <r>/secrets.json --exit-code 42` من جذر المشروع، مع التحقق من البصمة والتوقيع (sigstore عبر cosign) في C-11. وGitleaks 8.30.1 بديلًا بالاستدعاء نفسه (الواجهة متطابقة).
- **الحد من الإنذار الكاذب المرصود:** `generic-credential-uri` على ملفات `*.example` يُعرض «يحتاج مراجعة» (قاعدة عامة) ولا يحجب، ويمكن للمستخدم استثناؤه في إعداد الفاحص بالمشروع.
- **لا يتغير نص الخطة.**
