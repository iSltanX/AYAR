// Previews that a confirmation token binds to (6.5: "يصدر بعد عرض معاينة الإجراء للمستخدم").
import { JsonValue } from '../common.ts';
import { ConfirmationToken } from '../tokens.ts';
import { z } from '../zod.ts';

/** What the engine returns for a preview: the target it previews and a digest of exactly what was shown. */
export const ConfirmablePreview = z.strictObject({
  target: z.string().min(1),
  digest: z.string().min(1),
  preview: JsonValue,
});

/** What the renderer receives: the same preview plus the token the main process minted for it. */
export const ConfirmablePreviewWithToken = ConfirmablePreview.extend({ confirmationToken: ConfirmationToken });
