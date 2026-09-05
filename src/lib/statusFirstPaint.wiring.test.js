import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1371: 状態速報ページ(status.html)の【初回描画】の配線。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * なぜこの検査が要るか — ユーザー実機が真っ白のまま返ってこなかった
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 2026-08-12、ユーザーのスクショは status.html が【完全に白紙】だった。
 *
 * ★真因は下の describe('boot の storage read は必ず有界化する') の通り
 *   【init の無界 await】であって、「初回描画が無いこと」ではない
 *   (初回描画は v0.1.797 から `void refresh({timeoutMs:1500})` で存在していた)。
 *   ここで固定するのは、その周辺で同じ白紙を再発させないための条件:
 *   - interval だけに頼らず開いた瞬間にも描く
 *   - 初回は _lastRefreshPerf が空 → congested=false → **一番長い timeout(8秒)** になる
 *     ＝一番混んでいる初回が、一番遅い条件で、一番長く待つ、を避ける
 *   - 実測はコード内に残っていた: backfill 1918ms / fastDiagLite 1749ms / summaries 1724ms
 *
 * ★そして最悪なのは【状態速報が取れないこと】。速報は refresh() の成功後に書かれるので、
 *   詰まっている当の時間帯には存在しない。ユーザーは「どうやってこれで伝えるの」と言った。
 *   ＝一番知りたい瞬間に計器が黙る構造だった
 *   ([[instrument-must-not-overwrite-its-own-evidence-2026-08-09]] と同型)。
 *
 * この検査は「開いた瞬間に描く」「初回は短い timeout」「JSが死んでも読み込み表示が出る」
 * の3点を固定する。どれが欠けても白紙に戻る。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

const entrySrc = read('src/extension/status-entry.js');
const htmlSrc = read('extension/status.html');

describe('status 初回描画の配線 — 2秒の白紙を作らない', () => {
  it('★interval の登録と同時に1回描く(setInterval だけに頼らない)', () => {
    const start = entrySrc.indexOf('function startRefreshLoop()');
    expect(start).toBeGreaterThan(-1);
    const body = entrySrc.slice(start, entrySrc.indexOf('\n}\n', start));
    // 即時キックが setInterval より【前】にあること(後ろだと2秒待つのは変わらない)。
    const kick = body.indexOf('runRefreshTick({ first: true })');
    const interval = body.indexOf('setInterval');
    expect(kick).toBeGreaterThan(-1);
    expect(interval).toBeGreaterThan(-1);
    expect(kick).toBeLessThan(interval);
  });

  it('★初回は混雑を仮定して短い timeout で走る(未知を「軽い」と決めつけない)', () => {
    const start = entrySrc.indexOf('function runRefreshTick(');
    expect(start).toBeGreaterThan(-1);
    const body = entrySrc.slice(start, entrySrc.indexOf('\n}\n', start));
    // first のときは無条件に congested 扱い=CONGESTED_TIMEOUT_MS が使われる。
    expect(body).toMatch(/const congested = first\s*\?\s*true/);
    expect(body).toContain('CONGESTED_TIMEOUT_MS');
  });

  it('★初回は document.hidden でも降りない(降りると誰も再挑戦せず永久に白い)', () => {
    const start = entrySrc.indexOf('function runRefreshTick(');
    const body = entrySrc.slice(start, entrySrc.indexOf('\n}\n', start));
    expect(body).toMatch(/if \(!first && document\.hidden\) return;/);
  });

  it('interval 経路も同じ関数を通る(判断が2箇所に割れない)', () => {
    const start = entrySrc.indexOf('function startRefreshLoop()');
    const body = entrySrc.slice(start, entrySrc.indexOf('\n}\n', start));
    expect(body).toMatch(/setInterval\(\(\) => \{\s*runRefreshTick\(\);\s*\}/);
  });
});

/*
 * ★v0.1.1371 の【真因】: boot(init)で await する storage read が無界だった。
 *
 * 2026-08-12 実機で status.html が真っ白のまま返らなかった真因は
 * 「初回描画が無い」ではなく(それは既にあった=v0.1.797 の `void refresh({timeoutMs:1500})`)、
 * ★その手前の init が **timeout 無しの await** で止まっていたこと。
 *   refreshWebPublishOptInCache / refreshUploadConfigCache が
 *   生の `chrome.storage.local.get` を無期限に待っていた。
 *   chrome.storage.local は単一 LevelDB で、他タブの巨大 read-merge-write 中は
 *   **settle せず永久 pending** になりうる(storageOpTimeout.js の背景コメント)。
 *   ＝storage が詰まると refresh にも startRefreshLoop にも一生到達しない。
 *
 * ★実ブラウザで証明済み(出荷ビルドを拡張として実ロードし storage を永久 pending 化):
 *     修正前: 最終更新 —          / overviewBody = 「読み込み中...」のまま(6秒後も)
 *     修正後: 最終更新 18:15:05   / 更新 9007ms(backfill(stale) 3002ms / extras 3002ms)
 *   ＝degrade して画面が出る。[[prove-fix-by-replaying-old-code-2026-08-09]]
 *
 * ★このページの他の read は全て有界化済みで、**ここだけが非対称に無防備**だった。
 */
describe('★boot の storage read は必ず有界化する(白紙の真因)', () => {
  it('同意フラグの読み取りが runStorageOpWithTimeout を通っている', () => {
    const start = entrySrc.indexOf('async function refreshWebPublishOptInCache()');
    expect(start).toBeGreaterThan(-1);
    const body = entrySrc.slice(start, entrySrc.indexOf('\n}\n', start));
    expect(body).toContain('runStorageOpWithTimeout');
    expect(body).toContain('BOOT_STORAGE_TIMEOUT_MS');
    // 生の await が残っていないこと(これが残ると白紙に戻る)。
    expect(body).not.toMatch(/await chrome\.storage\.local\.get\(/);
  });

  it('共有キーの読み取りが runStorageOpWithTimeout を通っている', () => {
    const start = entrySrc.indexOf('async function refreshUploadConfigCache()');
    expect(start).toBeGreaterThan(-1);
    const body = entrySrc.slice(start, entrySrc.indexOf('\n}\n', start));
    expect(body).toContain('runStorageOpWithTimeout');
    expect(body).not.toMatch(/await chrome\.storage\.local\.get\(/);
  });

  it('★timeout しても fail-closed(送らない/未設定)に倒れる', () => {
    // 「読めなかった」を「同意した」に倒してはいけない。
    const start = entrySrc.indexOf('async function refreshWebPublishOptInCache()');
    const body = entrySrc.slice(start, entrySrc.indexOf('\n}\n', start));
    expect(body).toMatch(/catch\s*\{[\s\S]*_webPublishOptIn = false;/);
  });

  it('boot の timeout は初回refresh(3秒)より短い(先に諦めて描画へ進む)', () => {
    const m = entrySrc.match(/const BOOT_STORAGE_TIMEOUT_MS = ([\d_]+);/);
    expect(m).toBeTruthy();
    const boot = Number(String(m[1]).replace(/_/g, ''));
    const c = entrySrc.match(/const CONGESTED_TIMEOUT_MS = ([\d_]+);/);
    const congested = Number(String(c[1]).replace(/_/g, ''));
    expect(boot).toBeLessThanOrEqual(congested);
  });
});

describe('★読み込み表示 — JSが1行も動かなくても出る', () => {
  it('status.html に【静的に】置かれている(JS生成ではない)', () => {
    // JS が起動しない/バンドルが読めない状況こそ、この表示が要る場面。
    expect(htmlSrc).toContain('id="nlStatusBootNotice"');
    expect(htmlSrc).toContain('読み込み中です');
  });

  it('★既定が【表示】である(hidden 属性で隠れていない)', () => {
    /*
     * 既定を hidden にして JS で出す作りにすると、
     * 「JSが死んだら何も出ない」=直そうとしている症状そのものに戻る。
     */
    const m = htmlSrc.match(/<div id="nlStatusBootNotice"[^>]*>/);
    expect(m).toBeTruthy();
    expect(String(m[0])).not.toContain('hidden');
    // CSS の既定も display:none にしていないこと。
    const css = htmlSrc.slice(htmlSrc.indexOf('.nl-status-boot-notice {'));
    const block = css.slice(0, css.indexOf('}'));
    expect(block).not.toMatch(/display:\s*none/);
  });

  it('★成功経路と失敗経路の【両方】で下ろす(永久ローディングを作らない)', () => {
    expect(entrySrc).toContain('function dismissStatusBootNotice()');
    // 呼び出しが2箇所以上(renderAll 手前 + catch 内)。数で断言する。
    const calls = entrySrc.match(/dismissStatusBootNotice\(\);/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it('degrade(stale/空)でも下ろす=renderAll の手前で呼んでいる', () => {
    const idx = entrySrc.indexOf('dismissStatusBootNotice();');
    const renderIdx = entrySrc.indexOf('renderAll({');
    expect(idx).toBeGreaterThan(-1);
    expect(idx).toBeLessThan(renderIdx);
  });
});
