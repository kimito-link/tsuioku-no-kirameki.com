/**
 * 応援レーンの「確定度(evidence)」判定。
 *
 * レイヤ: domain/ (pure)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★なぜ要るか(ユーザー実機 2026-08-17 / 仕様見直し会議で確定)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   「ここ入れない理由がおかしい」「さむねがとれてコメントもわかるのに」
 *
 * 実機で【匿名(a:)なのに個人サムネと本人設定の表示名を持つ人】がりんく段に出ず、
 * 根拠が何も無い匿名と同じたぬ姉段に埋もれていた。
 *
 * ■ 誤っていた前提(3箇所に明文化されていた)
 *   - `src/domain/user/identity.js` 「a: 接頭辞 — プロフィールは期待できない」
 *   - `src/lib/identityAcquisitionCensus.js` 「匿名は…原理的に存在しない」
 *   ★しかし同じリポジトリが既にこれを否定していた:
 *     - `src/lib/commentRecord.js` は `avatarObserved` を【匿名判定なしに】保存する
 *     - `src/lib/supportGrowthTileSrc.js` の合成URL判定は【数値IDのときだけ】
 *       ＝匿名が http(s) サムネを持てば無条件で「実サムネ(score 2)」と採点される
 *     - `src/extension/story/renderStoryUserLaneDom.js` に
 *       「thumbScore は匿名でも 2 になり得る」と明記されている
 *   ＝採点器は「匿名でも実サムネ」と認めているのに、集計と段分けが手前で捨てていた。
 *
 * ■ 新しい軸: IDの形(桁数・接頭辞)を等級の材料にしない
 *   「匿名か否か」ではなく「素性がどれだけ確定しているか」で測る。
 *
 *     E1 観測サムネ … 本人のサムネを実際に観測した
 *     E2 本人の名前 … 本人が設定した表示名が取れている
 *     E3 数値ID     … 本登録IDだが上記の根拠が未着
 *     E4 根拠なし   … どれも無い
 *
 * ■ ★元の設計意図は捨てない(tanuPolicy の契約)
 *   「非匿名ユーザーの応援が匿名の群れに埋もれない」＝守る利益は
 *   【非匿名が埋もれないこと】であって【匿名が上段に居ないこと】ではない。
 *   根拠ゼロの匿名は E4 に落ちるので、上段へ到達する経路が構造的に存在しない。
 *
 * 掟: 判定するだけ。DOM を触らない・storage を読まない(呼び出し側が渡す)。
 * ★この関数は【計器(v1)と段分けの法(v2)が同じ物差しを使う】ための正本。
 *   知識を共有しても誤読は止まらない。止まるのは判定を共有したときだけ
 *   ([[shared-knowledge-is-not-shared-judgment-2026-08-10]])。
 *
 * @module domain/lane/evidence
 */

import { isNumericNicoUserId } from '../user/identity.js';
import { isStrongNickname } from '../user/nickname.js';

/**
 * 表示層が機械的に合成した匿名ラベルか(本人が設定した名前ではない)。
 *
 * ★なぜ必要か: `src/lib/userRooms.js` の `displayUserLabel` は匿名に対して
 *   「匿名（a:xxxx）」を、匿名番号形式は「匿名123」を合成する。
 *   これを「名前あり」と数えると【保有率100%の嘘】になる
 *   ([[check-what-the-number-counts-2026-08-09]])。
 *
 * ★前方一致 '匿名' の全弾きにはしない。「匿名太郎」のような
 *   【本人が設定した名前】まで殺してしまうため、合成形式の完全一致だけを除く。
 *
 * @param {unknown} nick
 * @returns {boolean}
 */
export function isSyntheticAnonymousLabel(nick) {
  const n = String(nick ?? '').trim();
  if (!n) return false;
  // 「匿名（a:xxxx）」= displayUserLabel 形式(全角括弧)
  if (/^匿名（a:[^）]*）$/.test(n)) return true;
  // 「匿名(a:xxxx)」= 半角括弧の異体も同様に扱う
  if (/^匿名\(a:[^)]*\)$/.test(n)) return true;
  // 「匿名123」= 匿名番号形式
  if (/^匿名\d+$/.test(n)) return true;
  return false;
}

/**
 * @typedef {Object} LaneEvidenceEntry
 * @property {unknown} [userId]
 * @property {unknown} [nickname]                                    保存層の生の表示名(表示層の合成値を渡さないこと)
 * @property {boolean} [avatarObserved]                              単一 boolean の互換フィールド
 * @property {ReadonlySet<string>|string[]} [avatarObservationKinds] 観測ソース集合
 * @property {boolean} [hasNonCanonicalPersonalUrl]                  非合成の個人 URL が判定済みか
 */

/**
 * @typedef {Object} LaneEvidence
 * @property {boolean} hasObservedThumb E1
 * @property {boolean} hasOwnName       E2
 * @property {boolean} hasNumericId     E3
 * @property {'observed'|'named'|'numeric'|'none'} grade 最上位の等級
 */

/**
 * 確定度を判定する。
 *
 * ★`thumbScore === 1`(IDから式で組んだ推測URL)は E1 に数えない。
 *   実在を確認していないため 404 になりうる(実機で実際に404した実績あり)。
 *   呼び出し側は `thumbScore >= 2` を `hasNonCanonicalPersonalUrl` に射影して渡すこと。
 *
 * @param {LaneEvidenceEntry|null|undefined} entry
 * @returns {LaneEvidence}
 */
export function resolveLaneEvidence(entry) {
  const uid = String(entry?.userId || '').trim();

  const kinds = entry?.avatarObservationKinds;
  const hasObservedThumb =
    (kinds instanceof Set && kinds.size > 0) ||
    (Array.isArray(kinds) && kinds.length > 0) ||
    Boolean(entry?.avatarObserved) ||
    Boolean(entry?.hasNonCanonicalPersonalUrl);

  const nick = String(entry?.nickname ?? '').trim();
  const hasOwnName = isStrongNickname(nick, uid) && !isSyntheticAnonymousLabel(nick);

  const hasNumericId = isNumericNicoUserId(uid);

  /** @type {'observed'|'named'|'numeric'|'none'} */
  const grade = hasObservedThumb
    ? 'observed'
    : hasOwnName
      ? 'named'
      : hasNumericId
        ? 'numeric'
        : 'none';

  return { hasObservedThumb, hasOwnName, hasNumericId, grade };
}
