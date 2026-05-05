/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  scrapeOfficialEventBannerFromDom,
  scrapeOfficialEventBalloonFromDom,
  scrapeContributionRankingFromDom,
  scrapeProgramStatisticsMenuFromDom
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
  it('実 niconico DOM (貢献度ランキング) から rank/name/contribution/thumb を取り出す', () => {
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
