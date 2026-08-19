/**
 * ★v0.1.1446: 「読む頻度を書き手の更新間隔から導く」配線を固定する。
 *
 * ■ 何を守っているか
 *   status.html の refresh() は毎サイクル(2秒)コア5readを直列で叩いていた。
 *   そのうち popupDiag は **popup を開いたときにしか書かれない**(popup-entry.js:19444)
 *   ＝診断ページを見ている間は値が変わらないのに、2秒ごとに単一 LevelDB の
 *   書込と競合していた(実測: 同じ read が平常1ms → 書込中217ms)。
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

  it('★(0) refresh 本体の切り出しに成功している(空本文で全断言が素通りするのを殺す)', () => {
    // fail-closed: 切り出せていないまま緑になるのが最悪([[wiring-test-must-assert-counts]])。
    expect(body).not.toBe('');
    expect(body.length).toBeGreaterThan(2000);
  });

  it('★(1) popupDiag の実 read は1箇所・peek も1箇所(迂回コピーが生えたら赤)', () => {
    expect(body.match(/_popupDiagGuard\.read\(/g) || []).toHaveLength(1);
    expect(body.match(/_popupDiagGuard\.peek\(/g) || []).toHaveLength(1);
  });

  it('★(2) 判定→read/peek の分岐がアンカーごと固定されている', () => {
    /*
     * 直前直後まで固定する。緩めると if(true) 前置や順序入れ替えが素通りする
     * (2026-08-05 に実際に緑のまま通してしまった実績あり)。
     */
    expect(body).toMatch(
      /const popupDiagDue = shouldReadNow\('popupDiag', \{\n\s*lastReadAt: _coreReadAt\.popupDiag,\n\s*now: Date\.now\(\)\n\s*\}\);\n\s*const pdRes = popupDiagDue\n\s*\? await _popupDiagGuard\.read\(\{ timeoutMs: _slice\(\) \}\)\n\s*: _popupDiagGuard\.peek\(\);/
    );
  });

  it('★(3) 判定が恒真/恒偽に潰されていない', () => {
    expect(body).not.toMatch(/const popupDiagDue = true/);
    expect(body).not.toMatch(/const popupDiagDue = false/);
  });

  it('★(4) 実 read が成功した回だけ時計を進める(peek で進めると二度と読まない)', () => {
    expect(body).toMatch(
      /if \(popupDiagDue && !pdRes\.stale\) _coreReadAt\.popupDiag = Date\.now\(\);/
    );
    // 代入は1箇所だけ = 条件の外にコピーが残っていない。
    expect(body.match(/_coreReadAt\.popupDiag = /g) || []).toHaveLength(1);
  });

  it('★(5) 譲った回も coreReads に入る=「⏳N秒前の値」が必ず出る(嘘をつかない)', () => {
    // pdRes を coreReads から外す変異 = 古い値を新品として出す静かな事故。
    expect(body).toMatch(/const coreReads = \[lvRes, sumRes, fdRes, pdRes, bfRes\];/);
  });

  it('★(6) 画面の土台と進捗は絶対に譲らない(peek が生えたら赤)', () => {
    /*
     * ★会議 2026-08-19 の結論: ユーザーは取り込み進捗を見に来ている=backfill は絶対に譲らない。
     *   summaries/fastDiagLite は全カード・全セルの入力なので同様。
     * ★v0.1.1447: lives は【譲る側へ移した】(tabs.query が実測1000ms=
     *   「storage を触らないから軽い」という前提が誤りだった)。ただし4秒までに留める。
     */
    for (const g of ['_summariesGuard', '_fastDiagGuard', '_backfillGuard']) {
      expect(body, `${g} の実 read が消えている`).toContain(`${g}.read(`);
      expect(body, `${g} に peek が生えている`).not.toContain(`${g}.peek(`);
    }
  });

  it('★(6b) 譲る対象は3本ちょうど(増やすときは必ずここを更新する)', () => {
    // 数で固定する([[wiring-test-must-assert-counts-2026-08-04]])。
    // 勝手に4本目が生えたら赤=「気づかないうちに鮮度を落とした」を防ぐ。
    expect(body.match(/\.peek\(\)/g) || []).toHaveLength(3);
    for (const g of ['_popupDiagGuard', '_livesGuard', '_watchTabMapGuard']) {
      expect(body, `${g}.peek が無い`).toContain(`${g}.peek()`);
    }
  });

  it('★(6c) tabs.query 系は2本とも間引きを通る(browserプロセス待ちの実測1000ms)', () => {
    expect(body).toMatch(
      /const livesDue = shouldReadNow\('lives', \{ lastReadAt: _coreReadAt\.lives, now: Date\.now\(\) \}\);/
    );
    expect(body).toMatch(/const wtDue = shouldReadNow\('watchTabMap', \{/);
    /*
     * ★tabs.query 系は【試みた回数】で時計を進める(成功/stale を問わない)。
     *   成功時だけ進めると、tabs.query が遅くて stale になり続ける環境で
     *   **毎tick 1秒のクエリを叩き続ける**＝間引きが効かない
     *   (実測1000msの当のAPIなので、ここを取り違えると修正が無意味になる)。
     *   ★storage 系(popupDiag)は逆に「成功時だけ」が正しい=下の (3) で別に固定している。
     */
    expect(body).toMatch(/if \(livesDue\) _coreReadAt\.lives = Date\.now\(\);/);
    expect(body).toMatch(/if \(wtDue\) _coreReadAt\.watchTabMap = Date\.now\(\);/);
    // 成功条件を混ぜる変異(=元の誤り)に戻っていないこと。
    expect(body).not.toMatch(/livesDue && !lvRes\.stale/);
    expect(body).not.toMatch(/wtDue && !wtRes\.stale/);
  });

  it('★(7) 計器に必ず1行出る(譲った回と読んだ回を名前で見分けられる)', () => {
    // aiShareFullText.js の重い順は 0ms 行を落とすので、譲った回は行ごと消える。
    // その差そのものが「効いているか」の判定材料になる(6サイクル中1回だけ出れば成功)。
    expect(body).toMatch(
      /_mark\(popupDiagDue \? \(pdRes\.stale \? 'popupDiag\(stale\)' : 'popupDiag'\) : 'popupDiag\(譲\)'\);/
    );
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
