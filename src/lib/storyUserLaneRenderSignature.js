// 応援レーン(renderStoryUserLane)の「見た目が同じなら DOM を付け直さない」ための描画シグネチャを組む純関数。
//   popup-entry.js から signature 生成ロジックだけ抽出（pure refactor・挙動不変）。
//   entry → stableId の解決は popup ローカル(commentStableId/popupEntryStableId)なので **注入**する。
//   依存ゼロ（文字列組み立てのみ）＝循環なし。
//
//   区切り文字は抽出前と同一: (unit separator)=フィールド間 / (record separator)=行間。

const FIELD_SEP = '';
const ROW_SEP = '';

/**
 * 応援レーンの描画シグネチャ文字列を返す（変化検出に使う＝同値なら再描画しない）。
 *
 * @param {{
 *   liveId: string,
 *   colorScheme: 'light'|'dark'|string,
 *   picked: Array<{ displaySrc?: any, meta?: { idLine?: any, nameLine?: any }, profileTier?: any, entry?: any }>,
 *   giftPicks: readonly unknown[],
 *   sourceEntryCount: number,
 *   stableIdOf: (entry: any) => string
 * }} input
 * @returns {string}
 */
export function buildStoryUserLaneRenderSignature(input) {
  const src = /** @type {Record<string, any>} */ (
    input && typeof input === 'object' ? input : {}
  );
  const lid = String(src.liveId || '').trim().toLowerCase();
  const scheme = String(src.colorScheme || 'light');
  const picked = Array.isArray(src.picked) ? src.picked : [];
  const gifts = Array.isArray(src.giftPicks) ? src.giftPicks : [];
  const stableIdOf =
    typeof src.stableIdOf === 'function' ? src.stableIdOf : () => '';

  const giftParts = gifts.map((/** @type {any} */ p) => {
    const row = /** @type {{ displaySrc?: unknown, meta?: { idLine?: unknown, nameLine?: unknown }, entry?: any }} */ (
      p
    );
    const sid = stableIdOf(row.entry);
    return [
      sid,
      String(row.displaySrc || ''),
      String(row.meta?.idLine || ''),
      String(row.meta?.nameLine || '')
    ].join(FIELD_SEP);
  });
  const giftSeg = giftParts.length ? `${ROW_SEP}G:${giftParts.join(ROW_SEP)}` : '|G:0';
  if (!picked.length) {
    const n = Math.max(0, Math.floor(Number(src.sourceEntryCount) || 0));
    return `${lid}|${scheme}|0|src:${n}${giftSeg}`;
  }
  const parts = picked.map((/** @type {any} */ p) => {
    const sid = stableIdOf(p.entry);
    return [
      sid,
      p.displaySrc,
      p.meta.idLine,
      p.meta.nameLine,
      String(p.profileTier)
    ].join(FIELD_SEP);
  });
  return `${lid}|${scheme}|${picked.length}${ROW_SEP}${parts.join(ROW_SEP)}${giftSeg}`;
}
