import { test, expect, dismissExtensionUsageTermsGate } from './fixtures.js';

/*
 * v0.1.336: 「上部の『横付き』を押しても何も変わらない（狭ウィンドウ）」誤解の解を実証する。
 *
 * 真因: 横付き(beside) は実効配置が viewport 幅で決まり、約1100px 未満では自動で「下(below)」に
 *   降格する（inlinePanelLayout.effectiveInlinePanelPlacement）。保存値は beside なのに見た目が
 *   下のまま＝「押しても変わらない」。実機 lv350592761 で viewportInnerWidth 1065 < 1100 で発生。
 *
 * 修正: INLINE_MODE（ページ内パネル＝popup.html?inline=1）では window.innerWidth が視聴ページ幅と
 *   一致するので、横付き降格時にヘッダーへ理由を出す（#nlPlacementQuickHint）。広げた瞬間に消える。
 *
 * ここでは popup.html?inline=1 を「狭幅→広幅」で開き直し/リサイズして、
 *   - 狭幅(1000px)で beside 保存時: ヒントが見え、文言に 1100px と「広げ」を含む。
 *   - 広幅(1300px)へリサイズ: ヒントが消える（live 追従）。
 * を実ブラウザで確認する（純関数の単体は inlinePlacementQuickbar.test.js が担保）。
 */

const KEY_PLACEMENT = 'nls_inline_panel_placement';
const HINT_SELECTOR = '#nlPlacementQuickHint';

async function swOf(context) {
  let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('インライン狭ウィンドウで横付き保存時: 降格ヒントが出て、広げると消える', async ({
  context
}) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  // 保存値を横付きにしておく（クイックバーは保存値を読む）。
  await sw.evaluate(async (k) => {
    await chrome.storage.local.set({ [k]: 'beside' });
  }, KEY_PLACEMENT);

  const popup = await context.newPage();
  // 狭幅 < 1100px。INLINE_MODE なので window.innerWidth=視聴ページ幅扱い → beside は below に降格。
  await popup.setViewportSize({ width: 1000, height: 720 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html?inline=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await dismissExtensionUsageTermsGate(popup);
  await popup.waitForTimeout(800);

  const bar = popup.locator('#nlPlacementQuickbar');
  await expect(bar).toBeAttached();

  // 狭幅: 降格ヒントが見える & 文言が行動可能。
  const hint = popup.locator(HINT_SELECTOR);
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('1100px');
  await expect(hint).toContainText('広げ');

  // 現在値ラベルに「横付き」かつ「（今は…で表示中）」の降格注記が出る。
  await expect(popup.locator('#nlPlacementQuickValue')).toContainText('横付き');
  await expect(popup.locator('#nlPlacementQuickValue')).toContainText('今は');

  // 保存値はあくまで beside（ユーザーの選択を尊重）。
  await expect(popup.locator('#nlPlacementQuickBeside')).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  await popup.screenshot({
    path: 'test-results/header-placement-quickbar-narrow-hint.png',
    fullPage: false
  });

  // 広幅へリサイズ → 実効が beside になりヒントが消える（resize 追従, debounce 150ms）。
  await popup.setViewportSize({ width: 1300, height: 720 });
  await expect(hint).toBeHidden({ timeout: 4000 });
  await expect(popup.locator('#nlPlacementQuickValue')).not.toContainText('今は');

  await popup.screenshot({
    path: 'test-results/header-placement-quickbar-wide-nohint.png',
    fullPage: false
  });
});
