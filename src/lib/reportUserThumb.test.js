/**
 * reportUserThumb のテスト。
 *
 * 0.1.12 (F): HTML レポート / マーケ分析の各ユーザー行に「最低サムネ」を必ず
 *   出すための解決ルール。優先順位を unit test で固定し、回帰を防ぐ。
 *
 *   1. 渡された avatarUrl が http/https → そのまま採用
 *   2. userId が数値（5〜14 桁）→ ニコ既定 user icon CDN URL（バケット計算）
 *   3. userId が匿名（a:.../長い英数字）→ identiconResolver があれば SVG data URL
 *   4. 上記いずれも該当しない → 空文字（呼び出し側で「無し」プレースホルダ）
 */

import { describe, it, expect, vi } from 'vitest';
import {
  resolveReportUserThumbSrc,
  buildNiconicoDefaultUserIconUrl
} from './reportUserThumb.js';

describe('buildNiconicoDefaultUserIconUrl', () => {
  it('uid=4046119 → bucket=404', () => {
    expect(buildNiconicoDefaultUserIconUrl('4046119')).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/404/4046119.jpg'
    );
  });

  it('uid=425541 → bucket=42', () => {
    expect(buildNiconicoDefaultUserIconUrl('425541')).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/42/425541.jpg'
    );
  });

  it('uid=12345 → bucket=1（5 桁の境界値）', () => {
    expect(buildNiconicoDefaultUserIconUrl('12345')).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/1/12345.jpg'
    );
  });

  it('uid=99999 → bucket=9（同 9999 区切り）', () => {
    expect(buildNiconicoDefaultUserIconUrl('99999')).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/9/99999.jpg'
    );
  });

  it('数値以外 / 空 / null は空文字（呼び出し側ガード前提だが防御）', () => {
    expect(buildNiconicoDefaultUserIconUrl('a:abcdefg')).toBe('');
    expect(buildNiconicoDefaultUserIconUrl('')).toBe('');
    expect(buildNiconicoDefaultUserIconUrl(null)).toBe('');
    expect(buildNiconicoDefaultUserIconUrl(undefined)).toBe('');
  });

  it('短すぎる数値（4 桁以下）は空文字', () => {
    expect(buildNiconicoDefaultUserIconUrl('1')).toBe('');
    expect(buildNiconicoDefaultUserIconUrl('999')).toBe('');
    expect(buildNiconicoDefaultUserIconUrl('9999')).toBe('');
  });
});

describe('resolveReportUserThumbSrc', () => {
  it('avatarUrl が http(s) ならそれを返す（最優先）', () => {
    expect(
      resolveReportUserThumbSrc({
        userId: '4046119',
        avatarUrl: 'https://example.test/custom.jpg'
      })
    ).toBe('https://example.test/custom.jpg');
  });

  it('avatarUrl が javascript: なら無視して fallback', () => {
    expect(
      resolveReportUserThumbSrc({
        userId: '4046119',
        avatarUrl: 'javascript:alert(1)'
      })
    ).toBe('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/404/4046119.jpg');
  });

  it('avatarUrl が data: なら無視して fallback（XSS 対策で http(s) のみ採用）', () => {
    expect(
      resolveReportUserThumbSrc({
        userId: '4046119',
        avatarUrl: 'data:image/svg+xml,<svg/onload=alert(1)>'
      })
    ).toBe('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/404/4046119.jpg');
  });

  it('avatarUrl 無し / 数値 ID → ニコ既定 CDN URL', () => {
    expect(
      resolveReportUserThumbSrc({
        userId: '4046119',
        avatarUrl: ''
      })
    ).toBe('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/404/4046119.jpg');
  });

  it('avatarUrl 無し / 匿名 a: + identiconResolver → resolver の戻りを返す', () => {
    const resolver = vi.fn().mockReturnValue('data:image/svg+xml;utf8,<svg/>');
    const result = resolveReportUserThumbSrc({
      userId: 'a:jUct3kuVrP6MGbev',
      avatarUrl: '',
      identiconResolver: resolver
    });
    expect(result).toBe('data:image/svg+xml;utf8,<svg/>');
    expect(resolver).toHaveBeenCalledWith('a:jUct3kuVrP6MGbev');
  });

  it('匿名 a: + resolver 無し → 空文字', () => {
    expect(
      resolveReportUserThumbSrc({
        userId: 'a:jUct3kuVrP6MGbev',
        avatarUrl: ''
      })
    ).toBe('');
  });

  it('匿名 a: + resolver が空文字を返す → 空文字（resolver の判定を尊重）', () => {
    const resolver = vi.fn().mockReturnValue('');
    expect(
      resolveReportUserThumbSrc({
        userId: 'a:jUct3kuVrP6MGbev',
        avatarUrl: '',
        identiconResolver: resolver
      })
    ).toBe('');
  });

  it('匿名 a: + 有効な avatarUrl → avatarUrl 優先（プロフィールキャッシュ等の本物が来た場合）', () => {
    expect(
      resolveReportUserThumbSrc({
        userId: 'a:jUct3kuVrP6MGbev',
        avatarUrl: 'https://example.test/real.jpg',
        identiconResolver: () => 'data:image/svg+xml;utf8,<svg/>'
      })
    ).toBe('https://example.test/real.jpg');
  });

  it('userId 不明（空・null）→ 空文字', () => {
    expect(resolveReportUserThumbSrc({ userId: '', avatarUrl: '' })).toBe('');
    expect(
      resolveReportUserThumbSrc({
        userId: null,
        avatarUrl: '',
        identiconResolver: () => 'x'
      })
    ).toBe('');
  });

  it('userId が UNKNOWN プレースホルダー → 空文字', () => {
    expect(
      resolveReportUserThumbSrc({ userId: '__unknown__', avatarUrl: '' })
    ).toBe('');
  });

  it('userId が短すぎる数字（4 桁以下）→ identicon 経路にも乗らず 空文字（誤識別防止）', () => {
    expect(resolveReportUserThumbSrc({ userId: '999', avatarUrl: '' })).toBe('');
  });
});
