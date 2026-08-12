import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1373: 「中身が見えない時間」を判定に配線する。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 実機がこう出した(2026-08-12・ユーザーの黒いパネル)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   サイドパネル自己診断: ✅正常 / ...
 *     ★中身が見えなかった合計=12773ms(幕660ms / シェード12773ms) 主因=初回シェード
 *
 * ★12.7秒も中身が出ていないのに【✅正常】。ユーザーには黒く見えているのに、
 *   計器は「正常」と言い張っていた。
 *
 * ■ なぜ漏れたか
 *   judgeSidepanelBlack は【その瞬間のサンプル】(塗り主・層の色)だけを見る。
 *   合算値(summarizeContentBlindTime)は v0.1.1370 で作ったのに、
 *   ★【判定には配線していなかった】=作っただけで使っていない
 *   ([[unwired-judgement-is-systemic-2026-08-12]] を私がまた踏んだ)。
 *
 * ■ 同じ速報が真因も示していた
 *     更新所要 48820ms / 記録中 2 配信 / 窓0x0の継続=t=1858〜10688ms
 *   ＝2配信同時記録で storage が飽和し、シェードが待つ「データ」が来ない。
 *   シェードの上限(旧10秒・CSS保険15秒)が、そのまま体感の黒時間になっていた。
 *   ★別のスクショでは同じパネルが正常に描けている=「描けない」のではなく
 *     【描けるまで待たされている】。だから上限を短くするのが正しい直し方。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

const panelSrc = read('src/extension/sidepanel-entry.js');
const popupSrc = read('src/extension/popup-entry.js');
const popupHtml = read('extension/popup.html');

describe('★「中身が見えない時間」を異常として判定する', () => {
  it('合算値(blindMs)が閾値を超えたら異常にする', () => {
    expect(panelSrc).toContain('CONTENT_BLIND_ALERT_MS');
    expect(panelSrc).toMatch(/const blindTooLong = blind\.blindMs >= CONTENT_BLIND_ALERT_MS;/);
  });

  it('★ok の判定に含まれている(作っただけで使わない、をしない)', () => {
    expect(panelSrc).toMatch(/const overallOk =[^;]*!blindTooLong/);
  });

  it('★保存する ok と画面に出す ok が同じ値(判定と表示が食い違わない)', () => {
    // 表示・保存の両方が overallOk を使うこと。片方だけだと
    // 「行には異常と書いてあるのに ok=true」という食い違いが再発する。
    expect(panelSrc).toContain('renderSelfDiagOverlay({ ok: overallOk');
    expect(panelSrc).toMatch(/ok: overallOk,/);
  });

  it('cause が「何秒出ていないか」と主因を名指しする', () => {
    expect(panelSrc).toMatch(/中身が\$\{[^}]+\}秒出ていない/);
  });

  it('閾値は人が気づく長さ(200ms)以上・体感の1秒以下ではない', () => {
    const m = panelSrc.match(/const CONTENT_BLIND_ALERT_MS = ([\d_]+);/);
    expect(m).toBeTruthy();
    const ms = Number(String(m[1]).replace(/_/g, ''));
    expect(ms).toBeGreaterThanOrEqual(200);
    expect(ms).toBeLessThanOrEqual(2000);
  });
});

describe('★シェードの上限 — 待たせるほど黒く見える', () => {
  it('JS 側の上限が実機の症状(12.7秒)より十分短い', () => {
    const m = popupSrc.match(/const INLINE_SHADE_DATA_FALLBACK_MS = ([\d_]+);/);
    expect(m).toBeTruthy();
    const ms = Number(String(m[1]).replace(/_/g, ''));
    expect(ms).toBeLessThanOrEqual(3000);
  });

  it('★CSS の最後の保険も短い(ここが長いと体感時間を決めてしまう)', () => {
    /*
     * JS が止まった場合に効く保険。旧 15s は「中身が見えない 12.7秒」を
     * 許す長さだった。JS側(2.5s)より後・ただし体感を壊さない範囲に収める。
     */
    const m = popupHtml.match(/animation: nl-init-shade-css-failsafe (\d+)s/);
    expect(m).toBeTruthy();
    expect(Number(m[1])).toBeLessThanOrEqual(6);
  });

  it('CSS 保険は JS 側の上限より後(先に消えて幕が復活する、を作らない)', () => {
    const js = Number(
      String(popupSrc.match(/const INLINE_SHADE_DATA_FALLBACK_MS = ([\d_]+);/)[1]).replace(/_/g, '')
    );
    const css = Number(popupHtml.match(/animation: nl-init-shade-css-failsafe (\d+)s/)[1]) * 1000;
    expect(css).toBeGreaterThan(js);
  });
});
