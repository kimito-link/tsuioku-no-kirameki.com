import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

// v0.1.2226 CACHE_HIT_SINGLE_PAINT: キャッシュヒットの refresh で、同じ仕事の中で全く同じ描き直しを2回していた。
//   1回目(幕を早く外すための描画)は、await 無しで続く本描画にすぐ上書きされ、画面に出ることがなかった。
const src = fs.readFileSync(new URL('../extension/popup-entry.js', import.meta.url), 'utf8');
const revealAt = src.indexOf('shouldRevealCloakAfterFirstPaint({ snapshotCacheHit, freshRefresh: isFreshRefresh() }).revealNow');
const mainPaintAt = src.indexOf("if (thumbCountEl) thumbCountEl.textContent = '…';\n  paintWatchPopupUi();", revealAt);

/** 文字列とコメントを消して、コードだけを残す(await の見張り用・粗くてよい)。 */
function codeOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''");
}

describe('refresh: キャッシュヒットでも描き直しは1回', () => {
  it('幕を外す判定の分岐の中では描かない', () => {
    expect(revealAt).toBeGreaterThan(0);
    const branch = src.slice(revealAt, src.indexOf('\n  }\n', revealAt));
    expect(codeOnly(branch)).not.toContain('paintWatchPopupUi(');
  });

  it('本描画の直後に幕を外す(キャッシュヒットでも同じ仕事の中で外れる)', () => {
    expect(mainPaintAt).toBeGreaterThan(revealAt);
    const after = src.slice(mainPaintAt, mainPaintAt + 200);
    expect(after).toMatch(/paintWatchPopupUi\(\);\s*markPopupRefreshContentPainted\(\);\s*revealPopupPrimaryOnce\(\);/);
  });

  it('キャッシュヒットの道筋(判定 → 本描画)に await が無い(あると幕が遅れる)', () => {
    const between = src.slice(revealAt, mainPaintAt);
    const missAt = between.indexOf('if (!snapshotCacheHit) {');
    expect(missAt).toBeGreaterThan(0);
    // キャッシュミスの分岐(取得を待つ側)を除いた部分だけを見る
    let depth = 0;
    let end = -1;
    for (let i = missAt + 'if (!snapshotCacheHit) '.length; i < between.length; i += 1) {
      const ch = between[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    expect(end).toBeGreaterThan(missAt);
    const hitPath = between.slice(0, missAt) + between.slice(end + 1);
    expect(codeOnly(hitPath)).not.toMatch(/\bawait\b/);
  });
});
