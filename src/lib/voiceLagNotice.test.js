import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  decideVoiceLagNotice,
  shouldHintVoiceGpu,
  decideVoiceGpuTip,
  VOICE_GPU_TIP_TEXT,
  VOICE_GPU_HINT_TEXT,
  VOICE_WARMING_TEXT,
  VOICE_LAG_NOTICE_HIDE_MS,
  VOICE_LAG_NOTICE_SHOW_MS
} from './voiceLagNotice.js';
import { VOICE_STALE_MS_NORMAL } from './voiceAgeGate.js';
import { VoicePlayer } from './voicePlayer.js';

describe('decideVoiceLagNotice', () => {
  it('未計測なら出さない', () => {
    expect(decideVoiceLagNotice(false, { e2eAvgMs: -1 }).shown).toBe(false);
    expect(decideVoiceLagNotice(false, {}).shown).toBe(false);
  });

  it('受信→キューとキュー→声を足して4秒以上で出す', () => {
    expect(decideVoiceLagNotice(false, { e2eAvgMs: 3000, upstreamEmaMs: 900, queueNow: 2 }).shown).toBe(false);
    const r = decideVoiceLagNotice(false, { e2eAvgMs: 3000, upstreamEmaMs: 1200, queueNow: 2 });
    expect(r.shown).toBe(true);
    expect(r.lagMs).toBe(4200);
    expect(r.text).toBe(`読み上げが約4秒遅れています。追いつくまで、8秒より前のコメントは読まずに飛ばします。${VOICE_WARMING_TEXT}`);
  });

  it('一度出したら2.5秒未満に戻るまで消さない(出たり消えたりしない)', () => {
    expect(decideVoiceLagNotice(true, { e2eAvgMs: 3000, queueNow: 1 }).shown).toBe(true);
    expect(decideVoiceLagNotice(true, { e2eAvgMs: 2400, queueNow: 1 }).shown).toBe(false);
  });

  it('読み上げ待ちが空になったら、古い平均が高くても消す', () => {
    expect(decideVoiceLagNotice(true, { e2eAvgMs: 9000, queueNow: 0 }).shown).toBe(false);
  });

  it('閾値の順序と文言の「8秒」が本物の基準と一致する(§12.7)', () => {
    expect(VOICE_LAG_NOTICE_HIDE_MS).toBeLessThan(VOICE_LAG_NOTICE_SHOW_MS);
    expect(VOICE_LAG_NOTICE_SHOW_MS).toBeLessThan(VOICE_STALE_MS_NORMAL);
    expect(VOICE_STALE_MS_NORMAL).toBe(8000);
  });
});

describe('配線(会場とコメビュの両方に出す)', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const vp = readFileSync(join(HERE, 'voicePlayer.js'), 'utf8');
  const cv = readFileSync(join(HERE, '..', 'extension', 'comeview-entry.js'), 'utf8');
  const vb = readFileSync(join(HERE, '..', 'extension', 'venueBar.js'), 'utf8');
  const html = readFileSync(join(HERE, '..', '..', 'extension', 'comeview.html'), 'utf8');

  it('会場: VoicePlayer が判定して onLagNotice に渡し、venueBar が表示する', () => {
    expect((vp.match(/decideVoiceLagNotice\(/g) || []).length).toBeGreaterThanOrEqual(1);
    expect(vp).toMatch(/this\.onLagNotice\(/);
    expect(vb).toMatch(/onLagNotice:\s*\(/);
  });

  it('コメビュ: 同じ判定を使い、専用の欄に出す', () => {
    expect((cv.match(/decideVoiceLagNotice\(/g) || []).length).toBeGreaterThanOrEqual(1);
    expect(html).toMatch(/id="cvVoiceLag"/);
    expect(cv).toMatch(/getElementById\('cvVoiceLag'\)/);
  });
});

describe('VoicePlayer の通知', () => {
  it('出すときと消すときだけ onLagNotice を呼ぶ', () => {
    const calls = [];
    const vp = new VoicePlayer({ onLagNotice: (t) => calls.push(t) });
    vp.queue = [{}, {}];
    vp.diag.e2eAvgMs = 5000;
    vp._updateLagNotice();
    vp._updateLagNotice();
    vp.diag.e2eAvgMs = 1000;
    vp._updateLagNotice();
    vp._updateLagNotice();
    expect(calls.length).toBe(3); // 出す・出したまま(秒数更新)・消す。消えたあとは呼ばない。
    expect(calls[0]).toMatch(/約5秒遅れています/);
    expect(calls[2]).toBe('');
  });
});

describe('GPU の案内(2026-10-28)', () => {
  const slow = { warmSynthEmaMs: 1500, warmSynthSamples: 8, coldSynthMaxMs: 2000 };
  const fast = { warmSynthEmaMs: 80, warmSynthSamples: 8, coldSynthMaxMs: 600 };
  it('GPU を使えて声づくりが遅いときだけ添える', () => {
    expect(shouldHintVoiceGpu(slow, true)).toBe(true);
    expect(shouldHintVoiceGpu(slow, false)).toBe(false);
    expect(shouldHintVoiceGpu(slow, null)).toBe(false);
    expect(shouldHintVoiceGpu(fast, true)).toBe(false);
    expect(shouldHintVoiceGpu({}, true)).toBe(false); // まだ測れていない
  });
  it('★2026-11-01: 遅れの一言には付けず、別の行(decideVoiceGpuTip)で遅れの大きさに関係なく出す', () => {
    const r = decideVoiceLagNotice(false, { ...slow, e2eAvgMs: 5000, queueNow: 3 }, { gpuCapable: true });
    expect(r.shown).toBe(true);
    expect(r.text).not.toContain('GPU');
    expect(decideVoiceGpuTip({ ...slow, e2eAvgMs: 1000 }, true)).toBe(VOICE_GPU_TIP_TEXT);
    expect(decideVoiceGpuTip(slow, false)).toBe('');
    expect(decideVoiceGpuTip(fast, true)).toBe('');
  });
  it('案内は VOICEVOX の実際の画面の場所(設定→オプション→エンジンモード)と再起動を書く', () => {
    expect(VOICE_GPU_TIP_TEXT).toContain('「設定」→「オプション」→「エンジンモード」');
    expect(VOICE_GPU_TIP_TEXT).toContain('再起動');
    expect(VOICE_GPU_HINT_TEXT).toContain('「設定」→「オプション」→「エンジンモード」');
  });
  it('起動直後(声の準備中)は出さない・時間切れが続く混雑中は準備中でも出す', () => {
    const warming = { warmSynthSamples: 1, coldSynthMaxMs: 8000 };
    expect(decideVoiceGpuTip(warming, true)).toBe('');
    expect(decideVoiceGpuTip({ ...warming, voiceOverloaded: true }, true)).toBe(VOICE_GPU_TIP_TEXT);
  });
});

describe('起動直後の一言(2026-10-31 りんく「ユーザーが理解できるようにするべき」)', () => {
  it('2回目以降の合成がまだ少ないうちは「準備中」と書き、GPU の案内は出さない', () => {
    const r = decideVoiceLagNotice(false, { e2eAvgMs: 4000, queueNow: 3, warmSynthSamples: 1, coldSynthMaxMs: 8000 }, { gpuCapable: true });
    expect(r.text).toContain('約4秒遅れています');
    expect(r.text.endsWith(`。${VOICE_WARMING_TEXT}`)).toBe(true);
    expect(r.text).not.toContain('GPU');
  });
  it('準備が済んだら「準備中」とは書かない(GPU の案内は別の行に出る)', () => {
    const diag = { e2eAvgMs: 5000, queueNow: 3, warmSynthEmaMs: 1500, warmSynthSamples: 8 };
    const r = decideVoiceLagNotice(false, diag, { gpuCapable: true });
    expect(r.text).not.toContain(VOICE_WARMING_TEXT);
    expect(decideVoiceGpuTip(diag, true)).toBe(VOICE_GPU_TIP_TEXT);
  });
});
