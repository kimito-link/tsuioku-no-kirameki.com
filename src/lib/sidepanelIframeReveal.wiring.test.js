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
    expect(tag).not.toMatch(/display:\s*none/);
  });

  it('★CSS 側に隠しクラスの定義がある(JSだけ在ってCSSが無い片肺を防ぐ)', () => {
    const html = read('extension/sidepanel.html');
    expect(html).toMatch(/iframe\.nl-ifr-loading\s*\{/);
    expect(html).toMatch(/visibility:\s*hidden/);
  });

  it('★display:none では隠さない(レイアウトが消えて中身の初期描画が狂う)', () => {
    const html = read('extension/sidepanel.html');
    const raw = /iframe\.nl-ifr-loading\s*\{([\s\S]*?)\}/.exec(html)?.[1] ?? '';
    // ★コメント内の「display:none ではなく」という説明を拾わない
    const block = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(block).not.toMatch(/display:\s*none/);
    expect(block).toMatch(/visibility:\s*hidden/);
  });

  it('★色の宣言は消していない(唯一効いている守り・消すと退化)', () => {
    const html = read('extension/sidepanel.html');
    expect(html).toMatch(/color-scheme:\s*light/);
    expect(html).toContain('#fffaf2');
    expect(html).toMatch(/<meta name="color-scheme" content="light"/);
  });
});
