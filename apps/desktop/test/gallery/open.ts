// `npm run gallery -w @ayar/desktop`: builds the app and the gallery, then opens the gallery in the
// development build and keeps it open until the window is closed (DEV-10, task 5).
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchGallery } from '../e2e/gallery-support.ts';

const root = realpathSync(mkdtempSync(join(tmpdir(), 'ayar-gallery-')));
const { app } = await launchGallery(join(root, 'AYAR'));
console.log('gallery open; close the window to quit');
app.on('close', () => rmSync(root, { recursive: true, force: true }));
await new Promise<void>((resolve) => app.on('close', () => resolve()));
