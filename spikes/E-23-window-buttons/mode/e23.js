function measure() {
  const wco = navigator.windowControlsOverlay;
  const r = wco && wco.visible ? wco.getTitlebarAreaRect() : null;
  const probe = getComputedStyle(document.getElementById('probe'));
  const m = {
    wcoSupported: Boolean(wco),
    wcoVisible: Boolean(wco && wco.visible),
    rect: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null,
    cssEnv: { x: probe.paddingLeft, width: probe.width },
    innerWidth: window.innerWidth,
    docDir: document.documentElement.dir,
    docLang: document.documentElement.lang,
  };
  document.getElementById('out').textContent = JSON.stringify(m, null, 2);
  return m;
}
window.spike.on('mode:e23-set-ui', (lang) => {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.getElementById('lang-line').textContent = lang === 'ar' ? 'لغة الواجهة: العربية' : 'UI language: English';
  requestAnimationFrame(() => requestAnimationFrame(() => window.spike.send('mode:e23-measure', measure())));
});

const geometryEvents = [];
if (navigator.windowControlsOverlay) {
  navigator.windowControlsOverlay.addEventListener('geometrychange', (e) => {
    geometryEvents.push({ visible: e.visible, x: e.titlebarAreaRect.x, width: e.titlebarAreaRect.width, t: Math.round(performance.now()) });
  });
}
window.spike.on('mode:e23-remeasure', () => window.spike.send('mode:e23-measure', { ...measure(), geometryEvents: geometryEvents.slice() }));
