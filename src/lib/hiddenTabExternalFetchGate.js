/**
 * v0.1.616: 非可視タブでも外部 API fetch（koken 貢献度 / nicoad 広告 / ギフト履歴 /
 * イベント💎）を一度は走らせてよいか、を決める純関数。
 *
 * 背景（実機 lv350673796 で確証）:
 *   貢献度ランキング等は無認証公式 API の直接 fetch に移行済み（iframe scrape は廃止）。
 *   しかし定期 fetch の interval に「document.visibilityState === 'hidden' なら return」
 *   ガードが残っていたため、視聴者が配信タブから別タブ/別ウィンドウへフォーカスを移すと
 *   koken/nicoad/gift の fetch が丸ごとスキップされ、popup が「取得中」のまま固まった。
 *   可視に戻った瞬間の fetch だけ成功する＝「とれたり取れなかったり」の間欠の真因。
 *
 * 方針（ユーザー選択「未取得時のみ非可視でも叩く」）:
 *   - 可視タブ: 従来どおり常に fetch（この関数は呼ばない or 常に true）。
 *   - 非可視タブ: 対象データが storage にまだ無い（未取得）ものが1つでも残っていれば
 *     fetch を許可する。全部取得済みなら非可視では叩かない（リソース最小・裏で叩き続けない）。
 *   - これにより「一度も取れていない間欠」だけを潰し、取れたら裏では静かになる。
 *
 * 副作用なし（storage も時刻も触らない）。呼び出し側が storage 有無の boolean を渡す。
 *
 * @module hiddenTabExternalFetchGate
 */

/**
 * 非可視タブで外部 API fetch を実行すべきか。
 *
 * @param {object} args
 * @param {boolean} args.tabHidden タブが現在 hidden か。
 * @param {boolean[]} args.targetsAcquired 各取得対象が「storage に取得済みか」の真偽配列。
 *   1つでも false（未取得）が残っていれば非可視でも叩く。空配列なら（対象判定なし）
 *   非可視では叩かない（false）。
 * @returns {boolean} true なら fetch を実行してよい。
 */
export function shouldRunExternalFetchWhileHidden(args) {
  const tabHidden = args?.tabHidden === true;
  // 可視タブはこの関数の管轄外＝常に実行可（呼び出し側ガードと二重化しても安全）。
  if (!tabHidden) return true;
  const targets = Array.isArray(args?.targetsAcquired) ? args.targetsAcquired : [];
  if (targets.length === 0) return false;
  // 未取得（false）が1つでも残っていれば、非可視でも一度は取りにいく。
  return targets.some((acquired) => acquired !== true);
}
