/**
 * v0.1.410: 過去ログ取り込み（backfill）の進捗に合わせた「りんくのセリフ」を返す純関数。
 * v0.1.415: stopReason で「本当に配信開始まで遡り切った」時だけ完了を言うよう正直化。
 *
 * 進捗は content が KEY_BACKFILL_PROGRESS に書く `{ seg, rows, done, stopReason }`。
 * popup/インラインパネルが onChanged で読み、この関数でフェーズ別セリフ（さかのぼる→
 * 集めた→届いた／途中まで／また後で）に変換して表示する。文言はここに集約（UI から
 * 分離してテスト可能にする）。
 *
 * ⚠️ 設計の肝（ユーザー指摘 2026-05-27「集まったと言うのに集まってない」）:
 *   処理が終わった（done=1）＝完了、ではない。NDGR 過去ログは時間切れ・混雑・入口なし
 *   などで途中で止まることがあり、その後もう一度押せば続きを遡れる（実機で 13%→95%）。
 *   そこで「本当に配信開始まで到達した（stopReason==='reached_start'）」時だけ達成を言い、
 *   それ以外は正直に「いまの分まで／また後で」と伝える。嘘の達成宣言をしない。
 *
 * tkjp 哲学「想いが強いほど届く」に寄せ、温かいトーンは保つ。
 *
 * @module backfillRinkuNarration
 */

/**
 * @typedef {(
 *   'idle' | 'fetching' | 'progress' |
 *   'done' | 'partial' | 'paused' | 'no_entry' | 'done_empty'
 * )} BackfillNarrationPhase
 */

/**
 * stopReason が「配信開始まで到達した（＝本当に全部遡った）」を表すか。
 * crawlNdgrBackward の reached_start のみが真の到達。
 * @param {unknown} stopReason
 * @returns {boolean}
 */
export function backfillReachedStreamStart(stopReason) {
  return String(stopReason || '') === 'reached_start';
}

/**
 * 進捗からフェーズを判定する。
 *
 * done=1（処理終了）時は stopReason で分岐する:
 *   - reached_start          … 配信開始まで到達 → rows>0 なら done / rows=0 なら done_empty
 *   - rate_limited           … 混雑で中断 → paused（また後で）
 *   - no_view_base/no_entry/backward_exhausted … 入口が見つからない → no_entry（少し経つと取れる）
 *   - cap_* / aborted / 等   … 途中で打ち切り → rows>0 なら partial（いまの分まで）/ rows=0 なら no_entry
 *   - stopReason 無し（旧経路）… 安全側に倒し、rows>0 なら partial / rows=0 なら no_entry
 *     （旧来の「done と断定」アンチパターンには戻さない）
 *
 * @param {{ started?: boolean, rows?: number, done?: number|boolean, stopReason?: string }} p
 * @returns {BackfillNarrationPhase}
 */
export function backfillNarrationPhase(p) {
  const started = !!(p && p.started);
  const rows = Number(p && p.rows) || 0;
  const done = !!(p && (p.done === 1 || p.done === true));
  if (!started) return 'idle';
  if (!done) return rows > 0 ? 'progress' : 'fetching';

  // ここから done=1（処理は終了）。stopReason で「達成 / 途中 / 休み / 入口なし」を分ける。
  const reason = String((p && p.stopReason) || '');
  if (reason === 'reached_start') {
    return rows > 0 ? 'done' : 'done_empty';
  }
  if (reason === 'rate_limited') {
    return 'paused';
  }
  if (
    reason === 'no_entry' ||
    reason === 'no_view_base' ||
    reason === 'backward_exhausted'
  ) {
    // 入口が（いまは）見つからない。「無かった」と断定せず、また後で取れると伝える。
    return rows > 0 ? 'partial' : 'no_entry';
  }
  // cap_elapsed / cap_segments / cap_bytes / cap_rows / cap_reseeds / aborted /
  // visited_revisit / その他 / stopReason 無し（旧経路）→ 途中で打ち切り。
  return rows > 0 ? 'partial' : 'no_entry';
}

/**
 * フェーズと件数から、りんくのセリフ（lead）と進捗の有無を返す。
 * @param {{ started?: boolean, rows?: number, done?: number|boolean, stopReason?: string }} progress
 * @returns {{ phase: BackfillNarrationPhase, lead: string, animating: boolean, count: number }}
 *   lead = りんくのセリフ。animating = 取り込み中アニメを動かすか。count = 取り込み件数。
 */
export function backfillRinkuNarration(progress) {
  const phase = backfillNarrationPhase(progress);
  const count = Number(progress && progress.rows) || 0;
  const n = count.toLocaleString('ja-JP');
  switch (phase) {
    case 'fetching':
      return {
        phase,
        lead: 'むかしのコメントまで、さかのぼってるよ…！',
        animating: true,
        count
      };
    case 'progress':
      return {
        phase,
        lead: `いま ${n}件 あつめたよ！まだまだ遡るね`,
        animating: true,
        count
      };
    case 'done':
      // ⚠️ 完了時は「正確な件数」を出さない。公式件数は配信中も増え続け、匿名/削除/
      //   システムメッセージ差で数件ずれるため、ぴったり一致しない＝「数が合わない」と
      //   気にさせてしまう（ユーザー指摘 2026-05-27）。達成感だけを伝える。
      //   ここは reached_start（本当に配信開始まで到達）の時だけ通る。
      return {
        phase,
        lead: '配信のはじめまで、ぜんぶ届いたよ！応援を集めきったよ✨',
        animating: false,
        count
      };
    case 'partial':
      // 途中まで遡れた（時間切れ/混雑/区画途中など）。嘘の達成宣言をせず、もう一度で
      //   続きを取りに行けることを前向きに案内する。件数は出さない（ズレを気にさせない）。
      return {
        phase,
        lead: 'いまの分まで遡ったよ！「過去のコメントも取り込む」をもう一度押すと、続きも取りに行くね',
        animating: false,
        count
      };
    case 'paused':
      // 429/403 等で減速・中断。混雑なので時間を置けば続きを取れる。
      return {
        phase,
        lead: 'いまサーバーが混んでるみたい。少し待って、もう一度押すと続きを遡るね',
        animating: false,
        count
      };
    case 'no_entry':
      // 遡る入口が（いまは）見つからない／取り込みが進まなかった。断定せず再試行を促す。
      return {
        phase,
        lead: 'いまは遡れる入口が見つからなかったよ。少し経ってからもう一度押すと取れることがあるよ',
        animating: false,
        count
      };
    case 'done_empty':
      // reached_start なのに rows=0＝この配信は（直近以外に）遡れる過去が無かった。
      return {
        phase,
        lead: 'さかのぼってみたけど、新しく取り込める過去は無かったみたい',
        animating: false,
        count
      };
    case 'idle':
    default:
      return {
        phase: 'idle',
        lead: 'ここから前の応援も、ぜんぶ拾ってくるね！',
        animating: false,
        count
      };
  }
}

/**
 * v0.1.432: 「実質取り切れている」とみなす、記録/公式の比率しきい値。これ以上なら partial
 * （途中まで）のヒントは出さない。公式件数は配信中も増え続け匿名/削除/システム差で数件ズレる
 * ため、ぴったり一致しなくても「ほぼ取れている」なら『途中まで』とは言わない（実機で記録207/
 * 公式203 のように実質100%でも reached_start に至らず partial 判定になることがあるため）。
 */
export const BACKFILL_RECORD_HINT_NEAR_COMPLETE_RATIO = 0.95;

/**
 * v0.1.435: 実質取り切れている（記録/公式 >= NEAR_COMPLETE_RATIO）partial 状態の記録カード短文。
 *
 *   ⭐ なぜ「沈黙＝空文字」をやめるか（実機 UX 検証・2026-05-28）:
 *     v0.1.432 では「数が合っているのに『途中まで』と言う違和感」を消すため、実質取り切れている
 *     partial では記録カードを空文字にして沈黙させた。しかし実機ではボタン下に「いまの分まで
 *     遡ったよ！もう一度押すと続きも取りに行くね」と表示される一方で、記録カード下は完全沈黙
 *     ＝ユーザー視点で「片方しか反応しない＝対応されていない」と感じる現象が再現した。
 *
 *   ⭐ 世界標準の UX 定石（Nielsen Norman #1 Visibility of System Status / Material Design 3
 *     Progress Indicator Guidelines / Instagram "You're all caught up" / Slack "Catch up"）:
 *     「ほぼ完了」状態は沈黙でなく**肯定的な"状態の名前化"**で表現する。数字でなく状態名で。
 *
 *   ⭐ こん太の声として、ボタン下の「いまの分まで遡ったよ！」と対になる短い肯定文を出す。
 *     「途中まで」とは言わない（v0.1.432 の趣旨は維持）、でも沈黙もしない＝両立。
 */
export const BACKFILL_RECORD_HINT_NEAR_COMPLETE_TEXT = 'いまの分まで届いてるよ ✨';

/**
 * v0.1.432: 記録カード（記録 件数の真下）に出す「過去ログ取り込みの状況」短文を返す。
 *
 * ユーザー要望（2026-05-28）: 「いまは遡れる入口が見つからなかったよ…」のような状況は、
 *   取り込みボタンの下のピンク枠だと気づきにくい。記録の数字が増えない理由を、まず目が行く
 *   記録カードの位置にも短く出したい。
 *
 * ボタン下の温かい語り（lead）はそのまま残し、ここでは「記録が止まっている/途中」の状況
 *   （no_entry / partial / paused）のときだけ簡潔なヒントを返す。取り込み中（fetching/progress）
 *   や達成（done）・空（done_empty）・待機（idle）では空文字＝記録カードには何も出さない
 *   （進行中の演出はボタン下のりんくに任せ、記録カードを散らかさない）。
 *
 * v0.1.432 追補（ユーザー要望）: partial（途中まで）でも、記録が公式件数の
 *   BACKFILL_RECORD_HINT_NEAR_COMPLETE_RATIO 以上なら実質取り切れているので出さない
 *   （「ちゃんと取れたのに『途中まで』と言われる」違和感を消す）。no_entry/paused は記録が
 *   少ない状況なので比率に関わらず出す。
 *
 * ⚠️ v0.1.452 重大バグ修正（ユーザー実機 2026-05-29 報告）:
 *   実機で公式 343 件・記録 13 件（公式の約4%）なのに「いまの分まで届いてるよ ✨」が
 *   表示されてしまう「caught_up 誤判定」が発生していた。同じ症状が公式 1,297 件・記録 93 件
 *   (約7%)、公式 1,465 件・記録 860 件 (約59%) 等で再現。
 *
 *   真因: 95% 判定で使っていた `progress.rows` は backfill エンジンの処理行数(dedupe 前)で、
 *     公式件数を**過大に超える**ことがある（取り込み試行回数 ≒ 公式件数を超えるが、dedupe で
 *     重複が弾かれて実際の記録総数は遥かに少ない）。これを公式件数と比較していたため、
 *     実際には 4% しか取れていなくても「公式の 95% 以上」と誤判定されていた。
 *
 *   修正: `opts.recordedCount`（dedupe 後の実保存件数 = popup の記録カード `#liveStatComments`
 *     表示値）を新規受け取り、それが渡されていればそれで比較する。未指定なら従来の
 *     progress.rows で比較（後方互換）。呼び出し元 popup-entry.js は recordedCount を渡す
 *     ように更新する。
 *
 * @param {{ started?: boolean, rows?: number, done?: number|boolean, stopReason?: string }} progress
 * @param {{ officialCount?: number|null, recordedCount?: number|null }} [opts]
 *   officialCount: 公式コメント数（比率判定用・無ければ比率判定しない）。
 *   recordedCount: dedupe 後の実記録総数（v0.1.452 caught_up 比較の正本）。未指定なら
 *     後方互換で progress.rows を使う。
 * @returns {string} 記録カードに出す短文（出さないときは ''）。
 */
export function backfillRecordCardHint(progress, opts = {}) {
  const phase = backfillNarrationPhase(progress);
  switch (phase) {
    case 'no_entry':
      return '過去ログは今は遡れませんでした（少し経つと取り込めることがあります）';
    case 'partial': {
      // 実質取り切れている（記録が公式の95%以上）なら『途中まで』を出さない。
      // v0.1.435: でも沈黙もしない＝肯定的な caught-up 文を出す（Nielsen 可視性原則・上の定数 doc 参照）。
      // v0.1.452: 比較の分子は recordedCount（dedupe 後）優先。progress.rows は dedupe 前で
      //   公式件数を過大に超えやすく caught_up 誤判定の原因だった（実機 4%/7%/59% で再現）。
      const recordedRaw = Number(opts && opts.recordedCount);
      const rowsForRatio =
        Number.isFinite(recordedRaw) && recordedRaw >= 0
          ? recordedRaw
          : Number(progress && progress.rows) || 0;
      const official = Number(opts && opts.officialCount);
      if (
        Number.isFinite(official) &&
        official > 0 &&
        rowsForRatio >= official * BACKFILL_RECORD_HINT_NEAR_COMPLETE_RATIO
      ) {
        return BACKFILL_RECORD_HINT_NEAR_COMPLETE_TEXT;
      }
      return '過去ログは途中まで取り込みました（もう一度押すと続きを取り込みます）';
    }
    case 'paused':
      return '混雑のため一時中断（少し待つと続きを取り込みます）';
    default:
      // idle / fetching / progress / done / done_empty は記録カードに出さない。
      return '';
  }
}

/**
 * v0.1.450: 「もう一度ためす」ボタン押下直後に短時間だけ表示する確認文言の長さ（ms）。
 *
 * 背景（2026-05-29 会議）: ボタン下の `#backfillFetchPrompt` を廃止して記録カード内
 *   `#liveStatCommentsBackfillHint` に集約する設計。進行中（fetching/progress）は
 *   引き続き沈黙（記録カードを散らかさない設計思想を維持）だが、押下直後だけは
 *   「ありがとう、もう一度…」のトーストを短時間出して『押した感』を出す。
 *   それ以降は #liveStatCommentsIngest（取り込みハートビート行）と
 *   no_entry/partial/paused 時の hint に任せる。
 */
export const BACKFILL_RECORD_HINT_RETRY_TOAST_MS = 1800;

/**
 * v0.1.450: ボタン押下直後トースト文言。
 */
export const BACKFILL_RECORD_HINT_RETRY_STARTED_TEXT =
  'ありがとう、もう一度さかのぼり始めるね';

/**
 * v0.1.438: 記録カード下に出す「こん太のお知らせ吹き出し」の DOM 状態を返す純関数。
 *
 * 背景（ユーザー指摘・2026-05-28）:
 *   取り込みボタンの下には「こん太(オレンジ髪のキャラ)+ピンク吹き出し」が出るのに、
 *   記録カード下には文字だけ＝同じこん太のお知らせなのに統一感がなく「もう一人のこん太が
 *   いないと寂しい」とユーザー指摘。世界UX標準(統合性原則・Material Design 3)にも合う。
 *
 * 設計:
 *   - 既存の `backfillRecordCardHint(progress, opts)` をそのまま使ってテキストを取得
 *     (文言とロジック・95%以上判定 すべて維持・後方互換)。
 *   - 加えて UI に必要な hidden/data-phase を返し、popup-entry.js がそれを DOM に流すだけ。
 *   - data-phase は CSS のスタイル切替に使う。caught-up(95%以上 partial) は明るめ、
 *     partial/paused/no_entry は落ち着き目（ボタン下と同じ規則）。
 *
 * v0.1.450 拡張（B 廃止に伴う「押した感」のフォールバック）:
 *   `opts.retryStartedAtMs` と `opts.nowMs` が両方与えられ、差が
 *   BACKFILL_RECORD_HINT_RETRY_TOAST_MS 以内なら、他のフェーズ判定より優先して
 *   `dataPhase='retry_started'` を返し、トースト文言を表示する。これにより
 *   ボタン押下後に進行中（fetching/progress=沈黙）まで一瞬で行っても、ユーザーは
 *   `押した→反応した` を確認できる。
 *
 *   ⚠️ 副作用フリー: 既存呼び出し（opts に retryStartedAtMs/nowMs が無い場合）は
 *   完全に従来挙動を保つ。
 *
 * @param {{ started?: boolean, rows?: number, done?: number|boolean, stopReason?: string }} progress
 * @param {{
 *   officialCount?: number|null,
 *   recordedCount?: number|null,
 *   retryStartedAtMs?: number|null,
 *   nowMs?: number|null
 * }} [opts]
 *   recordedCount: dedupe 後の実記録総数（v0.1.452 caught_up 誤判定修正）。未指定なら
 *     後方互換で progress.rows を使う。
 * @returns {{ hidden: boolean, dataPhase: string, lead: string }}
 *   hidden: 記録カード下のこん太を非表示にすべきか。
 *   dataPhase: CSS 切替用の data-phase 値
 *     （'retry_started' | 'caught_up' | 'partial' | 'paused' | 'no_entry' | ''）。
 *   lead: 吹き出しに出す文言（hidden=true のときは ''）。
 */
export function backfillRecordCardHintDomState(progress, opts = {}) {
  // v0.1.450: 押下直後トーストが優先（fetching/progress の沈黙より強い）。
  const retryStartedAt = Number(opts && opts.retryStartedAtMs);
  const now = Number(opts && opts.nowMs);
  if (
    Number.isFinite(retryStartedAt) &&
    retryStartedAt > 0 &&
    Number.isFinite(now) &&
    now >= retryStartedAt &&
    now - retryStartedAt <= BACKFILL_RECORD_HINT_RETRY_TOAST_MS
  ) {
    return {
      hidden: false,
      dataPhase: 'retry_started',
      lead: BACKFILL_RECORD_HINT_RETRY_STARTED_TEXT
    };
  }

  const phase = backfillNarrationPhase(progress);
  const lead = backfillRecordCardHint(progress, opts);
  if (!lead) {
    return { hidden: true, dataPhase: '', lead: '' };
  }
  // caught_up は phase=partial だが文言が NEAR_COMPLETE_TEXT に差し替わっているケース。
  //   CSS で明るめ背景にしたい（区別したい）ので別 data-phase を返す。
  if (phase === 'partial' && lead === BACKFILL_RECORD_HINT_NEAR_COMPLETE_TEXT) {
    return { hidden: false, dataPhase: 'caught_up', lead };
  }
  return { hidden: false, dataPhase: phase, lead };
}
