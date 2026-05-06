/**
 * v0.1.201: 診断 JSON の現在値から「なぜ取れていないか」を導出する純関数群。
 *
 * ユーザー要望「診断見せれば説明不要」を満たすため、ranking autoOpen の
 * 失敗理由と multi-tab race の警告フラグを後付けで導出する。
 *
 * 副作用なし。content-entry.js から渡された snapshot をそのまま判定する。
 */

/**
 * @typedef {{
 *   attemptCount?: number,
 *   lastStatus?: string,
 *   lastSidebarHints?: { hintCount?: number }|null
 * }} AutoOpenSnapshot
 *
 * @typedef {{
 *   hasSnapshot?: boolean,
 *   eventDomLvCount?: number,
 *   nicoadLvCount?: number,
 *   currentLiveIdInEventDom?: boolean|null,
 *   currentLiveIdInNicoad?: boolean|null
 * }} MultiTabSnapshot
 */

/**
 * ranking auto-open の現在状態から失敗理由を 1 トークンで返す。
 *
 * 戻り値（v0.1.201）:
 *   - null                                       … 成功 or 判定不能（attemptCount=0 以外で正常系）
 *   - 'never_attempted'                          … まだ自動オープン未試行
 *   - 'banner_not_rendered_sidebar_empty'        … 開いたが banner も sidebar hint も空（vue 不全の典型）
 *   - 'banner_not_rendered_sidebar_has_hints'    … 開いたが banner なし。hint はある（DOM scan miss の疑い）
 *   - 'sidebar_button_not_found'                 … sidebar を開く button 自体が見つからない
 *   - 'closed'                                   … sidebar が閉じている
 *   - その他文字列                                … lastStatus を素通し
 *
 * @param {AutoOpenSnapshot|null|undefined} autoOpen
 * @returns {string|null}
 */
export function deriveAutoOpenFailureReason(autoOpen) {
  if (!autoOpen || typeof autoOpen !== 'object') return null;
  const attempts =
    typeof autoOpen.attemptCount === 'number' ? autoOpen.attemptCount | 0 : 0;
  if (attempts === 0) return 'never_attempted';

  const status =
    typeof autoOpen.lastStatus === 'string' ? autoOpen.lastStatus : '';
  if (!status) return 'unknown';
  if (status === 'opened-with-banner' || status === 'success') return null;

  if (status === 'opened-but-no-banner') {
    const hints =
      autoOpen.lastSidebarHints && typeof autoOpen.lastSidebarHints === 'object'
        ? autoOpen.lastSidebarHints.hintCount | 0
        : 0;
    return hints === 0
      ? 'banner_not_rendered_sidebar_empty'
      : 'banner_not_rendered_sidebar_has_hints';
  }

  if (status === 'sidebar_button_not_found') return 'sidebar_button_not_found';
  if (status === 'closed') return 'closed';
  return status;
}

/**
 * multi-tab race による DOM bundle の汚染が疑わしいかを bool で返す。
 *
 * 判定（いずれか one でも当てはまれば true）:
 *   - eventDomLvCount > 30                 … 過去 lv の残骸が大量
 *   - currentLiveIdInEventDom === false    … 現在 watch している lv の DOM が混入していない（古い snapshot）
 *   - currentLiveIdInNicoad === false かつ eventDomLvCount > 5
 *
 * @param {MultiTabSnapshot|null|undefined} multiTabDiag
 * @returns {boolean}
 */
export function deriveStaleDomBundleSuspected(multiTabDiag) {
  if (!multiTabDiag || typeof multiTabDiag !== 'object') return false;
  if (!multiTabDiag.hasSnapshot) return false;

  const eventCount =
    typeof multiTabDiag.eventDomLvCount === 'number'
      ? multiTabDiag.eventDomLvCount | 0
      : 0;
  if (eventCount > 30) return true;
  if (multiTabDiag.currentLiveIdInEventDom === false) return true;
  if (multiTabDiag.currentLiveIdInNicoad === false && eventCount > 5)
    return true;
  return false;
}
