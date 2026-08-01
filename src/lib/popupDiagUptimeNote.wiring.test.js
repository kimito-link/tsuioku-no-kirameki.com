import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// ソースは CRLF 保存(Windows)。行またぎの断言が改行コードで壊れないよう正規化する。
const src = fs.readFileSync(path.join(here, 'aiShareFullText.js'), 'utf8').replace(/\r\n/g, '\n');

/**
 * 計器は printer まで通さないと「値は貯まるのに永久に読めない」(既知の地雷)。
 * この注記は開発者(Claude)自身の誤読を止めるためのものなので、
 * 印字への配線が無条件に実行されることまで機械で見張る。
 *
 * ★変異で実効性を確認済み: 呼び出しに if(false) を前置 → 赤。
 */
describe('popup diag uptime note wiring (aiShareFullText.js)', () => {
  it('buildPopupDiagUptimeNote が import されている', () => {
    expect(src).toContain("import { buildPopupDiagUptimeNote } from './popupDiagUptimeNote.js';");
  });

  it('注記が無条件の代入文で組み立てられる(if(false)等で握り潰されていない)', () => {
    // 代入の左辺と引数の出どころまで固定する。
    expect(src).toMatch(
      /const\s+uptimeNote\s*=\s*buildPopupDiagUptimeNote\(\s*popupDiag\?\.popup\?\.loadShadeProbe\?\.shadeAgeMs\s*\)/
    );
  });

  it('組み立てた注記が実際に出力行へ push されている', () => {
    expect(src).toMatch(/if\s*\(uptimeNote\)\s*lines\.push\(/);
  });

  it('注記は「取得時刻」行の直後に出る(離れた場所に紛れていない)', () => {
    const tsIdx = src.indexOf('lines.push(`取得時刻: ${persistedAt} ${ageStr}`);');
    const noteIdx = src.indexOf('const uptimeNote = buildPopupDiagUptimeNote(');
    expect(tsIdx).toBeGreaterThanOrEqual(0);
    expect(noteIdx).toBeGreaterThan(tsIdx);
    // 間に挟まるのはコメントだけ(300文字以内)＝取得時刻の直後という位置関係を保つ。
    expect(noteIdx - tsIdx).toBeLessThan(400);
  });
});
