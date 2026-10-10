// Compile-time contracts of the registry: the renderer command set and the renderer result of a preview.
// (A wrong type fails the typecheck of this file; the runtime assertions mirror it.)
import { describe, expect, expectTypeOf, it } from 'vitest';
import { RENDERER_COMMAND_NAMES, type RendererCommandName, type RendererResult } from '../src/index.ts';

describe('registry types', () => {
  it('RendererCommandName contains renderer commands and excludes host-only ones', () => {
    expectTypeOf<'settings.get'>().toExtend<RendererCommandName>();
    expectTypeOf<'dialog.pickFolder'>().toExtend<RendererCommandName>();
    expectTypeOf<'internal.clipboardText'>().not.toExtend<RendererCommandName>();
    expect(RENDERER_COMMAND_NAMES).toContain('settings.get');
  });

  it('a preview reaches the renderer with its confirmation token', () => {
    expectTypeOf<RendererResult<'setup.preview'>>().toHaveProperty('confirmationToken');
    expectTypeOf<RendererResult<'settings.set'>>().toHaveProperty('key');
  });
});
