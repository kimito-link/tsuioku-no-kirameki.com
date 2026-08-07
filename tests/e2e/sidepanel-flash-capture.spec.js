/**
 * サイドパネル「一瞬だけ真っ黒」を【動画とフレーム列】で捕まえる診断用 spec。
 *
 * ■ なぜ必要か
 *   この症状は settled state を測ると【必ず正常(クリーム)】に見える。
 *   実際 v0.1.1289 の調査では computed style を 5 点サンプルしても再現しなかった。
 *   黒はロード直後の数十 ms しか出ない＝【最初のフレームを見るしかない】。
 *   → [[video-beats-instruments-for-flicker-2026-08-04]] と同じ結論。
 *
 * ■ storageState 相当の考え方（playwright-headless-recording スキルの型）
 *   このターゲットは Web アプリではなく拡張なので、ログイン Cookie ではなく
 *   【chrome.storage.local の実データ】が "認証済み状態" にあたる。
 *   空の storage だと空状態(軽い描画)に倒れて重い経路を通らず、フラッシュが出ない。
 *   そこで .auth/panel-state.json を読んで storage に流し込んでから開く。
 *   ★保存先を test-results/ の【外】にするのはスキルのハマりどころ①のとおり
 *     （Playwright が実行開始時に test-results/ を空にするため）。
 *
 * ■ 使い方
 *   1) 実データを吸い出す（一度だけ・実機の拡張から）:
 *        node scripts/dump-panel-state.mjs > .auth/panel-state.json
 *      無ければ本 spec は内蔵の最小フィクスチャで走る（それでも html/body の
 *      「誰も塗らない窓」は観測できる）。
 *   2) 毎回:
 *        npx playwright test tests/e2e/sidepanel-flash-capture.spec.js --reporter=line
 *
 * ■ 出力
 *   - test-results/.../video.webm   … 動画（webm-to-mp4.mjs で mp4 化できる）
 *   - .artifacts/sidepanel-flash/frames.json … rAF ごとの塗り状態
 *   - .artifacts/sidepanel-flash/frame-*.png … 最初の数百 ms の連続スクショ
 */

import { test, expect } from './fixtures.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const AUTH_STATE = path.join(repoRoot, '.auth', 'panel-state.json');
const OUT_DIR = path.join(repoRoot, '.artifacts', 'sidepanel-flash');

/** 実データが無いときの最小フィクスチャ（重い描画経路に入れるだけの最低限）。 */
const FALLBACK_STATE = {
  nls_inline_panel_autoshow_enabled: true,
  nls_panel_dock_mode: 'side_panel'
};

test('サイドパネル: 最初の数百msを1フレームずつ記録して黒フラッシュを捕まえる', async ({
  context
}) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // --- service worker を掴む -------------------------------------------------
  let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  const extensionId = new URL(sw.url()).hostname;

  // --- storageState 相当を流し込む ------------------------------------------
  let seeded = FALLBACK_STATE;
  let seededFrom = 'fallback(内蔵最小フィクスチャ)';
  if (fs.existsSync(AUTH_STATE)) {
    try {
      seeded = JSON.parse(fs.readFileSync(AUTH_STATE, 'utf8'));
      seededFrom = `.auth/panel-state.json (${Object.keys(seeded).length} keys)`;
    } catch (e) {
      console.log('[warn] panel-state.json を読めなかったので fallback を使う:', e.message);
    }
  }
  console.log('[seed] storage 投入元 =', seededFrom);
  await sw.evaluate(async (state) => {
    await chrome.storage.local.set(state);
  }, seeded);

  // --- 初回ペイントから rAF ごとに塗り状態を記録する -------------------------
  // ★ページ内 script では間に合わない（cloak は静的属性＝HTML パース時点で有効）。
  //   addInitScript は document 生成直後に走るので最初のフレームから拾える。
  const page = await context.newPage();
  await page.setViewportSize({ width: 500, height: 1090 });
  await page.emulateMedia({ colorScheme: 'dark' }); // ★ユーザー環境はダーク（実機スクショで確認）

  await page.addInitScript(() => {
    window.__flashFrames = [];
    const t0 = performance.now();
    const snap = () => {
      try {
        const ifr = document.querySelector('iframe');
        const rec = { t: Math.round(performance.now() - t0) };
        if (!ifr) {
          rec.stage = 'NO_IFRAME';
        } else {
          rec.iframeBg = getComputedStyle(ifr).backgroundColor;
          const d = ifr.contentDocument;
          if (!d || !d.documentElement) {
            rec.stage = 'NO_DOC';
          } else {
            const h = getComputedStyle(d.documentElement);
            rec.cs = h.colorScheme;
            rec.htmlBg = h.backgroundColor;
            rec.htmlPaints = h.backgroundImage !== 'none' || h.backgroundColor !== 'rgba(0, 0, 0, 0)';
            rec.cloak = d.documentElement.getAttribute('data-nl-popup-primary-cloak');
            if (d.body) {
              const b = getComputedStyle(d.body);
              rec.bodyPaints = b.backgroundImage !== 'none' || b.backgroundColor !== 'rgba(0, 0, 0, 0)';
            } else {
              rec.bodyPaints = 'NO_BODY';
            }
            // ★iframe が実文書を commit する前の about:blank を除外する。
            //   about:blank は cloak 属性も自前 CSS も持たない(cs==='normal')ので
            //   「誰も塗らない」に見えるが、これは popup.html ではない＝偽陽性。
            //   親(sidepanel.html)がクリームを塗っているので実際に黒くもならない。
            //   ★ここを入れずに測って一度誤判定した。実文書だけを判定対象にする。
            rec.isRealDoc = d.documentElement.hasAttribute('data-nl-recording');
            rec.NOBODY_PAINTS =
              rec.isRealDoc === true && rec.htmlPaints === false && rec.bodyPaints === false;
          }
        }
        window.__flashFrames.push(rec);
      } catch (e) {
        window.__flashFrames.push({ t: Math.round(performance.now() - t0), err: String(e).slice(0, 80) });
      }
      if (performance.now() - t0 < 3000) requestAnimationFrame(snap);
    };
    requestAnimationFrame(snap);
  });

  const panelUrl = `chrome-extension://${extensionId}/sidepanel.html?lv=lv348888888`;
  await page.goto(panelUrl, { waitUntil: 'commit', timeout: 45_000 });

  // 最初の 600ms を細かくスクショ（黒はこの窓にしか出ない）
  for (let i = 0; i < 8; i += 1) {
    await page.screenshot({ path: path.join(OUT_DIR, `frame-${String(i).padStart(2, '0')}.png`) });
    await page.waitForTimeout(60);
  }

  await page.waitForTimeout(2600);
  const frames = await page.evaluate(() => window.__flashFrames || []);
  fs.writeFileSync(path.join(OUT_DIR, 'frames.json'), JSON.stringify(frames, null, 2));

  // --- 判定: 「誰も塗らないフレーム」が1つでもあれば黒フラッシュの窓がある -----
  const unpainted = frames.filter((f) => f.NOBODY_PAINTS === true);
  const darkScheme = frames.filter((f) => f.cs === 'light dark');
  console.log(`[result] 全 ${frames.length} フレーム`);
  console.log(`[result] 誰も塗らないフレーム = ${unpainted.length}`);
  if (unpainted.length) {
    console.log('[result] 窓 =', unpainted[0].t, 'ms 〜', unpainted[unpainted.length - 1].t, 'ms');
    console.log('[result] 先頭サンプル =', JSON.stringify(unpainted[0]));
  }
  console.log(`[result] color-scheme が 'light dark' のフレーム = ${darkScheme.length}`);

  expect(frames.length, 'フレームが取れていること(取れないなら計器の失敗)').toBeGreaterThan(10);

  // ★この2本が「黒フラッシュが起こりうる」ことの機械的な証拠。
  //   直っていれば 0 になる。直っていなければ件数と時間窓が出る。
  expect(
    unpainted.length,
    `html も body も塗らないフレームが ${unpainted.length} 個ある` +
      `（=ダーク時にキャンバス既定色の黒が見える窓）`
  ).toBe(0);
  expect(
    darkScheme.length,
    `color-scheme='light dark' のフレームが ${darkScheme.length} 個ある` +
      `（このアプリは light 固定のはず／sidepanel.html:29 参照）`
  ).toBe(0);
});

/*
 * ★会場モード(venue.html)は【黒が正しい】。
 *   venueBar.js:2231-2232「スタンドアロン時は背景を黒系に塗り、映像セーフエリアを確保」
 *   = OBS 配信で映像に載せるための意図的な黒。明るくしてはいけない。
 *
 *   なので会場に問うべきは「暗いかどうか」ではなく
 *   【誰も塗っていない瞬間が無いか】= 意図した黒(#0a0b0c)か、塗り忘れの地か。
 *   ★最初この test を「暗い地=NG」で書いて 115 フレーム赤にしたが、それは
 *     仕様の読み違えだった。計器は仕様を確認してから書く。
 */
test('会場モード: 起動直後に「誰も塗らない」瞬間が無いこと(黒自体は正しい)', async ({ context }) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  const extensionId = new URL(sw.url()).hostname;

  const page = await context.newPage();
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark' });

  await page.addInitScript(() => {
    window.__venueFrames = [];
    const t0 = performance.now();
    const isDark = (c) => {
      const m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) return false;
      const a = m[4] === undefined ? 1 : +m[4];
      return a > 0.5 && 0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3] < 80;
    };
    const snap = () => {
      try {
        const h = document.documentElement ? getComputedStyle(document.documentElement) : null;
        const b = document.body ? getComputedStyle(document.body) : null;
        window.__venueFrames.push({
          t: Math.round(performance.now() - t0),
          cs: h ? h.colorScheme : null,
          htmlDark: h ? isDark(h.backgroundColor) : null,
          bodyDark: b ? isDark(b.backgroundColor) : null,
          bodyBg: b ? b.backgroundColor : null
        });
      } catch { /* 計器の失敗は本体を止めない */ }
      if (performance.now() - t0 < 2000) requestAnimationFrame(snap);
    };
    requestAnimationFrame(snap);
  });

  await page.goto(`chrome-extension://${extensionId}/venue.html`, {
    waitUntil: 'commit',
    timeout: 45_000
  });
  await page.waitForTimeout(2200);
  const frames = await page.evaluate(() => window.__venueFrames || []);
  fs.writeFileSync(path.join(OUT_DIR, 'venue-frames.json'), JSON.stringify(frames, null, 2));

  // 会場の黒(#0a0b0c=rgb(10,11,12))は【正しい】。塗っていない透明だけを異常とする。
  const unpainted = frames.filter((f) => f.bodyBg === 'rgba(0, 0, 0, 0)');
  const intended = frames.filter((f) => f.bodyBg === 'rgb(10, 11, 12)');
  console.log(
    `[venue] 全 ${frames.length} フレーム / 意図した黒 = ${intended.length} / 誰も塗らない = ${unpainted.length}`
  );
  if (unpainted.length) console.log('[venue] 塗り忘れ先頭 =', JSON.stringify(unpainted[0]));

  expect(frames.length, 'フレームが取れていること').toBeGreaterThan(5);
  expect(
    unpainted.length,
    `会場で body が透明なフレームが ${unpainted.length} 個ある` +
      `（意図した黒 #0a0b0c ではなく【塗り忘れ】＝下の層が出る）`
  ).toBe(0);
});
