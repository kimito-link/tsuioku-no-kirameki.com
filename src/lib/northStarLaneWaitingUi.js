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
    return Object.freeze([
      Object.freeze({
        badge: 'りんく',
        line: '画面のギフトボタン→「ランキング」タブを開くと、貢献度の一覧が出やすいよ。'
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
        line: '画面のギフトボタン→「履歴」タブを開くと、この番組のギフト履歴が出やすいよ。'
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
          line: '画面のギフトボタン→「ランキング」タブを開くと、貢献度の一覧が出やすいよ。'
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
          line: '画面のギフトボタン→「履歴」タブを開くと、この番組のギフト履歴が出やすいよ。'
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
 * 画像ファイル不要。giftHistory / contributionRanking のように「タブを開くと取れる」
 * レーンでだけ出す。data 取得後は待機UIごと消えるので恒久表示にはならない。
 *
 * @param {string} laneId
 * @returns {string} 該当レーンは図解 HTML、対象外は ''（図解なし）
 */
export function buildNorthStarLaneOpenHintDiagramHtml(laneId) {
  const lid = String(laneId || '');
  /** @type {{ tab: string } | null} */
  let cfg = null;
  if (lid === 'giftHistory') cfg = { tab: '履歴' };
  else if (lid === 'contributionRanking') cfg = { tab: 'ランキング' };
  if (!cfg) return '';

  // タブ列（番組ギフト / マイギフト / 履歴 / ランキング）。該当タブだけ active。
  const tabs = ['番組ギフト', 'マイギフト', '履歴', 'ランキング'];
  const tabsHtml = tabs
    .map((t) => {
      const active = t === cfg.tab;
      const cls = active
        ? 'nl-open-hint__tab nl-open-hint__tab--active'
        : 'nl-open-hint__tab';
      return `<span class="${cls}">${escapeText(t)}</span>`;
    })
    .join('');

  // 仮スクショ風: ①ギフトボタン(🎁 風 SVG) → ②タブ列(該当をハイライト)
  return (
    `<div class="nl-open-hint" aria-hidden="true">` +
      `<div class="nl-open-hint__step">` +
        `<span class="nl-open-hint__num">1</span>` +
        `<span class="nl-open-hint__gift-btn" title="ギフトボタン">` +
          giftIconSvg() +
        `</span>` +
        `<span class="nl-open-hint__caption">ギフトを押す</span>` +
      `</div>` +
      `<span class="nl-open-hint__arrow">→</span>` +
      `<div class="nl-open-hint__step">` +
        `<span class="nl-open-hint__num">2</span>` +
        `<span class="nl-open-hint__tabs">${tabsHtml}</span>` +
        `<span class="nl-open-hint__caption">「${escapeText(cfg.tab)}」を開く</span>` +
      `</div>` +
    `</div>`
  );
}

/**
 * ギフトボタン風の小さな SVG（プレゼント箱）。仮の絵。
 * @returns {string}
 */
function giftIconSvg() {
  return (
    `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">` +
    `<rect x="3" y="9" width="18" height="11" rx="1.5" fill="currentColor" opacity="0.18"/>` +
    `<rect x="3" y="9" width="18" height="11" rx="1.5" stroke="currentColor" stroke-width="1.6"/>` +
    `<path d="M3 9h18M12 9v11" stroke="currentColor" stroke-width="1.6"/>` +
    `<path d="M12 9C9 9 7.5 4 9.5 3.2 11 2.6 12 6 12 9zM12 9c3 0 4.5-5 2.5-5.8C13 2.6 12 6 12 9z" stroke="currentColor" stroke-width="1.4" fill="none"/>` +
    `</svg>`
  );
}

/**
 * textContent 相当の最小エスケープ（< > & のみ）。escapeAttr は属性用なので本文用に別途。
 * @param {string} s
 * @returns {string}
 */
function escapeText(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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
