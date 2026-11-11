/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { readTcPageInfo, tcFractionOf, tcIntOf, parseTcSupporterDoc, tcSupporterUrl } from './tcPageInfo.js';

// 2026-11-12 の PC 実測の形(値は差し替え)
const PAGE = `
<head>
  <meta property="og:title" content="TJの生でやらせて！！">
  <meta property="og:description" content="テントレスキャンプ">
</head>
<body>
  <span id="updatetimer" class="tw-player-duration-time" data-started-at="1794398532000" data-live-type="live">5:57:29</span>
  <div id="viewer-counter"><span class="tw-viewer-indicator__number"><span class="tw-fraction">3,485/67462</span></span></div>
  <div id="comment-count"><a title="コメント数 27449"><span>27449</span></a></div>
  <div id="comment-list-app" data-movie-id="842841215" data-broadcaster-name="TJティージェー" data-broadcaster-screen-name="tj_ajianking"
    data-broadcaster-profile-image="https://imagegw02.twitcasting.tv/image3s/pbs.twimg.com/a.jpg" data-account-type="not_logged_in"></div>
</body>`;

describe('ツイキャスのページに出ている数', () => {
  it('現在/累計・コメント数・開始時刻・配信者をそのまま読む', () => {
    document.documentElement.innerHTML = PAGE;
    const r = readTcPageInfo(document, 'tj_ajianking');
    expect(r).toMatchObject({
      title: 'TJの生でやらせて！！',
      telop: 'テントレスキャンプ',
      name: 'TJティージェー',
      iconUrl: 'https://imagegw02.twitcasting.tv/image3s/pbs.twimg.com/a.jpg',
      startedAtMs: 1794398532000,
      liveType: 'live',
      viewers: 3485,
      signedOut: true,
      movieId: '842841215',
      stats: { totalViews: 67462, commentTotal: 27449 },
    });
  });
  it('読めない数は入れない(推定で埋めない)', () => {
    document.documentElement.innerHTML = '<body><div id="viewer-counter"><span class="tw-fraction"></span></div></body>';
    const r = readTcPageInfo(document, 'abc');
    expect(r.viewers).toBeNull();
    expect(r.stats).toEqual({});
    expect(r.signedOut).toBeNull();
    expect(r.startedAtMs).toBe(0);
  });
  it('別の配信者の印なら名前と絵は使わない', () => {
    document.documentElement.innerHTML = PAGE;
    expect(readTcPageInfo(document, 'other').name).toBe('');
  });
  it('数の読み方', () => {
    expect(tcFractionOf('3485/67462')).toEqual({ current: 3485, total: 67462 });
    expect(tcFractionOf('12 / 340')).toEqual({ current: 12, total: 340 });
    expect(tcFractionOf('109.1k')).toBeNull();
    expect(tcIntOf('1,234')).toBe(1234);
    expect(tcIntOf('')).toBeNull();
  });
});

// サポーターランキング(/<user>/supporter)。2026-11-12 PC 実測の形(名前と数は作りもの)。属性は一部シングルクォート
const SUPPORTER = `<div class="tw-supporter-ranking-summary-title">現在のレベル: 85</div>
<section class="tw-top-supporters">
  <div class="tw-top-supporter" data-rank="2"><a class="tw-user-name-icon" data-user-id="g:1234"><img src="https://imagegw02.twitcasting.tv/image3s/b_64.jpg"></a>
    <a class='tw-supporter-user-name' href="/g:1234"><span>にばんめ</span></a>
    <div class="tw-supporter-point-stat" data-type="mp-level" aria-label="現在のレベルのアイテムスコア/累計スコア"><span class="tw-supporter-point-stat-current">98275</span><span class="tw-supporter-point-stat-total">229435</span></div></div>
  <div class="tw-top-supporter" data-rank="1"><a class="tw-user-name-icon" data-user-id="c:first"><img src="https://imagegw02.twitcasting.tv/image3s/a_64.jpg"></a>
    <a class="tw-supporter-user-name" href="/c:first"><span>いちばん</span></a>
    <div class="tw-supporter-point-stat"><span class="tw-supporter-point-stat-current">100400</span><span class="tw-supporter-point-stat-total">142030</span></div></div>
  <div class="tw-top-supporter" data-rank="3" data-is-empty="true"><a class="tw-supporter-user-name"><span>-</span></a>
    <div class="tw-supporter-point-stat"><span class="tw-supporter-point-stat-current">0</span><span class="tw-supporter-point-stat-total">0</span></div></div>
</section>
<section class="tw-supporter-ranking" data-max-digits="2">
  <div class="tw-supporter-row" data-is-you="false"><span class="tw-supporter-number">4</span><a class="tw-user-name-icon" data-user-id="fourth"><img src="https://evil.example/x.jpg"></a>
    <a class="tw-supporter-user-name"><span>よんばん</span></a><div class="tw-supporter-point-stat"><span class="tw-supporter-point-stat-current">56000</span><span class="tw-supporter-point-stat-total">56000</span></div></div>
  <div class="tw-supporter-row"><span class="tw-supporter-number">5</span><a class="tw-supporter-user-name"><span>こわれ</span></a></div>
</section>`;

describe('サポーターランキング', () => {
  it('上位3人と4位からの行を、現在のレベルのアイテムスコアの順位のまま読む', () => {
    const doc = new DOMParser().parseFromString(SUPPORTER, 'text/html');
    const r = parseTcSupporterDoc(doc);
    expect(r.level).toBe(85);
    expect(r.rows).toEqual([
      { rank: 1, name: 'いちばん', xp: 100400, total: 142030, iconUrl: 'https://imagegw02.twitcasting.tv/image3s/a_64.jpg', login: 'c:first' },
      { rank: 2, name: 'にばんめ', xp: 98275, total: 229435, iconUrl: 'https://imagegw02.twitcasting.tv/image3s/b_64.jpg', login: 'g:1234' },
      // 3位の空き枠(data-is-empty)は並べない。よその画像は使わない・数の無い行は捨てる
      { rank: 4, name: 'よんばん', xp: 56000, total: 56000, iconUrl: '', login: 'fourth' },
    ]);
  });
  it('表が無ければ空', () => {
    expect(parseTcSupporterDoc(new DOMParser().parseFromString('<p>開催待ち</p>', 'text/html'))).toEqual({ level: null, rows: [] });
  });
  it('URL', () => {
    expect(tcSupporterUrl('C:Abc')).toBe('https://twitcasting.tv/c:abc/supporter');
    expect(tcSupporterUrl('../x')).toBe('');
  });
});
