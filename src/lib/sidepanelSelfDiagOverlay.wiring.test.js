import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1372: 「診断ページが無くても分かる」ための配線。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * なぜ要るか — ユーザーに2回言われて、2回とも私が忘れていた宿題
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 2026-08-12:
 *   「どうやってこれで伝えるの 状態速報なくても分かるようにして内部で」
 *   「診断ページもいちおうあるけど、診断ページなくてももう理解できる仕組み
 *     つくるというのもわすれられた」
 *
 * 従来、サイドパネルの自己診断は判定結果を storage に書くだけで、
 * それを読むのは status ページ【だけ】だった。つまり:
 *   - パネルが黒い ⇒ 当のパネルには何も出ない
 *   - 原因を知るには別ページ(status)を開いてコピーする必要がある
 *   - ★その status 自体が重い/白紙だと詰む(2026-08-12 に実際に詰んだ)
 *
 * ＝症状が出ている当人に何も伝えない計器だった。
 * [[screen-only-info-never-reaches-the-report-2026-08-11]] の【逆】:
 *   報告にしか出ない情報は、報告を開けない人には無いのと同じ。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

const src = read('src/extension/sidepanel-entry.js');

describe('サイドパネル自己診断を画面に出す配線', () => {
  it('★判定のたびにオーバーレイ描画を呼んでいる(storage に書くだけにしない)', () => {
    expect(src).toContain('function renderSelfDiagOverlay(');
    /*
     * 呼び出しが storage への【書き込み】より前にあること=保存に失敗しても表示は出る。
     * ★import 行にも KEY_SIDEPANEL_SELF_DIAG が出るので、書き込み(storage.local.set)の
     *   位置で比べる(最初の出現で比べると import と比較してしまい、常に赤くなる)。
     */
    const call = src.indexOf('renderSelfDiagOverlay({');
    const set = src.indexOf('chrome?.storage?.local?.set');
    expect(call).toBeGreaterThan(-1);
    expect(set).toBeGreaterThan(-1);
    expect(call).toBeLessThan(set);
  });

  it('★異常のときだけ出す(正常なら要素を消す=通常利用を邪魔しない)', () => {
    const start = src.indexOf('function renderSelfDiagOverlay(');
    const body = src.slice(start, src.indexOf('\n}\n', start));
    expect(body).toMatch(/if \(v\.ok\)/);
    expect(body).toMatch(/existing\.remove\(\)/);
  });

  it('★色をCSS変数に依存させない(地の色が出ないのが症状なので)', () => {
    /*
     * var(--nl-bg) 等に頼ると「黒画面のときだけ読めない表示」になる。
     * 症状のときに読めない計器は、無いのと同じ。
     */
    const start = src.indexOf('function renderSelfDiagOverlay(');
    const body = src.slice(start, src.indexOf('\n}\n', start));
    expect(body).not.toContain('var(--nl-');
    expect(body).toContain('background:#fffbeb');
    expect(body).toContain('color:#7c2d12');
  });

  it('★操作を奪わない(pointer-events:none)', () => {
    const start = src.indexOf('function renderSelfDiagOverlay(');
    const body = src.slice(start, src.indexOf('\n}\n', start));
    expect(body).toContain('pointer-events:none');
  });

  it('★1行目は「次に何をすればいいか」(専門用語だけにしない)', () => {
    const start = src.indexOf('function renderSelfDiagOverlay(');
    const body = src.slice(start, src.indexOf('\n}\n', start));
    // 判定文字列(line)だけでなく、行動を促す文が入っていること。
    expect(body).toContain('パネルの中身が出ていません');
    expect(body).toContain('閉じて開き直して');
    expect(body).toContain('v.line');
  });

  it('★同じ要素を使い回す(測定のたびに増殖させない)', () => {
    const start = src.indexOf('function renderSelfDiagOverlay(');
    const body = src.slice(start, src.indexOf('\n}\n', start));
    expect(body).toContain('getElementById(SELF_DIAG_OVERLAY_ID)');
    expect(body).toMatch(/const el = existing \|\| /);
  });
});
