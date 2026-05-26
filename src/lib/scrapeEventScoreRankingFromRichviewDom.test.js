/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { scrapeContributionRankingFromDom } from './officialEventBannerDom.js';
import { scrapeEventScoreRankingFromRichviewDom } from './scrapeEventScoreRankingFromRichviewDom.js';

function supporterSectionHtml(rankScoreRows) {
  const lis = rankScoreRows
    .map(
      ({ rank, score, name, disabled }) => `
      <li class="item">
        <i class="rank"><span>${rank}</span></i>
        <div class="info">
          <button type="button" class="ranker" ${disabled ? 'disabled' : ''}>
            <span class="name">${name}</span>
            <div class="thumbnail" style="background-image:url(https://example.test/t.png)"></div>
          </button>
          <p class="contribution">${String(score).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} <svg></svg></p>
        </div>
      </li>`
    )
    .join('');
  return `
    <div class="content-supporter-section">
      <div class="wrapper">
        <ul class="wrapper">
          ${lis}
        </ul>
      </div>
    </div>`;
}

describe('scrapeEventScoreRankingFromRichviewDom', () => {
  it('root が空なら null', () => {
    expect(scrapeEventScoreRankingFromRichviewDom(null)).toBeNull();
    expect(scrapeEventScoreRankingFromRichviewDom(undefined)).toBeNull();
  });

  it('該当リストが無ければ null', () => {
    document.body.innerHTML = '<div class="nothing"></div>';
    expect(scrapeEventScoreRankingFromRichviewDom(document)).toBeNull();
  });

  it('順位テキストが無い（序数での補完なし）は null（貢献度スクレイパはヒットしてもイベント用は不採用）', () => {
    document.body.innerHTML = `
      <div class="content-supporter-section">
        <div class="wrapper"><ul class="wrapper">
          <li class="item">
            <i class="rank"></i>
            <div class="info">
              <button class="ranker"><span class="name">ミュート</span></button>
              <p class="contribution">432,295</p>
            </div>
          </li>
          <li class="item">
            <i class="rank"></i>
            <div class="info">
              <button class="ranker"><span class="name">この</span></button>
              <p class="contribution">233,795</p>
            </div>
          </li>
        </ul></div></div>`;
    const contrib = scrapeContributionRankingFromDom(document);
    expect(Array.isArray(contrib) && contrib.length > 0).toBe(true);
    expect(scrapeEventScoreRankingFromRichviewDom(document)).toBeNull();
  });

  it('順位・スコアが明示されていれば昇順連番として取得（イベント💎リスト想定fixture）', () => {
    document.body.innerHTML = supporterSectionHtml([
      { rank: 1, score: 432295, name: 'ミュート' },
      { rank: 2, score: 233795, name: 'この' },
      { rank: 3, score: 133435, name: '零羽こはね' }
    ]);
    const rows = scrapeEventScoreRankingFromRichviewDom(document);
    expect(rows).not.toBeNull();
    expect(rows).toHaveLength(3);
    expect(rows?.[0]).toMatchObject({ rank: 1, score: 432295, name: 'ミュート', isAnonymous: false });
    expect(rows?.[1]).toMatchObject({ rank: 2, score: 233795, name: 'この', isAnonymous: false });
    expect(rows?.[2]).toMatchObject({ rank: 3, score: 133435, name: '零羽こはね', isAnonymous: false });
  });

  it('rank が飛んだ連番なら全体 null', () => {
    document.body.innerHTML = supporterSectionHtml([
      { rank: 1, score: 100, name: 'A' },
      { rank: 3, score: 50, name: 'B' }
    ]);
    expect(scrapeEventScoreRankingFromRichviewDom(document)).toBeNull();
  });

  it('順位開始が 1 でなくとも連続ブロックなら採用', () => {
    document.body.innerHTML = supporterSectionHtml([
      { rank: 4, score: 10, name: 'D' },
      { rank: 5, score: 9, name: 'E' }
    ]);
    const rows = scrapeEventScoreRankingFromRichviewDom(document);
    expect(rows).not.toBeNull();
    expect(rows?.map((r) => r.rank)).toEqual([4, 5]);
  });

  it('順位が重複なら null', () => {
    document.body.innerHTML = supporterSectionHtml([
      { rank: 1, score: 10, name: 'A' },
      { rank: 1, score: 9, name: 'B' }
    ]);
    expect(scrapeEventScoreRankingFromRichviewDom(document)).toBeNull();
  });

  it('強タグ rank-num があれば順位として採用できる', () => {
    document.body.innerHTML = `
      <div class="content-supporter-section">
        <div class="wrapper"><ul class="wrapper">
          <li class="item">
            <i class="rank"><strong class="rank-num">1</strong></i>
            <div class="info">
              <button class="ranker"><span class="name">X</span></button>
              <p class="contribution">999</p>
            </div>
          </li>
          <li class="item">
            <div class="status"><strong class="rank-num">2</strong></div>
            <div class="info">
              <button class="ranker"><span class="name">Y</span></button>
              <p class="contribution">888</p>
            </div>
          </li>
        </ul></div></div>`;
    const rows = scrapeEventScoreRankingFromRichviewDom(document);
    expect(rows).not.toBeNull();
    expect(rows?.map((r) => ({ rank: r.rank, score: r.score }))).toEqual([
      { rank: 1, score: 999 },
      { rank: 2, score: 888 }
    ]);
  });

  it('スコアに数字以外しか無ければ null', () => {
    document.body.innerHTML = `
      <div class="content-supporter-section">
        <div class="wrapper"><ul class="wrapper">
          <li class="item">
            <i class="rank"><span>1</span></i>
            <div class="info">
              <button class="ranker"><span class="name">z</span></button>
              <p class="contribution">💎のみ</p>
            </div>
          </li>
        </ul></div></div>`;
    expect(scrapeEventScoreRankingFromRichviewDom(document)).toBeNull();
  });

  // 実機 richview（Emotion CSS）の本物構造（2026-05-26 lv350612434 採取）。
  // 行=div.e16w44943 / 順位=div.e1abt54u0 / 名前=a.e16w44941 / 敬称=span.e16w44940 / スコア=💎隣の p。
  function emotionRichviewHtml(rows) {
    const items = rows
      .map(
        ({ rank, score, name, uid, anon }) => `
        <div class="css-o9iyhf e16w44943">
          <div class="css-zv4d0p e1abt54u0">${rank}</div>
          <div class="css-q9a1wl e16w44942">
            ${anon ? '' : `<a class="css-122p9lk e16w44941" href="https://www.nicovideo.jp/user/${uid || '0'}">${name}</a>`}
            <span class="css-nps8g0 e16w44940">さん</span>
          </div>
          <div class="css-vcb5i6">
            <svg class="css-jh4whz"><path></path></svg>
            <p class="css-1d9a3hd">${String(score).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</p>
          </div>
        </div>`
      )
      .join('');
    return `
      <div class="css-w7d8dq ef7q2pk4">
        <div class="css-1hz5wm5 e1gjhmvh3">
          ${items}
        </div>
      </div>`;
  }

  it('実機 richview Emotion 構造から 💎 順位・スコア・記名 uid を取得（本命パス）', () => {
    document.body.innerHTML = emotionRichviewHtml([
      { rank: 1, score: 432295, name: 'ミュート', uid: '111' },
      { rank: 2, score: 233795, name: 'この', uid: '222' },
      { rank: 3, score: 133435, name: '零羽こはね', uid: '333' }
    ]);
    const rows = scrapeEventScoreRankingFromRichviewDom(document);
    expect(rows).not.toBeNull();
    expect(rows).toHaveLength(3);
    expect(rows?.[0]).toMatchObject({ rank: 1, score: 432295, name: 'ミュート', isAnonymous: false, userId: '111' });
    expect(rows?.[1]).toMatchObject({ rank: 2, score: 233795, name: 'この', isAnonymous: false, userId: '222' });
    expect(rows?.[2]).toMatchObject({ rank: 3, score: 133435, name: '零羽こはね', isAnonymous: false, userId: '333' });
  });

  it('Emotion 構造で名前リンクが無い行（匿名）は「名無し」で残し行は捨てない', () => {
    document.body.innerHTML = emotionRichviewHtml([
      { rank: 1, score: 500, name: 'A', uid: '1' },
      { rank: 2, score: 300, anon: true }
    ]);
    const rows = scrapeEventScoreRankingFromRichviewDom(document);
    expect(rows).not.toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows?.[1]).toMatchObject({ rank: 2, score: 300, name: '名無し', isAnonymous: true });
  });

  it('Emotion 構造でも順位が飛べば全体 null（誤値ゼロ）', () => {
    document.body.innerHTML = emotionRichviewHtml([
      { rank: 1, score: 500, name: 'A', uid: '1' },
      { rank: 3, score: 300, name: 'C', uid: '3' }
    ]);
    expect(scrapeEventScoreRankingFromRichviewDom(document)).toBeNull();
  });

  it('Emotion 等のランダムCSSクラス（css-xxx）でも順位・スコアが抽出できれば取得できる', () => {
    document.body.innerHTML = `
      <div>
        <div class="css-1tcdyvs e5sar9i1">
          <li class="css-w7d8dq ef7q2pk4">
            <span class="css-74n2tq">1位</span>
            <img src="https://example.test/avatar1.jpg" alt="ミュートさんのサムネイル">
            <div class="css-1r66a6v e5sar9i0">ミュート</div>
            <span class="css-pts">💎 433,100</span>
          </li>
          <li class="css-w7d8dq ef7q2pk4">
            <span class="css-74n2tq">2</span>
            <img src="https://example.test/avatar2.jpg" alt="このさん">
            <div class="css-1r66a6v e5sar9i0">この</div>
            <span class="css-pts">233,920 pt</span>
          </li>
        </div>
      </div>`;
    const rows = scrapeEventScoreRankingFromRichviewDom(document);
    expect(rows).not.toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows?.[0]).toMatchObject({ rank: 1, score: 433100, name: 'ミュート', isAnonymous: false, thumbnailUrl: 'https://example.test/avatar1.jpg' });
    expect(rows?.[1]).toMatchObject({ rank: 2, score: 233920, name: 'この', isAnonymous: false, thumbnailUrl: 'https://example.test/avatar2.jpg' });
  });
});
