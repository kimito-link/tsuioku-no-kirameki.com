/**
 * ★v0.1.1450: 北極星 tick の onChanged が【素通しに戻らない】ことを固定する。
 *
 * ■ 何を守っているか(2026-08-19 実ブラウザ実測・25.9MB)
 *   `chrome.storage.onChanged` が `tickIndependentNorthStar()` を**無間引きで直呼び**していた。
 *   content は配信中ずっと `nls_comments_*` / `nls_panel_summary_*` を書くので:
 *     静穏2秒の read = 10本
 *     ★コメント1件を書いた直後1.2秒の read = **60 / 68 / 103本(平均77)**
 *     10秒で計149回・**合計7,698ms**(10秒中7.7秒が storage 待ち)
 *   ＝これがイベントループを止め、サイドパネルを黒くしていた当人。
 *
 * ■ ★なぜ wiring テストが要るか
 *   このリポの最大の病は【判定は在るが配線されていない】。
 *   しかも `mainThreadBlocker.wiring.test.js:42` は
 *   **boot.js 自身に単語があるか**を見ているだけの**恒真テスト**だった実績がある
 *   (テスト名は「★区間名で犯人を出せる」なのに、囲いの有無を一切検証していない)。
 *   → ここでは**出荷経路のソース**を読み、**数とアンカー**で固定する。
 *   → 3つの変異(素通しに戻す / 共用インスタンスに戻す / initialDone の取り違え)で
 *     **赤になることを目視してから**採用した。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
/** ★CRLF 正規化は必須(2026-08-18 に同じ罠で別の検査が丸ごと死んでいた)。 */
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

const popupSrc = read('src/extension/popup-entry.js');

/** コメント行を落として「実際に動くコード」だけにする(経緯の引用で誤検知しない)。 */
const codeOnly = (src) =>
  src.split('\n').filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');

const popupCode = codeOnly(popupSrc);

/** tick 側 onChanged リスナーの本体だけを切り出す。 */
function tickListenerBody(src) {
  const anchor = 'content が北極星の生データ/コメントを書いた=描けるようになった合図';
  const i = src.indexOf(anchor);
  if (i < 0) return '';
  return src.slice(i, i + 1800);
}

describe('北極星 tick の onChanged は間引かれている', () => {
  const seg = tickListenerBody(popupSrc);
  const segCode = codeOnly(seg);

  it('★(0) tick 側 onChanged の本体が取れている(空振りで全断言が素通りするのを殺す)', () => {
    // fail-closed: 切り出せていないまま緑になるのが最悪。
    expect(seg.length).toBeGreaterThan(300);
    expect(segCode).toContain('tickIndependentNorthStar');
  });

  it('★(1) onChanged から tick を【直呼び】していない(素通しに戻したら赤)', () => {
    // これが復活したら「コメント1件で60〜103本」の状態に逆戻りする。
    expect(segCode).not.toMatch(/\n\s*tickIndependentNorthStar\(\);/);
  });

  it('★(2) tick 専用スケジューラ経由で呼んでいる(アンカー付き)', () => {
    /*
     * 直前直後まで固定する。緩めると引数を差し替える変異が素通りする
     * ([[wiring-test-must-assert-counts-2026-08-04]])。
     */
    expect(segCode).toMatch(
      /northStarTickScheduler\.schedule\(\n\s*\{ allHighFreq, initialDone: northStarTickFirstRunDone \},\n\s*tickIndependentNorthStar\n\s*\);/
    );
  });

  it('★(3) 既存の共用インスタンスを使い回していない(状態共有で互いを抑制する)', () => {
    /*
     * coalescedRefreshScheduler は safeRefresh と自コメ即時描画が占有し lastPaintAt は1本だけ。
     * 共用すると tick が leading を食ってコメント再描画が trailing に落ちる(v0.1.508 の再発)。
     */
    expect(segCode).not.toContain('coalescedRefreshScheduler.');
    const creates = popupCode.match(/createCoalescedRefreshScheduler\(\{/g) || [];
    expect(creates).toHaveLength(2);
    expect(popupCode).toContain('const northStarTickScheduler = createCoalescedRefreshScheduler({');
  });

  it('★(4) throttle は tick=700ms / safeRefresh=450ms の2値', () => {
    expect(popupCode).toMatch(
      /const northStarTickScheduler = createCoalescedRefreshScheduler\(\{\n\s*throttleMs: 700\n\}\);/
    );
    expect(popupCode).toMatch(
      /const coalescedRefreshScheduler = createCoalescedRefreshScheduler\(\{\n\s*throttleMs: 450\n\}\);/
    );
  });

  it('★(5) initialDone は tick 自身のフラグ(refresh の完了フラグを渡すと間引きが恒久失効)', () => {
    /*
     * ★最も気づきにくい退化: initialRefreshDone は【重い refresh の .finally】で立つ。
     *   重い配信では refresh が完走しない(=独立 tick を作った動機そのもの)ので、
     *   渡すと initialDone=false が続き「初回は抑制を無視」経路で毎回即時実行になる。
     */
    expect(segCode).toContain('initialDone: northStarTickFirstRunDone');
    expect(segCode).not.toContain('initialDone: initialRefreshDone');
    // 宣言は tick 定義より前(参照時に未定義にならない)。
    const declAt = popupCode.indexOf('let northStarTickFirstRunDone = false;');
    const tickAt = popupCode.indexOf('const tickIndependentNorthStar = () => {');
    expect(declAt).toBeGreaterThan(-1);
    expect(declAt).toBeLessThan(tickAt);
  });

  it('★(6) フラグは finally で立てる(tick が throw しても素通しに戻らない)', () => {
    expect(popupCode).toMatch(
      /try \{ tickIndependentNorthStar\(\); \} catch \{ [^}]*\} finally \{ northStarTickFirstRunDone = true; \}/
    );
  });

  it('★(7) 初回描画を遅らせない: 同期1回と setTimeout 3本はスケジューラを通さない(数で断言)', () => {
    // ここを scheduler 経由にすると v0.1.1371「開いたのに永久に白い」が再発する。
    const direct = popupCode.match(/setTimeout\(tickIndependentNorthStar, \d+\)/g) || [];
    expect(direct).toHaveLength(3);
    expect(popupCode).toContain(
      'setInterval(tickIndependentNorthStar, NORTH_STAR_INDEPENDENT_REFRESH_MS);'
    );
  });

  it('★(8) 高頻度判定は既存の正本を再利用(tick 用の別実装を作らない)', () => {
    expect(segCode).toContain('isHighFrequencyCommentRelatedStorageKey');
    // v0.1.1248「混在で throttle を失う穴」の薬。tick 側にも同じ穴が開く。
    expect(segCode).toContain('stripSelfWrittenRenderArtifacts');
    const defs = popupCode.match(/function isHighFrequencyCommentRelatedStorageKey\(/g) || [];
    expect(defs).toHaveLength(1);
  });
});
