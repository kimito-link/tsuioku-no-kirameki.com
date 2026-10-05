import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 「出来上がるまで iframe を隠す」配線の検査。
 *
 * ★守っているのは【隠したまま戻せなくなる退化を出さないこと】。
 *   黒が"真っ白で何も出ない"に変わるのは、黒より悪い。
 *   だから「隠す側」だけでなく【戻す側が3経路あること】を数で固定する
 *   [[wiring-test-must-assert-counts-2026-08-04]]
 */

const repoRoot = path.resolve(process.cwd());
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('隠して→見せる の配線', () => {
  const entry = () => stripComments(read('src/extension/sidepanel-entry.js'));

  it('判定は純関数に任せている(entry に閾値を直書きしない)', () => {
    const e = entry();
    expect(e).toContain('shouldHideUntilReady');
    expect(e).toContain('decideReveal');
    expect(e).toContain('REVEAL_FALLBACK_MS');
    // ★reveal のタイマーだけは定数を使う(しきい値の二重管理を作らない)。
    //   ※他の診断系 setTimeout はこの変更と無関係なので見ない。
    expect(e).toMatch(/setTimeout\([^;]*reveal\(\{\s*timedOut:\s*true\s*\}\)[^;]*,\s*REVEAL_FALLBACK_MS\s*\)/);
  });

  it('★戻す経路は【4つ】ある(描画 / load からの猶予 / error / 時間切れ)', () => {
    const e = entry();
    expect(e).toMatch(/addEventListener\('load'/);
    expect(e).toMatch(/addEventListener\('error'/);
    expect(e).toMatch(/reveal\(\{\s*painted:\s*true/);
    expect(e).toMatch(/setTimeout\(\s*\(\)\s*=>\s*reveal\(\{\s*loadGraceElapsed:\s*true\s*\}\),\s*REVEAL_AFTER_LOAD_GRACE_MS\s*\)/);
    expect(e).toMatch(/setTimeout\(\s*\(\)\s*=>\s*reveal\(\{\s*timedOut:\s*true/);
    const reveals = e.match(/reveal\(\{/g) || [];
    expect(reveals.length).toBe(4);
  });

  it('★v0.1.1561: load では見せず、中身の初回描画(paint entry)を観測してから見せる', () => {
    const e = entry();
    // load ハンドラの中で中の performance timeline(paint)を見ている
    expect(e).toMatch(/getEntriesByType\('paint'\)/);
    expect(e).toMatch(/new cw\.PerformanceObserver\(/);
    expect(e).toMatch(/observe\(\{\s*type:\s*'paint',\s*buffered:\s*true\s*\}\)/);
    // load 直後に素で見せる旧経路(reveal({ loaded: true }))は残っていない
    expect(e).not.toMatch(/reveal\(\{\s*loaded:\s*true/);
  });

  it('★v0.1.1561: 隠す→見せる の実測(reason/loadAt/paintAt/revealAt)を自己診断に載せている', () => {
    const e = entry();
    expect(e).toMatch(/_revealDiag\.reason = d\.reason/);
    expect(e).toMatch(/_revealDiag\.paintAt = /);
    expect(e).toMatch(/reveal: \{ \.\.\._revealDiag \}/);
  });

  it('★クラスを外す(=見せる)処理が存在する', () => {
    expect(entry()).toMatch(/classList\.remove\(HIDDEN_CLASS\)/);
  });

  it('★隠すのは JS だけ。HTML は初期非表示にしない(JS不動作で真っ白にしない)', () => {
    const html = read('extension/sidepanel.html');
    // iframe タグ自身に隠しクラス/インライン非表示が付いていないこと
    const tag = /<iframe[^>]*>/.exec(html)?.[0] ?? '';
    expect(tag).not.toContain('nl-ifr-loading');
    expect(tag).not.toMatch(/visibility:\s*hidden/);
    expect(tag).not.toMatch(/opacity:\s*0/);
    expect(tag).not.toMatch(/display:\s*none/);
  });

  it('★v0.1.1561: iframe 自体は隠さない(opacity:0 にすると中身の描画が【見せた後】まで止まり、黒い2〜3フレームが残る)', () => {
    const html = read('extension/sidepanel.html');
    expect(html).toMatch(/iframe\.nl-ifr-loading\s*\{/);
    const rule = /iframe\.nl-ifr-loading\s*\{([\s\S]*?)\}/.exec(html)?.[1] ?? '';
    const block = rule.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(block).not.toMatch(/opacity:\s*0/);
    expect(block).not.toMatch(/visibility:\s*hidden/);
    expect(block).not.toMatch(/display:\s*none/);
  });

  it('★v0.1.1561: 隠すのは iframe の【上】の覆い(#nl-ifr-cover)。読み込み中だけ CSS で現れ、既定は無い', () => {
    const html = read('extension/sidepanel.html');
    // HTML に覆いの要素がある(JS で作らない=JS が死んでも覆いは CSS で外れる)
    expect(html).toMatch(/<div id="nl-ifr-cover"/);
    // 既定(読み込み中でない)は見えない
    const base = /#nl-ifr-cover\s*\{([\s\S]*?)\}/.exec(html)?.[1] ?? '';
    const baseBlock = base.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(baseBlock).toMatch(/opacity:\s*0/);
    expect(baseBlock).toMatch(/pointer-events:\s*none/);
    expect(baseBlock).toMatch(/z-index:\s*2/);
    // 読み込み中(iframe.nl-ifr-loading の直後)だけ現れる
    const on = /iframe\.nl-ifr-loading\s*\+\s*#nl-ifr-cover\s*\{([\s\S]*?)\}/.exec(html)?.[1] ?? '';
    const onBlock = on.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(onBlock).toMatch(/opacity:\s*1/);
    expect(onBlock).not.toMatch(/display:\s*none/);
    // 覆いは親の地の色(黒ではない)
    expect(baseBlock).toContain('#fffaf2');
  });

  it('★色の宣言は消していない(唯一効いている守り・消すと退化)', () => {
    const html = read('extension/sidepanel.html');
    expect(html).toMatch(/color-scheme:\s*light/);
    expect(html).toContain('#fffaf2');
    expect(html).toMatch(/<meta name="color-scheme" content="light"/);
  });
});

describe('★★JSに依存しない保険(v0.1.1437・実機で隠れっぱなしを見た)', () => {
  /*
   * v0.1.1436 は戻すのを JS(load / setTimeout)に任せていた。
   * 実機のパネルで【visibility:hidden のまま戻らない】のを実際に見た。
   * 真因: 2.3MB のバンドルを読む間イベントループが止まり、
   *        setTimeout も load ハンドラも発火できない
   *        [[stalled-event-loop-masquerades-as-paint-bug-2026-08-12]]
   * ★だから【コンポジタで進む CSS アニメーション】を保険にする。
   */
  const html = () => read('extension/sidepanel.html');

  const coverOnRule = () => (/iframe\.nl-ifr-loading\s*\+\s*#nl-ifr-cover\s*\{([\s\S]*?)\}/.exec(html())?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');

  it('★覆い(読み込み中)に CSS アニメーションの保険が付いている', () => {
    expect(coverOnRule()).toMatch(/animation:\s*nl-ifr-reveal/);
  });

  it('★アニメーションの終点は【覆いが消える】(開く側へ倒れる)', () => {
    const kf = /@keyframes\s+nl-ifr-reveal\s*\{([\s\S]*?)\}\s*\}/.exec(html())?.[1]
      ?? /@keyframes\s+nl-ifr-reveal\s*\{([\s\S]*?)\}/.exec(html())?.[1] ?? '';
    expect(kf).toMatch(/opacity:\s*0/);
    expect(kf).toMatch(/visibility:\s*hidden/);
    expect(kf).not.toMatch(/opacity:\s*1/);
  });

  it('★forwards で終状態を保つ(終わった途端に覆い戻らない)', () => {
    expect(coverOnRule()).toMatch(/forwards/);
  });

  it('★保険の長さは1.5秒以内(クリーム色のまま待たせない)', () => {
    const raw = coverOnRule();
    const m = /animation:\s*nl-ifr-reveal\s+([\d.]+)s/.exec(raw);
    expect(m).toBeTruthy();
    expect(Number(m[1])).toBeLessThanOrEqual(1.5);
    expect(Number(m[1])).toBeGreaterThan(0);
  });
});
