# E-04 — هوية التوقيع المحلية وثبات الأذونات

**المعيار (الخطة 22):** الهوية الذاتية إن لم تتكرر الطلبات. وإلا يُوثَّق السلوك ويُحفظ المفتاح في ملف بصلاحية 0600.

**ما يُفحص:** شهادة توقيع ذاتية، وبناءان بتعديل بينهما، ومراقبة الطلبات لمشروع في المستندات ولسلسلة المفاتيح. ومعه شرط 15.2: `EnableCookieEncryption` يُفعَّل إن ثبت عمله مع التوقيع المحلي.

## الملفات

- `create-identity.sh` **يشغّله المالك:** ينشئ «AYAR Local Code Signing» في سلسلة مفاتيح الدخول بمفتاح لا يستعمله إلا `codesign` (`-T /usr/bin/codesign`). ولا يضيف إعداد ثقة (انظر النتيجة 1). ولا يكتب شيئًا في المستودع.
- `mode/`: وضع `e04` للتطبيق المشترك. يقرأ ملفًا في `~/Documents/ayar-e04-probe` من المحرك (`utilityProcess`) ومن عملية ابنة (`/bin/cat`)، ثم يستخدم `safeStorage`: البناء A يشفّر قيمة ويحفظها، والبناء B يفكّها.
- قارئ سجل الخصوصية في `../E-05-privacy-scope/tcc-log.mjs`، ويعدّ الطلب المعروض فعلًا بسطر `AUTHREQ_PROMPTING` من `tccd`.

## الإعادة

```bash
spikes/E-04-signing-identity/create-identity.sh          # المالك، مرة واحدة
spikes/E-05-privacy-scope/make-probes.sh                  # ينشئ ~/Documents/ayar-e04-probe (و--remove يزيلها)
cd spikes/E-01-electron-forge && export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
ID=86526C3EC084F4676EECBD8D298C35EAB3278364   # بصمة الهوية: security find-identity -p codesigning
for TAG in A B; do
  date '+%Y-%m-%d %H:%M:%S'                               # بداية النافذة لقارئ السجل
  SPIKE_MODE=e04 SPIKE_NAME="AYAR Spike E04" SPIKE_BUNDLE_ID=com.bysltan.ayar.spike.e04 \
    SPIKE_IDENTITY=$ID SPIKE_DLV=1 SPIKE_COOKIE_ENC=1 SPIKE_BUILD_TAG=$TAG node_modules/.bin/electron-forge package
  # افتح «AYAR Spike E04.app» بالنقر المزدوج في Finder، ثم انتظر ~/Library/Application Support/AYAR Spike/e04-$TAG.json
done
/opt/homebrew/bin/node ../E-05-privacy-scope/tcc-log.mjs "<بداية النافذة>" com.bysltan.ayar.spike.e04
```

## النتائج (2026-10-10، جهاز المالك)

الملفات الخام في [results/](results/).

1. **لا حاجة لإعداد ثقة.** أخفق `add-trusted-cert -r trustAsRoot` في النسخة الأولى من السكربت، لأن الخيار للشهادات غير الذاتية. ثم ثبت أن `codesign` يوقّع بالهوية وهي «غير موثوقة» (`CSSMERR_TP_NOT_TRUSTED`)، وأن التوقيع صالح ويحقق المتطلب المعيّن `certificate leaf = H"86526c…"`. ولم يُكتب أي إعداد ثقة على الجهاز (`results/identity-trust-check.txt`). فحُذفت خطوة الثقة.
2. **بناءان مختلفان بالمتطلب المعيّن نفسه:** CDHash `455b11…` ثم `93ef69…`، وبصمة `app.asar` مختلفة، والمتطلب واحد (`results/builds-A-B.txt`). وكلاهما فُتح بالنقر المزدوج في Finder.
3. **أذونات الخصوصية تبقى عبر إعادة البناء:**

| | البناء A | البناء B |
|---|---|---|
| قراءة المستندات من المحرك | 5153 ملّي ثانية: **طلب واحد** وافق عليه المالك | **34 ملّي ثانية: لا طلب** |
| قراءة العملية الابنة (`cat`) | 35 ملّي ثانية، لا طلب | 2 ملّي ثانية، لا طلب |
| طلبات معروضة في سجل `tccd` (`AUTHREQ_PROMPTING`) | 1 (المستندات) | **0** |

4. **سلسلة المفاتيح لا تبقى:** في البناء B ظهر طلب سلسلة المفاتيح (`safeStorage.isEncryptionAvailable` انتظرت 136 ثانية حتى ضغط المالك «السماح»). وسجل `securityd` صريح: `ACL partition mismatch: client cdhash:93ef69… ACL ("cdhash:455b11…")`، ثم `displaying keychain prompt` (`results/keychain-B-prompt.txt`). فالتطبيق بلا Team ID يُقيَّد عنصره في سلسلة المفاتيح ببصمة البناء نفسه، فيتكرر الطلب مع كل بناء جديد.
5. **صمام `EnableCookieEncryption`:** كان مفعّلًا في البناءين، ولم يسبب بنفسه طلبًا، لأن التطبيق لا يستخدم الكعكات فلم يقرأ مفتاحها. لكن أي قراءة لمفتاح التشفير بعد ترقية ستطلب الإذن، للسبب نفسه في النتيجة 4.

## القرار

- **الهوية الذاتية الثابتة تبقى للتوقيع (D-25):** تحفظ أذونات الخصوصية عبر إعادة البناء.
- **سلسلة المفاتيح تتكرر طلباتها،** فيُطبَّق بديل المعيار: **مفتاح HMAC في ملف بصلاحية 0600** داخل مجلد بيانات عِيَار (0700)، ولا تُستخدم سلسلة المفاتيح ولا `safeStorage`.
- **`EnableCookieEncryption` يبقى معطّلًا:** لم يثبت عمله دون تكرار الطلبات، والتطبيق لا يستخدم الكعكات (15.2).
- **بديل ممكن بقرار من المالك:** شهادة Apple Development الموجودة على جهازه تحمل Team ID، فيصير قيد سلسلة المفاتيح `teamid:` لا `cdhash:`، ويُستغنى عن استثناء `disable-library-validation` (D-50). وهذا يربط التوقيع بحسابه لدى Apple وبشهادة تتجدد. لم يُجرَّب ولم يُعتمد.
- التفاصيل في D-53.

## ما بقي على الجهاز

- الهوية «AYAR Local Code Signing» في سلسلة مفاتيح الدخول، وتصلح لتوقيع عِيَار في DEV-3.
- عنصر سلسلة المفاتيح «AYAR Spike Safe Storage» من التجربة. لا ضرر منه، ويُزال بـ `security delete-generic-password -s "AYAR Spike Safe Storage"`.
- أذونات المستندات للمعرّف `com.bysltan.ayar.spike.e04`. وتُصفَّر إن أراد المالك بـ `tccutil reset All com.bysltan.ayar.spike.e04`.
