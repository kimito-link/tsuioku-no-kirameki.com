import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVoiceDiagLine, buildVoiceDiagSnapshot, makeInitialVoiceDiag } from './voiceDiag.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// ソースは CRLF 保存(Windows)。行またぎの断言が改行コードで壊れないよう正規化する。
const playerSrc = fs.readFileSync(path.join(here, 'voicePlayer.js'), 'utf8').replace(/\r\n/g, '\n');

/**
 * 計器は「数える」「スナップショットに乗せる」「印字する」の3つが全部繋がって初めて読める。
 * このプロジェクトには printer(statusFastDiagLite)を通し忘れて
 * 「値は貯まるのに永久に読めない」を実際に踏んだ履歴がある([[fastdiag-lite-is-the-printer-subset]])。
 *
 * ここでは文字列スキャンだけに頼らず、**本番モジュールを実importして値が印字まで届くこと**を
 * 端から端まで通して確認する([[integration-test-must-import-real-code]])。
 */
describe('voice synth failure counter wiring', () => {
  it('合成失敗のカウンタが state→snapshot→印字まで通っている(端から端)', () => {
    const diag = makeInitialVoiceDiag();
    // 実配信(lv351072048)で行方不明だった約34件を模す
    diag.synthNullTotal = 34;
    diag.synthNullNearTimeout = 30;
    const snap = buildVoiceDiagSnapshot(diag, Date.now());
    // snapshot に乗っていること(ここが抜けると印字側で永久に0)
    expect(snap.synthNullTotal).toBe(34);
    expect(snap.synthNullNearTimeout).toBe(30);
    // 印字まで届いていること
    const line = buildVoiceDiagLine(snap, Date.now());
    expect(line).toContain('合成失敗34件');
    expect(line).toContain('時間切れ30');
  });

  it('失敗0件なら行を汚さない(静かな計器)', () => {
    const snap = buildVoiceDiagSnapshot(makeInitialVoiceDiag(), Date.now());
    expect(buildVoiceDiagLine(snap, Date.now())).not.toContain('合成失敗');
  });

  it('voicePlayer の !wav 分岐で無条件にカウントしている(握り潰されていない)', () => {
    // 合成失敗(!wav)のときだけ数える。無効化/世代替わり/OBSは別事由なので混ぜない。
    expect(playerSrc).toMatch(/if\s*\(!wav\)\s*\{\s*\n\s*this\.diag\.synthNullTotal\s*\+=\s*1;/);
  });

  it('時間切れ判定は本番の純関数を呼んでいる(手書きコピーでない)', () => {
    expect(playerSrc).toContain("import { classifyVoiceSynthNull } from './voiceSynthFailure.js';");
    expect(playerSrc).toMatch(
      /classifyVoiceSynthNull\(\{\s*synthMs:\s*this\.diag\.lastSynthMs\s*\}\)/
    );
  });

  it('カウントは同じ分岐内の drop 通知より前にある(早期 continue で飛ばされない)', () => {
    const idx = playerSrc.indexOf('this.diag.synthNullTotal += 1;');
    expect(idx).toBeGreaterThanOrEqual(0);
    // _notifyDropped は5箇所ある。この分岐(合成失敗)のものだけを対象にする。
    const notifyIdx = playerSrc.indexOf('合成失敗/無効化で鳴らず', idx);
    expect(notifyIdx).toBeGreaterThan(idx);
    // 間に continue が挟まっていない(挟まると数える前に抜ける)
    const between = playerSrc.slice(idx, notifyIdx);
    expect(between).not.toContain('continue;');
  });
});
