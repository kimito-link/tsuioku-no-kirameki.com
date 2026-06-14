// venueRoster.js
// 2026-06-14 ユーザー要望「今会場にいるメンバーを視覚的に確認できるボタン・AIも人間も検証
//   しやすい診断シート」。会場の席割り結果から「誰が・どこに・顔付きか/点描か」の表データを
//   作る純関数。DOM 非依存(テスト可能)。venueBar が一覧パネルとして描画する。
//
// これがあると、実機を直接見られない検証(AI含む)でも「482人中、何人が顔付き席に出て、
// 何人が点描に逃げているか」を data で確認できる(今回の不整合の再発防止にも効く)。

/**
 * @typedef {{ userId?: string, name?: string, avatar?: string, key?: string, count?: number, hasGift?: boolean }} RosterParticipant
 * @typedef {{ seatIndex: number, participant: RosterParticipant }} RosterSeat
 */

import { participantHasEffectiveThumbnail } from './venueSeats.js';

/**
 * 会場の名簿(誰がどこにいるか)を表データ化する純関数。
 *
 * @param {{ allSeats?: RosterSeat[], visibleSeats?: RosterSeat[], audienceCount?: number }} [input]
 *   allSeats=席を持つ全参加者(seatIndex昇順) / visibleSeats=実際に画面に出ている席 /
 *   audienceCount=席に座らず後方の点描に逃げた観客(匿名等)の概算人数
 * @returns {{
 *   rows: Array<{ seatIndex: number, userId: string, name: string, hasThumb: boolean, visible: boolean, isGift: boolean }>,
 *   summary: { total: number, visible: number, hidden: number, withThumb: number, thumbVisible: number, audience: number }
 * }}
 *   rows=参加者ごとの行(seatIndex昇順) / summary=集計(全体/表示中/隠れ/サムネ持ち等)
 */
export function buildVenueRoster(input = {}) {
  const allSeats = Array.isArray(input.allSeats) ? input.allSeats : [];
  const visibleSeats = Array.isArray(input.visibleSeats) ? input.visibleSeats : [];
  const audienceCount = Math.max(0, Math.floor(Number(input.audienceCount) || 0));

  const visibleKeys = new Set(
    visibleSeats.map((s) => String(s?.participant?.key || s?.participant?.userId || '').trim())
  );

  const rows = allSeats.map((s) => {
    const p = s?.participant || {};
    const key = String(p.key || p.userId || '').trim();
    // 席の描画と同じ実効サムネ判定(stored avatar か 数値userId 由来アイコン)。
    //   participant.avatar だけ見ると、席ではアイコンが出てるのに診断で0人になる不整合が出る。
    const hasThumb = participantHasEffectiveThumbnail(p);
    return {
      seatIndex: Number(s?.seatIndex) || 0,
      userId: String(p.userId || '').trim(),
      name: String(p.name || '').trim(),
      hasThumb,
      visible: visibleKeys.has(key),
      isGift: !!p.hasGift
    };
  });
  rows.sort((a, b) => a.seatIndex - b.seatIndex);

  const withThumb = rows.filter((r) => r.hasThumb).length;
  const thumbVisible = rows.filter((r) => r.hasThumb && r.visible).length;
  const visible = rows.filter((r) => r.visible).length;

  return {
    rows,
    summary: {
      total: rows.length,
      visible,
      hidden: rows.length - visible,
      withThumb,
      thumbVisible,
      audience: audienceCount
    }
  };
}

/**
 * 名簿サマリを1行のテキストにする(診断ログ/ツールチップ用・人間とAIが読める)。
 * @param {Partial<ReturnType<typeof buildVenueRoster>['summary']>} [summary]
 * @returns {string}
 */
export function formatVenueRosterSummary(summary) {
  const s = summary || {};
  const total = Number(s.total) || 0;
  const visible = Number(s.visible) || 0;
  const withThumb = Number(s.withThumb) || 0;
  const thumbVisible = Number(s.thumbVisible) || 0;
  const audience = Number(s.audience) || 0;
  return (
    `席を持つ参加者 ${total}人 / 画面表示中 ${visible}人 / 隠れ ${total - visible}人 ` +
    `・サムネ持ち ${withThumb}人(うち表示 ${thumbVisible}人) ・ 後方観客(点描) ${audience}人`
  );
}
