/**
 * 0.1.1959: 公式ランキングの中身の指紋。中身が前回と同じなら storage に書き直さない。
 *
 * TikTok・SHOWROOM などの入口は、順位が変わっていなくても決まった間隔で同じ表を送ってくる。
 * 書き直すたびに storage の変化が起き、横の欄は(このキーは間引きの対象外なので)すぐ描き直し、
 * 入口 shim はその配信の全行を組み立て直していた。順位・名前・数・顔・期間が同じなら書かない。
 *
 * @param {unknown} rows
 * @param {string} [period]
 * @returns {string}
 */
export function ytLeaderboardSig(rows, period = '') {
  const list = Array.isArray(rows) ? rows : [];
  const parts = list.map((r) => {
    const o = /** @type {any} */ (r) || {};
    return `${Number(o.rank) || 0}\u0001${String(o.name || '')}\u0001${Number(o.xp) || 0}\u0001${String(o.iconUrl || '')}`;
  });
  return `${String(period || '')}\u0002${parts.join('\u0003')}`;
}
