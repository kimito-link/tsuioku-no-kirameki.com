import { describe, it, expect } from 'vitest';
import {
  resolveCommentPostStatus,
  commentComposeAriaDescribedBy
} from './commentPostStatusPresentation.js';

describe('resolveCommentPostStatus', () => {
  it('notice が無ければ base をそのまま返す', () => {
    const r = resolveCommentPostStatus(
      { statusMessage: 'ベース', statusKind: 'idle', mode: 'ready' },
      null
    );
    expect(r).toEqual({ message: 'ベース', kind: 'idle' });
  });

  it('notice があり base が override 対象外なら notice が勝つ', () => {
    const r = resolveCommentPostStatus(
      { statusMessage: 'ベース', statusKind: 'idle', mode: 'ready' },
      { message: '送信しました', kind: 'success' }
    );
    expect(r).toEqual({ message: '送信しました', kind: 'success' });
  });

  it('mode=no_watch では notice より base が優先', () => {
    const r = resolveCommentPostStatus(
      { statusMessage: 'watchを開いて', statusKind: 'idle', mode: 'no_watch' },
      { message: '送信しました', kind: 'success' }
    );
    expect(r).toEqual({ message: 'watchを開いて', kind: 'idle' });
  });

  it('mode=no_live_id でも base が優先', () => {
    const r = resolveCommentPostStatus(
      { statusMessage: '未取得', statusKind: 'idle', mode: 'no_live_id' },
      { message: 'x', kind: 'error' }
    );
    expect(r.message).toBe('未取得');
  });

  it('mode=submitting でも base が優先', () => {
    const r = resolveCommentPostStatus(
      { statusMessage: '送信中…', statusKind: 'idle', mode: 'submitting' },
      { message: '失敗', kind: 'error' }
    );
    expect(r.message).toBe('送信中…');
  });

  it('notice.message が空なら base のまま', () => {
    const r = resolveCommentPostStatus(
      { statusMessage: 'ベース', statusKind: 'idle', mode: 'ready' },
      { message: '', kind: 'error' }
    );
    expect(r.message).toBe('ベース');
  });

  it('notice.kind 欠落時は idle にフォールバック', () => {
    const r = resolveCommentPostStatus(
      { statusMessage: 'b', statusKind: 'idle', mode: 'empty' },
      { message: 'n' }
    );
    expect(r).toEqual({ message: 'n', kind: 'idle' });
  });

  it('baseState 欠落でも例外を投げない', () => {
    const r = resolveCommentPostStatus(null, null);
    expect(r).toEqual({ message: '', kind: 'idle' });
  });
});

describe('commentComposeAriaDescribedBy', () => {
  it('input・警告なし', () => {
    expect(commentComposeAriaDescribedBy('input', false)).toBe(
      'postStatus exportToolbarHint'
    );
  });
  it('input・警告あり', () => {
    expect(commentComposeAriaDescribedBy('input', true)).toBe(
      'commentKindnessBody commentKindnessConfirm postStatus exportToolbarHint'
    );
  });
  it('button・警告なし', () => {
    expect(commentComposeAriaDescribedBy('button', false)).toBe('postStatus');
  });
  it('button・警告あり', () => {
    expect(commentComposeAriaDescribedBy('button', true)).toBe(
      'commentKindnessBody commentKindnessConfirm postStatus'
    );
  });
});
