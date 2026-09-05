import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mergeNdgrUnknownSamplesBounded,
  serializeNdgrUnknownSamples,
  NDGR_UNKNOWN_SAMPLES_MAX_PER_KEY,
  NDGR_UNKNOWN_SAMPLES_MAX_KEYS,
  NDGR_UNKNOWN_SAMPLES_MAX_BYTES
} from './ndgrUnknownSamplesBudget.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

/**
 * ★watch ページの `<html>` に書く診断属性に【上限】を付ける。
 *
 * ■ ★ユーザー指示(2026-08-21)
 *   「表面的なものを考えるんじゃなくて、まず MCP デベロッパーツールで
 *     現在の DOM を全部把握して、それを計器に入れる基本から見直すべき」
 *   → 実際に DevTools の Elements を見たら、`<html>` にこれが載っていた:
 *       data-nls-ndgr-unknown-samples={巨大なJSON}
 *       data-nls-fetch-log=[長大なURL列]
 *       data-nls-page-intercept-xhr="4068"
 *
 * ■ ★見つけた実際の欠陥(推測ではなくコードで確認)
 *   `page-intercept-entry.js:555-569` の `_ndgrUnknownSamples` は
 *     ・**lifetime 蓄積**(消えない)
 *     ・上限は **1キーあたり3件だけ**
 *     ・★**キーの個数に上限が無い**
 *   そして `publishNdgrUnknownSamples()`(:571) は
 *   ★**毎回オブジェクト全体を JSON.stringify して属性へ書き直す**。
 *
 *   ＝ キーが増えるほど「1回の書き込み」が重くなる。
 *   ★属性の書き換えは **スタイル再計算とレイアウトを誘発する**ので、
 *   これがメインスレッド停止(実測 最悪4,776ms)の候補になる。
 *
 * ■ このモジュールが保証すること
 *   ★キー数・総バイト数の両方に上限を持ち、**超えたら足さない**。
 *   ★捨てたことを隠さない(切り捨て件数を残す)。
 */
describe('★診断属性の予算(html への書き込みを無限に太らせない)', () => {
  it('★1キーあたりの件数上限は既存と同じ3(挙動を変えない)', () => {
    expect(NDGR_UNKNOWN_SAMPLES_MAX_PER_KEY).toBe(3);
  });

  it('★★キーの個数に上限がある(ここが元の欠陥)', () => {
    expect(NDGR_UNKNOWN_SAMPLES_MAX_KEYS).toBeGreaterThan(0);
    expect(NDGR_UNKNOWN_SAMPLES_MAX_KEYS).toBeLessThanOrEqual(64);
  });

  it('★キー上限を超えたら新しいキーを足さない(既存は消さない)', () => {
    const state = {};
    for (let i = 0; i < NDGR_UNKNOWN_SAMPLES_MAX_KEYS + 10; i += 1) {
      mergeNdgrUnknownSamplesBounded(state, { [`k${i}`]: [{ v: i }] });
    }
    expect(Object.keys(state.samples).length).toBe(NDGR_UNKNOWN_SAMPLES_MAX_KEYS);
    // ★最初に入ったキーは残る(後から来たものを捨てる=観測の連続性を保つ)
    expect(state.samples.k0).toBeTruthy();
    // ★捨てた事実を隠さない
    expect(state.droppedKeys).toBeGreaterThan(0);
  });

  it('★1キーあたり3件を超えて溜めない(既存の契約)', () => {
    const state = {};
    for (let i = 0; i < 10; i += 1) {
      mergeNdgrUnknownSamplesBounded(state, { same: [{ v: i }] });
    }
    expect(state.samples.same.length).toBe(3);
  });

  it('★★書き出しの総バイト数に上限がある(属性が肥大しない)', () => {
    const state = {};
    // 巨大な文字列を持つサンプルを詰め込む
    for (let i = 0; i < NDGR_UNKNOWN_SAMPLES_MAX_KEYS; i += 1) {
      mergeNdgrUnknownSamplesBounded(state, { [`k${i}`]: [{ hex: 'a'.repeat(4000) }] });
    }
    const out = serializeNdgrUnknownSamples(state);
    expect(out.length, `属性が ${out.length} バイトに肥大した`)
      .toBeLessThanOrEqual(NDGR_UNKNOWN_SAMPLES_MAX_BYTES);
  });

  it('★上限で切ったときは、切ったと分かる印を残す(黙って捨てない)', () => {
    const state = {};
    for (let i = 0; i < NDGR_UNKNOWN_SAMPLES_MAX_KEYS; i += 1) {
      mergeNdgrUnknownSamplesBounded(state, { [`k${i}`]: [{ hex: 'a'.repeat(4000) }] });
    }
    expect(serializeNdgrUnknownSamples(state)).toContain('truncated');
  });

  it('★壊れた入力でも落ちない(診断が本体を壊さない)', () => {
    const state = {};
    for (const bad of [null, undefined, 'x', 42, []]) {
      expect(() => mergeNdgrUnknownSamplesBounded(state, bad)).not.toThrow();
    }
    expect(serializeNdgrUnknownSamples({})).toBe('{}');
  });

  it('★★実装(page-intercept-entry.js)がこの予算を使っている', () => {
    /*
     * ★純関数を作っただけで使われないと意味がない
     *   ([[unwired-judgement-is-systemic-2026-08-12]])。
     */
    const src = read('src/extension/page-intercept-entry.js');
    expect(src, '予算モジュールを import していない')
      .toContain('ndgrUnknownSamplesBudget.js');
    expect(src, '上限つきの merge を使っていない')
      .toContain('mergeNdgrUnknownSamplesBounded');
  });
});
