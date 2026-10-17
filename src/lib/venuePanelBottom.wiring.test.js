import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 一覧/発言/状態パネルが会場ヘッダーのボタンを覆わないこと(v0.1.1653・設計 docs/handoff/venue-layout-3decisions-DESIGN-2026-10-17.md の v2)。
 *   実測(修正前): パネルは top:8% から max-height:72vh=画面の80%まで伸び、画面の下半分にある会場ヘッダーを覆った。
 *   表示幅 420/640 でヘッダーの6ボタン全部、1280 で4/6が押せなかった(実配信・高さ 720/900/1000)。
 *   → パネルの最大の高さを「下端が会場の箱の最大上端より上」になる計算にする。top と bottom を両方指定すると中身が少なくても
 *     枠いっぱいに伸びるため、max-height で表す。--nlsb-venue-max-h は stage に注入する(パネルは stage の子)。
 *   外側クリックで閉じる処理は自分の開閉ボタンを除外する(ヘッダーが押せるようになると、開いている状態でボタンを押す→
 *   キャプチャで閉じる→ボタンで再び開く=閉じられない、が顕在化するため)。
 *   レイアウトの実測は実ブラウザでしかできない(別途 headless で 5 格子を前後比較済み)ので、再発させない規則だけを固定する。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/venueBar.js'), 'utf8').replace(/\r\n/g, '\n');

/** @param {string} selectorLine */
const ruleBody = (selectorLine) => {
  const a = src.indexOf(selectorLine);
  expect(a, `${selectorLine} が見つからない`).toBeGreaterThan(0);
  return src.slice(a, src.indexOf('\n  }\n', a));
};

describe('パネルの最大の高さは、会場の箱の上端より上に収まる', () => {
  const body = ruleBody('  .nlsb-roster-panel {');

  it('★max-height は 92vh − 箱の最大高 − 88px(最低160px)', () => {
    expect(body).toContain('max-height: max(160px, calc(92vh - var(--nlsb-venue-max-h, 48vh) - 88px));');
  });

  it('★旧 max-height:72vh に戻っていない', () => {
    expect(body).not.toContain('max-height: 72vh');
  });

  it('★bottom を指定していない(top と両方指定すると中身が少なくても枠いっぱいに伸びる)', () => {
    expect(body).not.toMatch(/\n\s+bottom:/);
  });

  it('★会場の箱(seating)の最大高も同じ変数(両者が同じ基準)', () => {
    expect(src).toContain('max-height: var(--nlsb-venue-max-h, 48vh);');
  });
});

describe('--nlsb-venue-max-h の注入先は stage(パネルから見える)', () => {
  it('★stage に注入し、seating の inline には書かない(正本1つ)', () => {
    expect(src).toContain("stage.style.setProperty(\n      '--nlsb-venue-max-h',");
    expect(src).not.toContain('seatingHostEl');
    expect(src.split("'--nlsb-venue-max-h',").length - 1).toBe(1);
  });
});

describe('外側クリックで閉じる処理は、自分の開閉ボタンを除外する', () => {
  it('★一覧: rosterBtn を除外', () => {
    const a = src.indexOf('const onRosterOutsideClick = (event) =>');
    const body = src.slice(a, src.indexOf('};', a));
    expect(a).toBeGreaterThan(0);
    expect(body).toContain('rosterBtn.contains(target)');
  });

  it('★状態: diagBtn を除外', () => {
    const a = src.indexOf('const onDiagOutsideClick = (event) =>');
    const body = src.slice(a, src.indexOf('};', a));
    expect(a).toBeGreaterThan(0);
    expect(body).toContain('diagBtn.contains(target)');
  });

  it('★add/remove は従来どおり document のキャプチャ(true)・stage には付けない', () => {
    for (const nm of ['Roster', 'Diag']) {
      expect(src).toContain(`document.addEventListener('click', on${nm}OutsideClick, true)`);
      expect(src).toContain(`document.removeEventListener('click', on${nm}OutsideClick, true)`);
    }
  });
});
