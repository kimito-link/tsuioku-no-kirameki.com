import { describe, it, expect } from 'vitest';
import {
  shouldRenderLoading,
  resolveVoiceLoadingView,
  VOICE_LOADING_FLICKER_GUARD_MS
} from './voiceLoadingState.js';

describe('shouldRenderLoading (遅延ガード)', () => {
  it('checking は経過がガード未満なら描かない(一瞬成功のチラつき防止)', () => {
    expect(shouldRenderLoading('checking', 0)).toBe(false);
    expect(shouldRenderLoading('checking', VOICE_LOADING_FLICKER_GUARD_MS - 1)).toBe(false);
  });

  it('checking はガード以上経過したら描く', () => {
    expect(shouldRenderLoading('checking', VOICE_LOADING_FLICKER_GUARD_MS)).toBe(true);
    expect(shouldRenderLoading('checking', 1000)).toBe(true);
  });

  it('connecting(再試行中)は経過に関わらず即描く(もう一瞬では終わらない)', () => {
    expect(shouldRenderLoading('connecting', 0)).toBe(true);
    expect(shouldRenderLoading('connecting', 5)).toBe(true);
  });

  it('ready / idle / notfound は楽しい演出を描かない', () => {
    expect(shouldRenderLoading('ready', 9999)).toBe(false);
    expect(shouldRenderLoading('idle', 9999)).toBe(false);
    expect(shouldRenderLoading('notfound', 9999)).toBe(false);
  });

  it('elapsedMs が壊れた値でも 0 扱いで安全', () => {
    expect(shouldRenderLoading('checking', NaN)).toBe(false);
    expect(shouldRenderLoading('checking', -100)).toBe(false);
  });
});

describe('resolveVoiceLoadingView (文言の出し分け)', () => {
  it('ready / idle は何も出さない(空)', () => {
    expect(resolveVoiceLoadingView('ready', 'venue')).toEqual({ kind: 'hidden', text: '' });
    expect(resolveVoiceLoadingView('idle', 'comeview')).toEqual({ kind: 'hidden', text: '' });
  });

  it('notfound は両画面共通で起動案内(error)', () => {
    const v = resolveVoiceLoadingView('notfound', 'venue');
    const c = resolveVoiceLoadingView('notfound', 'comeview');
    expect(v.kind).toBe('error');
    expect(c.kind).toBe('error');
    expect(v.text).toContain('VOICEVOX');
    expect(v.text).toBe(c.text); // 失敗時は共通文言
  });

  /*
   * ★v0.1.1326: ユーザー実機で VOICEVOX 0.25.2 が起動しているのに
   *   「VOICEVOXが見つかりません」と出た(ユーザー指摘「たちあがってるけどね」)。
   *   起動しているのに応答が無い(timeout)と、そもそも居ない(refused)は打つ手が違う。
   */
  it('★timeout は「見つかりません」と言わない(起動している前提の案内にする)', () => {
    const v = resolveVoiceLoadingView('notfound', 'venue', 'timeout');
    expect(v.kind).toBe('error');
    expect(v.text).toContain('起動していますが応答がありません');
    expect(v.text).not.toContain('見つかりません');
  });

  it('refused は従来どおり「見つかりません(起動して押し直す)」', () => {
    const v = resolveVoiceLoadingView('notfound', 'venue', 'refused');
    expect(v.text).toContain('VOICEVOXが見つかりません');
  });

  it('http-error はバージョン確認を促す', () => {
    expect(resolveVoiceLoadingView('notfound', 'venue', 'http-error').text)
      .toContain('エラーでした');
  });

  it('no-fetch は拡張側の再読み込みを促す', () => {
    expect(resolveVoiceLoadingView('notfound', 'venue', 'no-fetch').text)
      .toContain('再読み込み');
  });

  it('reason 省略時は従来文言(後方互換)', () => {
    expect(resolveVoiceLoadingView('notfound', 'venue').text)
      .toBe(resolveVoiceLoadingView('notfound', 'venue', 'refused').text);
  });

  it('venue は会場の世界観(開演前/ステージ準備)', () => {
    expect(resolveVoiceLoadingView('checking', 'venue')).toEqual({
      kind: 'loading',
      text: '🎤 まもなく開演…声の準備中'
    });
    expect(resolveVoiceLoadingView('connecting', 'venue').text).toContain('ステージ準備中');
    expect(resolveVoiceLoadingView('connecting', 'venue').text).toContain('数秒');
  });

  it('comeview は実況準備(マイクチェック)', () => {
    expect(resolveVoiceLoadingView('checking', 'comeview')).toEqual({
      kind: 'loading',
      text: '🎤 マイクチェック中…'
    });
    expect(resolveVoiceLoadingView('connecting', 'comeview').text).toContain('接続中');
    expect(resolveVoiceLoadingView('connecting', 'comeview').text).toContain('数秒');
  });

  it('connecting は両画面とも loading 種別', () => {
    expect(resolveVoiceLoadingView('connecting', 'venue').kind).toBe('loading');
    expect(resolveVoiceLoadingView('connecting', 'comeview').kind).toBe('loading');
  });
});
