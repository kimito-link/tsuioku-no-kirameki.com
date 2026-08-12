import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1382: `chrome.storage.local.get(null)`(全 storage の一括読み)を【数で固定】する。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * なぜ数で固定するのか(2026-08-12 実測)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   storage 20.7MB の実機相当環境での実測(chrome-devtools・出荷ビルド):
 *
 *     get(null) 全件読み        = 1,157ms   ← これ1回でイベントループが止まる
 *     getKeys() キー名だけ      =    81ms   ← 14倍軽い
 *     get([必要キー])           =    22ms
 *
 *   拡張の全ページ(sidepanel / popup / status / live-view)は**同一メインスレッド**を
 *   共有するので、どこか1箇所の全件読みがパネルの黒画面・診断ページの固まりとして現れる
 *   ([[stalled-event-loop-masquerades-as-paint-bug-2026-08-12]])。
 *
 * ★個別に塞いでも、全件読みは**別の場所に別の名前で再発する**。
 *   [[fail-open-recurs-under-new-names-2026-08-12]] と同じ構造なので、
 *   同じ対処(=分岐を数で固定する census)を採る。
 *   [[wiring-test-must-assert-counts-2026-08-04]]: 配線が複数箇所なら数で断言する。
 *
 * ■ 現在の正(このテストが守る契約) = **Chrome<130 用の fallback 2箇所のみ**
 *   1. `content-entry.js` の `readPrunableStorageBagCheap()`(v0.1.419)
 *   2. `popup-entry.js` の `readCommentBagForMigrationCheap()`(v0.1.1382)
 *   どちらも `getKeys()` が使えない古い Chrome でだけ全件読みに倒す(挙動は不変・重いだけ)。
 *
 * ★「ホットパスに全件読みが無い」ことが本質なので、数だけでなく
 *   **どのファイルの何行目か**まで固定する(下の個別 it がそれを担う)。
 *
 * ■ 増やしたくなったら
 *   まず `getKeys()` → 必要キーだけ `get([...])` を検討すること
 *   (先行実績: content-entry.js の readPrunableStorageBagCheap / prunableStorageKeys.js)。
 *   それでも必要ならこの数を上げ、**なぜ全件読みでなければならないか**を下に書くこと。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** src 配下の実コード(.test.js を除く)を全部集める。 */
function collectSourceFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...collectSourceFiles(p));
      continue;
    }
    if (!ent.name.endsWith('.js')) continue;
    if (ent.name.endsWith('.test.js')) continue;
    out.push(p);
  }
  return out;
}

/**
 * コメント行を除いた「実際に走るコード」だけを残す。
 * ★これをしないと、過去の経緯を説明する**コメント中の `get(null)` の文字列**まで
 *   数えてしまい、census が実態とずれる([[check-what-the-number-counts-2026-08-09]])。
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
}

describe('★storage 全件読み(get(null))の数を固定する', () => {
  const files = collectSourceFiles(path.join(repoRoot, 'src'));

  /** @type {{ file: string, line: number, text: string }[]} */
  const hits = [];
  for (const f of files) {
    const raw = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
    const code = stripComments(raw);
    const lines = code.split('\n');
    lines.forEach((text, i) => {
      // `local.get(null)` / `chrome.storage.local.get(null)` / `.get( null )` を拾う。
      if (/\.get\(\s*null\s*\)/.test(text)) {
        hits.push({ file: path.relative(repoRoot, f).replace(/\\/g, '/'), line: i + 1, text: text.trim() });
      }
    });
  }

  it('全件読みは 2 箇所だけ(Chrome<130 用 fallback)', () => {
    expect(
      hits.length,
      `全件読みが増減した。場所:\n${hits.map((h) => `  ${h.file}:${h.line}  ${h.text}`).join('\n')}`
    ).toBe(2);
  });

  it('★2箇所とも「getKeys が使えないときの fallback」である(ホットパスではない)', () => {
    /*
     * ★hits の line は【コメントを除去した後】の行番号なので、元ファイルの行とは一致しない。
     *   ここでは行番号ではなく「その全件読みを含む関数の中に getKeys がある」ことを見る
     *   ([[check-what-the-number-counts-2026-08-09]]: 何を数えているかを取り違えない)。
     */
    const EXPECTED_FALLBACK_FNS = [
      { file: 'src/extension/content-entry.js', fn: 'readPrunableStorageBagCheap' },
      { file: 'src/extension/popup-entry.js', fn: 'readCommentBagForMigrationCheap' }
    ];
    for (const { file, fn } of EXPECTED_FALLBACK_FNS) {
      const raw = readFileSync(path.join(repoRoot, file), 'utf8').replace(/\r\n/g, '\n');
      const start = raw.indexOf(`async function ${fn}(`);
      expect(start, `${file} に ${fn} が無い`).toBeGreaterThan(-1);
      // 関数本体(次の 'async function' か 2000字まで)に getKeys と get(null) が同居していること。
      const body = raw.slice(start, start + 2000);
      expect(body, `${fn} が getKeys を試していない`).toContain('getKeys');
      expect(body, `${fn} に fallback の全件読みが無い`).toMatch(/\.get\(\s*null\s*\)/);
    }
    // 見つかった全件読みが、この2つの関数を持つファイル以外に無いこと。
    const allowed = new Set(EXPECTED_FALLBACK_FNS.map((e) => e.file));
    for (const h of hits) {
      expect(allowed.has(h.file), `想定外のファイルに全件読み: ${h.file}:${h.line}`).toBe(true);
    }
  });

  it('★popup-entry.js の全件読みは migration 本体ではなく fallback 1箇所だけ', () => {
    const inPopup = hits.filter((h) => h.file.includes('popup-entry.js'));
    expect(
      inPopup.length,
      `パネル側の全件読みが増えた(黒画面の直接原因になる):\n${inPopup.map((h) => `  ${h.file}:${h.line}`).join('\n')}`
    ).toBe(1);
    // migration 4本は cheap reader を通ること(直接 get(null) しない)。
    const popupSrc = readFileSync(
      path.join(repoRoot, 'src/extension/popup-entry.js'),
      'utf8'
    ).replace(/\r\n/g, '\n');
    const cheapUses = popupSrc.match(/await readCommentBagForMigrationCheap\(local\)/g) || [];
    expect(cheapUses.length, 'migration 4本すべてが cheap reader を使うこと').toBe(4);
  });

  it('★sidepanel-entry.js には全件読みが無い(計器が症状を作らない)', () => {
    expect(hits.filter((h) => h.file.includes('sidepanel-entry.js')).length).toBe(0);
  });
});
