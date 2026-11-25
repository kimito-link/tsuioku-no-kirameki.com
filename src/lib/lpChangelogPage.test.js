import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXTENSION_CHANGELOG } from './changelog.js';
import { EXTENSION_CHANGELOG_ARCHIVE } from './changelog-archive.js';
import { CHANGELOG_NOTE_FORBIDDEN } from './whatsNewNotice.js';
import {
  renderLpChangelogPage,
  orderLpChangelogEntries,
  LP_CHANGELOG_FULL_ITEMS_SINCE,
  LP_CHANGELOG_OMITTED_SUMMARY
} from './lpChangelogPage.js';

const PAGE_PATH = resolve(__dirname, '../../tsuioku-no-kirameki/changelog.html');
const ALL = [...EXTENSION_CHANGELOG, ...EXTENSION_CHANGELOG_ARCHIVE];

const e = (version, summary, items = ['利用者向けの説明がここに二十字以上入っています。']) => ({
  version,
  date: '2026-11-25',
  summary,
  items
});

describe('renderLpChangelogPage', () => {
  it('版ごとに id="v<版>" と、その場所へのリンクを持つ', () => {
    const html = renderLpChangelogPage({ entries: [e('0.1.2229', '一言')] });
    expect(html).toContain('<li class="cl-entry" id="v0.1.2229">');
    expect(html).toContain('<a href="#v0.1.2229">v0.1.2229</a>');
  });

  it('新しい順・重複なしに並べる', () => {
    const ordered = orderLpChangelogEntries([e('0.1.9', 'a'), e('0.1.10', 'b'), e('0.1.9', 'c')]);
    expect(ordered.map((x) => x.version)).toEqual(['0.1.10', '0.1.9']);
    expect(ordered[1].summary).toBe('a');
  });

  it('利用者向けに書くようになった版からは項目まで、それより前は一言だけ', () => {
    const html = renderLpChangelogPage({
      entries: [e(LP_CHANGELOG_FULL_ITEMS_SINCE, '新しい版', ['新しい版の説明が二十字以上ここに入っています。']), e('0.1.100', '古い版', ['古い版の開発向けの説明が二十字以上ここに入っています。'])]
    });
    expect(html).toContain('新しい版の説明');
    expect(html).not.toContain('古い版の開発向けの説明');
    expect(html).toContain('古い版');
  });

  it('「有料」「LINE」などを含む文は載せない（一言は省略の文に置きかえる）', () => {
    const html = renderLpChangelogPage({
      entries: [e('0.1.2300', 'サポーター(有料)の土台', ['LINE でお知らせが届くようになりましたという説明です。', 'ふつうの説明が二十字以上ここに入っています。'])]
    });
    expect(html).not.toMatch(/有料|LINE/);
    expect(html).toContain(LP_CHANGELOG_OMITTED_SUMMARY);
    expect(html).toContain('ふつうの説明');
  });

  it('文字は HTML として解釈させない', () => {
    const html = renderLpChangelogPage({ entries: [e('0.1.2300', '<b>x</b>', ['<script>alert(1)</script> 二十字以上の説明をここに書いています。'])] });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('tsuioku-no-kirameki/changelog.html（紹介ページの全版一覧）', () => {
  const page = readFileSync(PAGE_PATH, 'utf8');

  it('changelog から作り直した中身と同じ（版を上げたら npm run build で書き直す）', () => {
    expect(page === renderLpChangelogPage({ entries: ALL })).toBe(true);
  });

  it('すべての版（古い版も）の場所がある＝一度出したリンクが切れない', () => {
    for (const entry of ALL) {
      expect(page.includes(`id="v${entry.version}"`), entry.version).toBe(true);
    }
  });

  it('今の版（changelog 先頭）がいちばん上', () => {
    const first = page.match(/<li class="cl-entry" id="v([\d.]+)">/);
    expect(first && first[1]).toBe(EXTENSION_CHANGELOG[0].version);
  });

  it('載せてはいけない言葉を含まない', () => {
    const body = page.slice(page.indexOf('<body>'));
    for (const rule of CHANGELOG_NOTE_FORBIDDEN) {
      expect(rule.re.test(body), rule.label).toBe(false);
    }
  });
});
