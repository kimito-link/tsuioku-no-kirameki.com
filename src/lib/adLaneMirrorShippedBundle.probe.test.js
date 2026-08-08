import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * ★v0.1.1297: 広告レーンの鏡publish取りこぼしを【出荷バンドルを実行して】実測する。
 *
 * 配線テスト(adLaneMirrorPublishNotSkipped.wiring.test.js)は src の【並び順】を固定するが、
 * 「実際に走らせたら鏡へ何件積まれるか」までは断言しない。ここは実機 lv351133074 と同じ状態
 * (bundle行なし / 鏡HTMLあり / nicoad API 直読み3件)で関数を【実行】し、鏡に3件届くことを測る。
 *
 * ■ 再現した実機の症状(2026-08-08 21:37 の状態速報)
 *     🔴 北極星 広告: 拡張 apiRows=3 / 鏡 0 (鏡が空なのに拡張に3件=鏡publishの取りこぼし)
 *   修正前の同一ハーネス実行 = publish 0回・鏡0件(症状を完全再現)
 *   修正後                   = publish 1回・鏡3件
 *
 * ■ なぜ dist を読むか
 *   ここで守りたいのは「ユーザーの Chrome で動く物」。src が正しくても build が壊れていれば
 *   ユーザーには届かない([[verify-on-shipped-bundle-2026-08-07]])。
 *   ★bundler が変数名を変えることがある(TIERS→TIERS2 の実績)ので、名前ではなく
 *     【実行結果】で判定する。
 */
describe('広告レーン: 出荷バンドルを実行して鏡に積まれる件数を実測', () => {
  const distPath = path.join(root, 'extension/dist/popup.js');

  /** dist から関数本体を切り出す(対応する括弧まで)。 */
  function extractShippedFn() {
    const src = fs.readFileSync(distPath, 'utf8');
    const start = src.indexOf('async function refreshNorthStarAdRankingLane');
    if (start < 0) return '';
    let depth = 0;
    for (let j = src.indexOf('{', start); j < src.length; j++) {
      if (src[j] === '{') depth += 1;
      else if (src[j] === '}') {
        depth -= 1;
        if (depth === 0) return src.slice(start, j + 1);
      }
    }
    return '';
  }

  /** 実機と同じ状態で出荷バンドルの関数を走らせ、publish された内容を返す。 */
  async function runShippedAdLane() {
    const fnSrc = extractShippedFn();
    const LID = 'lv351133074';
    const API_ROWS = [
      { rank: 1, name: '広告主A', contribution: 300, thumbnailUrl: 'https://x/a.jpg' },
      { rank: 2, name: '広告主B', contribution: 200, thumbnailUrl: 'https://x/b.jpg' },
      { rank: 3, name: '広告主C', contribution: 100, thumbnailUrl: 'https://x/c.jpg' }
    ];
    const published = [];
    const rendered = [];

    class FakeEl {
      constructor() { this.classList = { add() {}, remove() {} }; }
      querySelector() { return null; }
    }
    const scope = {
      HTMLElement: FakeEl,
      document: { getElementById: () => new FakeEl() },
      chrome: {
        storage: {
          local: {
            get: async (keys) => {
              const k = Array.isArray(keys) ? keys[0] : keys;
              if (String(k) === `nls_nicoad_api_ranking_${LID}`) {
                return { [k]: { liveId: LID, rows: API_ROWS, capturedAt: Date.now() } };
              }
              return {};
            }
          }
        }
      },
      // ★実機状態: bundle に広告【行】は無いが 鏡HTML は取れている
      //   =修正前はここで return し、API の3件へ到達しなかった。
      _lastOfficialEventDomBundle: {
        capturedAt: Date.now(),
        adContributionRanking: null,
        adRankingMirrorHtml: '<div class="ad-mirror">広告HTML</div>',
        programStats: { adPoints: 0 }
      },
      watchMetaCache: { snapshot: { officialAdPointsNdgr: 0 } },
      watchPopupLastPaintedLiveId: LID,
      publishNorthStarMirror: (input) => { published.push(input); },
      renderNorthStarLane: (lane, html, state) => { rendered.push({ lane, html, state }); },
      paintTopSupportRankStyleIntoElement: () => {},
      officialDomRankingRowsToStripRooms: (rows) => rows,
      trackAdAdvertiserCountForCelebration: () => {},
      buildNorthStarAdRankingStatsHtml: () => '',
      formatCardFreshnessNote: () => '',
      determineNorthStarLaneState: () => 'ok'
    };
    const names = Object.keys(scope);
    // eslint-disable-next-line no-new-func
    const factory = new Function(...names, `${fnSrc}; return refreshNorthStarAdRankingLane;`);
    await factory(...names.map((n) => scope[n]))(LID);
    return { published, rendered, API_ROWS, LID };
  }

  it('出荷バンドルに広告レーン関数が入っている(前提)', () => {
    expect(fs.existsSync(distPath)).toBe(true);
    expect(extractShippedFn().length).toBeGreaterThan(500);
  });

  it('★鏡HTMLが有っても、API直読みの3件が鏡へ積まれる(実機🔴の再現条件)', async () => {
    const { published, LID } = await runShippedAdLane();
    expect(published.length).toBe(1);
    expect(published[0].liveId).toBe(LID);
    expect(published[0].adRanking).toHaveLength(3);
  });

  it('★鏡HTML経路で早期returnしていない(描画だけして運搬を飛ばさない)', async () => {
    const { published, rendered } = await runShippedAdLane();
    // 修正前はここが published=0 / rendered=1(mirrorHtml) だった。
    expect(published.length).toBeGreaterThan(0);
    expect(rendered.filter((r) => typeof r.html === 'string' && r.html.includes('ad-mirror'))).toHaveLength(0);
  });

  it('★積まれた行は中身も保たれている(件数だけ合わせて空にしない)', async () => {
    const { published } = await runShippedAdLane();
    const rows = published[0].adRanking;
    expect(rows.map((r) => r.contribution)).toEqual([300, 200, 100]);
  });
});
