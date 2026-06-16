import { describe, it, expect } from 'vitest';
import {
  isVoiceItemStale,
  VOICE_STALE_MS_NORMAL,
  VOICE_STALE_MS_BACKLOG,
  VOICE_STALE_BACKLOG_QUEUE,
  VOICE_STALE_MS_HIGH_PRIORITY
} from './voiceAgeGate.js';

describe('isVoiceItemStale (v0.1.782 わんコメ式=件数ゲート主軸・時間ゲートは安全網)', () => {
  it('不正値は安全側（stale=false）として扱う', () => {
    expect(isVoiceItemStale(null, 100, 1).stale).toBe(false);
    expect(isVoiceItemStale(100, undefined, 1).stale).toBe(false);
    expect(isVoiceItemStale(100, 200, null).stale).toBe(false);
    expect(isVoiceItemStale(200, 100, 1).stale).toBe(false);
    expect(isVoiceItemStale(-1, 100, 1).stale).toBe(false);
  });

  it('v0.1.782: 通常しきい値は安全網=8秒(再生待ちの item を落とさない高さ)', () => {
    expect(VOICE_STALE_MS_NORMAL).toBe(8000);
    // 丁度はセーフ、超えたらドロップ。
    expect(isVoiceItemStale(1000, 1000 + VOICE_STALE_MS_NORMAL, 1).stale).toBe(false);
    expect(isVoiceItemStale(1000, 1000 + VOICE_STALE_MS_NORMAL + 1, 1).stale).toBe(true);
  });

  it('v0.1.782: backlog 短縮は撤廃=キュー長に関わらず同じ安全網しきい値(ゼロ音声回帰の根治)', () => {
    // 件数ゲート(最古drop)がリアルタイム維持を担うので、時間ゲートはキュー長で短縮しない。
    // 旧 v0.1.781 の罠(queue>=3 で 1.2秒に短縮→再生待ち中に全 stale 化)を構造的に排除。
    expect(VOICE_STALE_MS_BACKLOG).toBe(VOICE_STALE_MS_NORMAL);
    expect(VOICE_STALE_BACKLOG_QUEUE).toBe(Number.POSITIVE_INFINITY);
    // キューが何件溜まっていても、安全網(8秒)未満なら落とさない=再生順を待つだけの item は通す。
    for (const q of [1, 2, 3, 5, 8, 20]) {
      expect(isVoiceItemStale(1000, 1000 + 3000, q).stale).toBe(false); // 3秒待ち=まだ通す
      expect(isVoiceItemStale(1000, 1000 + VOICE_STALE_MS_NORMAL + 1, q).stale).toBe(true); // 8秒超=落とす
    }
  });

  it('再生1本ぶん(1〜3秒)の待ちでは絶対に stale にしない(時間ゲートの罠の回帰防止)', () => {
    // 1件の合成+再生は普通に1〜3秒。これより低いしきい値だと再生待ち中に stale 化しゼロ音声に戻る。
    for (const waitedMs of [1000, 2000, 3000, 5000]) {
      expect(isVoiceItemStale(1000, 1000 + waitedMs, 8).stale).toBe(false);
    }
  });

  it('高優先(ギフト等)はキュー長に関わらず長め(10秒)で確実に読む', () => {
    expect(VOICE_STALE_MS_HIGH_PRIORITY).toBe(10000);
    expect(isVoiceItemStale(1000, 1000 + VOICE_STALE_MS_HIGH_PRIORITY, 10, true).stale).toBe(false);
    expect(isVoiceItemStale(1000, 1000 + VOICE_STALE_MS_HIGH_PRIORITY + 1, 10, true).stale).toBe(true);
  });

  it('reason に実 age としきい値が出る(診断)', () => {
    const r = isVoiceItemStale(1000, 1000 + VOICE_STALE_MS_NORMAL + 1, 5);
    expect(r.reason).toMatch(new RegExp(`> ${VOICE_STALE_MS_NORMAL}ms`));
  });
});
