import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createPhoneVoice, phoneVoiceLabel } from '../../app/live-view-voice.js';

const liveView = readFileSync(new URL('../../app/live-view.js', import.meta.url), 'utf8');
const voiceSrc = readFileSync(new URL('../../app/live-view-voice.js', import.meta.url), 'utf8');
const statusEntry = readFileSync(new URL('./status-entry.js', import.meta.url), 'utf8');

describe('配線: スマホの読み上げ(v0.1.1740)', () => {
  it('★スマホ: トークンで作り、スナップショットの PC 状態を渡し、🗣 を付ける(閲覧は止めない)', () => {
    expect(liveView).toContain('_voice = createPhoneVoice({ token, ');
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
    expect(statusEntry).toContain('phoneVoiceStats: _phoneVoice.stats()');
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

describe('配線: 会場の吹き出しを読み上げの声に合わせる(v0.1.1742)', () => {
  const venue = readFileSync(new URL('../../app/live-view-venue.js', import.meta.url), 'utf8');
  it('★読み上げが鳴っている(PC も声を作れている)間だけ、吹き出しを声の再生開始まで待たせる', () => {
    expect(liveView).toContain("_venue.setVoiceActive(() => Boolean(_voice && _voice.isOn() && _voice.isReady() && _voice.pcState() === 'ok'));");
    expect(liveView).toContain('_voice.onPlay((no, ms) => _venue.onVoicePlay(no, ms));');
    expect(venueSrcHas(venue, '} else if (ev.no && voiceActive()) {')).toBe(true);
  });
  it('★声が来なくても保険で吹き出しを出す(永久に出ない事故を作らない・PC 会場 v0.1.757 と同じ考え)', () => {
    expect(venue).toMatch(/setTimeout\(\(\) => \{\s*waitingVoice\.delete\(ev\.no\);\s*bubble\(ev\.personKey, ev\.text\);\s*\}, VOICE_WAIT_MAX_MS\)/);
  });
  it('★v0.1.1743: 声が終わるまで吹き出しを出しておく(声の長さを再生開始で渡す)', () => {
    expect(voiceSrc).toContain('f(clip.no, Math.round((buf.duration || 0) * 1000))');
    expect(venue).toContain('bubble(w.personKey, w.text, Math.max(BUBBLE_MS, (Number(durationMs) || 0) + VOICE_TAIL_MS))');
  });
  it('★v0.1.1745: 最新コメント欄は、声が鳴っている間そのコメントを出す', () => {
    expect(liveView).toContain('const spoken = pickSpokenTickerRow(rows, _spokenNo);');
    expect(liveView).toContain('const latest = spoken || picked.entry || rows[rows.length - 1];');
    expect(liveView).toMatch(/_voice\.onPlay\(\(no, ms\) => \{\s*_spokenNo = String\(no \|\| ''\);/);
  });
  it('★v0.1.1751: 声が鏡より先に届いたら、鏡を取り直し・吹き出しは鏡に来た瞬間に出す(15秒待たせない)', () => {
    expect(liveView).toContain('if (!pickSpokenTickerRow(restoreCommentTimelineRows(_lastTimelineSnap), _spokenNo)) refresh(token).catch(() => {});');
    expect(venue).toContain('playedEarly.set(String(no), Date.now() + Math.max(0, Number(durationMs) || 0));');
    expect(venue).toContain('} else if (ev.no && playedEarly.has(ev.no)) {');
  });
  it('★「読み上げ」ボタンの説明文もスマホの読み上げに合わせる', () => {
    expect(voiceSrc).toContain("popupBtn.setAttribute('aria-label', l.aria);");
  });
});

/** @param {string} src @param {string} needle */
function venueSrcHas(src, needle) {
  return src.includes(needle);
}
