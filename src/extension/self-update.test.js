// self-update.test.js — キット(web-ios-android templates/extension-self-update)の試験をそのまま走らせる。
//   試験本体 self-update.kit-test.mjs はキットの写し(import 先も同じ ./self-update.js なので無改変)。
import { it } from 'vitest';

it('キットの self-update 試験(版の比較・待つ・ストア版・読めない時)が通る', async () => {
  await import('./self-update.kit-test.mjs');
});
