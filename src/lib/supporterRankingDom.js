/**
 * 応援者ランキングの行リスト DOM ビルダー(本物の人物タイルでそっくり)。
 *
 * status-entry.js#buildSupporterExpander の行描画(ランクバッジ + 人物タイル + 件数)を、
 * status / 純Web 両方から再利用できる形に切り出したもの(似せて自作しない・v0.1.937 と同一見た目)。
 * §3.5: 名前+件数だけでなくサムネ・ID・ハンドル名・リンクをセットで出す(応援者は主役・表彰)。
 *
 * 本物の supporterRowToPersonTile→buildPersonTileEl を再利用する。これらと avatar 導出/meta の
 * 注入(tileIo)・描画 I/O(domIo)は呼び出し側が渡す(status と純Webで微妙に違う=匿名 identicon の
 * upgradeAnonymousAvatarImage を純Webは渡さない 等)。chrome 非依存。
 *
 * @module supporterRankingDom
 */

/**
 * @typedef {{
 *   supporterRowToPersonTile: (row: any, tileIo: any) => any,
 *   buildPersonTileEl: (item: any, domIo: any) => HTMLElement,
 *   tileIo: any,
 *   domIo: any
 * }} SupporterRankingDomIo
 */

/**
 * 応援者ランキングの行リスト(ランクバッジ + 人物タイル + 件数)を入れたコンテナを返す。
 *
 * 元の buildSupporterExpander の行ループと完全同一:
 *   - 🥇🥈🥉(rank 1-3) / それ以外は `${rank}.`(rank 欠落は連番フォールバック)
 *   - 本物 supporterRowToPersonTile→buildPersonTileEl(数値uid はリンク・匿名は identicon)
 *   - 件数は千区切り
 *
 * @param {Array<{rank?: number, userId?: string, name?: string, avatarUrl?: string, count?: number, isAnonymous?: boolean}>|null|undefined} rows
 * @param {SupporterRankingDomIo} io
 * @returns {HTMLElement} 行を内包した div(呼び出し側が好きな親へ append)
 */
export function buildSupporterRankingRows(rows, io) {
  const host = document.createElement('div');
  const list = Array.isArray(rows) ? rows : [];
  const medals = ['🥇', '🥈', '🥉'];
  let i = 0;
  for (const r of list.slice(0, 10)) {
    i += 1;
    const rank = Number(r?.rank) || i; // rank 欠落は連番フォールバック。
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:3px 0;';
    const badge = document.createElement('span');
    badge.textContent = medals[rank - 1] || `${rank}.`;
    badge.style.cssText = 'flex:0 0 auto;width:22px;text-align:center;';
    // 本物の buildPersonTileEl(応援レーンと同じ I/O)を再利用=似せて自作しない。匿名は identicon。
    const tileItem = io.supporterRowToPersonTile(r, io.tileIo);
    const tile = io.buildPersonTileEl(tileItem, io.domIo);
    tile.style.flex = '1 1 auto';
    tile.style.minWidth = '0';
    const cnt = document.createElement('span');
    cnt.textContent = `${Number(r?.count || 0).toLocaleString('ja-JP')}件`;
    cnt.style.cssText = 'flex:0 0 auto;color:var(--nl-text-soft);font-variant-numeric:tabular-nums;';
    row.append(badge, tile, cnt);
    host.appendChild(row);
  }
  return host;
}
