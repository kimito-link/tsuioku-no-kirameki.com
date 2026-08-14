/**
 * ★v0.1.1392: 「大きく見せる枠(PICK UP 帯)」の配線テスト。
 *
 * ■ 会議(design 系4体・2026-08-14)の結論をコードに固定する
 *   - 全体 zoom は却下(ユーザー:「ぜんたいじゃなくて」= 情報量を減らさない)
 *   - 帯【だけ】を大きくする。高さと文字を**同じ倍率**で動かす
 *     (文字だけ上げると overflow:hidden で切れる=批判役の指摘。実コードで確認済)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '../../extension/popup.html'), 'utf8');
const entry = readFileSync(join(here, '../extension/popup-entry.js'), 'utf8');
// ★初期化本体は lib 側(popup-entry は max-lines 上限に張り付いているため)。
const boot = readFileSync(join(here, 'bandScaleBoot.js'), 'utf8');

/** コメント行を落として「実際のコード」だけにする。 */
function codeOnly(src) {
  return src
    .split('\n')
    .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l))
    .join('\n');
}

describe('PICK UP 帯の拡大が配線されている', () => {
  it('★高さと文字の【両方】が同じ変数で拡大する(片方だけだと切れる)', () => {
    expect(html).toMatch(/height:\s*calc\(clamp\(32px[^)]*\)\s*\*\s*var\(--nl-band-scale/);
    expect(html).toMatch(/font-size:\s*calc\(clamp\(10\.5px[^)]*\)\s*\*\s*var\(--nl-band-scale/);
  });

  it('既定値が CSS 側にも入っている(JSが動く前から大きい)', () => {
    const m = html.match(/var\(--nl-band-scale,\s*([0-9.]+)\)/g) || [];
    expect(m.length).toBeGreaterThanOrEqual(2);
    for (const x of m) expect(parseFloat(x.match(/([0-9.]+)\)/)[1])).toBeGreaterThan(1);
  });

  it('★popup が boot モジュールを読み込んでいる(読むだけで適用される)', () => {
    expect(entry).toContain("import '../lib/bandScaleBoot.js'");
  });

  it('★storage を待たずに既定を先に当てる(read 待ちだと一瞬小さく出る)', () => {
    expect(boot).toContain('applyBandScale');
    expect(boot).toContain('DEFAULT_BAND_SCALE');
    const iDefault = boot.indexOf('applyBandScale(doc, DEFAULT_BAND_SCALE)');
    const iRead = boot.indexOf('local.get(KEY_BAND_SCALE)');
    expect(iDefault).toBeGreaterThan(0);
    expect(iRead).toBeGreaterThan(iDefault);
  });

  it('★全体 zoom を使っていない(情報量を減らさない=ユーザーが却下した方式)', () => {
    const band = codeOnly(readFileSync(join(here, 'bandScale.js'), 'utf8'));
    expect(band).not.toMatch(/style\.zoom\s*=/);
    expect(band).not.toMatch(/transform:\s*scale/);
  });
});
