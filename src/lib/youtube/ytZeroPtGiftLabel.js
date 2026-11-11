// ytZeroPtGiftLabel.js — 「この番組へのギフト履歴」の送り主カードで、金額の出ない応援しかしていない人の「0pt」を
//   何を送ったかの札に直すための純関数(2026-11-08 りんく「ポイント0でなぜギフトの欄に?」)。
//
// 【なぜ 0pt になるか】YouTube の新しい「ギフト」(ジュエルで送るスタンプ。例「ハイ を送信しました」)と
//   メンバーシップギフト・メンバー加入は、チャット欄に金額が出ない。pt は「円にしたおよその額」なので 0 になる
//   (ytGiftToNico.js)。お金を使って応援した人なのでギフトの欄に並ぶのは正しいが、「0pt」だけだと
//   「応援していない人が混ざった」ように見える → 何を送ったか(例「ハイ」「ギフト ×2」)を出す。

/**
 * @typedef {{ senderName?: unknown, itemName?: unknown, points?: unknown }} GiftHistoryRow
 * @typedef {{ label: string, title: string, count: number }} ZeroPtSenderLabel
 */

/**
 * 送り主の名前 → カードに出す札。pt のある応援を1件でもした人は入れない(その人は pt で並ぶ)。
 * @param {GiftHistoryRow[]} history ytGiftToNico の subApp.history
 * @returns {Map<string, ZeroPtSenderLabel>}
 */
export function buildZeroPtSenderLabels(history) {
  /** @type {Map<string, { items: Map<string, number>, count: number, hasPoints: boolean }>} */
  const bySender = new Map();
  for (const h of Array.isArray(history) ? history : []) {
    const name = String(h?.senderName ?? '').trim();
    if (!name) continue;
    const cur = bySender.get(name) || { items: new Map(), count: 0, hasPoints: false };
    if (Number(h?.points) > 0) cur.hasPoints = true;
    else {
      const item = String(h?.itemName ?? '').trim() || 'ギフト';
      cur.items.set(item, (cur.items.get(item) || 0) + 1);
      cur.count += 1;
    }
    bySender.set(name, cur);
  }
  /** @type {Map<string, ZeroPtSenderLabel>} */
  const out = new Map();
  for (const [name, s] of bySender) {
    if (s.hasPoints || s.count <= 0) continue;
    const kinds = [...s.items.entries()];
    const label =
      kinds.length === 1
        ? kinds[0][1] > 1
          ? `${kinds[0][0]} ×${kinds[0][1]}`
          : kinds[0][0]
        : `ギフト ×${s.count}`;
    const list = kinds.map(([item, n]) => (n > 1 ? `${item} ×${n}` : item)).join('・');
    out.set(name, {
      label,
      count: s.count,
      title: `${name}: ${list}(金額が出ない応援のため pt は 0 として数えています)`,
    });
  }
  return out;
}

/** カードの数の欄が「0pt」か(「0 pt」「0pt」どちらも・ツイキャスは単位を直した「0 スコア」) @param {unknown} text */
export function isZeroPtCountText(text) {
  return /^0\s*(?:pt|スコア)$/i.test(String(text ?? '').trim());
}
