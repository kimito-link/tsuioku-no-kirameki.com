import { describe, expect, it } from 'vitest';
import {
  buildMarketingUserLabelLinkedHtml,
  buildUserProfileLinkedLabelHtml
} from './userProfileLinkHtml.js';

describe('buildUserProfileLinkedLabelHtml', () => {
  it('数値 ID + 表示名 → ニコ動ユーザーページへのリンクで包む', () => {
    const html = buildUserProfileLinkedLabelHtml('88210441', 'のら（88210441）');
    expect(html).toContain('href="https://www.nicovideo.jp/user/88210441"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('のら（88210441）');
  });

  it('匿名 (a:xxxx) ID はリンクにしない（プロフィールページが存在しない）', () => {
    const html = buildUserProfileLinkedLabelHtml(
      'a:AbCdEfGhIjKlMnOp',
      '匿名（a:AbCd…MnOp）'
    );
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('nicovideo.jp/user/');
    // エスケープだけはかかる
    expect(html).toContain('匿名（a:AbCd…MnOp）');
  });

  it('ハッシュ風 ID（数値でも a: でもない）もリンクにしない', () => {
    const html = buildUserProfileLinkedLabelHtml(
      'KqwErTyUiOpAsDfGh',
      'hoge（KqwEr…sDfGh）'
    );
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('nicovideo.jp/user/');
  });

  it('userKey が空・undefined・null のときはリンクにしない（未取得）', () => {
    expect(buildUserProfileLinkedLabelHtml('', 'ID未取得')).not.toContain('<a ');
    expect(buildUserProfileLinkedLabelHtml(undefined, '—')).not.toContain('<a ');
    expect(buildUserProfileLinkedLabelHtml(null, '—')).not.toContain('<a ');
  });

  it('ラベル中の HTML 特殊文字は必ずエスケープする（リンク有無にかかわらず）', () => {
    const withLink = buildUserProfileLinkedLabelHtml(
      '12345',
      '<script>alert(1)</script>'
    );
    expect(withLink).toContain('&lt;script&gt;');
    expect(withLink).not.toContain('<script>');

    const noLink = buildUserProfileLinkedLabelHtml(
      'a:xxx',
      '<script>alert(1)</script>'
    );
    expect(noLink).toContain('&lt;script&gt;');
    expect(noLink).not.toContain('<script>');
  });

  it('href の組み立てでも URL 構成要素に特殊文字が混ざらない（encodeURIComponent）', () => {
    // userId には数値のみ通るのが前提だが念のため
    const html = buildUserProfileLinkedLabelHtml('12345 & 67', 'x');
    // canLinkCommentTickerName の中で isAnonymousStyleNicoUserId がはじくため
    // こういう文字列はリンク化されない
    expect(html).not.toContain('<a ');
  });

  it('class は CSS で装飾できるよう安定名 (nl-user-profile-link) を付与', () => {
    const html = buildUserProfileLinkedLabelHtml('88210441', 'のら');
    expect(html).toContain('class="nl-user-profile-link"');
  });
});

describe('buildMarketingUserLabelLinkedHtml', () => {
  it('nickname があるとき: 数値 ID ならリンク化、表示は nickname', () => {
    const html = buildMarketingUserLabelLinkedHtml({
      userId: '88210441',
      nickname: 'のら'
    });
    expect(html).toContain('href="https://www.nicovideo.jp/user/88210441"');
    expect(html).toContain('>のら</a>');
  });

  it('nickname が空のとき: 表示は userId、数値 ID ならリンク化', () => {
    const html = buildMarketingUserLabelLinkedHtml({
      userId: '88210441',
      nickname: ''
    });
    expect(html).toContain('href="https://www.nicovideo.jp/user/88210441"');
    expect(html).toContain('>88210441</a>');
  });

  it('匿名 ID はリンクにしない', () => {
    const html = buildMarketingUserLabelLinkedHtml({
      userId: 'a:AbCdEfGhIj',
      nickname: '匿名'
    });
    expect(html).not.toContain('<a ');
    expect(html).toContain('匿名');
  });

  it('両方空なら — を表示してリンクなし', () => {
    const html = buildMarketingUserLabelLinkedHtml({ userId: '', nickname: '' });
    expect(html).not.toContain('<a ');
    expect(html).toContain('—');
  });
});
