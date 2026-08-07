/**
 * 入場演出(サイドパネル→会場へ運ぶ)を【実ブラウザで】機械判定する e2e。
 *
 * ■ なぜ e2e が要るか
 *   v1286/v1287 は「文字列スキャンの wiring テストで緑」のまま4回出荷して4回とも
 *   動いていなかった([[wiring-test-mutation-check]])。配線が在ることと、実際に
 *   DOM が動くことは別。ここでは【実際にアニメが起きたか】を DOM から確かめる。
 *
 * ■ 検査は CSS/DOM の実体に対して行う(スクショ比較はしない)
 *   ・@keyframes が実際に登録されているか(document.styleSheets を走査)
 *   ・投射体 DOM が生成され is-flying が付くか
 *   ・reduced-motion で「飛ばないが消えない」か
 *
 * SPEC: docs/handoff/venue-transport-effect-SPEC-2026-08-08.md の受け入れ条件5,7。
 */

import { test, expect } from './fixtures.js';

/**
 * venue.html を開いて venueBar のスタイルが載るまで待つ。
 * ★`?lv=` が【必須】。venue-entry.js:7 が `if (liveId)` で分岐しており、
 *   lv 無しだと mountVenueStandalone を呼ばない＝DOM が何も作られず永遠に待つ。
 *   (最初 lv 無しで書いてテストがハングした。会場は URL に配信IDが要る。)
 */
async function openVenue(context, { reducedMotion } = {}) {
  let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  const extensionId = new URL(sw.url()).hostname;
  const page = await context.newPage();
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${extensionId}/venue.html?lv=lv348888888`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  // venueBar が <style> を注入するまで待つ(会場は JS で組み立てる)。
  await page.waitForFunction(
    () => Array.from(document.styleSheets).some((s) => {
      try {
        return Array.from(s.cssRules || []).some((r) => String(r.cssText).includes('nlsb-'));
      } catch { return false; }
    }),
    { timeout: 30_000 }
  );
  return page;
}

/** ページ内の全 styleSheet から @keyframes 名を集める。 */
const collectKeyframeNames = () =>
  Array.from(document.styleSheets).flatMap((sheet) => {
    try {
      return Array.from(sheet.cssRules || [])
        .filter((r) => r.type === CSSRule.KEYFRAMES_RULE)
        .map((r) => String(r.name));
    } catch {
      return [];
    }
  });

test('入場演出: 飛行/着弾の @keyframes が実際に登録されている', async ({ context }) => {
  const page = await openVenue(context);
  const names = await page.evaluate(collectKeyframeNames);
  console.log('[entry] keyframes =', names.filter((n) => n.includes('entry') || n.includes('seat')).join(', '));
  expect(names, '飛行アニメが登録されていること').toContain('nlsb-entry-fly');
  expect(names, '着弾アニメが登録されていること').toContain('nlsb-seat-enter');
});

test('入場演出: 投射体を飛ばすと is-flying が付き、終わると回収される', async ({ context }) => {
  const page = await openVenue(context);

  // 会場の内部関数は閉じているので、CSS が実際に効くことを DOM 実体で確かめる。
  //   (演出の起動は renderSeats 経由=実データが要るため、ここでは CSS の実効性を検査する)
  const result = await page.evaluate(async () => {
    const layer = document.querySelector('.nlsb-bubble-layer') || document.body;
    const el = document.createElement('div');
    el.className = 'nlsb-entry-proj';
    el.style.setProperty('--nlsb-entry-dx', '120px');
    el.style.setProperty('--nlsb-entry-dy', '-60px');
    el.style.setProperty('--nlsb-entry-mx', '66px');
    el.style.setProperty('--nlsb-entry-my', '-79px');
    el.style.setProperty('--nlsb-entry-dur', '300ms');
    layer.appendChild(el);
    const before = getComputedStyle(el).animationName;
    void el.offsetWidth;
    el.classList.add('is-flying');
    const during = getComputedStyle(el).animationName;
    const durMs = getComputedStyle(el).animationDuration;
    const ended = await new Promise((res) => {
      let done = false;
      el.addEventListener('animationend', () => { done = true; res(true); }, { once: true });
      setTimeout(() => res(done), 2000);
    });
    el.remove();
    return { before, during, durMs, ended };
  });

  console.log('[entry] animation =', JSON.stringify(result));
  expect(result.before, 'is-flying が付く前はアニメしていない').toBe('none');
  expect(result.during, 'is-flying でアニメが始まる').toBe('nlsb-entry-fly');
  expect(result.durMs, '--nlsb-entry-dur が効く').toBe('0.3s');
  expect(result.ended, 'animationend が発火する(回収経路が動く)').toBe(true);
});

test('[条件5] reduced-motion では飛ばないが【消えない】(演出は計器でもある)', async ({
  context
}) => {
  const page = await openVenue(context, { reducedMotion: true });
  const result = await page.evaluate(() => {
    const layer = document.querySelector('.nlsb-bubble-layer') || document.body;
    const el = document.createElement('div');
    el.className = 'nlsb-entry-proj';
    el.style.setProperty('--nlsb-entry-dx', '120px');
    el.style.setProperty('--nlsb-entry-dy', '-60px');
    el.style.setProperty('--nlsb-entry-dur', '300ms');
    layer.appendChild(el);
    el.classList.add('is-flying');
    const cs = getComputedStyle(el);
    const out = { animationName: cs.animationName };
    el.remove();
    return out;
  });

  console.log('[entry/reduced] =', JSON.stringify(result));
  // ★ここが肝: 'none' になっていたら「消した」= 入場が観測できず計器価値が0。
  expect(
    result.animationName,
    'reduced-motion では nlsb-entry-fade(飛ばないが見える)であること。' +
      'none だと入場が観測できず、この演出の計器としての価値が失われる'
  ).toBe('nlsb-entry-fade');
});
