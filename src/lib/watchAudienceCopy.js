/**
 * watch パネル「観客メモ」用の短文・ツールチップ文言（DOM 非依存）。
 * _debug は本文・title のいずれにも含めない。
 */

const BODY_TEXT =
  '来場者数はニコ生の配信ページが示す累計視聴者（公式統計の watchCount 相当）で、NicoDB（https://nicodb.net/）の来場者数と同系として比較しやすいです。推定同時接続はコメントからの独自見積もりで、公式の同接表示ではありません。HTMLレポートの「来場（応援コメント）」は別定義です。取得は NDGR／embedded 由来・約30秒更新。';

const TITLE_TEXT =
  '累計の来場者数は watch ページの statistics.watchCount 等（取得経路: WebSocket → embedded-data → DOM）。推定同時接続はコメンター法（5分ユニーク×動的倍率）と滞留法の複合。ユニークは記録コメントの userId 種類数（未取得時は https アイコン URL 種類数を ≈ 表示）。';

/**
 * @param {{ snapshot: Record<string, unknown>|null|undefined }} params
 * @returns {{ body: string, title: string }}
 */
export function buildWatchAudienceNote({ snapshot }) {
  void snapshot;
  return {
    body: BODY_TEXT,
    title: TITLE_TEXT
  };
}
