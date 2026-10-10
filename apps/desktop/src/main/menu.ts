// The basic macOS menus (C-01), translated (C-24). No View menu: no reload and no developer tools for users.
import type { MenuItemConstructorOptions } from 'electron';
import { createTranslator, type Lang } from '@ayar/i18n';

export function menuTemplate(lang: Lang): MenuItemConstructorOptions[] {
  const t = createTranslator(lang);
  return [
    {
      label: t('common.appName'),
      submenu: [
        { role: 'about', label: t('menu.app.about') },
        { type: 'separator' },
        { role: 'hide', label: t('menu.app.hide') },
        { role: 'hideOthers', label: t('menu.app.hideOthers') },
        { role: 'unhide', label: t('menu.app.showAll') },
        { type: 'separator' },
        { role: 'quit', label: t('menu.app.quit') },
      ],
    },
    {
      label: t('menu.edit.title'),
      submenu: [
        { role: 'undo', label: t('menu.edit.undo') },
        { role: 'redo', label: t('menu.edit.redo') },
        { type: 'separator' },
        { role: 'cut', label: t('menu.edit.cut') },
        { role: 'copy', label: t('menu.edit.copy') },
        { role: 'paste', label: t('menu.edit.paste') },
        { role: 'selectAll', label: t('menu.edit.selectAll') },
      ],
    },
    {
      label: t('menu.window.title'),
      role: 'windowMenu',
      submenu: [
        { role: 'minimize', label: t('menu.window.minimize') },
        { role: 'zoom', label: t('menu.window.zoom') },
        { role: 'close', label: t('menu.window.close') },
        { type: 'separator' },
        { role: 'front', label: t('menu.window.front') },
      ],
    },
  ];
}
