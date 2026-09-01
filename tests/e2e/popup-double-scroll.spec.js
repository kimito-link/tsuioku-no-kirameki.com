import { test, expect } from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * ユーザー報告「Chromeのアイコンを押したポップアップでスクロールバーが2つも出る」の再現と検証。
 * 二重スクロールは body / .nl-main / .nl-popup-primary のいずれかが同時に overflow:auto|scroll に
 * なると起きる。ここでは実ユーザー条件（standalone popup, dark skin, データあり）で
 * 「縦方向に scroll 可能な要素が .nl-main 1 つだけ」を保証する。
 */
async function extensionBasePath(context) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const sw = context
      .serviceWorkers()
      .find((w) => w.url().startsWith('chrome-extension://'));
    if (sw) return sw.url().replace(/\/[^/]+$/, '');
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('extension service worker not found');
}

test('standalone popup: body はスクロールせず .nl-main 1本のみがスクロールする', async ({
  context
}) => {
  const base = await extensionBasePath(context);
  const popupUrl = `${base}/popup.html`;
  const sw = context
    .serviceWorkers()
    .find((w) => w.url().startsWith('chrome-extension://'));
  if (sw) {
    await sw.evaluate(
      async (watchUrl) => {
        await chrome.storage.local.set({
          nls_recording_enabled: true,
          nls_usage_terms_ack_ver: 1,
          // ★nls_last_watch_url は popup-layout.spec.js に倣って投入しているが、
          //   単体では active watch 状態を保証しない（下のコメント参照）。
          nls_last_watch_url: watchUrl
        });
      },
      MOCK_WATCH
    );
  }
  // ★データ入り状態（応援ランキング・記録件数など content が埋まった状態）で
  //   double-scroll を再現するには、popup を開く前に active な watch タブが
  //   必要。無いと popup 側は「配信中のタブが見つからない」と判定して
  //   empty state（nl-empty-state / nl-empty-no-history）に倒れ、
  //   html.nl-popup-window:not(.nl-empty-state) 系の CSS（.nl-main を
  //   flex 化して残余高を割り当てる規則）が丸ごと無効化されたまま
  //   実データを描画することになり、意図しない高さで溢れる
  //   （実測・2026-09-01: .nl-main が display:block のまま 855px の
  //   コンテンツを描画し、3回の popup 側修正では直らなかった。真因は
  //   このテストの watch タブ不足だった）。他の active watch 系 spec
  //   （popup-layout.spec.js 等）と同じく、先に watch タブを開いてから
  //   popup を開く。
  //
  //   ★2026-09-01 追加調査（未解決）: watch タブを開いても、standalone popup
  //   window 内部の chrome.tabs.query({active:true, currentWindow:true}) は
  //   popup 自身を currentWindow とみなすため必ず popup 自身の URL を返し、
  //   pickWatchUrlFromMultipleSources の優先順位 1（activeTab）はヒットしない。
  //   優先順位 3（storage の nls_last_watch_url）でも解決できるが、
  //   popup-entry.js の treatAsNoActiveWatch 判定はソースが 'storage' /
  //   'dataBacked' の場合を意図的に「実質アクティブでない」扱いにする設計
  //   （他タブの記録を誤ってアクティブ表示しないため）。つまりこのテストが
  //   意図する「standalone popup window で active watch の実データ」は、
  //   実際の OS レベルのウィンドウフォーカス（優先順位 2、
  //   lastFocusedNormalActiveTab）が正しく解決される場合にしか成立せず、
  //   Playwright 環境でそれを確実に再現できるかは未検証。詳細は
  //   _docs/CI-e2e-9-failures-investigation-2026-09-01.md の
  //   「popup-double-scroll: 追加調査で判明したこと」節（原因C）を参照。
  const watch = await context.newPage();
  await watch.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });

  // ★page.goto()で直接開くだけだと、chrome.windows.getCurrent()のtypeが'popup'に
  //   ならず、popup-entry.jsのnl-popup-windowクラス付与ロジック(win.type!=='popup'で
  //   early return)が発火しない。すると html:not(.nl-inline) の580pxキャップが
  //   外れないまま実データを描画し、コンテンツが580pxを超えて二重スクロールになる
  //   （実測・CI/ローカル両方で再現・2026-09-01）。実際のstandalone windowの起動
  //   経路(chrome.windows.create({type:'popup'}))を通す（popup-window-empty-history-real.spec.js
  //   と同じパターン）。
  if (!sw) throw new Error('service worker not found');
  await sw.evaluate(
    async (url) => {
      await chrome.windows.create({
        url,
        type: 'popup',
        width: 420,
        height: 780,
        focused: false
      });
    },
    popupUrl
  );

  let page;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    page = context.pages().find((p) => p.url() === popupUrl);
    if (page) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!page) throw new Error('standalone popup page was not created');

  await page.waitForSelector('#nlPopupPrimary', { timeout: 20_000 });
  // ★nl-popup-windowクラスはchrome.windows.getCurrent()の非同期解決を待って
  //   付与される（popup-entry.js:15243-15267）。固定スリープだけに頼ると、
  //   クラス付与前に計測してCSSの580pxキャップが外れていない状態を拾う
  //   （実測・2026-09-01）。クラス自体の付与を明示的に待つ。
  await page.waitForFunction(
    () => document.documentElement.classList.contains('nl-popup-window'),
    { timeout: 20_000 }
  );
  // 描画完了マーカー（popup-window-empty-history-real.spec.jsと同じ確認軸）
  await expect(
    page.locator('html[data-nl-popup-content-painted="1"]')
  ).toBeAttached({ timeout: 15_000 });
  // cloak auto-reveal の完全終了（750ms 以上）を待つ
  await page.waitForTimeout(1200);

  const report = await page.evaluate(() => {
    const scrollable = [];
    /** 閉じた <details> の中は「ユーザーには見えないので実スクロールバーは描画されない」として
     * 数え上げから除外する。textarea / pre などの native 要素は別軸として扱う。 */
    function walk(node) {
      if (!(node instanceof globalThis.Element)) return;
      if (
        node.tagName === 'DETAILS' &&
        /** @type {HTMLDetailsElement} */ (node).open === false
      ) {
        return;
      }
      const st = globalThis.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const visible =
        st.display !== 'none' &&
        st.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0;
      const scrollsY =
        visible &&
        (st.overflowY === 'auto' || st.overflowY === 'scroll') &&
        node.scrollHeight > node.clientHeight + 1;
      if (scrollsY) {
        scrollable.push({
          tag: node.tagName,
          id: node.id || null,
          cls: node.className || null,
          clientH: node.clientHeight,
          scrollH: node.scrollHeight,
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        });
      }
      for (const child of node.children) walk(child);
    }
    walk(globalThis.document.body);
    const html = globalThis.document.documentElement;
    const body = globalThis.document.body;
    return {
      scrollable,
      htmlOverflowY: globalThis.getComputedStyle(html).overflowY,
      bodyOverflowY: globalThis.getComputedStyle(body).overflowY,
      htmlScrollExceed: html.scrollHeight > html.clientHeight + 1,
      bodyScrollExceed: body.scrollHeight > body.clientHeight + 1,
      innerHeight: globalThis.innerHeight,
      htmlClientH: html.clientHeight,
      bodyClientH: body.clientHeight,
      htmlScrollH: html.scrollHeight,
      bodyScrollH: body.scrollHeight
    };
  });

  // 診断情報をテスト失敗時に出すため attach
  test.info().annotations.push({
    type: 'scroll-report',
    description: JSON.stringify(report)
  });

  // body と html は絶対にスクロールしてはいけない（Chrome ポップアップ枠の外側バー防止）
  expect(
    report.bodyScrollExceed,
    `body が溢れている: scrollH=${report.bodyScrollH} clientH=${report.bodyClientH}`
  ).toBe(false);
  expect(
    report.htmlScrollExceed,
    `html が溢れている: scrollH=${report.htmlScrollH} clientH=${report.htmlClientH}`
  ).toBe(false);
  expect(report.bodyOverflowY).toBe('hidden');
  expect(report.htmlOverflowY).toBe('hidden');

  // 縦方向に実際にスクロールしている要素は多くても 1 つ（.nl-main を想定）
  expect(
    report.scrollable.length,
    `縦スクロール要素が複数ある: ${JSON.stringify(report.scrollable)}`
  ).toBeLessThanOrEqual(1);
});

test('standalone popup: nl-popup-settings のコントラストが AA 以上', async ({
  context
}) => {
  const base = await extensionBasePath(context);
  const page = await context.newPage();
  await page.goto(`${base}/popup.html`, {
    waitUntil: 'load',
    timeout: 30_000
  });
  await page.waitForSelector('.nl-popup-settings__summary', { timeout: 20_000 });
  await page.waitForTimeout(1200);

  const metrics = await page.evaluate(() => {
    const sum = globalThis.document.querySelector('.nl-popup-settings__summary');
    if (!sum) return null;
    const st = globalThis.getComputedStyle(sum);
    const box = sum.closest('.nl-popup-settings');
    const boxBg = box ? globalThis.getComputedStyle(box).backgroundColor : null;
    const root = globalThis.document.documentElement;
    const isDarkSkin = root.classList.contains('nl-skin-panel-dark');
    /** @param {string} css */
    function cssColorToRgb(css) {
      const canvas = globalThis.document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    }
    return {
      color: st.color,
      textRgb: cssColorToRgb(st.color),
      summaryBg: st.backgroundColor,
      containerBg: boxBg,
      fontSize: st.fontSize,
      fontWeight: st.fontWeight,
      isDarkSkin
    };
  });
  expect(metrics, 'summary が見える').not.toBeNull();
  test.info().annotations.push({
    type: 'contrast-metrics',
    description: JSON.stringify(metrics)
  });

  /*
   * WCAG relative luminance による簡易コントラスト計算。
   * font-weight: 700 + font-size ~12-14 は "large text" ではないので AA = 4.5:1 要求。
   */
  const parseRgb = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = '1'] = m[1].split(',').map((x) => Number(x.trim()));
    return { r, g, b, a: Number(a) };
  };
  const relLum = ({ r, g, b }) => {
    const chan = (c) => {
      const cs = c / 255;
      return cs <= 0.03928 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  };
  const blend = (over, under) => {
    const a = over.a;
    return {
      r: over.r * a + under.r * (1 - a),
      g: over.g * a + under.g * (1 - a),
      b: over.b * a + under.b * (1 - a)
    };
  };
  const text =
    metrics.textRgb ||
    (() => {
      const m = String(metrics.color).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = '1'] = m[1].split(',').map((x) => Number(x.trim()));
      return { r, g, b, a: Number(a) };
    })();
  expect(text, `テキスト色を取得できない: ${metrics.color}`).not.toBeNull();
  const sumBg = parseRgb(metrics.summaryBg);
  const boxBg = parseRgb(metrics.containerBg);
  /* standalone は 0.1.51 以降ライト固定のため nl-skin-panel-dark が無い。
     ブレンド下地をテーマに合わせないと輝度計算が破綻する（ratio≈1.3）。 */
  const bodyBase = metrics.isDarkSkin
    ? { r: 10, g: 14, b: 20, a: 1 }
    : { r: 255, g: 250, b: 242, a: 1 };
  const resolvedBg = blend(
    sumBg && sumBg.a > 0 ? sumBg : { r: 0, g: 0, b: 0, a: 0 },
    blend(boxBg || { r: 0, g: 0, b: 0, a: 0 }, bodyBase)
  );
  const l1 = relLum(text);
  const l2 = relLum(resolvedBg);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  test.info().annotations.push({
    type: 'contrast-ratio',
    description: `ratio=${ratio.toFixed(2)} text=${JSON.stringify(text)} bg=${JSON.stringify(resolvedBg)}`
  });
  // AA 4.5:1 を目標。現状 ~3.0 前後なら失敗して regression ガードとして機能する。
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});
