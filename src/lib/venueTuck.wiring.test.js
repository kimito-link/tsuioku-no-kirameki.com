import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 会場の「しまう/戻す」(tuck・v0.1.1654・設計 docs/handoff/venue-layout-3decisions-DESIGN-2026-10-17.md の v3)。
 *   実測(修正前): ニコ生のコメント入力欄はページ上の固定位置、会場の箱は画面の下端に固定=ウィンドウの高さ×表示幅で覆われる
 *   (実配信 9格子のうち 900x720・900x900・1280x900・900x1000・1280x1000 の5つで入力欄の中心が会場に当たった)。
 *   会場を閉じて(✕)開き直すと DOM と集計を捨てて再描画になる(clearDisplay)ので、コメントを打つたびに閉じるのは重い。
 *   → 会場を閉じずに、箱だけ一時的に隠す(visibility)。右下の既存トグルを「▲ 会場に戻る」として再表示。集計・DOM・席順は保持。
 *   入力欄の置換/複製はしない(ニコ生ページ側の DOM)。入力欄の位置を製品内で測らない(ニコ生のセレクタ依存を持ち込まない)=常設ボタン。
 *   hidden 属性は使わない(v0.1.1650 の安全網で display:none になり、席の幅の計算が変わる)。Esc の連鎖には足さない(入力中の Esc を奪わない)。
 *   クロージャ内なので実行時テストは書けない=文字列スキャンで固定(実測は実ブラウザで 9 格子を前後比較済み)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/venueBar.js'), 'utf8').replace(/\r\n/g, '\n');

/** @param {string} startMarker @param {string} endMarker */
const slice = (startMarker, endMarker) => {
  const a = src.indexOf(startMarker);
  expect(a, `${startMarker} が見つからない`).toBeGreaterThan(0);
  const b = src.indexOf(endMarker, a);
  expect(b, `${endMarker} が見つからない`).toBeGreaterThan(a);
  return src.slice(a, b);
};

describe('CSS: しまう中は箱だけ隠し、トグルのピルを出す', () => {
  it('★しまう中の stage は visibility:hidden・pointer-events:none(下のページを通す)', () => {
    const a = src.indexOf('  .nlsb-root.nlsb-is-open.nlsb-is-tucked .nlsb-stage {');
    expect(a).toBeGreaterThan(0);
    const body = src.slice(a, src.indexOf('\n  }\n', a));
    expect(body).toContain('visibility: hidden;');
    expect(body).toContain('pointer-events: none;');
  });

  it('★しまう中だけトグル(ピル)を出す: html.nlsb-venue-open の display:none を詳細度で上回る(新しい html クラスは作らない)', () => {
    const a = src.indexOf('  html.nlsb-venue-open .nlsb-root.nlsb-is-tucked .nlsb-toggle {');
    expect(a).toBeGreaterThan(0);
    const body = src.slice(a, src.indexOf('\n  }\n', a));
    expect(body).toContain('display: inline-block;');
    expect(src).not.toContain('nlsb-venue-tucked');
  });

  it('★通常時のトグルは従来どおり開いている間は隠す(既存の契約)', () => {
    const a = src.indexOf('  html.nlsb-venue-open .nlsb-toggle {');
    expect(a).toBeGreaterThan(0);
    expect(src.slice(a, src.indexOf('\n  }\n', a))).toContain('display: none;');
  });
});

describe('JS: setTucked とボタン・トグルの配線', () => {
  it('★状態と setTucked があり、hidden 属性を使わない', () => {
    expect(src).toContain('let tucked = false;');
    const body = slice('const setTucked = (next) =>', 'const setOpen = (nextOpen, persist) =>');
    expect(body).toContain("root.classList.toggle('nlsb-is-tucked', tucked)");
    expect(body).not.toMatch(/\.hidden\s*=/);
    expect(body).not.toContain("setAttribute('hidden'");
  });

  it('★しまうとき、開いているパネルとホバーカードを閉じる(入力中に残らない)', () => {
    const body = slice('const setTucked = (next) =>', 'const setOpen = (nextOpen, persist) =>');
    expect(body).toContain('closeSpeechPanel()');
    expect(body).toContain('toggleRosterPanel(false)');
    expect(body).toContain('toggleDiagPanel(false)');
    expect(body).toContain('closeHoverCard()');
  });

  it('★ヘッダーに「しまう」ボタン(別窓の会場には出さない)', () => {
    expect(src).toContain("tuckBtn.textContent = '✍ しまう';");
    const a = src.indexOf('let tuckBtn = null;');
    expect(a).toBeGreaterThan(0);
    expect(src.slice(a, a + 400)).toContain('if (!isStandalone) {');
    expect(src).toContain('headerRight.append(...(tuckBtn ? [tuckBtn] : []), rosterBtn,');
  });

  it('★トグルを押したとき、しまい中なら戻す(会場の開閉より優先)', () => {
    const body = slice("toggle.addEventListener('click', () => {", "close.addEventListener('click'");
    const tuckAt = body.indexOf('if (tucked)');
    const setOpenAt = body.indexOf('setOpen(');
    expect(tuckAt).toBeGreaterThan(-1);
    expect(setOpenAt).toBeGreaterThan(tuckAt);
    expect(body).toContain('setTucked(false)');
  });

  it('★会場を閉じるとき、しまい状態も解除する(開き直しは必ず通常状態から)', () => {
    const body = slice('const setOpen = (nextOpen, persist) =>', "toggle.addEventListener('click', () => {");
    expect(body).toContain('setTucked(false)');
  });

  it('★Esc: 入力中(変換中・会場外の入力欄)は何もしない。その後の「しまい中」だけ戻す(v0.1.1657 で方針を明確化)', () => {
    const body = slice('const onEscapeKey = (event) =>', 'const addEscapeListener');
    // 入力中の Esc は奪わない=ガードが tucked の判定より前にある。
    expect(body.indexOf('isEditableOutsideVenue(event.target)')).toBeGreaterThan(0);
    expect(body.indexOf('isEditableOutsideVenue(event.target)')).toBeLessThan(body.indexOf('if (tucked)'));
    // しまい中の Esc は会場を閉じず戻すだけ(閉じると記録の表示が捨てられる)。
    expect(body).toContain('setTucked(false)');
  });
});
