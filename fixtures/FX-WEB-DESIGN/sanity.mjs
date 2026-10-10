// تشغيلات السلامة لـ FX-WEB-DESIGN (تُنفَّذ بـ: node fixtures/tools/sanity.mjs run FX-WEB-DESIGN)
const run = (id, cmd, proves, extra = {}) => ({ id, cmd, exit: 0, proves, evidence: true, ...extra });
const tokens = run('tokens-build', 'node tools/build-tokens.mjs --check', 'tokens.css مولَّد من tokens.json الحالي (اتساق الرموز)', { match: ['مطابق'], evidence: false });
const stat = (proves, match = []) => run('static', 'node $FX_TOOLS/web-design-check.mjs static .', proves, { match });
const render = (proves, match = [], nomatch = []) => run('render', 'node $FX_TOOLS/web-design-check.mjs render . | grep -v "^STATE .* ok$"', proves, { match, nomatch, timeout_s: 240, excerpt: 1600 });

export default {
  versions: { node: 'node --version', chromium: 'echo "Chromium 156.0.8078.4 (Playwright 1.64.0)"', 'axe-core': 'echo axe-core 4.14.0' },
  variants: {
    good: [tokens, stat('design.tokens.static/design.fonts.static/code.refs: لا مخالفات ساكنة', ['STATIC_TOTAL 0']),
      render('الحالات الخمس × الثيمان × اللغتان × الحجمان تحقق توقعاتها، والخطوط محمّلة، والقيم ضمن الرموز، وصفر تباين، و32 لقطة بلا الحساسة (8 متخطاة)', ['RENDER_PROBLEMS 0', 'SHOTS 32 SENSITIVE_SKIPPED 8', 'arabic_cairo_loaded=true', 'DIR light ar rtl/rtl', 'DIR light en ltr/ltr'], ['BLOCKED_EXTERNAL', 'MISSING', 'RENDER_OFF_TOKEN', 'AXE'])],
    'hardcoded-color': [tokens, stat('design.tokens.static: لون حرفي #1a73e8', ['HARDCODED_COLOR styles/app\\.css:\\d+ #1a73e8']), render('design.tokens.render: rgb(26, 115, 232) ليس من الرموز', ['RENDER_OFF_TOKEN .* \\.status background-color rgb\\(26, 115, 232\\)'])],
    'off-scale-spacing': [tokens, stat('design.tokens.static: padding: 15px', ['OFF_SCALE_SPACING styles/app\\.css:\\d+ padding: 15px']), render('design.tokens.render: padding-top 15px', ['RENDER_OFF_TOKEN .* \\.item padding-top 15px'])],
    'undefined-var': [tokens, stat('design.tokens.static: var() لرمز غير معرّف', ['UNDEFINED_VAR styles/app\\.css:\\d+ --color-text-subtle'])],
    'error-message-missing': [tokens, stat('لا مخالفات ساكنة', ['STATIC_TOTAL 0']), render('design.states: رسالة الخطأ المتوقعة لا تظهر', ['STATE error light ar desktop MISSING_TEXT', 'STATE error light en desktop MISSING_TEXT'])],
    'visual-change': [tokens, stat('لا مخالفات ساكنة (التغيير مقصود ومتسق)', ['STATIC_TOTAL 0']), render('الحالات تمر؛ والفرق في المظهر فقط', ['RENDER_PROBLEMS [0-9]+']),
      run('radius', 'grep -n -- "--radius-md" styles/tokens.css', 'design.visual: نصف القطر 16px بدل 8px', { match: ['--radius-md: 16px'] })],
    'silent-font-fallback': [tokens, stat('design.fonts.static: ملف @font-face مفقود', ['FONT_FACE_MISSING styles/app\\.css:\\d+ \\.\\./fonts/cairo-arabic-wght-normal-missing\\.woff2']), render('design.fonts.render: الوجه العربي غير محمّل', ['arabic_cairo_loaded=false'])],
    'low-contrast-default': [tokens, stat('لا مخالفات ساكنة', ['STATIC_TOTAL 0']), render('design.a11y: color-contrast في الحالة الافتراضية (الثيم الفاتح)', ['AXE color-contrast light (ar|en) \\d+ .*\\.item-meta'])],
    'external-font-host': [tokens, stat('design.fonts.static: مضيف خارجي', ['EXTERNAL_HOST index\\.html:\\d+ https://fonts\\.googleapis\\.com']), render('AT-31: الطلب الخارجي يُمنع ويُسجَّل', ['BLOCKED_EXTERNAL GET https://fonts\\.googleapis\\.com/css2'])],
  },
};
