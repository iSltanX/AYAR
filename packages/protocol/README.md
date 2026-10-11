# @ayar/protocol

عقود الرسائل بين الواجهة والعملية الرئيسية والمحرك (الخطة 6.5، D-29). **بلا Node:** الواجهة تستوردها، فلا يدخلها `node:*` ولا `electron` (قاعدة في `eslint.config.js`).

## القواعد

- **الإصدار:** `PROTOCOL_VERSION` في `src/version.ts`. يتصافح المضيف (العملية الرئيسية أو `tools/cli`) والمحرك عليه (`hello` ثم `welcome` أو `refuse`)، ويفحص كل طرف الرقم الرئيسي بنفسه. واختلافه يوقف الاتصال بالرمز `protocol_mismatch`. **وتغيير عقد قائم يرفع الرقم الرئيسي، وإضافة عقد ترفع الثانوي.**
- **ملف لكل مجال:** الأوامر في `src/commands/<المجال>.ts` والأحداث في `src/events/<المجال>.ts`، ويجمعها `index.ts` في كل مجلد. فالمرحلتان المتوازيتان لا تلتقيان إلا في سطر الفهرس.
- **التحقق في الطرفين:** `parseHostMessage` في المحرك، و`parseEngineMessage` و`ProtocolClient` في المضيف (ومنه نتيجة كل أمر مقابل مخططه). وما لا يطابق يُرفض ويُسجَّل. ورسائل الخطأ تذكر المسار ونوع المخالفة، لا القيمة المرفوضة.
- **الرموز والمنح:** الواجهة لا ترسل مسارًا أبدًا. ترسل رمزًا (`sel_` و`dst_` و`src_` و`cfm_`) تصدره العملية الرئيسية بعد نافذة نظام، أو بعد معاينة (`setup.preview` و`tools.preview`)، أو بعد تأكيد الواجهة لإجراء مدمّر (`confirm.issue`). وعند تمرير الأمر إلى المحرك تستبدل العملية الرئيسية بالرمز «منحة» (`grants`) تحمل المسار أو ربط التأكيد بالأمر وهدفه. والمحرك يرفض الأمر دون منحه (`checkGrants`).
- **الأحداث:** مرقمة في «مجرى» (`stream`) لكل جلسة محرك، وللمشرف مجراه. الفجوة في الترقيم أو تبدّل المجرى تطلق إعادة المزامنة في الجسر (`bridge.resync`).
- **`report.copied`** سجل تدقيق في `audit_log`، لا حدث (G-21). والأحداث الناقصة (تقدم التجهيز، وحالات فحوص النموذج والبطاقات) تضيفها مراحلها بإصدار ثانوي.
- **عقود المجال** في `src/domain/` ملفًا لكل مجال: `DiscoverySnapshot` و`ResolvedEnv` وملف المعايير (`ProfileView` و`ExportedProfile` بصيغة `ayar-profile/1`) وعقود المشاريع من DEV-4 (الإصدار 1.1)، وسياق التغيير ونتيجة المستشار (`AdvisorContext` و`AdvisorResult`) والبطاقة (`TaskCard` و`TaskRecord` و`TaskSource`) من DEV-8، و`RunPlan` و`RunView` و`RunDetail` و`SavedGroup` وعقود الأدوات والتجهيز من DEV-5. والمرحلتان أضافتا عقودهما بالتوازي في الإصدار 1.2 نفسه، فجُمعتا فيه عند الدمج (G-WAVE4-03)، ومراحل التشغيل تضيف ما بعدها. ومن DEV-6 (الإصدار 1.3): عقود الأحكام في `domain/terms.ts` (النتائج والشدة والثبوت والمنشأ والحالة عبر التشغيلات) و`domain/findings.ts` (`ParsedReport` و`ParsedFinding` و`ExitSignal` و`Finding` وصفحة `results.query` وتفصيل `finding.get`) و`domain/purity.ts` (`PurityResult` و`PuritySummary` ومدخلات النزاهة)، واستدعاء المحول `InvocationTemplate` في `CheckSpec`، وحمولات `run.summary` و`finding.provisional` و`finding.final`. ومن DEV-7 (الإصدار 1.4): عقود المسبار في `domain/probe.ts` (هدف العرض ومصفوفته `RenderTarget`، والحالات `ProbeStates` بخطواتها ومحاكاة شبكتها وتوقعاتها، وميزانيات الويب `WebBudgets`، ومفتاح الصورة المرجعية `CaptureKey` واللقطة `CaptureView` والمرجع `BaselineView`)، والأمران `captures.list` و`baselines.list`، وعقد `baseline.approve`، ونوع التجهيز `install_browser`. ومن DEV-11 (الإصدار 1.6): أوامر العملية الرئيسية التي تحتاجها الشاشات (`window.layout` لموضع أزرار النافذة D-54، و`project.reveal` و`editor.open` و`menu.popup`، و`clipboard.copyText` لنسخ نص قصير يراه المستخدم كالمعرّف والأمر)، و`check.tail` لذيل سجل الفحص الحي (والسطر الأطول من 20,000 محرف يُقطع بعلامة «…»)، وموضوع الجسر `bridge.drop` لرمز اختيار المجلد المُفلت، و`memoryKb` في `check.progress`، و`cancelled` اختياريًا في رأس `report/1` لتشغيل أُلغي فلا حكم له ولا عيار (D-DEV11-02، D-DEV11-03). ومن DEV-12 (الإصدار 1.7): `check.report` لتقرير تنفيذ الفحص الموحد دون اكتشافاته (أعداد الاختبارات والإشارات وحقائق القارئ) مع المخرجات المعلنة التي كتبها بأحجامها في نهاية التشغيل ونهاية الجولة السابقة، و`profile.versions` لإصدارات ملف المعايير وما غيّره كل منها، و`reports.copies` لعدد مرات «انسخ للنموذج» في المشروع من سجل التدقيق، و`disk_full` سببًا لإلغاء التشغيل حين يوقفه المنفذ بأمان لامتلاء القرص، وإعدادات `editor.template` و`run.notify` و`purity.narrowThreshold`، وأوامر العملية الرئيسية `about.get` و`about.openRepository` (D-DEV12-02) و`system.openPrivacySettings` (D-DEV12-01)، و`item` في هدف المراجعة لبنود `design.a11y.review` الأربعة، و`AiInstructionSummary` في `aiChecks.list` (مسار الحفظ ووقت قراءة ملف النتائج وسبب رفضه)، و`code` في `AiNeed`، و`path` اختياريًا في `project.reveal` لملف داخل المشروع. ونتيجة `z.unknown()` تعني أن عقد النتيجة لم يُعرَّف بعد.

## ملكية الأوامر (G-19)

مولّد من السجل نفسه (`ownershipMarkdown()`)، واختبار `test/readme.test.ts` يمنع افتراقهما. «المنفّذ» `main` يعني أن العملية الرئيسية تنفذه بنفسها. و«من يستدعيه» `host` يعني أن الواجهة لا تستطيعه. والأوامر الثمانية خارج 6.5 للعملية الرئيسية والمضيف قرار D-DEV3-03، والستة للمحرك (`project.confirm` و`project.cancelDiscovery` و`project.rename` و`profile.exportPreview` و`profile.importFromRepo` و`environment.resolve`) قرار D-DEV4-02 في الإصدار 1.1، ومعها حدثا `discovery.cancelled` و`discovery.failed`.

| الأمر | المالك | المنفّذ | من يستدعيه | المنح المطلوبة | المرحلة |
|---|---|---|---|---|---|
| `project.add` | C-05 | engine | renderer | selection | DEV-4 |
| `project.list` | C-05 | engine | renderer | — | DEV-4 |
| `project.get` | C-05 | engine | renderer | — | DEV-4 |
| `project.rescan` | C-05 | engine | renderer | — | DEV-4 |
| `project.relocate` | C-05 | engine | renderer | selection | DEV-4 |
| `project.remove` | C-05 | engine | renderer | confirmation | DEV-4 |
| `project.setTrust` | C-05 | engine | renderer | — | DEV-4 |
| `project.confirm` | C-05 | engine | renderer | — | DEV-4 |
| `project.cancelDiscovery` | C-05 | engine | renderer | — | DEV-4 |
| `project.rename` | C-05 | engine | renderer | — | DEV-4 |
| `profile.propose` | C-09 | engine | renderer | — | DEV-4 |
| `profile.get` | C-09 | engine | renderer | — | DEV-4 |
| `profile.update` | C-09 | engine | renderer | — | DEV-4 |
| `profile.approve` | C-09 | engine | renderer | — | DEV-4 |
| `profile.export` | C-09 | engine | renderer | destination | DEV-4 |
| `profile.import` | C-09 | engine | renderer | source | DEV-4 |
| `profile.exportPreview` | C-09 | engine | renderer | — | DEV-4 |
| `profile.versions` | C-09 | engine | renderer | — | DEV-12 |
| `profile.importFromRepo` | C-09 | engine | renderer | — | DEV-4 |
| `environment.resolve` | C-07 | engine | renderer | — | DEV-4 |
| `readiness.evaluate` | C-10 | engine | renderer | — | DEV-5 |
| `setup.preview` | C-11 | engine | renderer | — | DEV-5 |
| `setup.execute` | C-11 | engine | renderer | confirmation | DEV-5 |
| `run.plan` | C-10 | engine | renderer | — | DEV-5 |
| `run.start` | C-12 | engine | renderer | — | DEV-5 |
| `run.cancel` | C-12 | engine | renderer | — | DEV-5 |
| `run.rerun` | C-10 | engine | renderer | — | DEV-5 |
| `run.continueRound` | C-10 | engine | renderer | — | DEV-5 |
| `runs.list` | C-17 | engine | renderer | — | DEV-5 |
| `run.get` | C-17 | engine | renderer | — | DEV-5 |
| `runs.keep` | C-17 | engine | renderer | — | DEV-5 |
| `runs.delete` | C-17 | engine | renderer | confirmation | DEV-5 |
| `groups.save` | C-10 | engine | renderer | — | DEV-5 |
| `groups.list` | C-10 | engine | renderer | — | DEV-5 |
| `groups.delete` | C-10 | engine | renderer | — | DEV-5 |
| `results.query` | C-17 | engine | renderer | — | DEV-6 |
| `finding.get` | C-17 | engine | renderer | — | DEV-6 |
| `check.tail` | C-17 | engine | renderer | — | DEV-11 |
| `check.report` | C-17 | engine | renderer | — | DEV-12 |
| `evidence.token` | C-17 | engine | renderer | — | DEV-5 |
| `review.record` | C-16 | engine | renderer | — | DEV-9 |
| `reviews.list` | C-16 | engine | renderer | — | DEV-9 |
| `baseline.approve` | C-14 | engine | renderer | — | DEV-7 |
| `captures.list` | C-14 | engine | renderer | — | DEV-7 |
| `baselines.list` | C-14 | engine | renderer | — | DEV-7 |
| `report.build` | C-21 | engine | renderer | — | DEV-9 |
| `reports.copies` | C-21 | engine | renderer | — | DEV-12 |
| `reports.list` | C-21 | engine | renderer | — | DEV-9 |
| `compare.runs` | C-22 | engine | renderer | — | DEV-9 |
| `clipboard.copy` | C-01 | main | renderer | — | DEV-9 |
| `tasks.list` | C-20 | engine | renderer | — | DEV-8 |
| `task.create` | C-20 | engine | renderer | — | DEV-8 |
| `task.update` | C-20 | engine | renderer | — | DEV-9 |
| `tasks.verify` | C-20 | engine | renderer | — | DEV-9 |
| `advisor.suggest` | C-20 | engine | renderer | — | DEV-8 |
| `report.export` | C-23 | engine | renderer | destination | DEV-9 |
| `aiChecks.needs` | C-25 | engine | renderer | — | DEV-9 |
| `aiChecks.provideInput` | C-25 | engine | renderer | — | DEV-9 |
| `aiChecks.generate` | C-25 | engine | renderer | — | DEV-9 |
| `aiChecks.save` | C-25 | engine | renderer | destination | DEV-9 |
| `aiChecks.importResults` | C-25 | engine | renderer | — | DEV-9 |
| `aiChecks.get` | C-25 | engine | renderer | — | DEV-9 |
| `aiChecks.list` | C-25 | engine | renderer | — | DEV-9 |
| `tools.list` | C-11 | engine | renderer | — | DEV-5 |
| `tools.preview` | C-11 | engine | renderer | — | DEV-5 |
| `tools.install` | C-11 | engine | renderer | confirmation | DEV-5 |
| `tools.verify` | C-11 | engine | renderer | — | DEV-5 |
| `tools.remove` | C-11 | engine | renderer | confirmation | DEV-5 |
| `settings.get` | C-17 | engine | renderer | — | DEV-3 |
| `settings.set` | C-17 | engine | renderer | — | DEV-3 |
| `data.purge` | C-17 | engine | renderer | confirmation | DEV-12 |
| `dialog.pickFolder` | C-01 | main | renderer | — | DEV-3 |
| `dialog.pickDestination` | C-01 | main | renderer | — | DEV-3 |
| `dialog.pickSource` | C-01 | main | renderer | — | DEV-3 |
| `confirm.issue` | C-01 | main | renderer | — | DEV-5 |
| `engine.status` | C-01 | main | renderer | — | DEV-3 |
| `window.layout` | C-01 | main | renderer | — | DEV-11 |
| `project.reveal` | C-01 | main | renderer | — | DEV-11 |
| `editor.open` | C-01 | main | renderer | — | DEV-11 |
| `menu.popup` | C-01 | main | renderer | — | DEV-11 |
| `clipboard.copyText` | C-01 | main | renderer | — | DEV-11 |
| `engine.restart` | C-01 | main | renderer | — | DEV-3 |
| `about.get` | C-01 | main | renderer | — | DEV-12 |
| `about.openRepository` | C-01 | main | renderer | — | DEV-12 |
| `system.openPrivacySettings` | C-01 | main | renderer | — | DEV-12 |
| `internal.clipboardText` | C-21 | engine | host | — | DEV-9 |
| `internal.recordCopy` | C-17 | engine | host | — | DEV-9 |
| `internal.evidencePath` | C-17 | engine | host | — | DEV-5 |
| `internal.prepareQuit` | C-12 | engine | host | — | DEV-5 |

## ملكية الأحداث

| الحدث | المالك | المرحلة |
|---|---|---|
| `discovery.progress` | C-06 | DEV-4 |
| `discovery.done` | C-06 | DEV-4 |
| `discovery.cancelled` | C-06 | DEV-4 |
| `discovery.failed` | C-06 | DEV-4 |
| `run.state` | C-12 | DEV-5 |
| `check.state` | C-12 | DEV-5 |
| `check.progress` | C-12 | DEV-5 |
| `check.log` | C-12 | DEV-5 |
| `run.summary` | C-16 | DEV-6 |
| `finding.provisional` | C-15 | DEV-6 |
| `finding.final` | C-16 | DEV-6 |
| `engine.health` | C-04 | DEV-3 |
| `setup.progress` | C-11 | DEV-5 |

## اتحاد مصفوفة الواجهات (G-18)

اتحاد عمودي «يزوّد» و«يستهلك من» في مصفوفة الخطة (القسم 8): تُعد A مزوّدًا لـ B إن ذكرتها إحدى الخانتين. والعلامة \* على علاقة وردت في خانة واحدة فقط (28 علاقة). ونصوص «العلاقات» في المكونات غير موجّهة، فلا تضيف اتجاهًا. وصفّا C-04 (يزوّد كل مكونات المجال ويستهلك من C-01) وC-17 («معظم المكونات» في الخانتين) لا يُفصَّلان.

| المكوّن | يزوّد (الاتحاد) | يستهلك من (الاتحاد) |
|---|---|---|
| C-01 | C-02، C-04، C-05\*، C-12\*، C-14، C-18، C-23\* | C-04، C-17، C-21\* |
| C-02 | C-03 | C-01 |
| C-03 | المستخدم | C-02، C-10\*، C-19\*، C-20\*، C-21\*، C-22\*، C-24، C-25\* |
| C-05 | C-06، C-17 | C-01\*، C-04 |
| C-06 | C-07، C-09، C-10\*، C-13، C-17، C-20، C-25\* | C-05، C-08 |
| C-07 | C-09، C-10، C-11\*، C-12، C-18 | C-06، C-08\*، C-11\* |
| C-08 | C-06، C-07\*، C-09، C-10، C-11، C-13، C-15، C-16، C-18\*، C-19، C-20، C-21، C-24، C-25 | يُحمَّل عند الإقلاع |
| C-09 | C-10، C-12\*، C-13\*، C-16، C-19 | C-06، C-07، C-08، C-20 |
| C-10 | C-03\*، C-12 | C-06\*، C-07، C-08، C-09، C-11، C-17، C-20 |
| C-11 | C-07\*، C-10، C-12، C-14، C-15 | C-07\*، C-08، C-17 |
| C-12 | C-13\*، C-14، C-15، C-16، C-17 | C-01\*، C-07، C-09\*، C-10، C-11، C-15\*، C-18 |
| C-13 | C-16، C-20 | C-06، C-08، C-09\*، C-12\*، C-17 |
| C-14 | C-15\*، C-16، C-17 | C-01، C-11، C-12 |
| C-15 | C-12\*، C-16 | C-08، C-11، C-12، C-14\*، C-18 |
| C-16 | C-17، C-19، C-20، C-21، C-22، C-25\* | C-08، C-09، C-12، C-13، C-14، C-15، C-17، C-22، C-25\* |
| C-18 | C-12، C-15، C-17، C-21، C-23، C-25\* | C-01، C-07، C-08\* |
| C-19 | C-03\*، C-17، C-22 | C-08، C-09، C-16، C-22\* |
| C-20 | C-03\*، C-09، C-10، C-21، C-25\* | C-06، C-08، C-13، C-16، C-17 |
| C-21 | C-01\*، C-03\*، C-17، C-23\* | C-08، C-16، C-18، C-20، C-24، C-25 |
| C-22 | C-03\*، C-16، C-19\* | C-16، C-17، C-19، C-25\* |
| C-23 | المستخدم | C-01\*، C-17، C-18، C-21\*، C-24 |
| C-24 | C-03، C-21، C-23، C-25 | C-08 |
| C-25 | C-03\*، C-16\*، C-17، C-21، C-22\* | C-06\*، C-08، C-16\*، C-18\*، C-20\*، C-24 |
