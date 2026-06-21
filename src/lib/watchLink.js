/**
 * 状態ページ(status)から放送(ニコ生 watch ページ)へ行く導線の純ロジック(v0.1.864)。
 *
 * 背景(ユーザー要望 2026-06-21「診断ページから放送に行けるモード=その方が整理しやすい」):
 *   複数配信を同時記録していることが多く、status で全体を見てから個別の放送に飛びたい。星野ロミ式
 *   会議(council)で A案=各配信カードに状態別ボタンを採用(B/C は二重表示・共通ナビ正本汚染で却下)。
 *
 * 設計(星野ロミ式・self-verifying):
 *   - 死にリンクにしない: watch URL は lv から機械生成(lv 検証付き・不正ならボタンを出さない)。
 *   - 失敗体験の除去: 今そのタブを開いていれば切替、無ければ新規タブ、終了済みはアーカイブ文言。
 *     無効化(グレーアウト)はしない=「押したのに何も起きない」を避け、文言で予告する。
 *   - 既存データを活かす: 新規 storage/ページ無し。lv・endedAt と tab マップ(既存 tabs.query 由来)だけ。
 *   - 判定を1つの正本に: 状態→アクションの分岐はこの純関数に集約(status-entry は結果に従うだけ)。
 *
 * @typedef {{ tabId: number, windowId: number }} WatchTabEntry
 * @typedef {{
 *   kind: 'switch'|'open'|'archive',
 *   label: string,
 *   url: string|null,
 *   tabId: number|null,
 *   windowId: number|null
 * }} OpenAction
 */

/** lv が正規(lv+数字1〜15桁)か。enumerateActiveLives と同じ検証を再利用。 @param {unknown} lv */
export function isValidLiveId(lv) {
  return /^lv\d{1,15}$/.test(String(lv || '').trim().toLowerCase());
}

/**
 * lv から watch URL を機械生成。不正な lv は null(死にリンクを作らない)。
 * @param {unknown} lv
 * @returns {string|null}
 */
export function watchUrlForLive(lv) {
  const id = String(lv || '').trim().toLowerCase();
  if (!isValidLiveId(id)) return null;
  return `https://live.nicovideo.jp/watch/${id}`;
}

/**
 * 配信の状態(lv/終了フラグ/タブの有無)から「放送を開く」アクションを決める純関数。
 *   lv 不正(URL を作れない)なら null=ボタンを出さない(死にリンクより出さない方が正直)。
 * @param {{ lv?: unknown, endedAt?: unknown, tabEntry?: WatchTabEntry|null }} live
 * @returns {OpenAction|null}
 */
export function pickOpenAction(live) {
  const url = watchUrlForLive(live?.lv);
  if (!url) return null; // lv 不正=ボタンを出さない。
  const ended = !!live?.endedAt;
  const tab = live?.tabEntry;
  const hasTab =
    tab && Number.isFinite(Number(tab.tabId)) && Number(tab.tabId) >= 0;

  if (ended) {
    // 終了済み: watch URL は終了後もアーカイブ/コミュニティ案内に解決=死にリンクにならない。
    //   無効化せず「終了済み」と予告する文言で新規タブを開く。
    return { kind: 'archive', label: '配信ページを開く(終了済み)', url, tabId: null, windowId: null };
  }
  if (hasTab) {
    // 放送中・今そのタブを開いている=切替が最短(整理しやすい要望の核心)。
    return {
      kind: 'switch',
      label: 'この放送に切替',
      url,
      tabId: Number(tab.tabId),
      windowId: Number.isFinite(Number(tab.windowId)) ? Number(tab.windowId) : null
    };
  }
  // 放送中・タブが無い(リロード後など)=新規タブで開く。
  return { kind: 'open', label: '放送を開く', url, tabId: null, windowId: null };
}
