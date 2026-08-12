// cloakFailsafeContract.test.js
// ★幕(cloak)の「CSS の実値」と「計器が名乗る値」を機械で一致させる契約テスト。
//
// ■ なぜ要るか(2026-08-12)
//   状態速報の行は `★CSS自動解除(1500ms)より後=JS解除が遅い` のように
//   CLOAK_CSS_FAILSAFE_MS を**文言に埋め込んで**判定する。
//   ところが実際の遅延は popup.html の animation-delay にあり、両者は別ファイルにある。
//   片方だけ変えると、計器は平然と**嘘の数字**を報告し続ける
//   ([[shared-key-needs-a-consumer-registry]] と同型: 書き手と読み手が別の値を信じる)。
//
//   ★v0.1.1352 でこの値を 1500 → 400 に変えたので、以後ずれないよう固定する。

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLOAK_CSS_FAILSAFE_MS,
  CLOAK_CSS_FADE_MS,
  HUMAN_PERCEPTIBLE_MS,
  summarizeCloakDuration
} from './sidepanelCloakDuration.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const popupHtml = fs.readFileSync(
  path.resolve(__dirname, '../../extension/popup.html'),
  'utf8'
);

describe('幕(cloak)の CSS 実値と計器の名乗りが一致する', () => {
  it('★popup.html の animation-delay = CLOAK_CSS_FAILSAFE_MS', () => {
    const m = popupHtml.match(
      /animation:\s*nl-popup-primary-cloak-auto-reveal\s+(\d+)ms\s+(\d+)ms/
    );
    expect(m, 'cloak の animation 宣言が見つからない(書式が変わった?)').toBeTruthy();
    const durationMs = Number(m[1]);
    const delayMs = Number(m[2]);
    expect(delayMs, 'CSS の遅延と JS 定数がずれている').toBe(CLOAK_CSS_FAILSAFE_MS);
    expect(durationMs, 'CSS の fade 時間と JS 定数がずれている').toBe(CLOAK_CSS_FADE_MS);
  });

  it('★保険の発動が人の知覚(200ms)を大きく超えない', () => {
    // 完全に見えるまで = delay + fade。ここが長いほど「開いた瞬間の黒」が伸びる。
    // 1500ms 時代はこの合計が 1760ms で、実機で真っ黒として観測された。
    expect(CLOAK_CSS_FAILSAFE_MS + CLOAK_CSS_FADE_MS).toBeLessThanOrEqual(1000);
  });

  it('reduced-motion の遅延が通常より長くない(その人だけ黒が長い、を防ぐ)', () => {
    const m = popupHtml.match(
      /prefers-reduced-motion:\s*reduce\s*\)\s*\{[\s\S]{0,400}?animation-delay:\s*(\d+)ms/
    );
    expect(m, 'reduced-motion の animation-delay が見つからない').toBeTruthy();
    expect(Number(m[1])).toBeLessThanOrEqual(CLOAK_CSS_FAILSAFE_MS);
  });
});

describe('★計器が「黒く見えていた長さ」を自分で言う(読み手に引き算をさせない)', () => {
  it('幕がCSS保険より早く外れたら、その時刻がそのまま黒の長さ', () => {
    const r = summarizeCloakDuration([
      { t: 0, cloak: '1' },
      { t: 120, cloak: '1' },
      { t: 300, cloak: '' }
    ]);
    expect(r.visibleBlackMs).toBe(300);
    expect(r.line).toContain('この間パネルは黒く見えていた=300ms');
  });

  it('★幕がCSS保険より後まで残っても、黒の長さは保険+fadeで頭打ち(CSSが見せるため)', () => {
    const r = summarizeCloakDuration([
      { t: 0, cloak: '1' },
      { t: 1000, cloak: '1' },
      { t: 1507, cloak: '' }
    ]);
    // JS の解除は 1507ms だが、CSS が 400+260=660ms で見せている。
    // ★ここを clearedAtMs のまま出すと「1507ms 黒かった」と嘘をつく。
    expect(r.visibleBlackMs).toBe(CLOAK_CSS_FAILSAFE_MS + CLOAK_CSS_FADE_MS);
  });

  it('人が気づく長さかどうかを行に明示する', () => {
    const long = summarizeCloakDuration([
      { t: 0, cloak: '1' },
      { t: 500, cloak: '' }
    ]);
    expect(long.humanVisible).toBe(true);
    expect(long.line).toContain('人が気づく長さ');

    const short = summarizeCloakDuration([
      { t: 0, cloak: '1' },
      { t: 60, cloak: '' }
    ]);
    expect(short.humanVisible).toBe(false);
    expect(short.line).toContain('一瞬=気づかない');
  });

  it('幕が一度も立たなければ黒の注記は出さない(ノイズにしない)', () => {
    const r = summarizeCloakDuration([
      { t: 0, cloak: '' },
      { t: 100, cloak: '' }
    ]);
    expect(r.visibleBlackMs).toBe(0);
    expect(r.line).not.toContain('黒く見えていた');
  });

  it('HUMAN_PERCEPTIBLE_MS は白フラッシュの結論(0.2秒は見える)と揃っている', () => {
    expect(HUMAN_PERCEPTIBLE_MS).toBe(200);
  });
});
