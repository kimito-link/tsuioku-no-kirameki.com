import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createPhoneVoice, phoneVoiceLabel } from '../../app/live-view-voice.js';

const liveView = readFileSync(new URL('../../app/live-view.js', import.meta.url), 'utf8');
const voiceSrc = readFileSync(new URL('../../app/live-view-voice.js', import.meta.url), 'utf8');
const statusEntry = readFileSync(new URL('./status-entry.js', import.meta.url), 'utf8');

describe('配線: スマホの読み上げ(v0.1.1740)', () => {
  it('★スマホ: トークンで作り、スナップショットの PC 状態を渡し、🗣 を付ける(閲覧は止めない)', () => {
    expect(liveView).toContain('_voice = createPhoneVoice({ token });');
    expect(liveView).toContain('if (_voice) _voice.onSnapshot(jsonBlob);');
    expect(liveView).toContain('try { if (_voice) mountPhoneVoiceUi(_voice); } catch');
  });
  it('★popup の「読み上げ」は拡張の別ウィンドウより先に受け取り、「コメビュ」は隠す', () => {
    expect(voiceSrc).toMatch(/closest\('#openComeviewVoiceBtn'\)[\s\S]*stopImmediatePropagation\(\)/);
    expect(voiceSrc).toContain('#openComeviewBtn{display:none!important}');
  });
  it('★PC: 送信の返事の voiceWanted で声を作る・状態をスマホへ載せる', () => {
    expect(statusEntry).toContain('void _phoneVoice.tick({ wanted: ack.voiceWanted, liveId: sentLiveId, rows: jsonBlob.commentTimelineMirror?.rows });');
    expect(statusEntry).toContain('phoneVoice: _phoneVoice.state()');
  });
});

describe('createPhoneVoice', () => {
  const okJson = (clips) => ({ ok: true, json: async () => ({ ok: true, clips }) });
  it('ON にした最初の1回は覚えるだけ・次から after に最後の番号を付けて取る', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'on', setItem: () => {} });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(okJson([{ no: '5', ogg: 'AA==' }]))
      .mockResolvedValueOnce(okJson([]));
    const v = createPhoneVoice({ token: 'tok', fetchImpl, Ctx: null, setIntervalImpl: () => 0 });
    await new Promise((r) => setTimeout(r, 0));
    await v.poll();
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/status?v=tok&action=voice&after=');
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/status?v=tok&action=voice&after=5');
    vi.unstubAllGlobals();
  });
  it('ボタンの文字: OFF・PC の VOICEVOX 停止', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'off', setItem: () => {} });
    const v = createPhoneVoice({ token: 't', fetchImpl: vi.fn(), Ctx: null, setIntervalImpl: () => 0 });
    vi.unstubAllGlobals();
    expect(phoneVoiceLabel(v).text).toBe('🗣');
    const on = { isOn: () => true, isReady: () => true, pcState: () => 'voicevox_down' };
    expect(phoneVoiceLabel(/** @type {any} */ (on))).toMatchObject({ warn: true, text: '🗣 PCのVOICEVOXが起動していません' });
  });
});
