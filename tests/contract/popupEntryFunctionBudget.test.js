import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFnBody } from '../helpers/wiringTestSource.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const popupEntry = fs
  .readFileSync(path.join(repoRoot, 'src/extension/popup-entry.js'), 'utf8')
  .replace(/\r\n/g, '\n');

/**
 * ★Phase 2 の効果測定(仕様 Q8)。
 *
 * ■ なぜ「関数の行数」で測るか
 *   ファイル全体の max-lines(eslint.config.js:250)だけだと
 *   【同じファイル内で別の場所へ移しただけ】でも数字が下がってしまい、
 *   「本当に外へ出たか」が分からない。
 *   巨大関数そのものを測れば、中身が外に出たときだけ数字が下がる。
 *
 * ■ 運用(max-lines ラチェットと同じ流儀)
 *   抽出のたびに実測値+余裕へ【下げる】。★上げるのは禁止。
 *   上げたくなったら、それは抽出ではなく肥大なので、変更を見直す。
 *
 * ■ 現況(2026-08-10・v0.1.1305 時点)
 *   initPopup 2,553行 / refresh 1,764行
 *   棚卸し: docs/handoff/giant-entry-split-PHASE2-INVENTORY-2026-08-10.md
 */

/** 抽出のたびに下げる上限(実測+余裕)。★増やす方向の編集は禁止。 */
const BUDGET = Object.freeze({
  initPopup: 2600,
  refresh: 1800
});

/** @param {string} header */
function fnLines(header) {
  const body = extractFnBody(popupEntry, header);
  // ★fail-closed: 取れなかったら 0 を返して緑にしない(関数名の変更を見逃さない)。
  if (!body) throw new Error(`関数本体が取れません: ${header}(名前の変更/削除を疑う)`);
  return body.split('\n').length;
}

describe('popup-entry の巨大関数ラチェット(下げる方向のみ)', () => {
  it(`initPopup は ${BUDGET.initPopup} 行以下`, () => {
    const n = fnLines('async function initPopup()');
    expect(n).toBeLessThanOrEqual(BUDGET.initPopup);
  });

  it(`refresh は ${BUDGET.refresh} 行以下`, () => {
    const n = fnLines('async function refresh()');
    expect(n).toBeLessThanOrEqual(BUDGET.refresh);
  });

  it('★本体が取れなければ throw する(0行で緑にしない)', () => {
    expect(() => fnLines('async function __noSuchFunction__()')).toThrow(/取れません/);
  });

  it('★上限は実測から離れすぎていない(ラチェットが緩みっぱなしにならない)', () => {
    /*
     * 上限だけ大きくして「常に緑」にする抜け道を塞ぐ。
     * 抽出が進んだら BUDGET も下げる、という運用を機械的に督促する。
     */
    const slackInit = BUDGET.initPopup - fnLines('async function initPopup()');
    const slackRefresh = BUDGET.refresh - fnLines('async function refresh()');
    expect(slackInit).toBeLessThanOrEqual(200);
    expect(slackRefresh).toBeLessThanOrEqual(200);
  });
});
