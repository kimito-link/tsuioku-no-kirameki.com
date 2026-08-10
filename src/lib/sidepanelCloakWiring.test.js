import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const entrySrc = readFileSync(join(here, '../extension/sidepanel-entry.js'), 'utf8');

/**
 * ★配線テストの掟(このリポで何度も踏んだ穴):
 *   「文字列が在る」だけでは `if (false)` を前置する変異を検知できない。
 *   ここでは【無条件に実行される文】であること・【観測窓が実際に伸びていること】を数で断言する。
 *   ([[wiring-test-mutation-check-2026-08-01]] / [[wiring-test-must-assert-counts-2026-08-04]])
 */
describe('sidepanel 幕(cloak)計器の配線', () => {
  it('summarizeCloakDuration を import して呼んでいる', () => {
    expect(entrySrc).toMatch(
      /import \{ summarizeCloakDuration \} from '\.\.\/lib\/sidepanelCloakDuration\.js';/
    );
    expect(entrySrc).toMatch(/const cloakDuration = summarizeCloakDuration\(_cloakSeries\);/);
  });

  it('★観測窓が居座る黒を測れる長さ(30秒以上)まで伸びている', () => {
    const m = entrySrc.match(/const SAMPLE_AT_MS = \[([\s\S]*?)\];/);
    expect(m).toBeTruthy();
    const nums = String(m[1])
      .split(',')
      .map((s) => Number(String(s).trim()))
      .filter((n) => Number.isFinite(n));
    expect(nums.length).toBeGreaterThanOrEqual(15);
    // 3500ms 打ち切りでは「配信5時間45分経過でも黒い」実機症状を構造的に測れなかった。
    expect(Math.max(...nums)).toBeGreaterThanOrEqual(30000);
    // CSS の自動解除(1500ms)より後を必ず複数点見ている=「CSSで救えたか」を判定できる。
    expect(nums.filter((n) => n > 1500).length).toBeGreaterThanOrEqual(5);
  });

  it('★幕の観測列を積む処理が無条件に実行される(if(false) 前置の変異を弾く)', () => {
    // `if (sample.inner) { _cloakSeries.push({...}) }` の形で、直前に別の条件が
    // 挟まっていないこと(zeroArea の直後に置かれている)まで固定する。
    expect(entrySrc).toMatch(
      /const zeroArea = summarizeZeroAreaWindow\(_sizeSeries\);\n\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*if \(sample\.inner\) \{\n\s*_cloakSeries\.push\(\{/
    );
  });

  it('★速報の1行に幕の継続が混ざる(出力に現れなければ意味がない)', () => {
    // v0.1.1295 で「部品は緑なのに受け渡しが切れて無言で消える」を踏んだ。
    // ([[verify-output-appears-before-shipping-2026-08-09]])
    expect(entrySrc).toMatch(/const cloakNote = cloakDuration\.everCloaked \? ` \/ \$\{cloakDuration\.line\}` : '';/);
    const lineAssigns = entrySrc.match(/\$\{cloakNote\}/g) || [];
    // flashed 側 / 通常側の両方に載っている(片方だけだと症状が出た時ほど消える)
    expect(lineAssigns.length).toBe(2);
  });

  it('storage にも系列を残す(あとから継続時間を再検証できる)', () => {
    expect(entrySrc).toMatch(/cloakDuration,\n\s*cloakSeries: _cloakSeries,/);
  });
});
