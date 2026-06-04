/**
 * v0.1.636: HTML レポートの「ユーザー別集計テーブル」行ビルダ（純ロジック）。
 *
 * popup-entry.js#buildHtmlReportDocument のインライン `roomRows`（15835-15864・v0.1.635 時点）を
 * **挙動不変**で抽出した C-7 系 pure refactor。view-model（集計済み room 配列）→ `<tr>` HTML
 * 文字列配列の純変換。`chrome.*` を一切参照しない（Web版 app/app.js でも再利用可）。
 *
 * ⚠️ 閉包依存は**4つ**（会議室の地雷指摘・全て引数化して非決定を排除）:
 *   1. userKeyToTotalChars (Map) — 入力化。lib 内で再計算しない（heavy/non-heavy で別経路構築の
 *      結果をそのまま渡す契約）。
 *   2. displayUserLabel — 注入。
 *   3. buildUserProfileLinkedLabelHtml — 注入（内部で escape 済みを返すので二重 escape しない）。
 *   4. resolveReportUserThumbSrc + identiconResolver — 注入（identicon キャッシュ参照＝非決定）。
 *
 * ⚠️ 厳密保全ポイント:
 *   - `avgChars = count > 0 ? Math.round((totalChars/count)*10)/10 : 0`（小数1桁丸め）。
 *   - `data-search` は `` `${label} ${nickname||''} ${userKey} ${lastText||''} ${count} ${totalChars}` ``
 *     の**6部・スペース込み**を toLowerCase + escapeAttr。連結順を変えない。
 *   - `${totalChars}（平均 ${avgChars}）` の**全角括弧**。
 *   - avatar 空は `report-room-av--empty` span。img 属性順も保全。
 *   - Map iteration 順序ではなく **aggregatedRooms の順序**で出力（呼び出し側の順序が正）。
 *
 * @module reportUserRoomTableHtml
 */

import { escapeHtml, escapeAttr } from './htmlEscape.js';

/**
 * @typedef {object} AggregatedRoom
 * @property {string} userKey ユーザーキー（数値 ID / 匿名 a:... / UNKNOWN）。
 * @property {string} [nickname] ニックネーム。
 * @property {number} count コメント数。
 * @property {string} [lastText] 最新コメント本文。
 * @property {string} [avatarUrl] アバター URL（空なら resolver が既定を解決）。
 */

/**
 * ユーザー別集計テーブルの `<tr>` HTML 文字列配列を組み立てる。
 *
 * @param {AggregatedRoom[]} aggregatedRooms 集計済み room 配列（順序は呼び出し側の責務）。
 * @param {object} deps
 * @param {Map<string, number>} deps.userKeyToTotalChars userKey→累計字数（入力化）。
 * @param {(userKey: string, nickname?: string) => string} deps.displayUserLabel 表示ラベル生成。
 * @param {(userKey: string, label: string) => string} deps.buildUserProfileLinkedLabelHtml
 *   ラベル HTML 生成（数値 ID はリンク・匿名は escape 済みテキスト・**内部で escape 済み**）。
 * @param {(args: { userId: string, avatarUrl: string, identiconResolver: Function }) => string}
 *   deps.resolveReportUserThumbSrc アバター URL 解決。
 * @param {Function} deps.identiconResolver 匿名 identicon data URL 解決（キャッシュ参照）。
 * @returns {string[]} 各 room 1 件 = 1 文字列（元実装の `.map` と同じ要素・同じ順序）。
 */
export function buildReportUserRoomRows(aggregatedRooms, {
  userKeyToTotalChars,
  displayUserLabel,
  buildUserProfileLinkedLabelHtml,
  resolveReportUserThumbSrc,
  identiconResolver
}) {
  const list = Array.isArray(aggregatedRooms) ? aggregatedRooms : [];
  const totalCharsMap = userKeyToTotalChars instanceof Map ? userKeyToTotalChars : new Map();
  return list.map((room) => {
    const label = displayUserLabel(room.userKey, room.nickname);
    // 数値 ID のときだけ niconico ユーザーページへのリンクで包む
    // （匿名・ハッシュ・未取得は escapeHtml されたテキストのみ）。
    const labelHtml = buildUserProfileLinkedLabelHtml(room.userKey, label);
    const totalChars = totalCharsMap.get(room.userKey) || 0;
    const avgChars = room.count > 0 ? Math.round((totalChars / room.count) * 10) / 10 : 0;
    const search = escapeAttr(
      `${label} ${room.nickname || ''} ${room.userKey} ${room.lastText || ''} ${room.count} ${totalChars}`.toLowerCase()
    );
    // 0.1.12 (F): 「最低サムネ」を必ず出す。avatarUrl が空でも数値 ID なら
    // ニコ既定 CDN URL、匿名 a:... なら identicon SVG data URL を使う。
    const avatarSrc = resolveReportUserThumbSrc({
      userId: room.userKey,
      avatarUrl: room.avatarUrl || '',
      identiconResolver
    });
    const avatarCell = avatarSrc
      ? `<img class="report-room-av" src="${escapeAttr(avatarSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
      : '<span class="report-room-av report-room-av--empty"></span>';
    return `
      <tr class="search-item" data-search="${search}">
        <td>${avatarCell}</td>
        <td>${labelHtml}</td>
        <td>${room.count}</td>
        <td>${totalChars}（平均 ${avgChars}）</td>
        <td>${escapeHtml(room.lastText || '')}</td>
      </tr>
    `;
  });
}
