import { loadSettings, saveSettings } from './lib/settings';

const checkbox = document.getElementById('count-spaces') as HTMLInputElement;
const saved = document.getElementById('saved') as HTMLParagraphElement;

void loadSettings().then((s) => {
  checkbox.checked = s.countSpaces;
});

checkbox.addEventListener('change', () => {
  void saveSettings({ countSpaces: checkbox.checked }).then(() => {
    saved.textContent = 'تم الحفظ';
  });
});
