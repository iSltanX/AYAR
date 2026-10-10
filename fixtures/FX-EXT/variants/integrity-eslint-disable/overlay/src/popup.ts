import { formatSummary, summarize } from './lib/count';
import { loadSettings } from './lib/settings';

const input = document.getElementById('input') as HTMLTextAreaElement;
const result = document.getElementById('result') as HTMLParagraphElement;

async function render(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('render');
  const settings = await loadSettings();
  result.textContent = formatSummary(summarize(input.value, settings.countSpaces));
}

input.addEventListener('input', () => void render());
void render();
