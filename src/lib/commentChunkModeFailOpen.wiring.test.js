import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1382: fail-open 6件目の根治を配線で固定する。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 何が壊れていたか(2026-08-12 実測で確定)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   `content-entry.js` のチャンク seed 経路には3つの分岐がある:
 *     ① インデックス正常        → チャンク運用(軽い)
 *     ② フラグは立つがindex破損  → ★従来 main 運用に戻していた(= chunkMode=false)
 *     ③ 未移行                  → main を読んでチャンクへ移行
 *   さらに catch(timeout) が1つ。
 *
 *   ②に落ちた配信は `liveChunkMigrated=false` のままなので、以後**畳み込みのたびに
 *   巨大配列を丸ごと書き戻す**(O(N)の構造化クローン)。
 *
 *   実測(24,000件・chrome-devtools・出荷ビルド):
 *     丸ごと書き戻し ×5 = 2,522ms / イベントループ停止 410ms
 *     末尾チャンクだけ×5 =   371ms / イベントループ停止  63ms   ＝6.8倍
 *
 *   拡張の全ページは同一メインスレッドなので、これがパネルの黒画面・
 *   診断ページが開かない症状として現れる。
 *
 * ★これは v0.1.769 が「storage stall spiral の根治」として塞いだのと【同じ穴】。
 *   当時 catch(timeout) は塞がれたが、②の破損経路は残っていた
 *   ＝[[fail-open-recurs-under-new-names-2026-08-12]] が別名で再発(6件目)。
 *   「守るものが壊れているから通す」も fail-open である。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/content-entry.js'), 'utf8').replace(
  /\r\n/g,
  '\n'
);

describe('★チャンクモードの fail-open を塞ぐ', () => {
  it('index破損の分岐でも liveChunkMigrated=true に倒す(全件書き戻しへ落ちない)', () => {
    // 破損分岐(`else if (metaBag[chunkMigratedKey(lid)] === true) {`)の本体を切り出して検査する。
    const start = src.indexOf('} else if (metaBag[chunkMigratedKey(lid)] === true) {');
    expect(start, '破損分岐が見つからない(構造が変わったら本テストを見直すこと)').toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf('} else {', start));
    expect(body).toContain('liveChunkMigrated = true;');
    // ★空インデックスを立てて bounded(追記専用)で書き続ける=timeout 経路と同じ扱い。
    expect(body).toContain('planMigrateMainToChunks(lid, [])');
  });

  it('★通した理由を記録する(なぜチャンクに乗れなかったかを捨てない)', () => {
    const start = src.indexOf('} else if (metaBag[chunkMigratedKey(lid)] === true) {');
    const body = src.slice(start, src.indexOf('} else {', start));
    expect(body).toContain("noteCommentChunkModeFallback('index_broken')");
  });

  it('★timeout 経路も同じ扱いのまま(v0.1.769 の根治を壊していない)', () => {
    // catch 側は従来どおり空インデックス+true。ここが退化すると同じ症状が戻る。
    // ★seed 経路の catch は「tail_seed_main_timeout」を出す箇所(複数ある timeout catch のうちの1つ)。
    const idx = src.indexOf("formatPipelinePhase('tail_seed_main_timeout'");
    expect(idx, 'seed の timeout catch が見つからない').toBeGreaterThan(-1);
    const tail = src.slice(idx, idx + 1200);
    expect(tail).toContain('planMigrateMainToChunks(lid, [])');
    expect(tail).toContain('liveChunkMigrated = true;');
  });

  it('★書き込みモードを数えて速報に出す(真犯人を計器の死角に置かない)', () => {
    expect(src).toContain('KEY_COMMENT_WRITE_MODE_DIAG');
    expect(src).toMatch(/_commentWriteModeCensus\.wholeWrites \+= 1;/);
    expect(src).toMatch(/_commentWriteModeCensus\.chunkWrites \+= 1;/);
    // storage へ実際に publish していること(計算しても書かなければ speed 速報に出ない)。
    expect(src).toMatch(/\[KEY_COMMENT_WRITE_MODE_DIAG\]: \{/);
    expect(src).toMatch(/mode: chunkMode \? 'chunk' : 'whole',/);
  });

  it('★パネル自身が読んで行に出す(status が開けない症状でも当人に届く)', () => {
    const panel = readFileSync(path.join(repoRoot, 'src/extension/sidepanel-entry.js'), 'utf8').replace(
      /\r\n/g,
      '\n'
    );
    expect(panel).toContain('buildCommentWriteModeDiagLine');
    expect(panel).toContain('KEY_COMMENT_WRITE_MODE_DIAG');
    // ★line の両分岐(flashed / 通常)の【両方】に入っていること。
    const lines = panel.match(/^\s*(\? |: )`\$\{(worst\.verdict|verdict)\.line\}.*$/gm) || [];
    expect(lines.length).toBe(2);
    for (const l of lines) expect(l).toContain('${writeModeNote}');
  });

  it('★パネルの読みは1キーだけ(計器が症状を作らない)', () => {
    const panel = readFileSync(path.join(repoRoot, 'src/extension/sidepanel-entry.js'), 'utf8');
    expect(panel).toMatch(/get\?\.\(KEY_COMMENT_WRITE_MODE_DIAG\)/);
    // 全件読みを持ち込んでいないこと(census テストと二重で守る)。
    expect(panel).not.toMatch(/\.get\(\s*null\s*\)/);
  });
});
