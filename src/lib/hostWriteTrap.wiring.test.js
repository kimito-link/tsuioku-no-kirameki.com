import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const contentSrc = read('extension/content-entry.js');
const pageSrc = read('extension/page-intercept-entry.js');
const liteSrc = read('lib/statusFastDiagLite.js');
const shareSrc = read('lib/aiShareFullText.js');
const manifestSrc = fs.readFileSync(path.join(root, '..', 'extension/manifest.json'), 'utf8');

/**
 * v0.1.1268 の配線断言。
 *
 * ★この版の存在意義は「犯人を名指しすること」1点。
 *   トラップが【MAIN world に居ること】が最重要で、ここを外すと永遠に 0 が出る
 *   (content script は isolated world で JS ラッパーが別なので、
 *    ページの書き込みを捕まえられない)。
 */

function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('v0.1.1268 — ★world 境界(ここを外すと永遠に0)', () => {
  it('★トラップ本体は page-intercept-entry.js(MAIN world)に居る', () => {
    expect(pageSrc).toContain('installHostDisplayWriteTrap');
    // content-entry(isolated world)には【トラップ本体を置かない】。
    // 置いてしまうとページの書き込みを捕獲できず、また空振りする。
    expect(contentSrc).not.toContain('installHostDisplayWriteTrap');
  });

  it('★manifest で page-intercept が MAIN world 指定になっている', () => {
    const m = JSON.parse(manifestSrc);
    const scripts = m.content_scripts || [];
    const mainWorld = scripts.filter((s) => s.world === 'MAIN');
    expect(mainWorld.length).toBeGreaterThanOrEqual(1);
    // page-intercept が MAIN world 側に含まれること。
    const js = mainWorld.flatMap((s) => s.js || []).join(',');
    expect(js).toMatch(/page-intercept/);
  });

  it('★arm リスナーが無条件に登録される文である(if(false)前置を殺す)', () => {
    const body = codeOnly(pageSrc);
    // 直前のアンカーまで固定する([[mutation-test-needs-anchored-regex-2026-08-05]])。
    expect(body).toMatch(/window\.addEventListener\(HWT_ARM_EVENT, tryArmNow\);/);
    expect(body).not.toMatch(/if \(false\)[\s\S]{0,80}HWT_ARM_EVENT/);
  });

  it('★装着の合図は3系統ある(1系統だけだと取りこぼす=v0.1.1268の失敗)', () => {
    /*
     * v0.1.1268 は CustomEvent の1回きりの合図だけに頼り、実測 armed:null(未装着)だった。
     * 「一度きりの合図は取りこぼす」。3系統のうち1つでも通れば装着される形を固定する。
     */
    const body = codeOnly(pageSrc);
    // (1) isolated からの明示的な合図
    expect(body).toMatch(/window\.addEventListener\(HWT_ARM_EVENT, tryArmNow\);/);
    // (2) host の出現を自力で監視
    expect(body).toMatch(/hwtRootObserver = new MutationObserver\(/);
    expect(body).toMatch(/hwtRootObserver\.observe\(document\.documentElement/);
    // (3) 最後の砦のポーリング
    expect(body).toMatch(/setInterval\(tryArmNow, 2000\)/);
    // 起動時の即時試行(既に host が居る場合)
    expect(body).toMatch(/\n\s*tryArmNow\(\);/);
  });

  it('★(2)の常駐監視は装着できたら止める(滝コメントで重くしない)', () => {
    // subtree:true の監視を常駐させると毎秒何百回も走る(v0.1.1201 の前科)。
    const body = codeOnly(pageSrc);
    expect(body).toMatch(/installHostDisplayWriteTrap\(el\);\n\s*stopRootObserver\(\);/);
    expect(body).toMatch(/hwtRootObserver\.disconnect\(\)/);
  });

  it('★host が見つからないことを報告する(armed:null を二度と曖昧にしない)', () => {
    const body = codeOnly(pageSrc);
    expect(body).toMatch(/hwtHostMissing \+= 1;/);
    expect(body).toMatch(/armReason: `host-not-found\(探索\$\{hwtArmAttempts\}回・不在\$\{hwtHostMissing\}回\)`/);
  });
});

describe('v0.1.1272 — ★報告のタイミング(真因)', () => {
  /*
   * chrome-devtools MCP で実測して確定した真因:
   *   MAIN(page-intercept)=document_start / ISOLATED(content)=document_idle
   *   → 報告を送る側が聞く側より先に走る。postMessage は投げっぱなしなので
   *     リスナー登録前の報告は永久に失われる。
   *   実測は「トラップは装着済み(accessor)なのに armed:null」という形だった。
   *   ★「1回だけ送る」設計そのものが誤り。3版(1268/1269/1270)とも同じ穴だった。
   */
  it('★最新の報告を保持している(投げっぱなしにしない)', () => {
    const body = codeOnly(pageSrc);
    expect(body).toMatch(/let hwtLastReport = \{/);
    // armed 系は必ず保持してから送る。
    expect(body).toMatch(/if \(typeof payload\?\.armed === 'boolean'\) hwtLastReport = payload;/);
  });

  it('★content 側の hello を受けたら再送する', () => {
    const body = codeOnly(pageSrc);
    expect(body).toMatch(
      /window\.addEventListener\('nls:hwt-hello', \(\) => \{[\s\S]{0,120}postNlsIntercept\(hwtLastReport\)/
    );
  });

  it('★hello を取りこぼしても届くよう再送する(保険)', () => {
    const body = codeOnly(pageSrc);
    expect(body).toMatch(/setInterval\(\(\) => \{[\s\S]{0,200}postNlsIntercept\(hwtLastReport\)/);
    // 無限に送り続けない(10回で止める)。
    expect(body).toMatch(/if \(hwtResend >= 10\) clearInterval\(hwtResendTimer\);/);
  });

  it('★armed 報告はすべて hwtPost 経由(保持されない経路を残さない)', () => {
    const body = codeOnly(pageSrc);
    // 生の postNlsIntercept で armed を送っている箇所が無いこと。
    expect(body).not.toMatch(/postNlsIntercept\(\{\s*type: HWT_MSG, armed:/);
    expect(body).not.toMatch(/postNlsIntercept\(\{\n\s*type: HWT_MSG, armed:/);
    // hwtPost 経由が2箇所(装着結果 / host-not-found)+初回1回。
    expect((body.match(/hwtPost\(/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('★content 側が「聞ける」と伝える(無条件に実行される文)', () => {
    const body = codeOnly(contentSrc);
    // 定義内の dispatch と、start() からの呼び出しの2箇所。
    expect(body).toMatch(/\n\s*helloHostWriteTrap\(\);/);
    expect((body.match(/helloHostWriteTrap/g) || []).length).toBe(2);
  });
});

describe('v0.1.1268 — 装着と捕獲', () => {
  it('★4経路すべてを【無条件に】包んでいる(if(false)前置で1経路だけ殺す変異を捕らえる)', () => {
    const body = codeOnly(pageSrc);
    /*
     * ★存在の断言(toMatch)だけだと `if (false) Object.defineProperty(...)` が素通りする。
     *   2026-08-05 の変異テストで実際に緑のまま通した。行頭アンカーまで固定して殺す。
     *   cssText だけは「setter が取れたときのみ」なので if(cssTextDesc...) が正当。
     */
    expect(body).toMatch(/\n\s*Object\.defineProperty\(style, 'display', \{/);
    expect(body).toMatch(/\n\s*Object\.defineProperty\(style, 'setProperty', \{/);
    expect(body).toMatch(/\n\s*Object\.defineProperty\(el, 'setAttribute', \{/);
    // cssText は descriptor が取れたときだけ包む(この条件は正当)。
    expect(body).toMatch(
      /if \(cssTextDesc && cssTextDesc\.set\) \{\n\s*Object\.defineProperty\(style, 'cssText', \{/
    );
    // ★どの経路も if(false) 等で無効化されていないこと。
    expect(body).not.toMatch(/if \(false\)/);
  });

  it('★prototype を書き換えていない(ページ全体・他拡張への副作用ゼロ)', () => {
    const body = codeOnly(pageSrc);
    // インスタンスの own property で shadow する設計。prototype 代入は禁止。
    expect(body).not.toMatch(/CSSStyleDeclaration\.prototype\.setProperty\s*=/);
    expect(body).not.toMatch(/Element\.prototype\.setAttribute\s*=/);
  });

  it('★original を装着前に保存して転送している(無限再帰を防ぐ)', () => {
    const body = codeOnly(pageSrc);
    expect(body).toMatch(/const origSetProperty = proto\.setProperty;/);
    expect(body).toMatch(/const origSetAttribute = el\.setAttribute;/);
    // display の転送は保存済み original を使う(自分の shadow を呼ぶと再帰する)。
    expect(body).toMatch(/origSetProperty\.call\(style, 'display', String\(v\)\)/);
  });

  it('★観測に徹する(値を拒否・改変しない=v0.1.1250の再演を防ぐ)', () => {
    const body = codeOnly(pageSrc);
    // set 内で早期 return して original を呼ばない、という分岐が無いこと。
    expect(body).not.toMatch(/if \(String\(v\) === 'none'\) return;/);
    // 4経路すべてで original が呼ばれる。
    expect((body.match(/origSetProperty\.call/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(body).toMatch(/origSetAttribute\.call\(this, name, value\)/);
  });

  it('★装着結果(armed)を必ず報告する(0回と未計測を区別するため)', () => {
    const body = codeOnly(pageSrc);
    // ★v0.1.1272: hwtPost 経由に変更(最新状態を保持して再送できるようにするため)。
    expect(body).toMatch(/hwtPost\(\{ type: HWT_MSG, armed: ok, armReason: reason \}\)/);
  });

  it('stack 採取は上限つき(4秒周期で無限に伸びない)', () => {
    const body = codeOnly(pageSrc);
    expect(body).toMatch(/hwtStacksTaken < HWT_STACK_SAMPLE_MAX/);
  });

  it('報告はスロットルする(滝コメント時に postMessage の洪水を作らない)', () => {
    const body = codeOnly(pageSrc);
    expect(body).toMatch(/setTimeout\(hwtFlush, HWT_FLUSH_MS\)/);
  });
});

describe('v0.1.1268 — content-entry 側の配線', () => {
  it('★arm dispatch はちょうど2箇所(生成時 + rAF追従)', () => {
    const calls = codeOnly(contentSrc).match(/armHostWriteTrap\(\);/g) || [];
    expect(calls).toHaveLength(2);
  });

  it('★rAF の追従はポインタ比較のみ(hot path を汚さない)', () => {
    const body = codeOnly(contentSrc);
    expect(body).toMatch(
      /if \(host !== _hwtArmedHost\) \{\n\s*_hwtArmedHost = host;\n\s*armHostWriteTrap\(\);\n\s*\}/
    );
  });

  it('★受信分岐が1つあり、armed と レポートを取り違えない', () => {
    const body = codeOnly(contentSrc);
    expect((body.match(/'NLS_HOST_WRITE_TRAP'/g) || []).length).toBe(1);
    // boolean のときだけ armed 扱い(レポートと混ざると 0/未計測 の区別が壊れる)。
    expect(body).toMatch(
      /if \(typeof e\.data\.armed === 'boolean'\) \{\n\s*noteHostWriteTrapArmed\([\s\S]{0,80}\} else \{\n\s*noteHostWriteTrapReport\(/
    );
  });

  it('★速報組立2箇所に載せている', () => {
    expect((contentSrc.match(/hostWriteTrap: \(\(\) => \{/g) || []).length).toBe(2);
  });

  it('★lite に通している(通さないとコピペに永久に出ない)', () => {
    expect(liteSrc).toContain('content.hostWriteTrap');
    expect(liteSrc).toMatch(/\n\s{6}hostWriteTrap,/);
  });

  it('★状態速報の本文に出している', () => {
    expect(shareSrc).toMatch(/fastDiag\?\.content\?\.hostWriteTrap\?\.line/);
  });
});
