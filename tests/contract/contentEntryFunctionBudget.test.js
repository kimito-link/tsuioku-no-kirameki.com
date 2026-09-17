import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const contentEntry = fs
  .readFileSync(path.join(repoRoot, 'src/extension/content-entry.js'), 'utf8')
  .replace(/\r\n/g, '\n');

/**
 * content-entry.js の巨大関数ラチェット(D11)。
 *
 * popup 側 tests/contract/popupEntryFunctionBudget.test.js と同型。
 * 抽出のたびに実測+余裕へ下げる。★増やす方向の編集は禁止。
 *
 * extractFnBody(wiringTestSource) は header 直後の最初の `{` を本体開始とみなす。
 * persistCommentRowsImpl / runNdgrBackfillOnce は `opts = {}` / `ctx = {}` を持つので、
 * その方式だと本文が1行になる。ここだけ引数リストの閉じ `)` の後の `{` から切る。
 *
 * 現況(2026-09-17 実測): 915 / 802 / 574 / 517 / 470 / 440 / 407。上限は実測+30。
 */

/** 抽出のたびに下げる上限(実測+30)。★増やす方向の編集は禁止。 */
const BUDGET = Object.freeze({
  buildGiftDiagnosticsBundle: 945,
  start: 832,
  runNdgrBackfillOnce: 604,
  collectWatchPageSnapshot: 547,
  persistCommentRowsImpl: 500,
  bindContentScriptMessageListener: 470,
  buildAiSharePageDiagnostics: 437
});

const HEADERS = Object.freeze({
  buildGiftDiagnosticsBundle: 'function buildGiftDiagnosticsBundle(',
  start: 'async function start(',
  runNdgrBackfillOnce: 'async function runNdgrBackfillOnce(',
  collectWatchPageSnapshot: 'function collectWatchPageSnapshot(',
  persistCommentRowsImpl: 'async function persistCommentRowsImpl(',
  bindContentScriptMessageListener: 'function bindContentScriptMessageListener(',
  buildAiSharePageDiagnostics: 'function buildAiSharePageDiagnostics('
});

/**
 * 引数リストの `{}` 既定値を本体開始と誤認しない切り出し。
 * @param {string} src
 * @param {string} header
 * @returns {string}
 */
function extractFnBodyAfterParams(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  const openParen = i + header.lastIndexOf('(');
  let depth = 0;
  let closeParen = -1;
  for (let j = openParen; j < src.length; j += 1) {
    if (src[j] === '(') depth += 1;
    else if (src[j] === ')') {
      depth -= 1;
      if (depth === 0) {
        closeParen = j;
        break;
      }
    }
  }
  if (closeParen < 0) return '';
  const bodyBrace = src.indexOf('{', closeParen);
  if (bodyBrace < 0) return '';
  depth = 0;
  for (let j = bodyBrace; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  return '';
}

/** @param {string} header */
function fnLines(header) {
  const body = extractFnBodyAfterParams(contentEntry, header);
  if (!body) throw new Error(`関数本体が取れません: ${header}(名前の変更/削除を疑う)`);
  return body.split('\n').length;
}

describe('content-entry の巨大関数ラチェット(下げる方向のみ)', () => {
  for (const [name, budget] of Object.entries(BUDGET)) {
    it(`${name} は ${budget} 行以下`, () => {
      const n = fnLines(HEADERS[name]);
      expect(n).toBeLessThanOrEqual(budget);
    });
  }

  it('★本体が取れなければ throw する(0行で緑にしない)', () => {
    expect(() => fnLines('async function __noSuchFunction__(')).toThrow(/取れません/);
  });

  it('★上限は実測から離れすぎていない(ラチェットが緩みっぱなしにならない)', () => {
    for (const [name, budget] of Object.entries(BUDGET)) {
      const slack = budget - fnLines(HEADERS[name]);
      expect(slack, name).toBeLessThanOrEqual(200);
    }
  });
});
