import { describe, expect, it } from 'vitest';
import {
  decideOrphanReload,
  isTypingInPage,
  startOrphanTabAutoReload,
  ORPHAN_RELOAD_MIN_GAP_MS
} from './orphanTabAutoReload.js';

describe('decideOrphanReload', () => {
  const base = { alive: false, deadStreak: 0, typing: false, lastReloadAt: 0, now: 1_000_000 };
  it('生きていれば何もしない・連続回数を戻す', () => {
    expect(decideOrphanReload({ ...base, alive: true, deadStreak: 5 })).toEqual({ action: 'alive', deadStreak: 0 });
  });
  it('1回切れただけでは待つ(background の再読込が先に来るかもしれない)', () => {
    expect(decideOrphanReload(base).action).toBe('wait');
  });
  it('2回続けて切れていたら読み込み直す', () => {
    expect(decideOrphanReload({ ...base, deadStreak: 1 }).action).toBe('reload');
  });
  it('打ちかけの入力があれば待つ', () => {
    expect(decideOrphanReload({ ...base, deadStreak: 3, typing: true }).action).toBe('typing');
  });
  it('直近60秒以内に自分で読み込み直していたら待つ・過ぎたら読み込み直す', () => {
    const now = base.now;
    expect(decideOrphanReload({ ...base, deadStreak: 1, lastReloadAt: now - 10_000 }).action).toBe('loop-guard');
    expect(decideOrphanReload({ ...base, deadStreak: 1, lastReloadAt: now - ORPHAN_RELOAD_MIN_GAP_MS }).action).toBe('reload');
  });
});

describe('isTypingInPage', () => {
  it('中身のある入力欄だけを打ちかけとみなす', () => {
    const body = {};
    expect(isTypingInPage(/** @type {any} */ ({ body, activeElement: body }))).toBe(false);
    expect(isTypingInPage(/** @type {any} */ ({ body, activeElement: { tagName: 'TEXTAREA', value: '' } }))).toBe(false);
    expect(isTypingInPage(/** @type {any} */ ({ body, activeElement: { tagName: 'INPUT', value: 'こんにちは' } }))).toBe(true);
    expect(isTypingInPage(/** @type {any} */ ({ body, activeElement: { isContentEditable: true, textContent: 'あ' } }))).toBe(true);
  });
});

describe('startOrphanTabAutoReload', () => {
  /** @param {{ alive: () => boolean, typing?: () => boolean, last?: number }} o */
  function harness(o) {
    /** @type {(() => void) | null} */
    let tick = null;
    let t = 1_000_000;
    let reloads = 0;
    let written = 0;
    let cleared = false;
    startOrphanTabAutoReload({
      hasContext: o.alive,
      isTyping: o.typing || (() => false),
      reload: () => { reloads += 1; },
      readLastReloadAt: () => o.last || 0,
      writeLastReloadAt: (at) => { written = at; },
      now: () => t,
      setIntervalFn: (fn) => { tick = fn; return 1; },
      clearIntervalFn: () => { cleared = true; }
    });
    return {
      step: () => { t += 5000; tick?.(); },
      get reloads() { return reloads; },
      get written() { return written; },
      get cleared() { return cleared; }
    };
  }
  it('★拡張が切れたまま2回続いたら1回だけ読み込み直す(F5 不要)', () => {
    const h = harness({ alive: () => false });
    h.step();
    expect(h.reloads).toBe(0);
    h.step();
    expect(h.reloads).toBe(1);
    expect(h.written).toBeGreaterThan(0);
    expect(h.cleared).toBe(true);
    h.step();
    expect(h.reloads).toBe(1);
  });
  it('生きている間は読み込み直さない', () => {
    const h = harness({ alive: () => true });
    for (let i = 0; i < 10; i += 1) h.step();
    expect(h.reloads).toBe(0);
  });
  it('一瞬切れて戻った(1回だけ)なら読み込み直さない', () => {
    let n = 0;
    const h = harness({ alive: () => { n += 1; return n !== 2; } });
    for (let i = 0; i < 5; i += 1) h.step();
    expect(h.reloads).toBe(0);
  });
  it('打ちかけの間は待ち、打ち終えたら読み込み直す', () => {
    let typing = true;
    const h = harness({ alive: () => false, typing: () => typing });
    h.step(); h.step(); h.step();
    expect(h.reloads).toBe(0);
    typing = false;
    h.step();
    expect(h.reloads).toBe(1);
  });
  it('hasContext が投げたら切れているとみなす', () => {
    const h = harness({ alive: () => { throw new Error('Extension context invalidated.'); } });
    h.step(); h.step();
    expect(h.reloads).toBe(1);
  });
});
