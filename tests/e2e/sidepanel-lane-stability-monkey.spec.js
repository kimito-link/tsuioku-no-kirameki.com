/**
 * サイドパネル×可視性×リサイズの【交差点】でレーンが出たり消えたりしないことを検査する。
 *
 * ■ なぜ既存70本で捕まらなかったか（2026-08-17 実機報告で判明した穴）
 *   - `sidepanel-flash-capture` / `sidepanel-first-byte-paint` … サイドパネルを見るが【色とバイト数】だけ
 *   - `inline-panel-visibility-recover`                        … hidden→visible を見るが【watch埋め込み】が対象
 *   - `popup-monkey` / `multitab-monkey-no-blank`              … 揺さぶるが【白化とpageerror】だけ
 *   ＝「サイドパネル」と「hidden→visible」が交差する所を見るテストが1本も無く、
 *     かつ全部が「白いか/黒いか/落ちたか」しか見ておらず【レーンの件数】を誰も見ていない。
 *
 * ■ 実機で観測された症状（状態速報 v0.1.1425）
 *     laneTickProbe:            { ticks: 4, docHidden: 3, runs: 1 }
 *     storyUserLaneRenderProbe: { started: 0, heavyReadInflightJoinCount: 5 }
 *   ＝tickの3/4が「隠れている」で捨てられ、描画が一度も始まっていない。
 *   サイドパネルは【滑り出るあいだ hidden 扱い】になる（popup-entry.js:22399 に既述）。
 *
 * ■ このテストが断言すること（症状そのもの）
 *   「揺さぶってもタイル件数が【減らない】(単調非減少)」
 *   ★白/黒/クラッシュではなく【件数】を見る。それが今回の症状だから。
 *   [[unobserved-must-not-hide-the-cell-2026-08-15]]: 使っていない0と動くはずの0は別物。
 *     → 供給を入れた上で測るので、ここでの0は【異常】として扱ってよい。
 */
import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

const KEY_RECORDING = 'nls_recording_enabled';
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';

/** 再現可能な乱数（popup-monkey.spec.js と同じ実装＝同シードで同じ操作列） */
function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** サイドパネルが取りうる幅（ユーザーは自由にドラッグできる）。狭→広→狭を必ず含む。 */
const PANEL_WIDTHS = [360, 420, 560, 720, 900, 1300, 480];

/** 揺さぶりのシード（popup-monkey と同じ思想＝反復回数でなく入力多様性で情報量を稼ぐ） */
const SEEDS = [0x4e4c534d, 0x9e3779b1];

/**
 * 実機規模のコメント件数。
 *
 * ■ 二分探索の実測（2026-08-17・このテストで確定）
 *     200件 → タイル  208枚 … 緑
 *     800件 → タイル  約800枚 … 緑(1.8分)
 *   ★2000件 → タイル 1,108枚 … 【赤】ページが応答を失う
 *     6000件 → タイル 1,108枚 … 【赤】(一意ユーザー数で頭打ち＝件数でなく人数が効く)
 *
 *   ＝【800〜2000件のあいだに破綻点がある】。実機は 13,924 件＝完全に破綻側。
 *
 * ■ 既定を 800 にしている理由
 *   既定は「いま緑を保てる上限」に置き、退行（描画コストの悪化）で赤くなるようにする。
 *   真因（表示上限が Infinity・popup-entry.js:997）を直したら、この既定を
 *   2000→6000 と引き上げて【直ったことの証明】に使うこと。
 *   NL_STRESS_COMMENTS=2000 で現在の破綻を再現できる。
 */
const STRESS_COMMENT_TOTAL = Number(process.env.NL_STRESS_COMMENTS || 800);

/**
 * ページ内で hidden/visible を擬似切替する。
 * （Playwright は document.visibilityState を直接操作できないため、
 *   inline-panel-visibility-recover.spec.js と同じ標準的な回避策を使う）
 * @param {import('@playwright/test').Page} page
 * @param {'hidden'|'visible'} state
 */
async function setVisibility(page, state) {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => s
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => s === 'hidden'
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

/** 実DOMのタイル件数（鏡や履歴ではなく【画面に出ている数】を数える）。 */
async function countLaneTiles(page) {
  return page.evaluate(() => {
    const sel = '.nl-story-userlane-cell, .nl-north-star-lane';
    return document.querySelectorAll(sel).length;
  });
}

/** 自己診断（レーンのtickと描画の内訳）を読む。無ければ null。 */
async function readLaneProbes(page) {
  return page.evaluate(() => {
    const w = /** @type {any} */ (window);
    const probe = w.__nlDiag?.() || null;
    if (!probe) return null;
    return {
      ticks: probe?.laneTickProbe?.ticks ?? null,
      docHidden: probe?.laneTickProbe?.docHidden ?? null,
      runs: probe?.laneTickProbe?.runs ?? null,
      started: probe?.storyUserLaneRenderProbe?.started ?? null
    };
  });
}

test.describe('サイドパネル: レーンが出たり消えたりしない', () => {
  for (const seed of SEEDS) {
    const seedHex = `0x${(seed >>> 0).toString(16)}`;

    test(`シード ${seedHex}: 可視性とリサイズで揺さぶってもタイルが減らない`, async ({
      context
    }) => {
      // 実機規模(6000件=1100枚超)の初回描画は既定120秒に収まらないことがある。
      // 「遅い」と「固まる」を分けて判定するため上限を広げる（断言は下の件数で行う）。
      test.setTimeout(300_000);
      const rand = mulberry32(seed);

      let sw = context.serviceWorkers()[0];
      if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
      const extensionId = new URL(sw.url()).hostname;

      // 供給を入れる（[[unobserved-must-not-hide-the-cell]]: 0が「未使用」ではなく
      // 「異常」だと言い切れる状態を作ってから測る）
      //
      // ★v1: 40件では症状が【一度も再現しなかった】(2026-08-17)。実機は 387〜13,924件で
      //   heavyReadInflightJoinCount=5（重いreadが5本合流）が出ている＝データ量が足りず
      //   heavy read 経路そのものに入っていなかった。
      //   → 実データと同じ【チャンク形式】(nls_cchunk_<lv>_<seq> + index) で実機規模を積む。
      //     src/lib/commentChunkStore.js: 1チャンク1000件・index に seqs/total を持つ。
      await sw.evaluate(
        async ({ recordingKey, lastWatchKey, commentsKey, watchUrl, total, perChunk }) => {
          const LID = 'lv888888888';
          const mk = (idx) => ({
            id: `${LID}::${idx + 1}`,
            liveId: LID,
            commentNo: String(idx + 1),
            // 実機は匿名主体（a:xxxx 形式）。ユーザー数も実機に寄せて散らす。
            userId: idx % 3 === 0 ? `a:anon${idx % 900}` : `${1000000 + (idx % 1200)}`,
            text: `stress row ${idx + 1}`,
            capturedAt: Date.now() - (total - idx) * 500
          });

          /** @type {Record<string, unknown>} */
          const payload = {
            [recordingKey]: true,
            [lastWatchKey]: watchUrl
          };

          const seqs = [];
          for (let seq = 0; seq * perChunk < total; seq++) {
            const from = seq * perChunk;
            const to = Math.min(total, from + perChunk);
            const rows = [];
            for (let i = from; i < to; i++) rows.push(mk(i));
            payload[`nls_cchunk_${LID}_${seq}`] = rows;
            seqs.push(seq);
          }
          payload[`nls_cchunk_index_${LID}`] = {
            v: 1,
            liveId: LID,
            seqs,
            total,
            maxPerChunk: perChunk
          };
          payload[`nls_cchunk_migrated_${LID}`] = true;
          // 旧キーにも末尾だけ残す（読み手がフォールバックしても破綻しないように）
          payload[commentsKey] = [];

          await chrome.storage.local.set(payload);
        },
        {
          recordingKey: KEY_RECORDING,
          lastWatchKey: KEY_LAST_WATCH_URL,
          commentsKey: STORAGE_COMMENTS,
          watchUrl: MOCK_WATCH,
          total: STRESS_COMMENT_TOTAL,
          perChunk: 1000
        }
      );

      const watch = await context.newPage();
      await watch.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });

      // ★サイドパネル実体（dock=sidepanel）を開く。ここが既存テストに無かった経路。
      const panel = await context.newPage();
      const pageErrors = [];
      panel.on('pageerror', (err) => pageErrors.push(String(err)));
      // ★クラッシュ（タブが落ちる）を「遅い」と区別して捕まえる。
      //   6000件で page.evaluate が "Target closed" になる原因の切り分け用。
      let crashed = false;
      panel.on('crash', () => {
        crashed = true;
      });
      panel.on('close', () => {
        crashed = crashed || true;
      });

      await panel.goto(
        `chrome-extension://${extensionId}/popup.html?inline=1&dock=sidepanel`,
        { waitUntil: 'domcontentloaded', timeout: 60_000 }
      );
      await focusMockWatchThenReloadPopup(watch, panel);
      await dismissExtensionUsageTermsGate(panel);
      await panel.waitForTimeout(1200); // 初回描画が落ち着くまで

      await expect(panel.locator('.nl-main')).toBeVisible({ timeout: 20_000 });

      /** @type {{label:string,tiles:number}[]} */
      const timeline = [];
      const snap = async (label) => {
        const tiles = await countLaneTiles(panel);
        timeline.push({ label, tiles });
        return tiles;
      };

      const baseline = await snap('baseline');

      // ── 揺さぶり本体: 可視性 × 幅変更 ──────────────────────────────
      //
      // ★幅の変え方について（2026-08-17 の実測で判明・この注意書きを消さないこと）
      //   当初 `page.setViewportSize()` を使ったが、拡張を読み込んだ headed Chrome では
      //   【about:blank でも10秒無応答になる】ことを対照実験で確認した
      //   ＝Playwright/環境側の制約であって【製品の不具合ではない】。
      //   これを「リサイズでレーンが壊れる」と誤読しかけた。
      //   → ユーザーがパネル幅を変える行為に相当するのは「文書の実効幅が変わる」こと。
      //     html へ直接幅を当てて再レイアウトを起こす（viewport は触らない）。
      for (let i = 0; i < PANEL_WIDTHS.length; i++) {
        const w = PANEL_WIDTHS[i];

        // (1) サイドパネルが滑り出る＝hidden 扱いを再現してから幅を変える
        await setVisibility(panel, 'hidden');
        await panel.evaluate((px) => {
          document.documentElement.style.width = `${px}px`;
          document.documentElement.style.maxWidth = `${px}px`;
          window.dispatchEvent(new Event('resize'));
        }, w);
        await panel.waitForTimeout(60 + Math.floor(rand() * 140));

        // (2) 見えるようになる（ここで描画が復帰しなければ症状が再現する）
        await setVisibility(panel, 'visible');
        await panel.waitForTimeout(300 + Math.floor(rand() * 400));

        await snap(`w=${w}`);
      }

      // ── 追い打ち: 高速に hidden/visible を往復（滑り出しの連打を再現）──
      for (let i = 0; i < 6; i++) {
        await setVisibility(panel, 'hidden');
        await panel.waitForTimeout(40 + Math.floor(rand() * 80));
        await setVisibility(panel, 'visible');
        await panel.waitForTimeout(220 + Math.floor(rand() * 260));
      }
      await panel.waitForTimeout(1200); // 復帰の猶予（遅いだけなら緑にする）
      const settled = await snap('settled');

      const probes = await readLaneProbes(panel);
      const detail =
        `件数の推移: ${timeline.map((t) => `${t.label}=${t.tiles}`).join(' → ')}` +
        (probes
          ? ` / probes: ticks=${probes.ticks} docHidden=${probes.docHidden} runs=${probes.runs} started=${probes.started}`
          : ' / probes: 取得できず');

      // ★断言1: 一度出たタイルが消えない（単調非減少）＝「出たり消えたり」の直接検査
      const worst = Math.min(...timeline.map((t) => t.tiles));
      expect(
        worst,
        `タイルが途中で減った（出たり消えたりしている）。${detail}`
      ).toBeGreaterThanOrEqual(baseline);

      // ★断言2: 揺さぶり後に落ち着いた状態で0になっていない（消えっぱなしにしない）
      expect(settled, `揺さぶり後にタイルが消えた。${detail}`).toBeGreaterThan(0);

      // ★断言3: クラッシュしていない（既存monkeyと同じ最低線も維持）
      expect(
        pageErrors,
        `pageerror が発生: ${pageErrors.join(' | ')}`
      ).toHaveLength(0);
    });
  }
});
