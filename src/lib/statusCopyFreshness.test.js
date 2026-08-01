import { describe, expect, it } from 'vitest';
import {
  STATUS_COPY_STALE_SEC,
  buildStatusCopyButtonLabel,
  buildStatusCopyStaleBanner
} from './statusCopyFreshness.js';

describe('buildStatusCopyStaleBanner', () => {
  it('新鮮なら何も足さない(通常時のコピー本文を変えない)', () => {
    expect(buildStatusCopyStaleBanner(0)).toBe('');
    expect(buildStatusCopyStaleBanner(STATUS_COPY_STALE_SEC - 1)).toBe('');
  });

  it('古いときは秒数を明記する', () => {
    const out = buildStatusCopyStaleBanner(57);
    expect(out).toContain('57秒前の値');
    expect(out).toContain('今どうなっているか');
  });

  it('★90秒超なら「会場休止中」の誤読を名指しで打ち消す', () => {
    // 2026-08-01 に実際に踏んだ誤読。会場は動いていたのに「休止中」と読める。
    const out = buildStatusCopyStaleBanner(197);
    expect(out).toContain('会場休止中');
    expect(out).toContain('会場が止まったのではなく');
  });

  it('90秒未満なら会場休止中の説明は出さない(無関係な警告で埋めない)', () => {
    const out = buildStatusCopyStaleBanner(30);
    expect(out).not.toContain('会場休止中');
  });

  it('累計値の誤読は古いとき常に警告する', () => {
    expect(buildStatusCopyStaleBanner(30)).toContain('累計');
  });

  it('末尾が空行=本文と混ざらない', () => {
    expect(buildStatusCopyStaleBanner(57).endsWith('\n\n')).toBe(true);
  });
});

describe('buildStatusCopyButtonLabel', () => {
  it('新鮮なコピー成功は従来どおりの文言', () => {
    const r = buildStatusCopyButtonLabel('clipboard', 3);
    expect(r.stale).toBe(false);
    expect(r.label).toContain('コピーしました');
  });

  it('★古いときは「コピーしました ✓」で終わらせず秒数を見せる', () => {
    const r = buildStatusCopyButtonLabel('clipboard', 57);
    expect(r.stale).toBe(true);
    expect(r.label).toContain('57秒前');
    // 「✓ そのまま貼ってください」だけだと古さが伝わらない=それを出さないこと
    expect(r.label).not.toContain('そのまま貼ってください');
  });

  it('execCommand 経路でも同じ扱い', () => {
    expect(buildStatusCopyButtonLabel('execCommand', 120).stale).toBe(true);
  });

  it('選択フォールバックでも古さを見せる', () => {
    expect(buildStatusCopyButtonLabel('selected', 99).label).toContain('99秒前');
  });

  it('失敗はそのまま失敗と言う(古さで上書きしない)', () => {
    expect(buildStatusCopyButtonLabel('failed', 300).label).toBe('コピーできませんでした');
  });
});
