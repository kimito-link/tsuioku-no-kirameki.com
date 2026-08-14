/**
 * 症状別判定が【画面に】配線されているかの wiring テスト。
 *
 * ★なぜ要るか(2026-08-14 ユーザー実機)
 *   v0.1.1385 で symptomVerdicts.js を新設したが、import したのは
 *   `aiShareFullText.js`(コピー本文)**だけ**で、`status-entry.js`(画面)からは
 *   一度も呼んでいなかった。ユーザーには「診断の箇所が1つしかない」と見えていて、
 *   その指摘が正しかった。私の「新設した」という報告が画面上は嘘だった。
 *   → [[unwired-judgement-is-systemic-2026-08-12]]
 *
 * ★このテストの契約: **画面側(status-entry.js)が buildSymptomVerdicts を呼ぶこと**。
 *   コピー本文側だけが呼んでいる状態に戻ったら赤にする。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const statusEntry = readFileSync(join(here, 'status-entry.js'), 'utf8');
const aiShare = readFileSync(join(here, '../lib/aiShareFullText.js'), 'utf8');

describe('症状別判定の画面配線', () => {
  it('status-entry.js が symptomVerdicts を import している', () => {
    expect(statusEntry).toMatch(
      /import\s*\{[^}]*buildSymptomVerdicts[^}]*\}\s*from\s*['"]\.\.\/lib\/symptomVerdicts\.js['"]/
    );
  });

  it('★画面の描画関数から実際に呼ばれている(import だけでは配線ではない)', () => {
    // renderHealthCells の中で呼ぶ契約。関数名ごと変わったら気づけるよう両方見る。
    expect(statusEntry).toContain('buildSymptomVerdicts(');
    const calls = statusEntry.match(/buildSymptomVerdicts\(/g) || [];
    // 署名用と描画用の2回(署名に入れないと diff-skip で画面に出ない)。
    expect(calls.length).toBe(2);
  });

  it('★署名(diff-skip キー)に症状別判定が含まれる=変化したら再描画される', () => {
    // これが無いと「セルは同じだが症状別が変わった」paint が捨てられ画面に出ない。
    expect(statusEntry).toMatch(/_symptomSig/);
    expect(statusEntry).toMatch(/\$\{v\.level\}\|\$\{v\.text\}\|\$\{_symptomSig\}\|/);
  });

  it('コピー本文側の配線も維持されている(片方に寄せて他方を落とさない)', () => {
    expect(aiShare).toMatch(/buildSymptomVerdicts/);
  });

  it('画面に出す DOM クラスが status.html の CSS と一致する', () => {
    const html = readFileSync(join(here, '../../extension/status.html'), 'utf8');
    expect(statusEntry).toContain('health-symptom hs-');
    expect(html).toContain('.health-symptom');
    expect(html).toContain('.health-symptom.hs-bad');
    expect(html).toContain('.health-symptom.hs-warn');
  });

  /*
   * ★「サムネが飛んでいる」の正体は【匿名は仕様上サムネが無い】。
   *   その説明文(identityAcquisition.line)も画面に出ていなかったので配線した。
   *   挙動(ゆっくり顔)は正しいので変えない=**直すのは表示ではなく説明**。
   */
  it('本人情報の取得(匿名の説明)が画面に配線されている', () => {
    expect(statusEntry).toContain('identityAcquisition?.line');
    expect(statusEntry).toContain('health-idnote');
    const html = readFileSync(join(here, '../../extension/status.html'), 'utf8');
    expect(html).toContain('.health-idnote');
  });
});
