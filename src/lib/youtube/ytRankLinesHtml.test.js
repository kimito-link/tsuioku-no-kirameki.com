import { describe, it, expect } from 'vitest';
import { topSupportRankLineModels } from '../topSupportRankStripLines.js';
import {
  buildYtRankLinesHtml,
  buildYtCasterTileHtml,
  safeYtChannelHref,
  ytRankUserKey,
} from './ytRankLinesHtml.js';

describe('ytRankLinesHtml', () => {
  it('ニコ生版と同じ class でカードを作り、YouTube のチャンネルへリンクする', () => {
    const models = topSupportRankLineModels(
      [
        { userKey: 'UCabcdefghijklmnopqrstuv', nickname: 'あいう', count: 12, avatarUrl: 'https://yt3.ggpht.com/a=s64' },
        { userKey: 'name:えお', nickname: 'えお', count: 3 },
      ],
      { defaultThumbSrc: 'images/x.png' },
    );
    const html = buildYtRankLinesHtml(models, {
      countTextAt: (i) => (i === 0 ? '12件 · ¥1,500' : '3件'),
      hrefFor: (key) => (key.startsWith('UC') ? `https://www.youtube.com/channel/${key}` : ''),
    });
    expect(html).toContain('class="nl-top-support-rank__line');
    expect(html).toContain('nl-top-support-rank__line--linkable');
    expect(html).toContain('href="https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"');
    expect(html).toContain('<span class="nl-top-support-rank__count">12件 · ¥1,500</span>');
    expect(html).toContain('<span class="nl-top-support-rank__name">あいう</span>');
    expect(html).not.toContain('nicovideo.jp');
    // 2人目はリンクなし(div)
    expect(html.match(/<a /g)?.length).toBe(1);
  });

  it('名前やリンクの中の記号はエスケープし、YouTube 以外・http のリンクは出さない', () => {
    const models = topSupportRankLineModels(
      [{ userKey: 'UCx', nickname: '<b>"悪"</b>', count: 1 }],
      { defaultThumbSrc: 'images/x.png' },
    );
    const html = buildYtRankLinesHtml(models, {
      countTextAt: () => '<1件>',
      hrefFor: () => 'javascript:alert(1)',
    });
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;1件&gt;');
    expect(html).not.toContain('javascript:');
    expect(safeYtChannelHref('http://www.youtube.com/channel/UCx')).toBe('');
    expect(safeYtChannelHref('https://evil.example/youtube.com')).toBe('');
    expect(safeYtChannelHref('https://www.youtube.com/@abc')).toBe('https://www.youtube.com/@abc');
  });

  it('配信者タイルはニコ生版と同じ形・名前が無ければ出さない', () => {
    expect(buildYtCasterTileHtml({ name: '' })).toBe('');
    const html = buildYtCasterTileHtml({
      name: 'りんく',
      iconUrl: 'https://yt3.ggpht.com/a=s176',
      pageUrl: 'https://www.youtube.com/channel/UC1',
    });
    expect(html).toContain('nl-top-support-rank__caster-label">配信者');
    expect(html).toContain('nl-top-support-rank__caster-follow');
    expect(html).toContain('data-on-error-hide="1"');
  });

  it('人の鍵はチャンネルID優先、無ければ名前から', () => {
    expect(ytRankUserKey('UC1', 'a')).toBe('UC1');
    expect(ytRankUserKey('', 'a')).toBe('name:a');
    expect(ytRankUserKey('', '')).toBe('');
  });
});
