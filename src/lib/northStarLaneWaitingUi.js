/**
 * 北極星「公式値レーン」の取得待ち（not_yet / iframe_unrendered）用 UI 断片。
 * HTML はテンプレのみ（メッセージは popup-entry 側で textContent 差し替え）。
 */

import { escapeAttr } from '../shared/html/escape.js';

/** @typedef {{ badge: string, line: string }} NorthStarWaitLine */

/** @type {ReadonlySet<string>} */
export const NORTH_STAR_WAITING_STATES = new Set(['not_yet', 'iframe_unrendered']);

/**
 * v0.1.332: 「待機UIの正直化」の発火閾値（ミリ秒）。
 *
 * rescue-link 配信（「お困りの方はこちら」が出る broadcaster 等）では koken API /
 * 公式 DOM / iframe の 3 経路とも永久に空になり、`iframe_unrendered` の待機UIが
 * 永遠に出続けて「固まった」印象を与える（真因3）。一定時間（この閾値）を超えても
 * 取得できないときだけ、「この配信では公式の貢献度一覧が取得できないようです
 * （配信者側の設定によります）」という確定文言へ**単方向 1 回だけ**遷移する。
 *
 * 50s は handoff 設計の 45-60s 範囲の中央。短すぎると「取れる配信」を諦めたと
 * 誤認させ、長すぎると固まった印象が残る。数値（順位/件数）は一切出さない
 * （feedback_ndgr_field6_silence 遵守）。
 */
export const NORTH_STAR_WAIT_HONEST_THRESHOLD_MS = 50_000;

/**
 * 確定文言（取得不能を正直に伝える）。rescue-link 配信などで閾値超過時に出す。
 * 数値は出さず、原因を断定しない（「配信者側の設定によります」）。
 * @param {string} laneId
 * @returns {string|null} 該当レーンの確定文言。対象外は null
 */
function getNorthStarWaitGiveUpFootnote(laneId) {
  const lid = String(laneId || '');
  if (lid === 'contributionRanking') {
    return '（この配信では公式の貢献度一覧が取得できないようです。配信者側の設定によります）';
  }
  if (lid === 'giftHistory') {
    return '（この配信では公式のギフト一覧が取得できないようです。配信者側の設定によります）';
  }
  return null;
}

/**
 * elapsedMs が確定文言へ遷移する閾値を超えているか（数値が有限で閾値以上）。
 * 省略時（undefined）/ 非数値 / 閾値未満は false ＝現行の待機文言のまま（後方互換）。
 * @param {number|undefined} elapsedMs
 * @returns {boolean}
 */
function isNorthStarWaitElapsedOverThreshold(elapsedMs) {
  return (
    typeof elapsedMs === 'number' &&
    Number.isFinite(elapsedMs) &&
    elapsedMs >= NORTH_STAR_WAIT_HONEST_THRESHOLD_MS
  );
}

/**
 * v0.1.615: イベント系2レーン（eventBroadcasters / eventVotingSupporters）の
 * 「問い合わせ中」固まり対策のタイムアウト（ミリ秒）。
 *
 * 真因: 公式 API バンドル取得の async チェーンが throw / hang すると hide 判定
 * （refreshAllNorthStarMirrorLanes）へ到達せず、イベント非参加配信でも待機UIが
 * 永久に残った（[[reference_event_ranking_lane_stuck_waiting_v0614]]）。案1（finally
 * 保証）で throw 経路は塞いだが、await が永久 pending（hang）になる経路に備えて、
 * 待機開始から本閾値を超えても rows が一度も来ないイベント系レーンは畳む（=非参加確定）。
 *
 * 13s は contributionRanking 等の 50s 確定文言より短い。イベント参加判定は無認証
 * 公式 API が即答する設計（DOM iframe 待ちが不要）なので、参加中なら通常この時間内に
 * rows が来る。短すぎて参加中の配信を取りこぼさないよう、参加中（rows>0）なら
 * 通常経路の show が先に走り、タイムアウト hide はそもそも発火しない（呼び出し側でガード）。
 */
export const NORTH_STAR_EVENT_LANE_WAIT_TIMEOUT_MS = 13_000;

/**
 * タイムアウトで畳む対象のイベント系レーン id（公式 API 即答前提のレーンのみ）。
 * 貢献度/ギフト履歴（iframe 経由・50s 確定文言を別途持つ）は対象外。
 * @type {ReadonlySet<string>}
 */
export const NORTH_STAR_EVENT_LANE_TIMEOUT_TARGETS = new Set([
  'eventBroadcasters',
  'eventVotingSupporters'
]);

/**
 * v0.1.615: イベント系レーンが待機開始からタイムアウトを超えたか（純関数・同期判定）。
 *
 * elapsedMs が省略 / 非数値 / 閾値未満なら false（畳まない＝現行の待機UIのまま）。
 * 呼び出し側は「rows が一度も来ていない」ことを別途確認した上でのみ本判定で hide する。
 * @param {number|undefined} elapsedMs 待機開始からの経過ミリ秒
 * @param {number} [timeoutMs] 既定 NORTH_STAR_EVENT_LANE_WAIT_TIMEOUT_MS
 * @returns {boolean}
 */
export function isNorthStarEventLaneWaitTimedOut(
  elapsedMs,
  timeoutMs = NORTH_STAR_EVENT_LANE_WAIT_TIMEOUT_MS
) {
  return (
    typeof elapsedMs === 'number' &&
    Number.isFinite(elapsedMs) &&
    elapsedMs >= timeoutMs
  );
}

/**
 * @param {unknown} state
 * @returns {boolean}
 */
export function isNorthStarLaneWaitingState(state) {
  return NORTH_STAR_WAITING_STATES.has(String(state || '').trim());
}

/**
 * @param {string} laneId
 * @param {string} state `not_yet` | `iframe_unrendered`
 * @param {number} [elapsedMs] v0.1.332: 待機開始からの経過ミリ秒（省略可）。
 *   `iframe_unrendered` で閾値超過時のみ確定文言へ単方向遷移。省略時は現行と完全同一。
 * @returns {string} プレーン文言（textContent 用）
 */
export function getNorthStarWaitFootnote(laneId, state, elapsedMs) {
  const st = String(state || '').trim();
  const lid = String(laneId || '');
  // v0.1.332: 取得不能を正直に伝える確定文言（rescue-link 配信等）。
  //   iframe_unrendered が閾値超で続くときだけ。not_yet（起動直後）には出さない。
  if (st === 'iframe_unrendered' && isNorthStarWaitElapsedOverThreshold(elapsedMs)) {
    const giveUp = getNorthStarWaitGiveUpFootnote(lid);
    if (giveUp) return giveUp;
  }
  if (st === 'not_yet') {
    if (lid === 'eventScore') {
      return '（イベント累計スコアの反映を待っています）';
    }
    if (lid === 'programPoints') {
      return '（番組累計ポイントの反映を待っています）';
    }
    if (lid === 'eventRank') {
      return '（イベント現在順位の反映を待っています）';
    }
    if (lid === 'adRanking') {
      return '（広告ランキングの反映を待っています）';
    }
    if (lid === 'contributionRanking') {
      return '（貢献度ランキングの反映を待っています）';
    }
    if (lid === 'giftHistory') {
      return '（ギフト履歴の反映を待っています）';
    }
    return '（起動直後・取得処理の途中です）';
  }
  if (st === 'iframe_unrendered') {
    // v0.1.619: koken 公式 API 直叩きに移行済み。「まだ開いていない（タブ未オープン）」は
    //   誤情報なので「公式から問い合わせ中」に統一。
    if (laneId === 'giftHistory') {
      return '（公式のギフト履歴を問い合わせ中です）';
    }
    if (laneId === 'contributionRanking') {
      return '（公式の貢献度ランキングを問い合わせ中です）';
    }
    return '（公式ページの表示を待っています）';
  }
  return '（取得状況を確認しています）';
}

/**
 * りんく／こん太／たぬ姉のローテーション台詞。
 *
 * @param {string} laneId
 * @param {string} state
 * @param {number} [elapsedMs] v0.1.332: 待機開始からの経過ミリ秒（省略可）。
 *   `iframe_unrendered` で閾値超過時のみ確定メッセージ（ローテーションせず1件）へ
 *   単方向遷移。省略時は現行と完全同一。
 * @returns {readonly NorthStarWaitLine[]}
 */
export function getNorthStarWaitRotationMessages(laneId, state, elapsedMs) {
  const st = String(state || '').trim();
  const lid = String(laneId || '');

  // v0.1.332: 取得不能が確定したら、回し続けず「諦め」を1件だけ正直に伝える。
  //   点滅・ローテーションは固まった印象を強めるので単一メッセージにする。
  if (st === 'iframe_unrendered' && isNorthStarWaitElapsedOverThreshold(elapsedMs)) {
    if (lid === 'contributionRanking') {
      return Object.freeze([
        Object.freeze({
          badge: 'こん太',
          line: 'この配信では公式の貢献度一覧が出ないみたい。配信者さんの設定によることがあるよ。'
        })
      ]);
    }
    if (lid === 'giftHistory') {
      return Object.freeze([
        Object.freeze({
          badge: 'こん太',
          line: 'この配信では公式のギフト一覧が出ないみたい。配信者さんの設定によることがあるよ。'
        })
      ]);
    }
  }

  if (st === 'iframe_unrendered' && lid === 'contributionRanking') {
    // v0.1.619: koken 公式 API 直叩きに移行済み。「ランキングタブを開いて」は撤去。
    return Object.freeze([
      Object.freeze({
        badge: 'りんく',
        line: 'ニコニコの公式から、貢献度ランキングを問い合わせ中だよ。'
      }),
      Object.freeze({
        badge: 'こん太',
        line: 'もうちょっとだけ待ってて。出たら横に並べるね。'
      }),
      Object.freeze({
        badge: 'たぬ姉',
        line: 'ギフトがまだ少ない配信だと、ここは空のままになることがあるわよ。'
      })
    ]);
  }

  if (st === 'iframe_unrendered' && lid === 'giftHistory') {
    // v0.1.619: koken 公式 API（/histories）直叩きに移行済み。「履歴タブを開いて」は撤去。
    return Object.freeze([
      Object.freeze({
        badge: 'りんく',
        line: 'ニコニコの公式から、ギフト履歴を問い合わせ中だよ。'
      }),
      Object.freeze({
        badge: 'こん太',
        line: 'まだ空っぽに見えるときは、もう少し待っててね。'
      }),
      Object.freeze({
        badge: 'たぬ姉',
        line: '焦らずで大丈夫。表示が付いたらここに並べるわ。'
      })
    ]);
  }

  if (st === 'not_yet') {
    if (lid === 'eventScore') {
      return Object.freeze([
        Object.freeze({
          badge: 'りんく',
          line: 'イベントの累計スコアを探しているよ。少し待ってて。'
        }),
        Object.freeze({
          badge: 'こん太',
          line: '参加していない配信だと、ここは空のままになることがあるよ。'
        }),
        Object.freeze({
          badge: 'たぬ姉',
          line: '公式のバナーや数値が付いたら、ここに出るわ。'
        })
      ]);
    }
    if (lid === 'programPoints') {
      return Object.freeze([
        Object.freeze({
          badge: 'りんく',
          line: '番組の累計ポイントを、配信ページから拾っているよ。'
        }),
        Object.freeze({
          badge: 'こん太',
          line: '数字が出たら、ここにすぐ並べるね。'
        }),
        Object.freeze({
          badge: 'たぬ姉',
          line: 'ページの表示と、裏で受け取った数値を照合してから出すわ。'
        })
      ]);
    }
    if (lid === 'eventRank') {
      return Object.freeze([
        Object.freeze({
          badge: 'りんく',
          line: 'イベントの順位は、公式のバナー表示を優先して待ってる。'
        }),
        Object.freeze({
          badge: 'こん太',
          line: 'イベントに出ていない配信だと、順位は出ないことが多いよ。'
        }),
        Object.freeze({
          badge: 'たぬ姉',
          line: '参考として貢献度上位も並べるけど、順位そのものとは別物よ。'
        })
      ]);
    }
    if (lid === 'adRanking') {
      return Object.freeze([
        Object.freeze({
          badge: 'りんく',
          line: '広告の貢献度ランキングを、公式の別画面から拾っているよ。'
        }),
        Object.freeze({
          badge: 'こん太',
          line: 'ギフトの貢献度とは別の順位だから、名前が違っても大丈夫。'
        }),
        Object.freeze({
          badge: 'たぬ姉',
          line: '読み込みが遅いときは、もう一息かかることがあるわ。'
        })
      ]);
    }
    if (lid === 'contributionRanking') {
      // v0.1.619: 貢献度ランキングは無認証 koken 公式 API から直接取得する設計に移行済み。
      //   「ギフトボタン→ランキングタブを開いて」は iframe scrape 時代の誤誘導なので撤去
      //   （API 直叩きでは手元のタブ操作は不要）。eventBroadcasters(v0.1.605) と同じく
      //   「公式から問い合わせ中」を正直に伝え、データが無い配信は静かに空のままにする。
      return Object.freeze([
        Object.freeze({
          badge: 'りんく',
          line: 'ニコニコの公式から、貢献度ランキングを問い合わせ中だよ。'
        }),
        Object.freeze({
          badge: 'こん太',
          line: '応答が返ってきたら、ここに並べるね！'
        }),
        Object.freeze({
          badge: 'たぬ姉',
          line: 'ギフトがまだ少ない配信だと、ここは空のままになることがあるわよ。'
        })
      ]);
    }
    if (lid === 'giftHistory') {
      // v0.1.619: ギフト履歴も無認証 koken 公式 API（/histories）直叩きに移行済み。
      //   「履歴タブを開いて」は iframe 時代の誤誘導なので撤去。
      return Object.freeze([
        Object.freeze({
          badge: 'りんく',
          line: 'ニコニコの公式から、ギフト履歴を問い合わせ中だよ。'
        }),
        Object.freeze({
          badge: 'こん太',
          line: 'ギフトが一件も無い配信だと、別の説明に切り替わるよ。'
        }),
        Object.freeze({
          badge: 'たぬ姉',
          line: '応答が返ってきたら、ここにリストが並ぶからね。'
        })
      ]);
    }
    // v0.1.605: イベントランキング / 応援者ランキング は無認証の公式 API から直接取得する設計。
    //   「配信ページからデータを受け取り中」は DOM scrape 時代の文言で誤情報なので
    //   ニコニコ公式 API に問い合わせ中であることを正確に伝える。
    if (lid === 'eventBroadcasters') {
      return Object.freeze([
        Object.freeze({
          badge: 'りんく',
          line: 'ニコニコの公式から、イベント順位を問い合わせ中だよ。'
        }),
        Object.freeze({
          badge: 'こん太',
          line: '応答が返ってきたら、ここにランキングを並べるね！'
        }),
        Object.freeze({
          badge: 'たぬ姉',
          line: 'イベントに出ていない配信だと、ここは空のままになることがあるわよ。'
        })
      ]);
    }
    if (lid === 'eventVotingSupporters') {
      return Object.freeze([
        Object.freeze({
          badge: 'りんく',
          line: 'ニコニコの公式から、応援者ランキングを問い合わせ中だよ。'
        }),
        Object.freeze({
          badge: 'こん太',
          line: 'ギフト＋ニコニ広告のスコア順で、応答が返ったらここに並べるよ！'
        }),
        Object.freeze({
          badge: 'たぬ姉',
          line: 'イベント参加中の配信だけ、ここに出るわ。'
        })
      ]);
    }
    // default: 取得経路を断定しない中立的な文言（DOM scrape 時代の「配信ページから」を撤去）。
    return Object.freeze([
      Object.freeze({
        badge: 'りんく',
        line: 'いま公式の情報を取りに行っているよ。ちょっと待ってて。'
      }),
      Object.freeze({
        badge: 'こん太',
        line: '数値がそろったら、ここに並べていくね！'
      }),
      Object.freeze({
        badge: 'たぬ姉',
        line: '受信の手順を、しっかり確認しているところよ。'
      })
    ]);
  }

  return Object.freeze([
    Object.freeze({
      badge: 'りんく',
      line: '公式ページ側の準備を待っているよ。'
    }),
    Object.freeze({
      badge: 'こん太',
      line: '取得できたらすぐここに表示するね。'
    }),
    Object.freeze({
      badge: 'たぬ姉',
      line: '待っているあいだも、記録は裏で進んでいるわよ。'
    })
  ]);
}

/**
 * 「公式ギフト欄の○○タブを開くと出やすい」を示す手順図解（仮の見た目・SVG/CSS のみ）。
 *
 * v0.1.619: 貢献度ランキング / ギフト履歴は無認証 koken 公式 API 直叩きに移行済みで、
 *   手元で「ギフトボタン→タブを開く」操作は一切不要になった。この図解は iframe scrape
 *   時代の誤誘導なので**全レーンで非表示**にする（ユーザー実機指摘「API 直叩きなら消すべき」）。
 *   関数自体は将来用途・テスト互換のため残置するが、常に '' を返す（図解なし）。
 *
 * @param {string} laneId
 * @returns {string} 常に ''（図解なし）。
 */
export function buildNorthStarLaneOpenHintDiagramHtml(laneId) {
  // v0.1.619: 全レーンで図解なし（koken/nicoad 公式 API 直叩きに移行済みで「タブを開く」
  //   操作は不要・誤誘導になるため撤去）。引数は API 互換のため受けるが未使用。
  void laneId;
  return '';
}

// v0.1.619: giftIconSvg / escapeText は「タブを開く」手順図解専用だった。図解撤去に伴い
//   未使用になったため削除（死蔵コードを残さない）。

/**
 * innerHTML 用の静的シェル（台詞 1 行 + 該当レーンは手順図解。台詞は popup-entry で textContent）。
 *
 * @param {string} laneId
 * @returns {string}
 */
export function buildNorthStarLaneWaitingShellHtml(laneId) {
  const lid = escapeAttr(laneId);
  const diagram = buildNorthStarLaneOpenHintDiagramHtml(laneId);
  return (
    `<div class="nl-north-star-lane-wait nl-north-star-lane-wait--compact" data-north-star-wait="1" data-lane-id="${lid}" role="status" aria-live="off" aria-busy="true">` +
    `<p class="nl-north-star-lane-wait__short"></p>` +
    diagram +
    `</div>`
  );
}
