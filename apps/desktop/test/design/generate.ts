// Regenerates src/renderer/design/tokens.css and icons.generated.ts from the Figma dump (DEV-10, tasks 1 and 3).
// Run: /opt/homebrew/bin/node apps/desktop/test/design/generate.ts
import { writeFileSync } from 'node:fs';
import { ICONS_TS, TOKENS_CSS, iconsModule, readDesignSource, tokensCss } from './design-source.ts';

writeFileSync(TOKENS_CSS, tokensCss(readDesignSource()));
writeFileSync(ICONS_TS, iconsModule());
console.log(`wrote ${TOKENS_CSS} and ${ICONS_TS}`);
