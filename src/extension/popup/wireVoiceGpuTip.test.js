// 2026-11-03: ポップアップの GPU の案内は、遅い PC と記録されているときだけ出る。
import { describe, it, expect } from 'vitest';
import { wireVoiceGpuTip } from './wireVoiceGpuTip.js';
import { KEY_VOICE_WEAK_PC } from '../../lib/voiceKeys.js';
import { VOICE_GPU_TIP_TEXT } from '../../lib/voiceLagNotice.js';

function fakeRoot() {
  const el = { dataset: {}, hidden: false, textContent: '' };
  return { el, root: { getElementById: (id) => (id === 'voiceGpuTip' ? el : null) } };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('wireVoiceGpuTip', () => {
  it('遅い PC と記録されていれば会場と同じ文言で出す', async () => {
    const { el, root } = fakeRoot();
    wireVoiceGpuTip(root, { get: async () => ({ [KEY_VOICE_WEAK_PC]: true }) });
    await tick();
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe(VOICE_GPU_TIP_TEXT);
  });
  it('記録が無ければ出さず、記録されたらすぐ出す', async () => {
    const { el, root } = fakeRoot();
    let listener = null;
    wireVoiceGpuTip(root, { get: async () => ({}), onChanged: (fn) => { listener = fn; } });
    await tick();
    expect(el.hidden).toBe(true);
    listener({ [KEY_VOICE_WEAK_PC]: { newValue: true } });
    expect(el.hidden).toBe(false);
  });
});
