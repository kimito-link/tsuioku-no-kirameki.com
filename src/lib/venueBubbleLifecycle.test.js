import { describe, it, expect } from 'vitest';
import {
  nextBubbleVoiceState,
  isBubbleExpiredByVoice,
  bubbleEvictionScore,
  selectBubblesToEvict,
  resolvePendingLifetimeMs,
  BUBBLE_VOICE_AFTERGLOW_MS,
  BUBBLE_VOICE_SPEAKING_CAP_MS,
  BUBBLE_PENDING_VOICE_FLOOR_MS
} from './venueBubbleLifecycle.js';
import { VOICE_STALE_MS_NORMAL } from './voiceAgeGate.js';

describe('nextBubbleVoiceState (状態遷移)', () => {
  it('pending → audioStart で speaking', () => {
    expect(nextBubbleVoiceState('pending', 'audioStart')).toBe('speaking');
  });

  it('speaking → audioEnd で done', () => {
    expect(nextBubbleVoiceState('speaking', 'audioEnd')).toBe('done');
  });

  it('pending → resolved(鳴らず消費) で unvoiced', () => {
    expect(nextBubbleVoiceState('pending', 'resolved')).toBe('unvoiced');
  });

  it('pending → audioEnd(start 取りこぼし)でも done(声は鳴り終わっている)', () => {
    expect(nextBubbleVoiceState('pending', 'audioEnd')).toBe('done');
  });

  it('done/unvoiced は終端=後から audioStart が来ても蘇らせない', () => {
    expect(nextBubbleVoiceState('done', 'audioStart')).toBe('done');
    expect(nextBubbleVoiceState('unvoiced', 'audioStart')).toBe('unvoiced');
  });

  it('speaking 中の resolved は維持(end 待ちを壊さない)', () => {
    expect(nextBubbleVoiceState('speaking', 'resolved')).toBe('speaking');
  });

  it('未知の現在値は pending 扱い', () => {
    expect(nextBubbleVoiceState('???', 'audioStart')).toBe('speaking');
    expect(nextBubbleVoiceState(undefined, 'resolved')).toBe('unvoiced');
  });
});

describe('isBubbleExpiredByVoice (時間切れ判定)', () => {
  it('speaking は流速寿命を過ぎても消えない(声が鳴っている間は残す)', () => {
    expect(isBubbleExpiredByVoice('speaking', 99999, 1200, 100)).toBe(false);
  });

  it('speaking でも SPEAKING_CAP を超えたら消してよい(滞留対策)', () => {
    expect(isBubbleExpiredByVoice('speaking', 99999, 1200, BUBBLE_VOICE_SPEAKING_CAP_MS)).toBe(true);
    expect(isBubbleExpiredByVoice('speaking', 99999, 1200, BUBBLE_VOICE_SPEAKING_CAP_MS - 1)).toBe(false);
  });

  it('done は流速寿命 + 余韻ぶんで消える', () => {
    const flow = 1200;
    expect(isBubbleExpiredByVoice('done', flow + BUBBLE_VOICE_AFTERGLOW_MS - 1, flow)).toBe(false);
    expect(isBubbleExpiredByVoice('done', flow + BUBBLE_VOICE_AFTERGLOW_MS, flow)).toBe(true);
  });

  it('pending / unvoiced は従来の流速寿命のまま', () => {
    expect(isBubbleExpiredByVoice('pending', 1199, 1200)).toBe(false);
    expect(isBubbleExpiredByVoice('pending', 1200, 1200)).toBe(true);
    expect(isBubbleExpiredByVoice('unvoiced', 1200, 1200)).toBe(true);
  });
});

describe('selectBubblesToEvict (上限超過時にどれを消すか)', () => {
  const now = 1_000_000;
  const mk = (voiceState, ageMs) => ({ voiceState, createdAt: now - ageMs });

  it('上限以下なら何も消さない', () => {
    expect(selectBubblesToEvict([mk('speaking', 0)], 12, now)).toEqual([]);
  });

  it('speaking は最後まで残す(unvoiced/pending を先に消す)', () => {
    const speaking = mk('speaking', 100);
    const unvoiced = mk('unvoiced', 50);
    const evict = selectBubblesToEvict([speaking, unvoiced], 1, now);
    expect(evict).toEqual([unvoiced]); // 1枠オーバー → unvoiced を消す
  });

  it('優先順位 unvoiced → pending → done → speaking', () => {
    const speaking = mk('speaking', 100);
    const done = mk('done', 100);
    const pending = mk('pending', 100);
    const unvoiced = mk('unvoiced', 100);
    // 4件中3件消す(max=1)。残るのは speaking。消す順は unvoiced, pending, done。
    const evict = selectBubblesToEvict([speaking, done, pending, unvoiced], 1, now);
    expect(evict).toEqual([unvoiced, pending, done]);
  });

  it('同じ状態なら古いものから消す', () => {
    const oldUnvoiced = mk('unvoiced', 500);
    const newUnvoiced = mk('unvoiced', 10);
    const evict = selectBubblesToEvict([newUnvoiced, oldUnvoiced], 1, now);
    expect(evict).toEqual([oldUnvoiced]); // 古いほうを先に消す
  });

  it('どうしても枠が足りなければ speaking の中で古い発言から消す', () => {
    const oldSpeaking = mk('speaking', 800);
    const newSpeaking = mk('speaking', 50);
    const evict = selectBubblesToEvict([newSpeaking, oldSpeaking], 1, now);
    expect(evict).toEqual([oldSpeaking]);
  });
});

describe('resolvePendingLifetimeMs (合成遅れの床)', () => {
  it('読み上げOFFなら流速寿命そのまま', () => {
    expect(resolvePendingLifetimeMs(1200, false)).toBe(1200);
    expect(resolvePendingLifetimeMs(5000, false)).toBe(5000);
  });

  it('読み上げONなら床を下回らない', () => {
    expect(resolvePendingLifetimeMs(1200, true)).toBe(BUBBLE_PENDING_VOICE_FLOOR_MS);
    expect(resolvePendingLifetimeMs(800, true)).toBe(BUBBLE_PENDING_VOICE_FLOOR_MS);
  });

  it('読み上げONでも流速寿命が床より長ければそのまま', () => {
    // v0.1.799: 床が鮮度ゲート(8000ms)に上がったので、床より長い値で検証する。
    expect(resolvePendingLifetimeMs(BUBBLE_PENDING_VOICE_FLOOR_MS + 2000, true)).toBe(
      BUBBLE_PENDING_VOICE_FLOOR_MS + 2000
    );
  });
});

describe('v0.1.799: pending 床と読み上げ鮮度ゲートの単一正本(再発防止)', () => {
  it('BUBBLE_PENDING_VOICE_FLOOR_MS === VOICE_STALE_MS_NORMAL(常に一致)', () => {
    // 床(吹き出しを pending で残す上限)と鮮度ゲート(音声が鳴りうる上限)が食い違うと
    //   「声が鳴る前に吹き出しが消える」ずれが再発する。物理的に同一値であることを担保。
    expect(BUBBLE_PENDING_VOICE_FLOOR_MS).toBe(VOICE_STALE_MS_NORMAL);
  });
});

describe('bubbleEvictionScore', () => {
  const now = 1000;
  it('speaking は pending/unvoiced より高スコア(後で消す)', () => {
    const speaking = bubbleEvictionScore({ voiceState: 'speaking', createdAt: now }, now);
    const pending = bubbleEvictionScore({ voiceState: 'pending', createdAt: now }, now);
    const unvoiced = bubbleEvictionScore({ voiceState: 'unvoiced', createdAt: now }, now);
    expect(speaking).toBeGreaterThan(pending);
    expect(pending).toBeGreaterThan(unvoiced);
  });
});
