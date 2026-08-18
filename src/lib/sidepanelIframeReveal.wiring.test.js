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

  it('★戻す経路は【3つ】ある(load / error / 時間切れ)', () => {
    const e = entry();
    expect(e).toMatch(/addEventListener\('load'/);
    expect(e).toMatch(/addEventListener\('error'/);
    expect(e).toMatch(/setTimeout\(\s*\(\)\s*=>\s*reveal\(\{\s*timedOut:\s*true/);
    const reveals = e.match(/reveal\(\{/g) || [];
    expect(reveals.length).toBe(3);
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

  it('★CSS 側に隠しクラスの定義がある(JSだけ在ってCSSが無い片肺を防ぐ)', () => {
    const html = read('extension/sidepanel.html');
    expect(html).toMatch(/iframe\.nl-ifr-loading\s*\{/);
    // ★隔すのは opacity(コンポジタで扱える・親のクリーム色が透ける)
    const rule = /iframe\.nl-ifr-loading\s*\{([\s\S]*?)\}/.exec(html)?.[1] ?? '';
    expect(rule.replace(/\/\*[\s\S]*?\*\//g, '')).toMatch(/opacity:\s*0/);
  });

  it('★display:none では隠さない(レイアウトが消えて中身の初期描画が狂う)', () => {
    const html = read('extension/sidepanel.html');
    const raw = /iframe\.nl-ifr-loading\s*\{([\s\S]*?)\}/.exec(html)?.[1] ?? '';
    // ★コメント内の「display:none ではなく」という説明を拾わない
    const block = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(block).not.toMatch(/display:\s*none/);
    expect(block).toMatch(/opacity:\s*0/);
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

  it('★隔しクラスに CSS アニメーションの保険が付いている', () => {
    const raw = /iframe\.nl-ifr-loading\s*\{([\s\S]*?)\}/.exec(html())?.[1] ?? '';
    const block = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(block).toMatch(/animation:\s*nl-ifr-reveal/);
  });

  it('★アニメーションの終点は visible(開く側へ倒れる)', () => {
    const kf = /@keyframes\s+nl-ifr-reveal\s*\{([\s\S]*?)\}\s*\}/.exec(html())?.[1]
      ?? /@keyframes\s+nl-ifr-reveal\s*\{([\s\S]*?)\}/.exec(html())?.[1] ?? '';
    expect(kf).toMatch(/opacity:\s*1/);
    expect(kf).not.toMatch(/opacity:\s*0/);
  });

  it('★forwards で終状態を保つ(終わった途端に隠れ戻らない)', () => {
    const raw = /iframe\.nl-ifr-loading\s*\{([\s\S]*?)\}/.exec(html())?.[1] ?? '';
    expect(raw.replace(/\/\*[\s\S]*?\*\//g, '')).toMatch(/forwards/);
  });

  it('★保険の長さは1.5秒以内(白いまま待たせない)', () => {
    const raw = /iframe\.nl-ifr-loading\s*\{([\s\S]*?)\}/.exec(html())?.[1] ?? '';
    const m = /animation:\s*nl-ifr-reveal\s+([\d.]+)s/.exec(raw.replace(/\/\*[\s\S]*?\*\//g, ''));
    expect(m).toBeTruthy();
    expect(Number(m[1])).toBeLessThanOrEqual(1.5);
    expect(Number(m[1])).toBeGreaterThan(0);
  });
});
