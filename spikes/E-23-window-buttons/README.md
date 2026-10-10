# E-23 — موضع أزرار النافذة مع اختلاف لغة النظام ولغة التطبيق

**المعيار (الخطة 22):** قراءة الموضع الفعلي وحجز ركنه دائمًا. وإن لم يتبع الموضع اللغة إلا بإعادة الفتح، يُذكر ذلك عند تبديل اللغة (AT-41).

**ما يُفحص:** تطبيق بشريط عنوان مدمج (`titleBarStyle: 'hidden'` مع `titleBarOverlay`)، ولغة نظام × لغة تطبيق، وقراءة الموضع عند التشغيل عبر Window Controls Overlay (`navigator.windowControlsOverlay` ومتغيرات `titlebar-area-*`)، وتجربة التبديل دون إعادة فتح.

## الملفات

- `mode/`: وضع `e23` للتطبيق المشترك. يقرأ مستطيل WCO عند الإقلاع وبعد 1.5 ثانية، ثم يبدّل لغة الواجهة (`dir`/`lang`) ويقرأ مجددًا. والخيارات: `--label` و`--style hidden|hiddenInset` و`--overlay true|<ارتفاع>` و`--hold-ms` و`--auto-quit`.
- `results/auto-*.json` قياسات آلية، و`results/screens/` لقطات الشاشة، و`results/defaults-written-by-chromium.txt`.

## الإعادة

```bash
cd spikes/E-01-electron-forge && export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
SPIKE_MODE=e23 SPIKE_NAME="AYAR Spike E23" SPIKE_BUNDLE_ID=com.bysltan.ayar.spike.e23 \
  SPIKE_IDENTITY=- SPIKE_DLV=1 node_modules/.bin/electron-forge package
APP="$PWD/out/AYAR Spike E23-darwin-arm64/AYAR Spike E23.app"
open -n -W "$APP" --args --label sys-ar --auto-quit                               # لغة التطبيق = لغة النظام (عربي)
open -n -W "$APP" --args --label arg-en --auto-quit -AppleLanguages "(en)"        # إنجليزية بوسيط الإقلاع
defaults write com.bysltan.ayar.spike.e23 AppleLanguages -array en               # إنجليزية بتفضيل التطبيق
open -n -W "$APP" --args --label pref-en --auto-quit; defaults delete com.bysltan.ayar.spike.e23 AppleLanguages
open -n -W "$APP" --args --label inset-en --style hiddenInset --auto-quit -AppleLanguages "(en)"
cat ~/Library/Application\ Support/AYAR\ Spike/e23-*.json
defaults read com.bysltan.ayar.spike.e23          # ما يكتبه Chromium
# اللقطات: --hold-ms 60000 بدل --auto-quit، ثم لقطة شاشة للنافذة
```

## النتائج (2026-10-10، نظام عربي `ar-SA`)

| لغة التطبيق عند الإقلاع | الطريقة | الموضع الفعلي (لقطة) | قراءة WCO |
|---|---|---|---|
| عربية (`app.getLocale()` = ar) | لغة النظام | **يمين** (`screens/titlebar-app-ar.jpg`) | ظاهرة، `x=0` و`width=822` من 900، أي 78 بكسل محجوزة يمينًا. ومع `hiddenInset` 84 بكسل |
| إنجليزية (en-US) | `-AppleLanguages "(en)"` | **يمين** (`screens/window-en-first-launch-after-ar.jpg`) | **غير ظاهرة** (`visible=false`، `rect=null`) |
| إنجليزية | الإقلاع الثاني بالوسيط نفسه | **يمين** (`screens/window-en-second-launch.jpg`) | غير ظاهرة |
| إنجليزية | تفضيل التطبيق `AppleLanguages` (كإعدادات النظام ← اللغة ← التطبيقات) | **يمين** (`screens/window-per-app-pref-en.jpg`) | غير ظاهرة |
| إنجليزية | `hiddenInset` | — | ظاهرة لكن **بلا حجز** (`x=0` و`width=900`)، وهذا خطأ |

- **التبديل داخل التطبيق** (عربي ⇄ إنجليزي) لا يحرك الأزرار، ولا يغيّر قراءة WCO، في كل الحالات.
- **Chromium يكتب عند كل إقلاع** في تفضيلات التطبيق `AppleTextDirection = 1`، و`NSForceRightToLeftWritingDirection` = 1 في العربية و0 في الإنجليزية. ومع ذلك بقيت الأزرار يمينًا حتى حين كانت القيمة 0 من بداية الإقلاع.
- **شريط القوائم** يتبع النظام كذلك: قوائم التطبيق تظهر يمينًا.
- **الخلاصة على نظام عربي:** الأزرار تتبع لغة النظام لا لغة التطبيق، ولا تتغير بإعادة الفتح. وقراءة WCO صحيحة حين يتفق اتجاه التطبيق مع اتجاه النظام، وخاطئة أو غائبة حين يختلفان.
- **لم يُختبر هنا:** نظام بلغة إنجليزية. يحتاج تغيير لغة نظام المالك، فيغطيه AT-41 على التطبيق الحقيقي في تركيباته الأربع.

## القرار

- **الموضع يُستنتج من لغة النظام الأولى** (`app.getPreferredSystemLanguages()[0]`: العربية والعبرية والفارسية والأردية يمين، وغيرها يسار)، لا من لغة واجهة عِيَار ولا من `app.getLocale()`. وتُستخدم قراءة WCO عرضًا لا مصدرًا، ويُعتمد عليها حين تكون ظاهرة ومتسقة مع الاستنتاج فقط.
- **يُحجز ركن الأزرار بعرض 78 بكسل** (مع `titleBarStyle: 'hidden'`)، **ولا يوضع عنصر تحكم في أي من الركنين العلويين** (13.2). فيبقى الشريط سليمًا حتى لو خالف الاستنتاج الواقع في تركيبة لم تُختبر.
- **عند تبديل لغة الواجهة** لا يُذكر «يحتاج إعادة فتح»، لأن إعادة الفتح لا تحرك الأزرار. يُذكر أن موضعها يتبع لغة النظام. وهذا يغيّر نص 13.2 وE-23 في الخطة: D-54.
