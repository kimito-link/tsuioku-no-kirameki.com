/**
 * 北極星「公式値レーン」の取得待ち（not_yet / iframe_unrendered）用 UI 断片。
 * HTML はテンプレのみ（メッセージは popup-entry 側で textContent 差し替え）。
 */

import { escapeAttr } from '../shared/html/escape.js';

/** @typedef {{ badge: string, line: string }} NorthStarWaitLine */

/** @type {ReadonlySet<string>} */
export const NORTH_STAR_WAITING_STATES = new Set(['not_yet', 'iframe_unrendered']);

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
 * @returns {string} プレーン文言（textContent 用）
 */
export function getNorthStarWaitFootnote(laneId, state) {
  const st = String(state || '').trim();
  const lid = String(laneId || '');
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
    if (laneId === 'giftHistory') {
      return '（公式のギフト一覧がまだ開いていないようです）';
    }
    if (laneId === 'contributionRanking') {
      return '（公式の貢献度一覧がまだ開いていないようです）';
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
 * @returns {readonly NorthStarWaitLine[]}
 */
export function getNorthStarWaitRotationMessages(laneId, state) {
  const st = String(state || '').trim();
  const lid = String(laneId || '');

  if (st === 'iframe_unrendered' && lid === 'contributionRanking') {
    return Object.freeze([
      Object.freeze({
        badge: 'りんく',
        line: '公式のギフト欄を開けると、貢献度の一覧が出やすいよ。'
      }),
      Object.freeze({
        badge: 'こん太',
        line: 'もうちょっとだけ待ってて。出たら横に並べるね。'
      }),
      Object.freeze({
        badge: 'たぬ姉',
        line: '一覧が見えないときは、ページを開き直すのも手よ。'
      })
    ]);
  }

  if (st === 'iframe_unrendered' && lid === 'giftHistory') {
    return Object.freeze([
      Object.freeze({
        badge: 'りんく',
        line: 'この番組のギフト履歴を探しているよ。公式の一覧を待ってる。'
      }),
      Object.freeze({
        badge: 'こん太',
        line: 'まだ空っぽに見えるときは、タブを切り替えてみてね。'
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
      return Object.freeze([
        Object.freeze({
          badge: 'りんく',
          line: '貢献度の一覧は、公式のギフトまわりの準備待ちになりやすいんだ。'
        }),
        Object.freeze({
          badge: 'こん太',
          line: 'ランキングのタブが見えたら、もうちょっとだけ待ってて。'
        }),
        Object.freeze({
          badge: 'たぬ姉',
          line: '手元でギフト欄を開くと、進むことが多いわよ。'
        })
      ]);
    }
    if (lid === 'giftHistory') {
      return Object.freeze([
        Object.freeze({
          badge: 'りんく',
          line: 'この番組のギフト履歴も、公式の一覧の出方とセットだよ。'
        }),
        Object.freeze({
          badge: 'こん太',
          line: 'ギフトが一件も無い配信だと、別の説明に切り替わるよ。'
        }),
        Object.freeze({
          badge: 'たぬ姉',
          line: '表示が付いたら、ここにリストが並ぶからね。'
        })
      ]);
    }
    return Object.freeze([
      Object.freeze({
        badge: 'りんく',
        line: '配信ページからデータを受け取り中だよ。ちょっと待ってて。'
      }),
      Object.freeze({
        badge: 'こん太',
        line: '公式の数値がそろったら、ここにどんどん出るはず！'
      }),
      Object.freeze({
        badge: 'たぬ姉',
        line: '接続と取得の手順を、しっかり確認しているところよ。'
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
 * innerHTML 用の静的シェル（1 行のみ。台詞は popup-entry で textContent）。
 *
 * @param {string} laneId
 * @returns {string}
 */
export function buildNorthStarLaneWaitingShellHtml(laneId) {
  const lid = escapeAttr(laneId);
  return (
    `<div class="nl-north-star-lane-wait nl-north-star-lane-wait--compact" data-north-star-wait="1" data-lane-id="${lid}" role="status" aria-live="off" aria-busy="true">` +
    `<p class="nl-north-star-lane-wait__short"></p>` +
    `</div>`
  );
}
