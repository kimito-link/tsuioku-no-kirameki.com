import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 全拡張ページへ配られる巨大キーの書き込みを減らす配線(v0.1.1694)。
 *   chrome.storage.onChanged は旧値+新値を全ページへ構造化クローンで配る。拡張の全ページは1本の主スレッドを共有するため、
 *   巨大キー1回の書き込みが全ページの時間になる(実機の census: popup-sidepanel と status が稼働の約25%ずつ)。
 *   ここが元の頻度・サイズに戻ると、サイドパネルの最初の描画(縞=黒い幕の長さ)がまた遅れる。
 */
const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const content = strip(read('src/extension/content-entry.js'));

describe('巨大キーの書き込み削減', () => {
  it('★較正リングの試行間隔は 120 秒以上(25 秒に戻さない)', () => {
    const m = /const CALIBRATION_LOG_ATTEMPT_INTERVAL_MS = (\d+);/.exec(content);
    expect(m).not.toBeNull();
    expect(Number(/** @type {RegExpExecArray} */ (m)[1])).toBeGreaterThanOrEqual(120000);
  });

  it('★fastDiag の全文は fastDiagFullGate の判定を通して書き、lite は毎回書く', () => {
    expect(content).toContain("from '../lib/fastDiagFullGate.js'");
    expect(content).toMatch(/const writeFull = shouldWriteFastDiagFull\(\{ now, lastFullAt: aiShareFastDiagLastFullAt, forceFull: !!\(opts && opts\.forceFull\) \}\);/);
    // 全文を書かない回でも lite だけは書く(status が2秒ごとに読む)
    expect(content).toMatch(/: \{ \[KEY_STATUS_FAST_DIAG_LITE\]: buildStatusFastDiagLite\(payload\) \}/);
    // 全文と lite を毎回セットで書く旧い形が残っていない
    expect(content).not.toMatch(/setStorageLocalSilent\(\{\s*\[KEY_AI_SHARE_FAST_DIAG\]: payload,\s*\[KEY_STATUS_FAST_DIAG_LITE\]: buildStatusFastDiagLite\(payload\)\s*\}\);/);
  });

  it('★読み手が最新を求めたとき(AI共有のコピー=NLS_AI_SHARE_PAGE_DIAGNOSTICS)は全文を必ず書く(forceFull)', () => {
    const at = content.indexOf("msg.type === 'NLS_AI_SHARE_PAGE_DIAGNOSTICS'");
    expect(at).toBeGreaterThan(-1);
    expect(content.slice(at, at + 300)).toContain('persistAiShareFastDiagnostics({ forceFull: true });');
    // forceFull は最小間隔(minGap)も飛ばす
    expect(content).toMatch(/if \(!\(opts && opts\.forceFull\) && now - aiShareFastDiagLastPersistAt < minGap\) return;/);
  });

  it('★取り込みログの履歴は小さく(全体書き直し+全ページ配信なので 100 件以下)', () => {
    const lib = read('src/lib/commentIngestLog.js');
    const m = /export const COMMENT_INGEST_LOG_MAX_ITEMS = (\d+);/.exec(lib);
    expect(m).not.toBeNull();
    expect(Number(/** @type {RegExpExecArray} */ (m)[1])).toBeLessThanOrEqual(100);
  });
});
