/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  scrapeOfficialEventBannerFromDom,
  scrapeOfficialEventBalloonFromDom,
  scrapeContributionRankingFromDom,
  scrapeProgramStatisticsMenuFromDom,
  scrapeGiftHistoryFromDom,
  aggregateGiftHistoryByUser,
  scrapeAdRankingMirrorHtml,
  scrapeEventInfoMirrorParts
} from './officialEventBannerDom.js';

describe('scrapeOfficialEventBannerFromDom', () => {
  it('実 niconico DOM (グリーンバナー) から rank / score / title / iconUrl / href を取り出す', () => {
    document.body.innerHTML = `
      <a class="wrapper" href="https://audition.nicovideo.jp/embedded/richview/live?content_id=lv350458677&frontend_id=9">
        <p class="owner-name">あかねこ。さんが参加しています！</p>
        <div class="info">
          <div class="image">
            <img class="thumbnail" src="https://audition.nicovideo.jp/images/thumbnails/abc" alt="クリエイターズギフトスタジオで使える！ギフトのモト争奪戦 2026年5月開催">
          </div>
          <div class="text">
            <div class="name-wrapper">
              <p class="marquee-target">
                <span class="name">クリエイターズギフトスタジオで使える！ギフトのモト争奪戦 2026年5月開催</span>
              </p>
            </div>
            <p class="status">
              <span class="rank-field"> 現在 <strong class="rank-num">2</strong> 位 </span>
              <span class="score"><svg class="score-icon"></svg> 207,835</span>
            </p>
          </div>
        </div>
      </a>`;
    const r = scrapeOfficialEventBannerFromDom(document);
    expect(r).not.toBeNull();
    expect(r.rank).toBe(2);
    expect(r.score).toBe(207835);
    expect(r.title).toBe('クリエイターズギフトスタジオで使える！ギフトのモト争奪戦 2026年5月開催');
    expect(r.iconUrl).toContain('audition.nicovideo.jp/images/thumbnails/abc');
    expect(r.ownerText).toContain('さんが参加しています');
    expect(r.href).toContain('content_id=lv350458677');
  });

  it('該当バナーが無いときは null', () => {
    document.body.innerHTML = '<div class="other">x</div>';
    expect(scrapeOfficialEventBannerFromDom(document)).toBeNull();
  });

  it('「さんが参加しています」を含まない .owner-name は無視', () => {
    document.body.innerHTML = `
      <a class="wrapper">
        <p class="owner-name">違うテキスト</p>
        <span class="rank-num">9</span>
        <span class="score">100</span>
      </a>`;
    expect(scrapeOfficialEventBannerFromDom(document)).toBeNull();
  });

  it('rank 数字以外は null（誤検出回避）', () => {
    document.body.innerHTML = `
      <a class="wrapper">
        <p class="owner-name">配信者さんが参加しています！</p>
        <strong class="rank-num">不明</strong>
        <span class="name">イベント</span>
      </a>`;
    const r = scrapeOfficialEventBannerFromDom(document);
    expect(r).not.toBeNull();
    expect(r.rank).toBeNull();
    expect(r.title).toBe('イベント');
  });
});

describe('scrapeOfficialEventBalloonFromDom', () => {
  it('実 niconico DOM (バルーン) から eventTotalScore / programTotalPoints を取り出す', () => {
    document.body.innerHTML = `
      <div class="balloon">
        <div class="point">
          <table class="point-field">
            <tr>
              <th class="point-title">イベント累計スコア：</th>
              <td class="point-value score-value"><svg></svg> 207,835</td>
            </tr>
            <tr>
              <th class="point-title">番組累計ポイント：</th>
              <td class="point-value">1,740 <small class="point-unit">pt</small></td>
            </tr>
          </table>
        </div>
      </div>`;
    const r = scrapeOfficialEventBalloonFromDom(document);
    expect(r).not.toBeNull();
    expect(r.eventTotalScore).toBe(207835);
    expect(r.programTotalPoints).toBe(1740);
  });

  it('行がひとつしか無くても拾える（部分降臨ケース）', () => {
    document.body.innerHTML = `
      <table class="point-field">
        <tr>
          <th class="point-title">番組累計ポイント：</th>
          <td class="point-value">3,200 pt</td>
        </tr>
      </table>`;
    const r = scrapeOfficialEventBalloonFromDom(document);
    expect(r.eventTotalScore).toBeNull();
    expect(r.programTotalPoints).toBe(3200);
  });

  it('該当無しは null', () => {
    document.body.innerHTML = '<div></div>';
    expect(scrapeOfficialEventBalloonFromDom(document)).toBeNull();
  });
});

describe('scrapeContributionRankingFromDom', () => {
  it('2026-05 実 niconico DOM（content-supporter-section / ul.wrapper > li.item / button.ranker > .name）から rank/name/contribution を取る', () => {
    document.body.innerHTML = `
      <div class="secondary-content-info">
        <div class="content-supporter-section">
          <div class="wrapper">
            <nav class="tabs">
              <button class="tab" aria-selected="true">貢献度ランキング</button>
              <button class="tab" aria-selected="false">広告履歴</button>
            </nav>
            <div class="panel-container">
              <div>
                <ul class="wrapper">
                  <li class="item">
                    <i class="rank"><svg class="rank-icon"></svg></i>
                    <div class="info">
                      <button class="ranker">
                        <span class="name">むんた</span>
                        <span class="honorific"> さん </span>
                        <span class="reward">
                          <i class="body">
                            <span class="thumbnail" style="background-image: url('https://asset2.dlive.nicovideo.jp/abc/screenshot.jpg');"></span>
                          </i>
                        </span>
                      </button>
                      <p class="contribution">15,200 <svg class="contribution-unit"></svg></p>
                    </div>
                  </li>
                  <li class="item">
                    <i class="rank"><svg class="rank-icon"></svg></i>
                    <div class="info">
                      <button class="ranker">
                        <span class="name">ムッシュ村村</span>
                        <span class="honorific"> さん </span>
                      </button>
                      <p class="contribution">9,609 <svg></svg></p>
                    </div>
                  </li>
                  <li class="item">
                    <i class="rank"><svg class="rank-icon"></svg></i>
                    <div class="info">
                      <button class="ranker" disabled>
                        <span class="name">高市早苗</span>
                        <span class="honorific"> さん </span>
                      </button>
                      <p class="contribution">7,061 <svg></svg></p>
                    </div>
                  </li>
                  <li class="item">
                    <i class="rank">4</i>
                    <div class="info">
                      <button class="ranker">
                        <span class="name">な、言うたやろ</span>
                        <span class="honorific"> さん </span>
                      </button>
                      <p class="contribution">5,328 <svg></svg></p>
                    </div>
                  </li>
                  <li class="item">
                    <i class="rank">5</i>
                    <div class="info">
                      <button class="ranker" disabled>
                        <span class="name">あ</span>
                        <span class="honorific"> さん </span>
                      </button>
                      <p class="contribution">3,644 <svg></svg></p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    const rows = scrapeContributionRankingFromDom(document);
    expect(rows).not.toBeNull();
    expect(rows.length).toBe(5);
    expect(rows[0]).toMatchObject({ rank: 1, name: 'むんた', contribution: 15200, isAnonymous: false });
    expect(rows[0].thumbnailUrl).toContain('screenshot.jpg');
    expect(rows[1]).toMatchObject({ rank: 2, name: 'ムッシュ村村', contribution: 9609, isAnonymous: false });
    expect(rows[2]).toMatchObject({ rank: 3, name: '高市早苗', contribution: 7061, isAnonymous: true });
    expect(rows[3]).toMatchObject({ rank: 4, name: 'な、言うたやろ', contribution: 5328, isAnonymous: false });
    expect(rows[4]).toMatchObject({ rank: 5, name: 'あ', contribution: 3644, isAnonymous: true });
  });

  it('実 niconico DOM (貢献度ランキング・旧構造) から rank/name/contribution/thumb を取り出す', () => {
    document.body.innerHTML = `
      <div class="wrapper">
        <h2 class="title">貢献度ランキング</h2>
        <ul class="contribution-ranking-list">
          <li class="ranker">
            <button class="button">
              <p class="rank"><svg class="rank-icon"></svg></p>
              <p class="text">
                <span class="ranker-name">
                  <strong class="ranker-name-value" data-button-disabled="false">なぎ</strong>
                  <small class="honorific">さん</small>
                </span>
                <span class="reward-sticker">
                  <i class="body">
                    <span class="thumbnail" style="background-image: url('https://asset2.dlive.nicovideo.jp/c72b/abc/screenshot.jpg');"></span>
                  </i>
                </span>
              </p>
              <p class="contribution">5,000 <svg></svg></p>
            </button>
          </li>
          <li class="ranker">
            <button class="button">
              <p class="rank"><svg class="rank-icon"></svg></p>
              <p class="text">
                <span class="ranker-name">
                  <strong class="ranker-name-value" data-button-disabled="false">マカロン⚔️♥️</strong>
                  <small class="honorific">さん</small>
                </span>
              </p>
              <p class="contribution">1,505 <svg></svg></p>
            </button>
          </li>
          <li class="ranker">
            <button class="button">
              <p class="rank"><svg class="rank-icon"></svg></p>
              <p class="text">
                <span class="ranker-name">
                  <strong class="ranker-name-value" data-button-disabled="false">おはぎ</strong>
                  <small class="honorific">さん</small>
                </span>
              </p>
              <p class="contribution">915 <svg></svg></p>
            </button>
          </li>
          <li class="ranker">
            <button class="button">
              <p class="rank"><span>4</span></p>
              <p class="text">
                <span class="ranker-name">
                  <strong class="ranker-name-value" data-button-disabled="false">Celica</strong>
                  <small class="honorific">さん</small>
                </span>
              </p>
              <p class="contribution">510 <svg></svg></p>
            </button>
          </li>
          <li class="ranker">
            <button class="button">
              <p class="rank"><span>4</span></p>
              <p class="text">
                <span class="ranker-name">
                  <strong class="ranker-name-value" data-button-disabled="false">ヤタケ</strong>
                  <small class="honorific">さん</small>
                </span>
              </p>
              <p class="contribution">510 <svg></svg></p>
            </button>
          </li>
          <li class="ranker">
            <button class="button" disabled>
              <p class="rank"><span>8</span></p>
              <p class="text">
                <span class="ranker-name">
                  <strong class="ranker-name-value" data-button-disabled="true">名無し</strong>
                  <small class="honorific">さん</small>
                </span>
              </p>
              <p class="contribution">15 <svg></svg></p>
            </button>
          </li>
        </ul>
      </div>`;
    const rows = scrapeContributionRankingFromDom(document);
    expect(rows).not.toBeNull();
    expect(rows.length).toBe(6);
    expect(rows[0]).toMatchObject({ rank: 1, name: 'なぎ', contribution: 5000, isAnonymous: false });
    expect(rows[0].thumbnailUrl).toContain('screenshot.jpg');
    expect(rows[1]).toMatchObject({ rank: 2, name: 'マカロン⚔️♥️', contribution: 1505 });
    expect(rows[2]).toMatchObject({ rank: 3, name: 'おはぎ', contribution: 915 });
    expect(rows[3]).toMatchObject({ rank: 4, name: 'Celica', contribution: 510 });
    expect(rows[4]).toMatchObject({ rank: 4, name: 'ヤタケ', contribution: 510 });
    expect(rows[5]).toMatchObject({ rank: 8, name: '名無し', contribution: 15, isAnonymous: true });
  });

  it('rank 列が span 数字なら index に依存せずそのまま採用', () => {
    document.body.innerHTML = `
      <ul class="contribution-ranking-list">
        <li class="ranker">
          <button>
            <p class="rank"><span>9</span></p>
            <p class="text"><span class="ranker-name"><strong class="ranker-name-value" data-button-disabled="false">x</strong></span></p>
            <p class="contribution">10 <svg></svg></p>
          </button>
        </li>
      </ul>`;
    const rows = scrapeContributionRankingFromDom(document);
    expect(rows).not.toBeNull();
    expect(rows[0].rank).toBe(9);
  });

  it('該当無しは null', () => {
    document.body.innerHTML = '<div></div>';
    expect(scrapeContributionRankingFromDom(document)).toBeNull();
  });
});

describe('scrapeProgramStatisticsMenuFromDom', () => {
  it('実 niconico DOM (program-statistics-menu) から data-value をそのまま整数化', () => {
    document.body.innerHTML = `
      <ul class="___program-statistics-menu___W9_FZ ___program-statistics-menu___IuMeU">
        <li class="___watch-count-item___Vnlru ___watch-count-item___QNXNV ___item___icZda" title="来場者数">
          <span class="___count___TrBVS count" data-value="3266">
            <span class="inner-content">3,266</span>
          </span>
        </li>
        <li class="___comment-count-item___NrQ3E ___comment-count-item___Y9hgA" title="コメント数">
          <span class="count" data-value="1060">
            <span class="inner-content">1,060</span>
          </span>
        </li>
        <li class="___timeshift-reservation-count-item___XAw_K" title="タイムシフト予約数">
          <button class="count" data-value="1" type="button">1</button>
        </li>
        <li class="___nicoad-count-item___AxKxh" title="ニコニ広告ポイント">
          <button class="count" data-value="55800" type="button">55,800</button>
        </li>
        <li class="___gift-count-item___G7gCf" title="ギフトポイント">
          <button class="count" data-value="1770" type="button">1,770</button>
        </li>
      </ul>`;
    const r = scrapeProgramStatisticsMenuFromDom(document);
    expect(r).not.toBeNull();
    expect(r.watchCount).toBe(3266);
    expect(r.commentCount).toBe(1060);
    expect(r.timeshiftReservationCount).toBe(1);
    expect(r.adPoints).toBe(55800);
    expect(r.giftPoints).toBe(1770);
  });

  it('class が部分的に欠けても title だけで識別できる', () => {
    document.body.innerHTML = `
      <ul class="program-statistics-menu">
        <li class="x" title="来場者数"><span class="count" data-value="100"></span></li>
        <li class="x" title="ギフトポイント"><span class="count" data-value="42"></span></li>
      </ul>`;
    const r = scrapeProgramStatisticsMenuFromDom(document);
    expect(r.watchCount).toBe(100);
    expect(r.giftPoints).toBe(42);
    expect(r.adPoints).toBeNull();
  });

  it('data-value が無い行はスキップ（誤って 0 を埋めない）', () => {
    document.body.innerHTML = `
      <ul class="program-statistics-menu">
        <li title="来場者数"><span class="count">--</span></li>
        <li title="コメント数"><span class="count" data-value="55">55</span></li>
      </ul>`;
    const r = scrapeProgramStatisticsMenuFromDom(document);
    expect(r.watchCount).toBeNull();
    expect(r.commentCount).toBe(55);
  });

  it('該当 ul が無ければ null', () => {
    document.body.innerHTML = '<div></div>';
    expect(scrapeProgramStatisticsMenuFromDom(document)).toBeNull();
  });
});

describe('scrapeGiftHistoryFromDom', () => {
  it('実 niconico DOM (履歴タブ) から個別ギフト履歴を取り出す', () => {
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">
          <img class="thumbnail" src="https://x.cdn/stamp.png" alt="８８８８">
          <p class="time">19:58</p>
          <p class="text">
            <span class="advertiser-name">くろかな <small class="honorific">さん</small></span>
          </p>
          <p class="point">30 <small class="point-unit">pt</small></p>
        </li>
        <li class="item">
          <img class="thumbnail" src="https://x.cdn/wakotsu.png" alt="わこつ茶">
          <p class="time">11:13</p>
          <p class="text">
            <span class="advertiser-name">名無し <small class="honorific">さん</small></span>
          </p>
          <p class="point">300 <small class="point-unit">pt</small></p>
        </li>
        <li class="item">
          <img class="thumbnail" src="https://x.cdn/wakotsu.png" alt="わこつ茶">
          <p class="time">07:39</p>
          <p class="text">
            <span class="advertiser-name">ケロ彦 <small class="honorific">さん</small></span>
          </p>
          <p class="point">50 <small class="point-unit">pt</small></p>
        </li>
      </ul>`;
    const r = scrapeGiftHistoryFromDom(document);
    expect(r).not.toBeNull();
    expect(r.length).toBe(3);
    expect(r[0]).toMatchObject({
      time: '19:58',
      advertiserName: 'くろかな',
      isAnonymous: false,
      point: 30,
      giftName: '８８８８'
    });
    expect(r[1]).toMatchObject({
      advertiserName: '名無し',
      isAnonymous: true,
      point: 300
    });
    expect(r[2].advertiserName).toBe('ケロ彦');
  });

  it('「さん」honorific を除いた名前だけ取り出す', () => {
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">
          <p class="text">
            <span class="advertiser-name">つるちゃ͜ん <small class="honorific">さん</small></span>
          </p>
          <p class="point">100 <small class="point-unit">pt</small></p>
        </li>
      </ul>`;
    const r = scrapeGiftHistoryFromDom(document);
    expect(r[0].advertiserName).toBe('つるちゃ͜ん');
    expect(r[0].advertiserName).not.toContain('さん');
  });

  it('ul が無ければ null', () => {
    document.body.innerHTML = '<div></div>';
    expect(scrapeGiftHistoryFromDom(document)).toBeNull();
  });

  it('数値が無いエントリはスキップ', () => {
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">
          <p class="text"><span class="advertiser-name">x <small class="honorific">さん</small></span></p>
          <p class="point">--</p>
        </li>
        <li class="item">
          <p class="text"><span class="advertiser-name">y <small class="honorific">さん</small></span></p>
          <p class="point">42 pt</p>
        </li>
      </ul>`;
    const r = scrapeGiftHistoryFromDom(document);
    expect(r.length).toBe(1);
    expect(r[0].advertiserName).toBe('y');
    expect(r[0].point).toBe(42);
  });
});

describe('aggregateGiftHistoryByUser', () => {
  it('同一ユーザーの複数ギフトを totalPoints で合算', () => {
    const result = aggregateGiftHistoryByUser([
      { time: '00:09', advertiserName: 'つるちゃ͜ん', isAnonymous: false, point: 100, thumbnailUrl: '', giftName: '' },
      { time: '00:12', advertiserName: 'つるちゃ͜ん', isAnonymous: false, point: 100, thumbnailUrl: '', giftName: '' },
      { time: '00:15', advertiserName: 'つるちゃ͜ん', isAnonymous: false, point: 100, thumbnailUrl: '', giftName: '' },
      { time: '11:13', advertiserName: '名無し', isAnonymous: true, point: 300, thumbnailUrl: '', giftName: '' },
      { time: '02:57', advertiserName: '名無し', isAnonymous: true, point: 50, thumbnailUrl: '', giftName: '' }
    ]);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({ name: '名無し', totalPoints: 350, giftCount: 2 });
    expect(result[1]).toMatchObject({ name: 'つるちゃ͜ん', totalPoints: 300, giftCount: 3 });
  });

  it('totalPoints 降順で並ぶ', () => {
    const result = aggregateGiftHistoryByUser([
      { time: '01:00', advertiserName: 'A', isAnonymous: false, point: 100, thumbnailUrl: '', giftName: '' },
      { time: '02:00', advertiserName: 'B', isAnonymous: false, point: 500, thumbnailUrl: '', giftName: '' },
      { time: '03:00', advertiserName: 'C', isAnonymous: false, point: 300, thumbnailUrl: '', giftName: '' }
    ]);
    expect(result.map((r) => r.name)).toEqual(['B', 'C', 'A']);
  });

  it('lastTime は最新（数値比較できる範囲で）', () => {
    const result = aggregateGiftHistoryByUser([
      { time: '01:00', advertiserName: 'A', isAnonymous: false, point: 100, thumbnailUrl: '', giftName: '' },
      { time: '05:00', advertiserName: 'A', isAnonymous: false, point: 100, thumbnailUrl: '', giftName: '' },
      { time: '03:00', advertiserName: 'A', isAnonymous: false, point: 100, thumbnailUrl: '', giftName: '' }
    ]);
    expect(result[0].lastTime).toBe('05:00');
  });

  it('空配列なら空', () => {
    expect(aggregateGiftHistoryByUser([])).toEqual([]);
  });
});

describe('scrapeAdRankingMirrorHtml (v0.1.237)', () => {
  it('content-supporter-section 内の ul.wrapper を outerHTML で返す', () => {
    document.body.innerHTML = `
      <div class="secondary-content-info">
        <div class="content-supporter-section">
          <div class="wrapper">
            <nav class="tabs">
              <button class="tab" aria-selected="true">貢献度ランキング</button>
              <button class="tab" aria-selected="false">広告履歴</button>
            </nav>
            <div class="panel-container">
              <div>
                <ul class="wrapper">
                  <li class="item">
                    <i class="rank">1</i>
                    <div class="info">
                      <button class="ranker"><span class="name">nyanko</span></button>
                      <p class="contribution">45,400 <svg class="contribution-unit"><title>貢</title></svg></p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const html = scrapeAdRankingMirrorHtml(document);
    expect(html).toBeTruthy();
    expect(html).toContain('<ul class="wrapper">');
    expect(html).toContain('class="ranker"');
    expect(html).toContain('nyanko');
    expect(html).toContain('45,400');
    expect(html).toContain('class="contribution-unit"');
  });

  it('content-supporter-section が存在しない時は null を返す', () => {
    document.body.innerHTML = '<div class="something-else"><ul><li>x</li></ul></div>';
    expect(scrapeAdRankingMirrorHtml(document)).toBeNull();
  });

  it('CSS Modules ハッシュ化された class（content-supporter-xxx）でもフォールバックで取れる', () => {
    document.body.innerHTML = `
      <div class="content-supporter-section_AbCdE">
        <ul class="wrapper_FgHiJ">
          <li>x</li>
        </ul>
      </div>
    `;
    const html = scrapeAdRankingMirrorHtml(document);
    expect(html).toBeTruthy();
    expect(html).toMatch(/^<ul/);
  });

  it('null/undefined を渡しても落ちず null を返す', () => {
    expect(scrapeAdRankingMirrorHtml(null)).toBeNull();
    expect(scrapeAdRankingMirrorHtml(undefined)).toBeNull();
  });
});

describe('scrapeEventInfoMirrorParts (v0.1.240)', () => {
  it('実 niconico DOM から scoreHtml + rankHtml を outerHTML で返す', () => {
    document.body.innerHTML = `
      <a class="wrapper" href="https://audition.nicovideo.jp/embedded/richview/live?content_id=lv350458677">
        <p class="owner-name">あかねこ。さんが参加しています！</p>
        <div class="info">
          <div class="text">
            <p class="status">
              <span class="rank-field"> 現在 <strong class="rank-num">2</strong> 位 </span>
              <span class="score"><svg class="score-icon"></svg> 207,835</span>
            </p>
          </div>
        </div>
      </a>
    `;

    const parts = scrapeEventInfoMirrorParts(document);
    expect(parts).not.toBeNull();
    expect(parts.scoreHtml).toContain('class="score"');
    expect(parts.scoreHtml).toContain('207,835');
    expect(parts.scoreHtml).toContain('class="score-icon"');
    expect(parts.rankHtml).toContain('class="rank-field"');
    expect(parts.rankHtml).toContain('現在');
    expect(parts.rankHtml).toContain('class="rank-num"');
    expect(parts.rankHtml).toContain('2');
    expect(parts.rankHtml).toContain('位');
  });

  it('該当バナーが無いときは null', () => {
    document.body.innerHTML = '<div class="other">x</div>';
    expect(scrapeEventInfoMirrorParts(document)).toBeNull();
  });

  it('「さんが参加しています」を含まない .owner-name は無視', () => {
    document.body.innerHTML = `
      <a class="wrapper">
        <p class="owner-name">違うテキスト</p>
        <p class="status">
          <span class="rank-field">現在 <strong class="rank-num">1</strong> 位</span>
          <span class="score">100</span>
        </p>
      </a>
    `;
    expect(scrapeEventInfoMirrorParts(document)).toBeNull();
  });

  it('score だけ取れて rank-field が無い場合は scoreHtml のみ', () => {
    document.body.innerHTML = `
      <a class="wrapper">
        <p class="owner-name">配信者さんが参加しています！</p>
        <p class="status">
          <span class="score"><svg class="score-icon"></svg> 50,000</span>
        </p>
      </a>
    `;
    const parts = scrapeEventInfoMirrorParts(document);
    expect(parts).not.toBeNull();
    expect(parts.scoreHtml).toContain('50,000');
    expect(parts.rankHtml).toBeNull();
  });

  it('rank-field だけ取れて score が無い場合は rankHtml のみ', () => {
    document.body.innerHTML = `
      <a class="wrapper">
        <p class="owner-name">配信者さんが参加しています！</p>
        <p class="status">
          <span class="rank-field">現在 <strong class="rank-num">99</strong> 位</span>
        </p>
      </a>
    `;
    const parts = scrapeEventInfoMirrorParts(document);
    expect(parts).not.toBeNull();
    expect(parts.scoreHtml).toBeNull();
    expect(parts.rankHtml).toContain('99');
  });

  it('wrapper はあるが両 span ともに取れない場合は null', () => {
    document.body.innerHTML = `
      <a class="wrapper">
        <p class="owner-name">配信者さんが参加しています！</p>
        <div class="info"><div class="text"></div></div>
      </a>
    `;
    expect(scrapeEventInfoMirrorParts(document)).toBeNull();
  });

  it('null/undefined を渡しても落ちず null を返す', () => {
    expect(scrapeEventInfoMirrorParts(null)).toBeNull();
    expect(scrapeEventInfoMirrorParts(undefined)).toBeNull();
  });

  it('balloon の score-value (td) と混同しない（バナーの score 側を返す）', () => {
    document.body.innerHTML = `
      <a class="wrapper">
        <p class="owner-name">配信者さんが参加しています！</p>
        <p class="status">
          <span class="rank-field">現在 <strong class="rank-num">3</strong> 位</span>
          <span class="score"><svg class="score-icon"></svg> 12,345</span>
        </p>
      </a>
      <table class="point-field">
        <tr>
          <th class="point-title">イベント累計スコア：</th>
          <td class="point-value score-value"><svg></svg> 12,345</td>
        </tr>
      </table>
    `;
    const parts = scrapeEventInfoMirrorParts(document);
    expect(parts).not.toBeNull();
    // バナー内の span.score の outerHTML で td.score-value ではない
    expect(parts.scoreHtml).toMatch(/^<span/);
    expect(parts.scoreHtml).not.toContain('point-value');
  });
});
