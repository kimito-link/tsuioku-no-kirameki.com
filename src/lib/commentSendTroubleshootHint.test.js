import { describe, it, expect } from 'vitest';
import {
  withCommentSendTroubleshootHint,
  EXTENSION_RELOAD_USER_GUIDE_JA
} from './commentSendTroubleshootHint.js';

describe('withCommentSendTroubleshootHint', () => {
  it('空メッセージ → 空文字（ヒントだけ単独で出さない）', () => {
    expect(withCommentSendTroubleshootHint('')).toBe('');
    expect(withCommentSendTroubleshootHint(null)).toBe('');
    expect(withCommentSendTroubleshootHint(undefined)).toBe('');
    expect(withCommentSendTroubleshootHint('  ')).toBe('');
  });

  it('普通のエラー → 両方の案内が末尾に付く', () => {
    const r = withCommentSendTroubleshootHint('送信に失敗しました');
    expect(r).toContain('送信に失敗しました');
    expect(r).toContain('※うまくいかないとき');
    expect(r).toContain('watchページを再読み込み');
    expect(r).toContain(EXTENSION_RELOAD_USER_GUIDE_JA);
  });

  it('"再読み込み" を含むメッセージ → 再読み込み案内は重複追加しない', () => {
    const r = withCommentSendTroubleshootHint('watchページを再読み込みしてください');
    // 案内には拡張更新だけが追加される（二重案内を避ける）
    expect(r).toContain('watchページを再読み込みしてください');
    expect(r).toContain(EXTENSION_RELOAD_USER_GUIDE_JA);
    // F5 案内は追加されない
    expect(r.match(/F5/g)?.length || 0).toBe(0);
  });

  it('"F5" を含むメッセージ → F5 案内は重複追加しない', () => {
    const r = withCommentSendTroubleshootHint('F5 で更新してください');
    expect(r.match(/F5/g)?.length).toBe(1);
  });

  it('chrome://extensions を含むメッセージ → 拡張更新案内は重複追加しない', () => {
    const r = withCommentSendTroubleshootHint(
      'chrome://extensions で更新してください'
    );
    expect(r.match(/chrome:\/\/extensions/g)?.length).toBe(1);
  });

  it('両方含む → 何も追加しない', () => {
    const r = withCommentSendTroubleshootHint(
      'F5 で再読み込みするか、chrome://extensions の「更新」を押してください'
    );
    expect(r).toBe('F5 で再読み込みするか、chrome://extensions の「更新」を押してください');
    expect(r).not.toContain('※うまくいかないとき');
  });
});

describe('EXTENSION_RELOAD_USER_GUIDE_JA', () => {
  it('chrome://extensions と「更新」の両方を含む（regex の片方だけで案内が止まらないように）', () => {
    expect(EXTENSION_RELOAD_USER_GUIDE_JA).toContain('chrome://extensions');
    expect(EXTENSION_RELOAD_USER_GUIDE_JA).toContain('「更新」');
  });
});
