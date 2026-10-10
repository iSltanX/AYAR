// Test project of ayar.js.html-injection.
export function render(el, name) {
  // ruleid: ayar.js.html-injection
  el.innerHTML = `<b>${name}</b>`;
  // ruleid: ayar.js.html-injection
  el.innerHTML += name;
  // ruleid: ayar.js.html-injection
  el.outerHTML = name;
  // ruleid: ayar.js.html-injection
  el.insertAdjacentHTML('beforeend', name);
  // ruleid: ayar.js.html-injection
  document.write(name);
}

export function safe(el, name) {
  // ok: ayar.js.html-injection
  el.innerHTML = '';
  // ok: ayar.js.html-injection
  el.textContent = name;
  // ok: ayar.js.html-injection
  el.insertAdjacentHTML('beforeend', '<hr>');
}
