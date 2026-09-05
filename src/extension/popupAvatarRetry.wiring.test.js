/**
 * popup 側のアイコン再プローブ配線テスト(v0.1.1338)。
 *
 * ★なぜ要るか(2026-08-12 実機で確定)
 *   状態速報: 「アイコン画像が 6 件読み込めていません(成功 18 件・失敗率 25%)」
 *             かつ `retriedTotal: 0` = 【一度も再試行していない】。
 *   会場は v0.1.1318 で retryPolicy を opt-in 済みだったが、popup 側は
 *   設計書 §E の「段階3の判断」待ちで既定 null(恒久負キャッシュ)のままだった。
 *   ＝CDN の一時不調で失敗した URL が永久に灰色の丸で固着していた。
 *
 * ★数で断言する理由([[wiring-test-must-assert-counts]])
 *   popup のレーン描画経路は【2つ】ある(通常 paint / 鏡由来 paint)。
 *   片方だけに配線すると、その経路を通るときだけ直らない = 読み上げで実際に踏んだ
 *   「片肺」と同じ穴になる。だから 1 でも 3 でもなく【2】で固定する。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(new URL('./popup-entry.js', import.meta.url), 'utf8');

describe('popup のアイコン再プローブ配線', () => {
  it('storyAvatarLoadGuard が retryPolicy を opt-in している(会場と同設定)', () => {
    const block = SRC.slice(
      SRC.indexOf('const storyAvatarLoadGuard = createSupportAvatarLoadGuard('),
      SRC.indexOf('let _storyAvatarRetrySweepAt')
    );
    expect(block).toContain('retryPolicy:');
    // 会場(venueBar.js)と同じ既定値であること = 面ごとに挙動を変えない。
    expect(block).toMatch(/retryPolicy:\s*\{\s*\}/);
  });

  it('★掃引が【2つの描画経路の両方】から呼ばれている(片肺を作らない)', () => {
    /*
     * ★定義行 `function sweepStoryAvatarRetryThrottled(els) {` を数えないよう、
     *   行頭が空白+呼び出しの形だけを拾う(定義は行頭が `function`)。
     *   ここを雑に数えると定義1件を呼び出しと誤認して 3 になる(実際に踏んだ)。
     * ★行末コメントの有無で壊れないこと(`;` の後は問わない)。
     *   v0.1.1343 で1行にコメントを畳んだ際、`;$` 固定の正規表現が空振りして
     *   「片肺になった」と誤検出した(配線は2箇所とも生きていた)。
     */
    const calls = SRC.match(/^\s+sweepStoryAvatarRetryThrottled\(els\);/gm) || [];
    expect(calls.length).toBe(2);
  });

  it('掃引は新規タイマーを作らず min-gap 判定を通している(hot path 保護)', () => {
    const fn = SRC.slice(
      SRC.indexOf('function sweepStoryAvatarRetryThrottled'),
      SRC.indexOf('function sweepStoryAvatarRetryThrottled') + 800
    );
    // 間引き判定は lib(avatarRetrySweepThrottle)が正本。popup で数値を直書きしない。
    expect(fn).toContain('shouldSweepAvatarRetry');
    expect(fn).toContain('retrySweep');
    // ★setInterval/setTimeout を新設していないこと(会場は diagDue に相乗りしている)。
    expect(fn).not.toContain('setInterval');
    expect(fn).not.toContain('setTimeout');
  });

  it('min-gap の判定を lib から import している(面ごとに値がズレない)', () => {
    expect(SRC).toContain("import { shouldSweepAvatarRetry } from '../lib/avatarRetrySweepThrottle.js'");
  });
});
