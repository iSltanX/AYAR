// DES-4 — تدقيق الشاشات في Figma (قراءة فقط).
// يُشغَّل بأداة use_figma على الملف UXkPakdqRuHDVTs78DO4uC، ويعيد JSON حُفظ في figma-audit.json.
// يفحص في كل إطار شاشة (اسمه يبدأ برقم) في الصفحات الثلاث:
//  1. التركيب: كل عقدة خارج النسخ إما نسخة مكوّن، أو إطار تخطيط، أو نص؛ ولا أشكال ولا متجهات (otherTypes فارغ).
//  2. الربط: كل تعبئة وحد في إطارات التخطيط والنصوص مربوط بمتغير، وكل نص له نمط نص.
//  3. الأحمر والأخضر خارج النسخ: صفر (لا يُرسم لون نتيجة أو حكم خارج مكوّناته).
//  4. الانعكاس: الشريط الجانبي يمين المحتوى والمفتش يساره في العربية، والعكس في الإنجليزية.
//  5. الاتجاه: نسخ المكوّنات بخاصية Direction تطابق لغة الإطار (والاستثناء المقصود وسوم المسارات اللاتينية LTR، D-DES4-10).
//  6. العبارات الممنوعة (البرومبت §11) في كل نص ظاهر.
//  7. زر «انسخ للنموذج» واحد في كل سياق (المحتوى، والمفتش)، ولا زر نسخ آخر.
//  8. لا شارة نتيجة داخل صف ادعاء نموذج أو معاينة تعليمات.
//  9. إطارات الصفحة الداكنة مضبوطة على وضع Dark في المجموعات الثلاث.
const pages = { ar: '49:1057', dark: '49:1058', en: '49:1059' };
const FORBID = ['آمن تمامًا', 'جاهز للإنتاج', 'لا توجد مشكلات', 'تم الإصلاح', 'مجاني', 'وضع بسيط', 'وضع متقدم', 'completely safe', 'production ready', 'production-ready', 'no issues', 'fixed', 'free', 'simple mode', 'advanced mode'];
const REDGREEN = new Set();
const cols = await figma.variables.getLocalVariableCollectionsAsync();
for (const c of cols) for (const id of c.variableIds) { const v = await figma.variables.getVariableByIdAsync(id); if (/^(result\/(passed|failed)|verdict\/(pure|blocked))\//.test(v.name) || /^(red|green)\//.test(v.name)) REDGREEN.add(v.id); }
const res = {};
for (const [k, pid] of Object.entries(pages)) {
  const page = await figma.getNodeByIdAsync(pid); await page.loadAsync();
  const frames = page.children.filter(n => n.type === 'FRAME' && /^\d/.test(n.name));
  const R = { frames: frames.length, nodes: 0, instances: 0, layoutFrames: 0, texts: 0, otherTypes: {}, unboundFill: [], unboundStroke: [], textNoStyle: [], mirrorFail: [], dirMismatch: {}, forbidden: [], copyButtons: [], redGreenOutside: 0, darkModes: [] };
  for (const f of frames) {
    const walk = (n, insideInst) => {
      for (const c of (n.children || [])) {
        if (insideInst) { if ('children' in c) walk(c, true); continue; }
        R.nodes++;
        if (c.type === 'INSTANCE') { R.instances++; walk(c, true); continue; }
        if (c.type === 'FRAME') {
          R.layoutFrames++;
          for (const p of (c.fills || [])) { if (p.visible === false) continue; if (!(p.boundVariables && p.boundVariables.color)) R.unboundFill.push(f.name.slice(0, 5) + '/' + c.name); else if (REDGREEN.has(p.boundVariables.color.id)) R.redGreenOutside++; }
          for (const p of (c.strokes || [])) { if (!(p.boundVariables && p.boundVariables.color)) R.unboundStroke.push(f.name.slice(0, 5) + '/' + c.name); else if (REDGREEN.has(p.boundVariables.color.id)) R.redGreenOutside++; }
          walk(c, false); continue;
        }
        if (c.type === 'TEXT') { R.texts++; if (!c.textStyleId) R.textNoStyle.push(f.name.slice(0, 5) + '/' + c.name); for (const p of c.fills) { if (!(p.boundVariables && p.boundVariables.color)) R.unboundFill.push(f.name.slice(0, 5) + '/T:' + c.name); else if (REDGREEN.has(p.boundVariables.color.id)) R.redGreenOutside++; } continue; }
        R.otherTypes[c.type] = (R.otherTypes[c.type] || 0) + 1;
      }
    };
    for (const p of f.fills) if (!(p.boundVariables && p.boundVariables.color)) R.unboundFill.push(f.name.slice(0, 5) + '/root');
    walk(f, false);
    const sb = f.findOne(n => n.name === 'sidebar'); const cs = f.findOne(n => n.name === 'content-slot'); const is = f.findOne(n => n.name === 'inspector-slot');
    const ax = n => n.absoluteBoundingBox.x; const rtl = k !== 'en';
    if (sb && cs) { if (rtl ? !(ax(sb) > ax(cs)) : !(ax(sb) < ax(cs))) R.mirrorFail.push(f.name.slice(0, 5) + ' sidebar'); }
    if (is && is.visible && cs) { if (rtl ? !(ax(is) < ax(cs)) : !(ax(is) > ax(cs))) R.mirrorFail.push(f.name.slice(0, 5) + ' inspector'); }
    for (const inst of f.findAll(n => n.type === 'INSTANCE')) { const vp = inst.mainComponent && inst.mainComponent.variantProperties; if (!vp || !vp.Direction) continue; const want = rtl ? 'RTL' : 'LTR'; if (vp.Direction !== want) { const key = inst.mainComponent.parent.name; R.dirMismatch[key] = (R.dirMismatch[key] || 0) + 1; } }
    for (const t of f.findAll(n => n.type === 'TEXT' && n.visible)) for (const w of FORBID) { const re = /^[a-z]/.test(w) ? new RegExp('\\b' + w + '\\b', 'i') : null; if (re ? re.test(t.characters) : t.characters.includes(w)) R.forbidden.push(f.name.slice(0, 5) + ': «' + t.characters.slice(0, 60) + '» [' + w + ']'); }
    const cbs = f.findAll(n => n.type === 'INSTANCE' && n.mainComponent && n.mainComponent.parent && n.mainComponent.parent.name === 'Copy for model button');
    const inInsp = cbs.filter(b => { let p = b.parent; while (p && p !== f) { if (p.name === 'inspector-slot') return true; p = p.parent; } return false; }).length;
    const otherCopy = f.findAll(n => n.type === 'TEXT' && /^(انسخ|Copy)\b/.test(n.characters) && !(n.parent && n.parent.type === 'INSTANCE' && n.parent.mainComponent && n.parent.mainComponent.parent && n.parent.mainComponent.parent.name === 'Copy for model button')).map(t => t.characters);
    if (cbs.length) R.copyButtons.push(f.name.slice(0, 5) + ': content ' + (cbs.length - inInsp) + ' · inspector ' + inInsp + (otherCopy.length ? ' · other ' + otherCopy.join('/') : ''));
    if (k === 'dark') R.darkModes.push(f.name.slice(0, 4) + ':' + Object.keys(f.explicitVariableModes).length);
  }
  res[k] = R;
}
let claimBadges = 0;
for (const pid of Object.values(pages)) { const page = await figma.getNodeByIdAsync(pid); for (const n of page.findAll(x => x.type === 'INSTANCE' && x.mainComponent && x.mainComponent.parent && ['Model claim row', 'Instructions preview'].includes(x.mainComponent.parent.name))) claimBadges += n.findAll(y => y.type === 'INSTANCE' && y.mainComponent && y.mainComponent.parent && y.mainComponent.parent.name === 'Result badge').length; }
res.claimOrInstructionResultBadges = claimBadges;
for (const k of Object.keys(pages)) { const R = res[k]; R.unboundFill = R.unboundFill.length; R.unboundStroke = R.unboundStroke.length; R.textNoStyle = R.textNoStyle.length; }
return res;
