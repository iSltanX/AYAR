// DES-5 — تدقيق الشاشات 9–22 والرحلات والإرشادات في Figma (قراءة فقط).
// يُشغَّل بأداة use_figma على الملف UXkPakdqRuHDVTs78DO4uC، ويعيد JSON حُفظ في figma-audit.json.
// يفحص في إطارات DES-5 (الشاشات 9–22 في AR Light، و10.2 و16.1 في AR Dark، وإطارات الرحلات J في Flows، وG-01..G-06 في Guidelines):
//  1. التركيب: كل عقدة خارج النسخ إما نسخة مكوّن، أو إطار تخطيط، أو نص؛ ولا أشكال ولا متجهات.
//  2. الربط: كل تعبئة وحد في إطارات التخطيط والنصوص مربوط بمتغير، وكل نص له نمط نص.
//  3. الأحمر والأخضر خارج النسخ: صفر.
//  4. النزاهة (15.x): كل لون أحمر أو أخضر في الإطار، داخل النسخ أو خارجها، يقع داخل شارة نتيجة فحص (Result badge).
//  5. الانعكاس: الشريط الجانبي يمين المحتوى والمفتش يساره.
//  6. العبارات الممنوعة (§11)، و«مجاني» مسموحة في بيان «عِيَار محلي ومجاني» وحده (§10.21).
//  7. «اجتاز» و«أخفق»: لا شارة نتيجة داخل صف ادعاء نموذج أو معاينة تعليمات، ولا كلمتا «اجتاز» و«أخفق» في المستشار (17.3 و17.4).
//  8. زر «انسخ للنموذج» واحد في كل سياق.
//  9. الإطارات الداكنة على وضع Dark في المجموعات الثلاث.
// 10. الرحلات: من كل نقطة بدء في Flows، تُتبع التفاعلات حتى آخر إطار في الرحلة، وتُعد الإطارات غير المبلوغة.
const PAGES = { ar: '49:1057', dark: '49:1058', flows: '49:1060', guide: '49:1061' };
const isDes5Screen = n => /^(9|1\d|2[0-2])\.\d+ · /.test(n.name);
const FORBID = ['آمن تمامًا', 'جاهز للإنتاج', 'لا توجد مشكلات', 'تم الإصلاح', 'مجاني', 'وضع بسيط', 'وضع متقدم'];
const REDGREEN = new Set();
const cols = await figma.variables.getLocalVariableCollectionsAsync();
for (const c of cols) for (const id of c.variableIds) { const v = await figma.variables.getVariableByIdAsync(id); if (/^(result\/(passed|failed|passed-reviewed|failed-reviewed)|verdict\/(pure|blocked))\//.test(v.name) || /^(red|green)\//.test(v.name)) REDGREEN.add(v.id); }
const setName = n => n.type === 'INSTANCE' && n.mainComponent ? (n.mainComponent.parent && n.mainComponent.parent.type === 'COMPONENT_SET' ? n.mainComponent.parent.name : n.mainComponent.name) : null;
const paintsRG = n => { const out = []; for (const k of ['fills', 'strokes']) { const ps = n[k]; if (!Array.isArray(ps)) continue; for (const p of ps) if (p.visible !== false && p.boundVariables && p.boundVariables.color && REDGREEN.has(p.boundVariables.color.id)) out.push(k); } return out.length; };
const res = { frames: {}, totals: {} };
const audit = async (key, pid, pick) => {
  const page = await figma.getNodeByIdAsync(pid); await page.loadAsync();
  const frames = page.children.filter(n => n.type === 'FRAME' && pick(n));
  const R = { frames: frames.length, nodes: 0, instances: 0, layoutFrames: 0, texts: 0, otherTypes: {}, unboundFill: [], unboundStroke: [], textNoStyle: [], redGreenOutside: [], integrityRG: [], mirrorFail: [], forbidden: [], claimBadges: 0, advisorWords: [], copyButtons: [], darkModes: [] };
  for (const f of frames) {
    const tag = f.name.split(' · ')[0];
    const walk = (n) => { for (const c of (n.children || [])) { R.nodes++;
      if (c.type === 'INSTANCE') { R.instances++; continue; }
      if (c.type === 'FRAME') { R.layoutFrames++; for (const p of (c.fills || [])) if (p.visible !== false && !(p.boundVariables && p.boundVariables.color)) R.unboundFill.push(tag + '/' + c.name); for (const p of (c.strokes || [])) if (!(p.boundVariables && p.boundVariables.color)) R.unboundStroke.push(tag + '/' + c.name); if (paintsRG(c)) R.redGreenOutside.push(tag + '/' + c.name); walk(c); continue; }
      if (c.type === 'TEXT') { R.texts++; if (!c.textStyleId) R.textNoStyle.push(tag + '/' + c.characters.slice(0, 20)); for (const p of c.fills) if (!(p.boundVariables && p.boundVariables.color)) R.unboundFill.push(tag + '/T'); if (paintsRG(c)) R.redGreenOutside.push(tag + '/T:' + c.characters.slice(0, 20)); continue; }
      R.otherTypes[c.type] = (R.otherTypes[c.type] || 0) + 1; } };
    for (const p of (f.fills || [])) if (!(p.boundVariables && p.boundVariables.color)) R.unboundFill.push(tag + '/root');
    walk(f);
    if (/^15\.|^J\d+\.\d+ · .*نزاهة/.test(f.name)) { for (const n of f.findAll(x => 'fills' in x && paintsRG(x))) { let p = n, ok = false; while (p && p !== f) { if (setName(p) === 'Result badge') { ok = true; break; } p = p.parent; } if (!ok) R.integrityRG.push(tag + '/' + n.name); } }
    const sb = f.findOne(n => n.name === 'sidebar'); const cs = f.findOne(n => n.name === 'content-slot'); const is = f.findOne(n => n.name === 'inspector-slot');
    const ax = n => n.absoluteBoundingBox.x;
    if (sb && cs && !(ax(sb) > ax(cs))) R.mirrorFail.push(tag + ' sidebar');
    if (is && is.visible && cs && !(ax(is) < ax(cs))) R.mirrorFail.push(tag + ' inspector');
    for (const t of f.findAll(n => n.type === 'TEXT' && n.visible)) for (const w of FORBID) { if (!t.characters.includes(w)) continue; if (w === 'مجاني' && t.characters.includes('عِيَار محلي ومجاني')) continue; R.forbidden.push(tag + ': «' + t.characters.slice(0, 60) + '»'); }
    for (const n of f.findAll(x => ['Model claim row', 'Instructions preview'].includes(setName(x)))) R.claimBadges += n.findAll(y => setName(y) === 'Result badge').length;
    if (/^17\.[34]|^J8\.0[23]/.test(f.name)) for (const t of f.findAll(n => n.type === 'TEXT' && n.visible)) if (/اجتاز|أخفق/.test(t.characters)) R.advisorWords.push(tag + ': ' + t.characters.slice(0, 40));
    const cbs = f.findAll(n => setName(n) === 'Copy for model button');
    if (cbs.length) { const inInsp = cbs.filter(b => { let p = b.parent; while (p && p !== f) { if (p.name === 'inspector-slot') return true; p = p.parent; } return false; }).length; R.copyButtons.push(tag + ': ' + (cbs.length - inInsp) + '+' + inInsp); }
    if (key === 'dark') R.darkModes.push(tag + ':' + Object.keys(f.explicitVariableModes).length);
  }
  for (const k of ['unboundFill', 'unboundStroke', 'textNoStyle']) R[k] = R[k].length;
  res.totals[key] = R;
  return page;
};
await audit('ar', PAGES.ar, isDes5Screen);
await audit('dark', PAGES.dark, n => /^(10\.2|16\.1) · /.test(n.name));
const flows = await audit('flows', PAGES.flows, n => /^J\d+\.\d+ · /.test(n.name));
await audit('guide', PAGES.guide, n => /^G-0[1-6] · /.test(n.name));
// journeys reachability
const J = {};
const all = flows.children.filter(n => n.type === 'FRAME' && /^J\d+\.\d+ · /.test(n.name));
for (const sp of flows.flowStartingPoints) {
  const start = await figma.getNodeByIdAsync(sp.nodeId); const j = start.name.match(/^J(\d+)\./)[1];
  const members = all.filter(n => n.name.startsWith('J' + j + '.')).map(n => n.id);
  const seen = new Set([start.id]); const queue = [start]; let bad = 0;
  while (queue.length) { const fr = queue.shift(); const srcs = [fr, ...fr.findAll(n => n.reactions && n.reactions.length)];
    for (const s of srcs) for (const r of (s.reactions || [])) for (const a of (r.actions || [])) { if (a.type !== 'NODE') continue; const d = await figma.getNodeByIdAsync(a.destinationId); if (!d || d.parent !== flows) { bad++; continue; } if (!seen.has(d.id)) { seen.add(d.id); queue.push(d); } } }
  J[sp.name] = { steps: members.length, reached: members.filter(id => seen.has(id)).length, badDestinations: bad };
}
res.journeys = J;
return res;
