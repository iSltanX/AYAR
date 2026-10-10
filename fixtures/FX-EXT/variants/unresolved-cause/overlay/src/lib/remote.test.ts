import { expect, it } from 'vitest';
import { remoteConfigUrl } from './remote';

it('يحمّل عنوان إعدادات الخدمة', () => {
  expect(remoteConfigUrl()).toBeDefined();
});
