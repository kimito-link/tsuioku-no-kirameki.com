/**
 * ★v0.1.1449: コアの storage read が【1本の get】であり続けることを固定する。
 *
 * ■ 実測で確定した真因(2026-08-19・27MB の実ブラウザ・交互3回)
 *     単一キー get 909ms / 全件(152キー) 1,456ms   ← キー数152倍でも1.6倍
 *     単一キー5回【直列】17,040ms / 同5キー【1本】391ms ← 43倍
 *     直列6発行 27,049ms vs 一括1発行 4,649ms(5.8倍)
 *   ＝**get の発行回数**が支配的。直列に戻す変異が最悪の退化なので、数で固定する。
 *
 * ★このリポの禁止事項(いずれも実害の実績あり)
 *   - Promise.all で並列化 … v0.1.867 で timeout 多発→空表示→撤回
 *   - 読むキーを減らす     … 上の実測どおり効かない
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractFnBody } from '../../tests/helpers/wiringTestSource.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
/** ★CRLF 正規化は必須(2026-08-18 に同じ罠で別の検査が丸ごと死んでいた)。 */
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

const entrySrc = read('src/extension/status-entry.js');

/** コメント行を落として「実際に動くコード」だけにする。 */
const codeOnly = (src) =>
  src.split('\n').filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');

describe('コアreadの一括化の配線', () => {
  const bodyStart = entrySrc.indexOf('async function refresh(opts = {}) {');
  const body = extractFnBody(
    entrySrc.slice(bodyStart + 'async function refresh(opts = {})'.length),
    ' {'
  );
  const bodyCode = codeOnly(body);

  it('★(0) refresh 本体の切り出しに成功している(空振りで全断言が素通りするのを殺す)', () => {
    expect(body).not.toBe('');
    expect(body.length).toBeGreaterThan(2000);
  });

  it('★(1) コアの storage read は【1本】だけ(直列に戻したら赤)', () => {
    // ここが2以上になった＝発行回数が増えた＝実測27秒コースへ逆戻り。
    expect(bodyCode.match(/_coreBatchGuard\.read\(/g) || []).toHaveLength(1);
  });

  it('★(2) 撤去した個別ガードが復活していない(定義も呼び出しも)', () => {
    // 定義だけ残すと次の人が使ってしまい、静かに直列へ戻る。
    for (const g of ['_summariesGuard', '_fastDiagGuard', '_popupDiagGuard', '_backfillGuard']) {
      expect(codeOnly(entrySrc), `${g} が復活している`).not.toContain(g);
    }
  });

  it('★(3) コア経路で Promise.all を使っていない(v0.1.867 の空表示を再発させない)', () => {
    // 並列化は「発行回数を減らす」ことにならず、timeout 多発で空表示になる。
    expect(bodyCode).not.toMatch(/Promise\.all\(\s*\[[^\]]*Guard\./);
  });

  it('★(4) 1本の get にまとめる純関数を通っている', () => {
    expect(entrySrc).toMatch(
      /import \{ buildCoreBatchKeys, pickCoreBatchValues \} from '\.\.\/lib\/statusCoreBatch\.js';/
    );
    expect(bodyCode).toContain('pickCoreBatchValues(coreRes.value, lvList)');
    // 実際の get も1箇所だけ(loadCoreBatchSafe の中)。
    expect(codeOnly(entrySrc).match(/chrome\.storage\.local\.get\(buildCoreBatchKeys\(/g) || [])
      .toHaveLength(1);
  });

  it('★(5) 鮮度表示(staleNote)の材料に一括readの結果が入っている', () => {
    // coreReads から外すと「古い値を新品として出す」静かな事故になる。
    expect(bodyCode).toMatch(/const coreReads = \[lvRes, coreRes\];/);
  });

  it('★(6) popupDiag の間引きは残っている(袋の中でも鮮度の宣言は生きる)', () => {
    expect(bodyCode).toContain("shouldReadNow('popupDiag'");
    // 間引いた回に出す前回値の置き場。
    expect(bodyCode).toContain('_lastPopupDiag');
  });
});
