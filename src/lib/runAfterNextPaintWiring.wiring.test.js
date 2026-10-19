import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * サイドパネルの再表示(タブ切り替えで戻った瞬間)の refresh は、次の描画のあとへ送る(v0.1.1695)。
 *   同期で始めると、その最初の長い処理(100〜300ms)が再表示後の最初のフレームより先に走り、縞が見える時間を延ばす。
 */
const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const src = strip(read('src/extension/popup-entry.js'));

describe('再表示の refresh は次の描画のあと', () => {
  it('★runAfterNextPaint を import し、サイドパネルでは resume を描画のあとへ送る', () => {
    expect(src).toContain("from '../lib/runAfterNextPaint.js'");
    expect(src).toMatch(/if \(INLINE_SIDE_PANEL\) runAfterNextPaint\(resume\);\s*else resume\(\);/);
  });
  it("★resume の中身は従来どおり(キャッシュ鍵を空にして理由を付けて safeRefresh)・隠れていたら走らせない", () => {
    const at = src.indexOf('const resume = () => {');
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, at + 420);
    expect(body).toContain("document.visibilityState !== 'visible'");
    expect(body).toContain("watchMetaCache.key = '';");
    expect(body).toContain("tagRefreshReason('visibility_resume');");
    expect(body).toContain('safeRefresh();');
  });
  it('★再表示のハンドラの中に、描画より先に走る生の safeRefresh() が残っていない', () => {
    const at = src.indexOf("const visGapMs = INLINE_EMBED_WATCH || INLINE_SIDE_PANEL ? 400 : POLL_INTERVAL_MS;");
    expect(at).toBeGreaterThan(-1);
    const handler = src.slice(at, src.indexOf('\n    });\n  }\n', at));
    // safeRefresh() は resume の中の1か所だけ
    expect((handler.match(/safeRefresh\(\)/g) || []).length).toBe(1);
  });
});
