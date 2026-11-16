/**
 * 【層】L0 判定層(ブラウザI/Oは呼び出し側へ委譲)
 * 【この箱に入るもの】会場の新着コメントを音声と描画へ振り分ける処理
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* の直接操作
 * 【書けるstorageキー】なし
 * 【正本宣言】会場の新着コメントを音声と描画へ振り分ける処理 の判断根拠はこのファイルのみ
 */
/**
 * 会場の live コメント入口。DOM を持つ venueBar から依存を渡し、同じ実行経路を単体実測できる形にする。
 * 閉会場でも processSpeechRows までは必ず通し、描画用 roster だけを止める。
 */
/**
 * @param {{
 *   currentLiveId: () => string, speechLiveId: () => string, resetSpeechTracking: (liveId: string) => void,
 *   liveFeedRows: (rows: ReadonlyArray<Record<string, unknown>>) => Array<Record<string, any>>,
 *   processSpeechRows: (rows: Array<Record<string, any>>, path: string, source: string) => void,
 *   isOpen: () => boolean, rosterDriven: () => boolean, now: () => number,
 *   touchRoster: (row: Record<string, any>, now: number) => void, scheduleRosterCommit: () => void
 * }} deps
 */
export function createVenueLiveCommentHandler(deps) {
  /** @param {string} incomingLiveId @param {ReadonlyArray<Record<string, unknown>>} rows @param {string} [source] */
  return (incomingLiveId, rows, source = '') => {
    const cur = deps.currentLiveId();
    if (!cur || cur !== incomingLiveId) return;
    if (deps.speechLiveId() !== cur) deps.resetSpeechTracking(cur);
    const feedRows = deps.liveFeedRows(rows);
    if (feedRows.length === 0) return;
    deps.processSpeechRows(feedRows, 'live', String(source || ''));
    if (!deps.isOpen() || !deps.rosterDriven()) return;
    const now = deps.now();
    for (const row of feedRows) deps.touchRoster(row, now);
    deps.scheduleRosterCommit();
  };
}
