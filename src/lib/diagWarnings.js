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
 *   lastSidebarHints?: { hintCount?: number }|null,
 *   lastDetailCode?: string
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
 *   - 'rank_tab_not_found'                       … `opened-but-no-banner` かつランキングタブ未検出（content-entry が lastDetailCode で渡す）
 *   - 'ranking_dom_timeout'                      … タブは押したが所定時間内にスクレイパ可能な行が出なかった
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
    const detail = String(autoOpen.lastDetailCode || '').trim();
    if (detail === 'rank_tab_not_found') return 'rank_tab_not_found';
    const hints =
      autoOpen.lastSidebarHints && typeof autoOpen.lastSidebarHints === 'object'
        ? autoOpen.lastSidebarHints.hintCount | 0
        : 0;
    return hints === 0
      ? 'banner_not_rendered_sidebar_empty'
      : 'banner_not_rendered_sidebar_has_hints';
  }

  if (status.startsWith('opened-no-banner-no-ranking')) {
    const detail = String(autoOpen.lastDetailCode || '').trim();
    if (detail === 'ranking_dom_timeout') return 'ranking_dom_timeout';
  }

  if (status === 'sidebar_button_not_found') return 'sidebar_button_not_found';
  if (status === 'closed') return 'closed';
  return status;
}

/**
 * v0.1.203: gift sub-app の取得失敗理由を 1 トークンで返す。
 *
 * 戻り値:
 *   - null                            … 取得できている（historyCount > 0）
 *   - 'no_iframe_found'               … iframe 自体が無い（page 構造変更の疑い）
 *   - 'cross_origin_iframe_only'      … iframe あるが全部 cross-origin（仕様、NDGR 経路に頼る）
 *   - 'iframe_present_but_no_history' … iframe scrape できるが履歴 0（タイミング or DOM 変更）
 *
 * Agent A の deep research で判明：niconico のギフトサイドバーは cross-origin iframe で
 * 隔離されており、Chrome 拡張の content_script では中身を読めない。これを「異常」ではなく
 * 「仕様」として reason 化することで、ユーザーが「DOM scrape 失敗 = バグ」と誤解しないよう
 * にする。代替路は NDGR Protobuf gift event の `advertiserUserId/Name/contributionRank/point`。
 *
 * @param {{ historyCount?: number, iframeCount?: number, scrapableFrameCount?: number }|null|undefined} subApp
 * @returns {string|null}
 */
export function deriveGiftSubAppFailureReason(subApp) {
  if (!subApp || typeof subApp !== 'object') return null;
  const hc = typeof subApp.historyCount === 'number' ? subApp.historyCount | 0 : 0;
  const ifc = typeof subApp.iframeCount === 'number' ? subApp.iframeCount | 0 : 0;
  const sfc =
    typeof subApp.scrapableFrameCount === 'number'
      ? subApp.scrapableFrameCount | 0
      : 0;

  if (hc > 0) return null;
  if (ifc === 0) return 'no_iframe_found';
  if (sfc === 0) return 'cross_origin_iframe_only';
  return 'iframe_present_but_no_history';
}

/**
 * multi-tab race による DOM bundle の汚染が疑わしいかを bool で返す。
 *
 * 判定（いずれか one でも当てはまれば true）:
 *   - currentLiveIdInEventDom === false    … 現在 watch している lv の DOM が混入していない（古い snapshot＝本当に怪しい）
 *   - eventDomLvCount > 60                  … prune が複数周期効かない異常膨張のみ
 *   - currentLiveIdInNicoad === false かつ eventDomLvCount > 10
 *
 * v0.1.834: 件数しきいを 30→60 へ。pruneStaleEventDomLvs の LRU 上限(DEFAULT_MAX_KEEP=30)と
 *   旧 `>30` が同値で結合していたため、prune が正常に上限 30 件 keep した直後に新しい lv が1件来ただけで
 *   31→誤警告が立っていた(実機 eventDomLvCount:31)。表示には現在 lv の単数 bundle しか使わず
 *   (northStarLaneReason は単数受領・lv 切替で lastOfficialEventDomBundle=null 強制初期化)実害は無い＝
 *   この警告は「自分の配信の痕跡が消えている(currentLiveIdInEventDom=false)」か「prune が効かない異常膨張」
 *   のときだけ意味を持つ。星野ロミ式・誤検知(失敗体験)の除去。正本=council/stale-dom-bundle-SYNTHESIS.md。
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
  // 本当に怪しいのは「今見ている配信の痕跡が eventDom に無い」とき(別タブの世界を見ている疑い)。
  if (multiTabDiag.currentLiveIdInEventDom === false) return true;
  // 単なる件数は LRU 上限(30)直後の +1 で誤検知する。prune が効かない異常膨張(>60)のみ警告。
  if (eventCount > 60) return true;
  if (multiTabDiag.currentLiveIdInNicoad === false && eventCount > 10)
    return true;
  return false;
}
