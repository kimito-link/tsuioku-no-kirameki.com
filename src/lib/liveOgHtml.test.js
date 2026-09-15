import { describe, expect, it } from 'vitest';
import { buildLiveOgHtml, LIVE_OG_FALLBACK_IMAGE } from './liveOgHtml.js';

const LARGE_URL = 'https://asset2.dlive.nicovideo.jp/live/screenshot/1/thumbnail-854x480/screenshot.jpg';

/** 放送中の 1 配信ぶん(保存形の抜粋)。 */
function onAirLive(over = {}) {
  return {
    liveId: 'lv1234567',
    title: 'テスト配信',
    streamer: { id: '999', name: 'テスト配信者', pageUrl: 'https://www.nicovideo.jp/user/999', icon50: '', icon150: '' },
    thumbnail: { large: LARGE_URL, middle: '', small: '', micro: '' },
    ...over
  };
}

describe('buildLiveOgHtml', () => {
  it('放送中(large あり): og:image=large・og:url に ?lv=・寸法 854x480・twitter:card', () => {
    const html = buildLiveOgHtml({ lv: 'lv1234567', live: onAirLive() });
    expect(html).toContain(`<meta property="og:image" content="${LARGE_URL}">`);
    expect(html).toContain('<meta property="og:url" content="https://tsuioku-no-kirameki.com/live/?lv=lv1234567">');
    expect(html).toContain('<meta property="og:image:width" content="854">');
    expect(html).toContain('<meta property="og:image:height" content="480">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<meta property="og:image:type" content="image/jpeg">');
  });

  it('large 無し: フォールバック PNG・width/height 無し', () => {
    const html = buildLiveOgHtml({ lv: 'lv1234567', live: onAirLive({ thumbnail: { large: '', middle: '', small: '', micro: '' } }) });
    expect(html).toContain(`<meta property="og:image" content="${LIVE_OG_FALLBACK_IMAGE}">`);
    expect(html).toContain('<meta property="og:image:type" content="image/png">');
    expect(html).not.toContain('og:image:width');
    expect(html).not.toContain('og:image:height');
  });

  it('javascript: の large は通さずフォールバック PNG', () => {
    const html = buildLiveOgHtml({ lv: 'lv1234567', live: onAirLive({ thumbnail: { large: 'javascript:alert(1)', middle: '', small: '', micro: '' } }) });
    expect(html).toContain(`<meta property="og:image" content="${LIVE_OG_FALLBACK_IMAGE}">`);
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('og:image:width');
  });

  it('live=null: 汎用 title・PNG・og:url は /live/(クエリ無し)', () => {
    const html = buildLiveOgHtml({ lv: 'lv1234567', live: null });
    expect(html).toContain('<meta property="og:title" content="いま配信を支えている人 ― ニコニコ生放送（追憶のきらめき ランキング）">');
    expect(html).toContain(`<meta property="og:image" content="${LIVE_OG_FALLBACK_IMAGE}">`);
    expect(html).toContain('<meta property="og:url" content="https://tsuioku-no-kirameki.com/live/">');
    expect(html).not.toContain('?lv=');
  });

  it('lv 不正: 汎用・og:url は /live/', () => {
    const html = buildLiveOgHtml({ lv: 'abc', live: onAirLive() });
    expect(html).toContain('<meta property="og:url" content="https://tsuioku-no-kirameki.com/live/">');
    expect(html).not.toContain('?lv=');
  });

  it('幅高が読めない URL: og:image:width を含まない', () => {
    const url = 'https://asset2.dlive.nicovideo.jp/live/screenshot/1/foo/screenshot.jpg';
    const html = buildLiveOgHtml({ lv: 'lv1234567', live: onAirLive({ thumbnail: { large: url, middle: '', small: '', micro: '' } }) });
    expect(html).toContain(`<meta property="og:image" content="${url}">`);
    expect(html).not.toContain('og:image:width');
    expect(html).not.toContain('og:image:height');
  });

  it('エスケープ: title の特殊文字は属性内で実体参照になり、生の < が meta 内に出ない', () => {
    const html = buildLiveOgHtml({ lv: 'lv1234567', live: onAirLive({ title: `"<&>'`, streamer: { name: '', id: '', pageUrl: '', icon50: '', icon150: '' } }) });
    // title のみ分岐: 「{title}」 ― いま支えている人。escape 後は &quot;&lt;&amp;&gt;&#39;
    expect(html).toContain('&quot;&lt;&amp;&gt;&#39;');
    // meta の content 内に生の < タグが漏れていない(<meta 以外の < は出ない)。
    expect(html).not.toContain('content="「"');
    expect(html).not.toMatch(/content="[^"]*<[^"]*"/);
  });

  it('★リダイレクト不在: 出力に <script も http-equiv も含まない', () => {
    const html = buildLiveOgHtml({ lv: 'lv1234567', live: onAirLive() });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('http-equiv');
  });

  it('★支援者・本文・数値不在: gift/comment/watchCount を持つ live でもその文字列が出ない', () => {
    // ★数値は lv(lv1234567)やサムネ寸法(854/480)と重ならない値を選ぶ(テスト側の偶然一致を避ける)。
    const live = onAirLive({
      watchCount: 70001,
      giftTotal: 80002,
      gift: { rankers: [{ rank: 1, name: 'ギフト太郎', contribution: 90003 }] },
      ad: { ranking: [{ rank: 1, name: '広告花子' }] },
      comment: { rankers: [{ rank: 1, uid: '60004', name: 'コメント次郎', count: 60005 }] }
    });
    const html = buildLiveOgHtml({ lv: 'lv1234567', live });
    expect(html).not.toContain('ギフト太郎');
    expect(html).not.toContain('広告花子');
    expect(html).not.toContain('コメント次郎');
    expect(html).not.toContain('70001');
    expect(html).not.toContain('80002');
    expect(html).not.toContain('90003');
    expect(html).not.toContain('60004');
    expect(html).not.toContain('60005');
  });

  it('ネガコン: lv が違えば og:url が違う / title が違えば og:title が違う', () => {
    const a = buildLiveOgHtml({ lv: 'lv1234567', live: onAirLive() });
    const b = buildLiveOgHtml({ lv: 'lv7654321', live: onAirLive({ liveId: 'lv7654321' }) });
    expect(a).toContain('?lv=lv1234567');
    expect(b).toContain('?lv=lv7654321');
    const c = buildLiveOgHtml({ lv: 'lv1234567', live: onAirLive({ title: '別の番組名' }) });
    expect(a).not.toEqual(c);
    expect(c).toContain('別の番組名');
  });
});
