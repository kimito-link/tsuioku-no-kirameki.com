/**
 * watch パネル「観客メモ」用の短文・ツールチップ文言（DOM 非依存）。
 * _debug は本文・title のいずれにも含めない。
 */

const BODY_TEXT =
  '公式の数値ではありません。来場者は NDGR / embedded から約30秒更新。推定同時接続は直近5分のコメンター×倍率と滞留の複合見積もりです。';

const TITLE_TEXT =
  '推定同時接続はコメンター法（5分ユニーク×動的倍率・規模に応じ5〜28）と滞留法（来場者×残留率・経過時間で減衰）の幾何平均。ユニークは userId の種類数（未取得時は https アイコン URL 種類数を ≈ 表示）。';

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
