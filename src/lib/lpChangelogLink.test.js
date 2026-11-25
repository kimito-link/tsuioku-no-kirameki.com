import { describe, it, expect } from 'vitest';
import { lpChangelogAnchorId, lpChangelogUrl, LP_CHANGELOG_PAGE_URL } from './lpChangelogLink.js';

describe('lpChangelogLink', () => {
  it('版ごとの決まった場所（#v<版>）を指す', () => {
    expect(lpChangelogUrl('0.1.2229')).toBe('https://tsuioku-no-kirameki.com/changelog.html#v0.1.2229');
    expect(lpChangelogAnchorId('0.1.7')).toBe('v0.1.7');
  });
  it('先頭の v や空白はあってもよい', () => {
    expect(lpChangelogAnchorId(' v0.1.2229 ')).toBe('v0.1.2229');
  });
  it('版でないものは一覧のページそのもの（壊れた # を作らない）', () => {
    for (const bad of ['', '?', 'dev', '0.1', null, undefined, 12, '0.1.2229<script>']) {
      expect(lpChangelogAnchorId(bad)).toBe('');
      expect(lpChangelogUrl(bad)).toBe(LP_CHANGELOG_PAGE_URL);
    }
  });
  it('紹介ページ（本番ドメイン）の https で、通信先を増やさない', () => {
    expect(LP_CHANGELOG_PAGE_URL).toMatch(/^https:\/\/tsuioku-no-kirameki\.com\/changelog\.html$/);
  });
});
