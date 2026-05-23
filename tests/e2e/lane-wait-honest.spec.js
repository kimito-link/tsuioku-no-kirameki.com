import { test, expect, dismissExtensionUsageTermsGate } from './fixtures.js';

/*
 * v0.1.332: 待機UIの正直化を実ブラウザ（実拡張バンドル）で実証する。
 *
 * rescue-link 配信（koken/DOM/iframe 3経路とも永久に空）で iframe_unrendered の
 * 待機UIが永久に出続け「固まった」印象を与える真因3への対処。閾値（50s）を超えても
 * 取得できないとき、待機メッセージを「公式の貢献度一覧が取得できないようです（配信者側の
 * 設定によります）」へ単方向遷移させる。
 *
 * 50s 経過を実時間で待つのは非現実的なので、popup ページ（chrome-extension:// origin）で
 * 拡張バンドルの純関数を dynamic import し、実ブラウザの JS エンジンで elapsedMs を
 * 与えて検証する＝「拡張に同梱されたコードが実ブラウザで設計どおり動く」実証。
 */

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('待機UI正直化: 拡張バンドルの純関数が閾値超で確定文言へ単方向遷移する', async ({
  context
}) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await dismissExtensionUsageTermsGate(popup);

  // 拡張バンドル（実ブラウザにロード済み）から純関数を dynamic import して検証。
  const result = await popup.evaluate(async (extId) => {
    const mod = await import(
      `chrome-extension://${extId}/src/lib/northStarLaneWaitingUi.js`
    );
    const TH = mod.NORTH_STAR_WAIT_HONEST_THRESHOLD_MS;
    return {
      threshold: TH,
      // 省略時（後方互換）
      footnoteOmitted: mod.getNorthStarWaitFootnote('contributionRanking', 'iframe_unrendered'),
      // 閾値未満
      footnoteBelow: mod.getNorthStarWaitFootnote(
        'contributionRanking',
        'iframe_unrendered',
        TH - 1
      ),
      // 閾値超
      footnoteOver: mod.getNorthStarWaitFootnote(
        'contributionRanking',
        'iframe_unrendered',
        TH + 1
      ),
      rotationOverLen: mod.getNorthStarWaitRotationMessages(
        'contributionRanking',
        'iframe_unrendered',
        TH + 1
      ).length,
      rotationOverLine: mod.getNorthStarWaitRotationMessages(
        'contributionRanking',
        'iframe_unrendered',
        TH + 1
      )[0].line,
      // not_yet には出さない
      footnoteNotYetOver: mod.getNorthStarWaitFootnote('contributionRanking', 'not_yet', TH + 1)
    };
  }, extensionId);

  console.log('lane-wait-honest result:', JSON.stringify(result));

  // 閾値は設計範囲
  expect(result.threshold).toBeGreaterThanOrEqual(45_000);
  expect(result.threshold).toBeLessThanOrEqual(60_000);

  // 後方互換: 省略時=現行文言（「まだ開いていない」）
  expect(result.footnoteOmitted).toContain('まだ開いていない');
  // 閾値未満も現行文言
  expect(result.footnoteBelow).toContain('まだ開いていない');

  // 閾値超で確定文言へ遷移（取得できない・配信者側の設定）
  expect(result.footnoteOver).toContain('取得できない');
  expect(result.footnoteOver).toContain('配信者側の設定');
  // 数値は出さない（field6 silence）
  expect(result.footnoteOver).not.toMatch(/\d/);

  // rotation は確定時 1 件のみ（ちかちか防止）
  expect(result.rotationOverLen).toBe(1);
  expect(result.rotationOverLine).toContain('出ないみたい');

  // not_yet（起動直後）には確定文言を出さない
  expect(result.footnoteNotYetOver).toContain('待っています');
});
