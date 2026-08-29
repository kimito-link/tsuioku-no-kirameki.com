import { describe, expect, it } from 'vitest';
import { venueHoverCardPresenceVerdict } from './venueHoverCardProbe.js';

describe('ホバーカードの一言が出ているかの判定', () => {
  it('文字があって隠れていなければ「出ている」', () => {
    const v = venueHoverCardPresenceVerdict({
      cardExists: true,
      elementExists: true,
      text: 'いまは聞いている・ここまで62回',
      buildId: '0829-213705'
    });
    expect(v.visible).toBe(true);
    expect(v.reason).toBe('ok');
    // ★実際の文字を出す(「出ています」だけでは確かめようがない)。
    expect(v.line).toContain('いまは聞いている・ここまで62回');
    expect(v.line).toContain('0829-213705');
  });
});

describe('★出ない理由を4つに切り分ける', () => {
  it('カードが無い＝ホバーしていない（異常ではない）', () => {
    const v = venueHoverCardPresenceVerdict({ cardExists: false });
    expect(v.reason).toBe('no-card');
    expect(v.visible).toBe(false);
    // ★異常扱いしない（🔴を出さない）。
    expect(v.line).not.toContain('🔴');
  });

  it('★要素が無い＝古いコードかDOM配線漏れ。両方を名指しする', () => {
    const v = venueHoverCardPresenceVerdict({ cardExists: true, elementExists: false });
    expect(v.reason).toBe('element-missing');
    expect(v.line).toContain('リロード');
    expect(v.line).toContain('配線');
  });

  it('要素はあるが空＝何もしていない人（異常ではない）', () => {
    const v = venueHoverCardPresenceVerdict({
      cardExists: true,
      elementExists: true,
      text: ''
    });
    expect(v.reason).toBe('empty-text');
    expect(v.line).not.toContain('🔴');
  });

  it('★文字はあるのに hidden＝CSS/表示条件の問題として名指しする', () => {
    const v = venueHoverCardPresenceVerdict({
      cardExists: true,
      elementExists: true,
      text: 'ここまで5回',
      hidden: true
    });
    expect(v.reason).toBe('hidden');
    expect(v.line).toContain('hidden 属性');
    // ★入っている文字を必ず出す（何が入っているか分からないと直せない）。
    expect(v.line).toContain('ここまで5回');
  });

  it('display:none も同じく名指しする', () => {
    const v = venueHoverCardPresenceVerdict({
      cardExists: true,
      elementExists: true,
      text: 'x',
      displayNone: true
    });
    expect(v.reason).toBe('hidden');
    expect(v.line).toContain('display:none');
  });
});

describe('★ビルドIDを必ず添える（新旧の取り違えを防ぐ）', () => {
  it('ビルドIDがあれば出す', () => {
    const v = venueHoverCardPresenceVerdict({
      cardExists: true,
      elementExists: false,
      buildId: '0829-213705'
    });
    expect(v.line).toContain('0829-213705');
  });

  it('★ビルドIDが無いときは「不明」と言う（黙って省略しない）', () => {
    const v = venueHoverCardPresenceVerdict({ cardExists: true, elementExists: false });
    expect(v.line).toContain('ビルドID不明');
  });
});

describe('★壊れた入力で落ちない', () => {
  it('null/undefined/文字列でも throw しない', () => {
    expect(() => venueHoverCardPresenceVerdict(null)).not.toThrow();
    expect(() => venueHoverCardPresenceVerdict(undefined)).not.toThrow();
    expect(() => venueHoverCardPresenceVerdict('x')).not.toThrow();
  });

  it('★何も分からないときを「出ている」と言わない（fail-closed）', () => {
    expect(venueHoverCardPresenceVerdict(null).visible).toBe(false);
    expect(venueHoverCardPresenceVerdict({}).visible).toBe(false);
  });

  it('空白だけの文字は「空」として扱う', () => {
    const v = venueHoverCardPresenceVerdict({
      cardExists: true,
      elementExists: true,
      text: '   '
    });
    expect(v.reason).toBe('empty-text');
  });
});
