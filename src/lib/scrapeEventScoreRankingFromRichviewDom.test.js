/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { scrapeContributionRankingFromDom } from './officialEventBannerDom.js';
import {
  scrapeEventScoreRankingFromRichviewDom,
  scrapeEventSelfStatusFromRichviewDom
} from './scrapeEventScoreRankingFromRichviewDom.js';

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

  // ★本命★ 実機「イベントランキング」(参加配信者の💎順位)の本物構造（2026-05-26 ユーザー提供生HTML）。
  // 行=el69c2m4 / 順位=ebq6m481(「位」=ebq6m480) / 名前=el69c2m1(敬称=el69c2m0) / スコア=css-z40gn4。
  function realEventRankingHtml(rows) {
    const items = rows
      .map(
        ({ rank, score, name, thumb }) => `
        <div class="css-12vetqo el69c2m4">
          <div class="css-1wdbxvj ebq6m483">
            <span class="css-89z9eu ebq6m481">${rank}</span><span class="css-v76r9i ebq6m480">位</span>
          </div>
          <div class="css-x el69c2m3"${thumb ? ` style="background-image:url(${thumb})"` : ''}></div>
          <div>
            <p class="css-1dtdcds el69c2m2"><span class="css-1ybg0xk el69c2m1">${name}</span><span class="css-spovqj el69c2m0">さん</span></p>
            <div class="css-8zj0aw"><svg class="css-jh4whz"><path></path></svg><p class="css-z40gn4">${String(score).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</p></div>
          </div>
        </div>`
      )
      .join('');
    return `
      <div class="css-1ghu3wd ef7q2pk1"><div><div class="css-1066lcq e1hv4cge5">
        <h2 class="css-1row0ay e1hv4cge4">イベントランキング</h2>
        <button class="css-7ozhqr e10ycgko1"><span>更新</span></button>
      </div><div class="css-ezqgwq">${items}</div></div></div>`;
  }

  it('★本命★ 実機「イベントランキング」(参加配信者)構造から 💎 順位・スコアを取得', () => {
    document.body.innerHTML = realEventRankingHtml([
      { rank: 1, score: 4965200, name: 'あめ！' },
      { rank: 2, score: 3452500, name: 'この', thumb: 'https://example.test/kono.jpg' },
      { rank: 3, score: 2825600, name: 'ぴとなちゃん♡' }
    ]);
    const rows = scrapeEventScoreRankingFromRichviewDom(document);
    expect(rows).not.toBeNull();
    expect(rows).toHaveLength(3);
    expect(rows?.[0]).toMatchObject({ rank: 1, score: 4965200, name: 'あめ！', isAnonymous: false });
    expect(rows?.[1]).toMatchObject({ rank: 2, score: 3452500, name: 'この', isAnonymous: false, thumbnailUrl: 'https://example.test/kono.jpg' });
    expect(rows?.[2]).toMatchObject({ rank: 3, score: 2825600, name: 'ぴとなちゃん♡', isAnonymous: false });
  });

  it('★本命★ 敬称「さん」を名前に含めない', () => {
    document.body.innerHTML = realEventRankingHtml([
      { rank: 1, score: 100, name: '屋敷' },
      { rank: 2, score: 50, name: 'さやか☆' }
    ]);
    const rows = scrapeEventScoreRankingFromRichviewDom(document);
    expect(rows?.[0].name).toBe('屋敷');
    expect(rows?.[1].name).toBe('さやか☆');
  });

  it('本命(イベントランキング)とサポーター両方あれば本命が勝つ', () => {
    document.body.innerHTML =
      realEventRankingHtml([
        { rank: 1, score: 4965200, name: 'あめ！' },
        { rank: 2, score: 3452500, name: 'この' }
      ]) +
      emotionRichviewHtml([
        { rank: 1, score: 999, name: 'サポーターA', uid: '1' },
        { rank: 2, score: 888, name: 'サポーターB', uid: '2' }
      ]);
    const rows = scrapeEventScoreRankingFromRichviewDom(document);
    expect(rows).not.toBeNull();
    // 本命のスコア(4965200/3452500)であってサポーター(999/888)ではない
    expect(rows?.[0].score).toBe(4965200);
    expect(rows?.[1].score).toBe(3452500);
  });

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

describe('scrapeEventSelfStatusFromRichviewDom', () => {
  // 実機バナー構造（2026-05-26 採取）: e1awe04q* クラスタ + select（複数イベント切替）。
  // selectOpts は <option> テキスト配列（selectedIndex は使わない＝広告を指すことがあるため）。
  function bannerHtml({ rank, score, diff, selectOpts }) {
    const opts = (selectOpts || ['イベントX'])
      .map((t, i) => `<option${i === 0 ? ' selected' : ''}>${t}</option>`)
      .join('');
    return `
      <div class="css-x ef7q2pk1">
        <select class="css-y elcxquj20">${opts}</select>
        <div class="css-x e1awe04q14">
          <span class="css-1kputv7 e1awe04q12">現在</span><span class="css-1oa92lc e1awe04q11">位</span>
          <span class="css-mmdt3g e1awe04q10">○○さんを応援しよう！</span>
          <span class="css-ggzujz e1awe04q0">${rank}</span>
          <p class="css-1qqb6me">${String(score).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</p>
          <p class="css-1d9a3hd">${String(diff).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</p>
        </div>
      </div>`;
  }

  it('本人の順位・累計スコア・順位UPまでの差を取得（配信者名は richview から取らず空）', () => {
    document.body.innerHTML = bannerHtml({ rank: 2, score: 3453400, diff: 1517300, selectOpts: ['横浜DeNAベイスターズ始球式オーディション'] });
    const s = scrapeEventSelfStatusFromRichviewDom(document);
    expect(s).not.toBeNull();
    expect(s?.rank).toBe(2);
    expect(s?.score).toBe(3453400);
    expect(s?.diffToNext).toBe(1517300);
    expect(s?.broadcasterName).toBe(''); // richview の e1awe04q10 は「を応援しよう！」のため使わない
    expect(s?.eventName).toBe('横浜DeNAベイスターズ始球式オーディション');
  });

  it('⭐イベント名: select が広告キャンペーン(selected)とギフトイベントを持つ時、ギフトイベントを選ぶ', () => {
    // 実機 lv350613081 の罠: selectedIndex=0 は広告だが、ランキングは始球式(idx1)のもの。
    document.body.innerHTML = bannerHtml({
      rank: 2, score: 3471100, diff: 1659800,
      selectOpts: [
        '5月病なんか銀河系まで飛んでいけ！ニコニ広告で憂うつパージ！',
        'ニコニコ生放送プレミアムナイター2026 横浜DeNAベイスターズ 始球式オーディション'
      ]
    });
    const s = scrapeEventSelfStatusFromRichviewDom(document);
    expect(s?.eventName).toBe('ニコニコ生放送プレミアムナイター2026 横浜DeNAベイスターズ 始球式オーディション');
    expect(s?.eventName).not.toMatch(/ニコニ広告|憂うつパージ/);
  });

  it('イベント名: option が広告1つだけならそれを出す（option 単一は採用）', () => {
    document.body.innerHTML = bannerHtml({ rank: 3, score: 100, diff: 50, selectOpts: ['ニコニ広告で憂うつパージ！'] });
    const s = scrapeEventSelfStatusFromRichviewDom(document);
    expect(s?.eventName).toBe('ニコニ広告で憂うつパージ！');
  });

  it('イベント名: 複数の広告 option しか無ければ誤判定回避で空', () => {
    document.body.innerHTML = bannerHtml({ rank: 3, score: 100, diff: 50, selectOpts: ['ニコニ広告A', 'ニコニ広告で憂うつパージ！'] });
    const s = scrapeEventSelfStatusFromRichviewDom(document);
    expect(s?.eventName).toBe('');
  });

  it('該当バナーが無ければ null', () => {
    document.body.innerHTML = '<div class="nothing"></div>';
    expect(scrapeEventSelfStatusFromRichviewDom(document)).toBeNull();
  });

  it('root が空なら null', () => {
    expect(scrapeEventSelfStatusFromRichviewDom(null)).toBeNull();
  });

  it('スコアは「現在」「位」等のラベルを数値に取り違えない（数字のみ採用）', () => {
    document.body.innerHTML = bannerHtml({ rank: 1, score: 9999999, diff: 0, selectOpts: ['イベントX'] });
    const s = scrapeEventSelfStatusFromRichviewDom(document);
    expect(s?.rank).toBe(1);
    expect(s?.score).toBe(9999999);
  });
});
