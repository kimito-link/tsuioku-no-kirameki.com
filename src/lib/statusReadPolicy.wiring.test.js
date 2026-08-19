/**
 * ★v0.1.1446: 「読む頻度を書き手の更新間隔から導く」配線を固定する。
 *
 * ■ 何を守っているか
 *   status.html の refresh() は毎サイクル(2秒)コア5readを直列で叩いていた。
 *   そのうち popupDiag は **popup を開いたときにしか書かれない**(popup-entry.js:19444)
 *   ＝診断ページを見ている間は値が変わらないのに、2秒ごとに単一 LevelDB の
 *   書込と競合していた(実測: 同じ read が平常1ms → 書込中217ms)。
 *
 * ★v0.1.1449: コアread を【1本の get】へ統合したので、popupDiag は
 *   袋から取り出す形になった(read の発行回数は増えない)。
 *   間引きの意味は「popup を開いていない間は古い値で描いてよい」という
 *   **鮮度の宣言を1箇所に残すこと**へ変わった。判定自体が消えたら赤。
 *
 * ■ なぜ wiring テストが要るか
 *   純関数(statusReadPolicy.test.js)は「判定が正しいか」しか見ない。
 *   ★このリポの最大の病は【判定は在るが配線されていない】(1日に4件出た前科)。
 *   出荷経路で実際に使われていることを、ここで数とアンカーで固定する。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractFnBody } from '../../tests/helpers/wiringTestSource.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
/** ★CRLF 正規化は必須。2026-08-18 に同じ罠で別の検査が丸ごと死んでいた。 */
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

const entrySrc = read('src/extension/status-entry.js');
const guardSrc = read('src/lib/inFlightGuard.js');
const policySrc = read('src/lib/statusReadPolicy.js');

/** コメント行を落として「実際に動くコード」だけにする(経緯の引用で誤検知しない)。 */
const codeOnly = (src) =>
  src.split('\n').filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');

describe('読み取り頻度ポリシーの配線', () => {
  /*
   * ★extractFnBody は「header の位置から最初の `{`」を本体の開始とみなす。
   *   refresh の signature は `refresh(opts = {})` なので、**既定値の `{}` で
   *   括弧の対応がその場で閉じ**、本文が1行も取れない(実際に踏んだ)。
   *   → signature を除いた位置から切り出す。下の (0) が空振りを検出する。
   */
  const bodyStart = entrySrc.indexOf('async function refresh(opts = {}) {');
  const body = extractFnBody(
    entrySrc.slice(bodyStart + 'async function refresh(opts = {})'.length),
    ' {'
  );
  const bodyCode = codeOnly(body);

  it('★(0) refresh 本体の切り出しに成功している(空本文で全断言が素通りするのを殺す)', () => {
    // fail-closed: 切り出せていないまま緑になるのが最悪([[wiring-test-must-assert-counts]])。
    expect(body).not.toBe('');
    expect(body.length).toBeGreaterThan(2000);
  });

  it('★(1) popupDiag の間引き判定が生きている(袋の中でも鮮度の宣言は残る)', () => {
    expect(bodyCode).toContain("shouldReadNow('popupDiag'");
    expect(bodyCode.match(/shouldReadNow\('popupDiag'/g) || []).toHaveLength(1);
  });

  it('★(2) 判定が恒真/恒偽に潰されていない', () => {
    expect(bodyCode).not.toMatch(/const popupDiagDue = true/);
    expect(bodyCode).not.toMatch(/const popupDiagDue = false/);
  });

  it('★(3) 間引いた回は前回値を出す(空にしない)', () => {
    /*
     * ★_lastPopupDiag を消すと、間引いた回に popupDiag が null になり
     *   健全度セルが na へ落ちる([[unobserved-must-not-hide-the-cell-2026-08-15]])。
     */
    expect(bodyCode).toContain('_lastPopupDiag');
    expect(bodyCode).toMatch(
      /const popupDiag = popupDiagDue && !coreRes\.stale \? core\.popupDiag : _lastPopupDiag;/
    );
  });

  it('★(4) 実 read できた回だけ時計を進める(stale で進めると鮮度を偽る)', () => {
    expect(bodyCode).toMatch(/if \(popupDiagDue && !coreRes\.stale\) \{/);
    expect(bodyCode.match(/_coreReadAt\.popupDiag = /g) || []).toHaveLength(1);
  });

  it('★(5) 鮮度表示の材料に一括readが入っている(嘘をつかない)', () => {
    // coreReads から外す変異 = 古い値を新品として出す静かな事故。
    expect(bodyCode).toMatch(/const coreReads = \[lvRes, coreRes\];/);
  });

  it('★(6) tabs.query 系は2本とも間引きを通る(browserプロセス待ちの実測1000ms)', () => {
    expect(bodyCode).toMatch(/const livesDue = shouldReadNow\('lives'/);
    expect(bodyCode).toMatch(/const wtDue = shouldReadNow\('watchTabMap'/);
    /*
     * ★tabs.query 系は【試みた回数】で時計を進める(成功/stale を問わない)。
     *   成功時だけ進めると、遅くて stale になり続ける環境で毎tick 1秒のクエリを
     *   叩き続ける＝間引きが効かない(実測1000msの当のAPI)。
     *   ★storage 系(popupDiag)は逆に「成功時だけ」が正しい=上の(4)で別に固定。
     */
    expect(bodyCode).toMatch(/if \(livesDue\) _coreReadAt\.lives = Date\.now\(\);/);
    expect(bodyCode).toMatch(/if \(wtDue\) _coreReadAt\.watchTabMap = Date\.now\(\);/);
    expect(bodyCode).not.toMatch(/livesDue && !lvRes\.stale/);
    expect(bodyCode).not.toMatch(/wtDue && !wtRes\.stale/);
  });

  it('★(7) 譲る対象は2本ちょうど(lives と watchTabMap・増やすなら必ずここを更新)', () => {
    // 数で固定する([[wiring-test-must-assert-counts-2026-08-04]])。
    expect(bodyCode.match(/\.peek\(\)/g) || []).toHaveLength(2);
    for (const g of ['_livesGuard', '_watchTabMapGuard']) {
      expect(bodyCode, `${g}.peek が無い`).toContain(`${g}.peek()`);
    }
  });

  it('★(8) shouldReadNow を出荷経路が import している', () => {
    expect(entrySrc).toMatch(
      /import \{ shouldReadNow \} from '\.\.\/lib\/statusReadPolicy\.js';/
    );
  });

  it('★(9) peek が guard に実在する(未配線で TypeError にしない)', () => {
    expect(guardSrc).toMatch(/const peek = \(\) => \{/);
    expect(guardSrc).toMatch(/return \{ read, peek, getStats \};/);
    // peek は opFn を呼ばない = storage を叩かない。これが「譲る」の実体。
    expect(guardSrc).toMatch(/stats\.peekServeCount \+= 1;\n\s*return staleResult\('peek'\);/);
  });

  it('★(10) 進捗と画面の土台は宣言テーブルに載っていない(=毎回読む)', () => {
    // 宣言に足す変異 = ユーザーが一番見たいものが遅くなる。
    expect(policySrc).not.toMatch(/^\s{2}backfill:/m);
    expect(policySrc).not.toMatch(/^\s{2}summaries:/m);
    expect(policySrc).not.toMatch(/^\s{2}fastDiagLite:/m);
  });
});
