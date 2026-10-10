import { fetchItems } from './api.js';
import { currentLang, messages } from './i18n.js';

const params = new URLSearchParams(location.search);
const lang = currentLang();
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
const t = messages[lang];
const nf = new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US');

const root = document.documentElement;
root.lang = lang;
root.dir = lang === 'ar' ? 'rtl' : 'ltr';
root.dataset.theme = theme;
document.title = t.title;
document.getElementById('app-title').textContent = t.title;

const langToggle = document.getElementById('lang-toggle');
langToggle.textContent = t.langToggle;
langToggle.href = `?lang=${lang === 'ar' ? 'en' : 'ar'}&theme=${theme}`;
const themeToggle = document.getElementById('theme-toggle');
themeToggle.textContent = theme === 'dark' ? t.themeLight : t.themeDark;
themeToggle.href = `?lang=${lang}&theme=${theme === 'dark' ? 'light' : 'dark'}`;

const app = document.getElementById('app');

function message(text, extra = {}) {
  const p = document.createElement('p');
  p.className = 'message';
  p.textContent = text;
  for (const [k, v] of Object.entries(extra)) p.setAttribute(k, v);
  return p;
}

function renderLoading() {
  app.dataset.state = 'loading';
  app.replaceChildren();
  app.setAttribute('aria-busy', 'true');
  for (let i = 0; i < 3; i += 1) {
    const s = document.createElement('div');
    s.className = 'skeleton';
    app.append(s);
  }
  app.append(message(t.loading));
}

function renderItems(items) {
  app.removeAttribute('aria-busy');
  if (items.length === 0) {
    app.dataset.state = 'empty';
    app.replaceChildren(message(t.empty));
    return;
  }
  app.dataset.state = 'default';
  const list = document.createElement('ul');
  list.className = 'items';
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'item';
    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = item.name[lang];
    const meta = document.createElement('div');
    meta.className = 'item-meta';
    meta.textContent = `${nf.format(item.price)} ${lang === 'ar' ? 'ر.س' : 'SAR'}`;
    info.append(name, meta);
    const status = document.createElement('span');
    status.className = 'status';
    status.textContent = item.inStock ? t.available : t.soldOut;
    li.append(info, status);
    list.append(li);
  }
  app.replaceChildren(list);
}

function renderError() {
  app.removeAttribute('aria-busy');
  app.dataset.state = 'error';
  app.replaceChildren(message(t.error, { role: 'alert' }));
}

function renderAccount() {
  const section = document.createElement('section');
  section.className = 'account';
  section.dataset.sensitive = 'true';
  const h = document.createElement('h2');
  h.textContent = t.account;
  const p = document.createElement('p');
  p.textContent = `${t.balance}: ${nf.format(12480.5)} ${lang === 'ar' ? 'ر.س' : 'SAR'}`;
  section.append(h, p);
  app.after(section);
}

renderLoading();
fetchItems().then(renderItems, renderError);
if (params.get('panel') === 'account') renderAccount();
