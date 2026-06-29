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

import { BACKFILL_FALSE_COMPLETION_RATIO } from './timingConstants.js';

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
 * v0.1.453: 実質取り切れている（記録が公式の 95% 以上）かを純粋に判定する内部ヘルパ。
 *
 * 呼び出し元の判定ロジックを集約することで、phase が partial か no_entry か paused かに
 * 関わらず「実質達成」のときは同じ caught_up 文言を返せるようにする。
 *
 * 設計（ユーザー実機 2026-05-29 報告で確定）:
 *   - 実機で公式 2,679 件・記録 2,679 件（100%）なのに「過去ログは今は遡れませんでした」が
 *     出続ける問題があった。最後の backfill サイクルが no_entry/no_progress で終わると
 *     phase=no_entry になるが、実質的には既に全件取れているのに警告が出続ける UX 破綻。
 *     （v0.1.452 で caught_up 誤判定＝false positive を recordedCount で直したのに対し、
 *       こちらは「達成しているのに警告が出る」逆方向＝false negative の根治。）
 *   - 修正: phase に依らず recordedCount(または rows) >= official * 0.95 なら caught_up
 *     文言を出す（hidden には倒さない。「届いてる ✨」を出すことで「これ以上やり直す必要はない」
 *     と伝える）。
 *
 * @param {{ rows?: number }} progress
 * @param {{ officialCount?: number|null, recordedCount?: number|null }} opts
 * @returns {boolean}
 */
function isBackfillRecordEffectivelyCaughtUp(progress, opts) {
  const official = Number(opts && opts.officialCount);
  if (!Number.isFinite(official) || official <= 0) return false;
  const recordedRaw = Number(opts && opts.recordedCount);
  const rowsForRatio =
    Number.isFinite(recordedRaw) && recordedRaw >= 0
      ? recordedRaw
      : Number(progress && progress.rows) || 0;
  return rowsForRatio >= official * BACKFILL_RECORD_HINT_NEAR_COMPLETE_RATIO;
}

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

  // v0.1.453: 実質達成（recordedCount >= 公式の 95%）なら phase に依らず caught_up 文言。
  //   no_entry/partial/paused のどれでも「実質取れている」なら警告を出さず肯定的に伝える。
  //   実機で 100% 取れているのに「過去ログは今は遡れませんでした」が出続けるバグの根治。
  if (
    (phase === 'no_entry' || phase === 'partial' || phase === 'paused') &&
    isBackfillRecordEffectivelyCaughtUp(progress, opts)
  ) {
    return BACKFILL_RECORD_HINT_NEAR_COMPLETE_TEXT;
  }

  switch (phase) {
    case 'no_entry':
      return '過去ログは今は遡れませんでした（少し経つと取り込めることがあります）';
    case 'partial':
      return '過去ログは途中まで取り込みました（もう一度押すと続きを取り込みます）';
    case 'paused':
      return '混雑のため一時中断（少し待つと続きを取り込みます）';
    default:
      // idle / fetching / progress / done / done_empty は記録カードに出さない。
      return '';
  }
}

/**
 * v0.1.763「％という概念がおかしい・止まってるのに取り込み中と出る・じゃなきゃ繰り返す」(ユーザー)
 *   根治(A案・会議全会一致の次点): 公式件数との比較行に出す表示を、誤解を招く「約N%」でなく
 *   【正直な状態】に切り替える純関数。
 *
 * 背景(実機 fastDiag で確定): 過去ログ取得(backfill)は NDGR の入口(view base)が配信中に
 *   ローテーションし、接続が切れると古い入口で 0 件のまま backward_exhausted で止まる。
 *   それでも記録カードは「記録は公式の約6%」のように中途半端な％を出し、かつ「取り込み中」と
 *   進行中を装っていた=「止まってるのに進んでるように見える」最悪 UX。％は配信中ずっと増える
 *   公式(statistics.comments=gift/system 等も含む)が分母で、達成不能な見かけの数字でもある。
 *
 * 方針(A): ％は「本当に取り切れている(実質達成)」ときだけ静かに肯定で示し、それ以外は
 *   ％を出さず「取り込み中／少し待つと続きを取ります(再試行)」という正直な状態名にする。
 *   止まっているのに「取り込み中」とは言わない。Nielsen Norman #1 Visibility of System Status /
 *   Instagram "You're all caught up" の定石(数字でなく状態名)。
 *
 * @param {{
 *   officialCount?: number|null,   // 公式コメント数(statistics.comments)。分母。
 *   recordedCount?: number|null,   // dedupe 後の実記録総数(記録カードの値)。
 *   backfillRunning?: boolean,     // backfill が今走っているか(romiDebug.backfill.running)。
 *   backfillStopReason?: string,   // 直近の停止理由。
 *   backfillStarted?: boolean,     // backfill を一度でも起動したか。
 *   recordingActive?: boolean      // v0.1.764: 記録中の生放送か。状態不明でも％でなく「取り込み中」既定に。
 * }} args
 * @returns {{ mode: 'complete'|'fetching'|'stalled'|'hidden', text: string }}
 *   mode=complete: 実質達成(静かに肯定・％でなく状態名) / fetching: 取り込み中(まだ走行・進捗あり) /
 *   stalled: 止まっている(接続待ち/再試行・正直に) / hidden: 比較を出さない(公式不明等)。
 *   呼び出し側は text を officialEl に「公式 N 件 · {text}」の形で出す。
 */
export function resolveOfficialComparisonDisplay(args) {
  const official = Number(args && args.officialCount);
  if (!Number.isFinite(official) || official <= 0) {
    return { mode: 'hidden', text: '' };
  }
  const recorded = Number(args && args.recordedCount);
  const rec = Number.isFinite(recorded) && recorded >= 0 ? recorded : 0;

  // 実質達成(記録が公式の 95% 以上 or 記録が公式以上)=％でなく静かな肯定。公式は配信中増え続け
  //   gift/system 差で数件ズレるので「約100%」と数字で煽らず「最新まで取り込み済み」と状態名で。
  if (rec >= official * BACKFILL_RECORD_HINT_NEAR_COMPLETE_RATIO) {
    return { mode: 'complete', text: '最新まで取り込み済み ✨' };
  }

  const running = !!(args && args.backfillRunning);
  const started = !!(args && args.backfillStarted);
  const reason = String((args && args.backfillStopReason) || '');
  // 「止まっている」= 走っておらず、入口なし/遡り切り(0件)/中断系で終わっている。
  //   接続切れ・古い入口で 0 件 backward_exhausted もここ(=正直に再試行中と出す)。
  const stalledReasons = new Set([
    'no_entry',
    'no_view_base',
    'backward_exhausted',
    'rate_limited',
    'no_progress',
    'aborted',
    'stalled',
    'rotation_yield',
    'visibility_paused'
  ]);
  if (!running && started && stalledReasons.has(reason)) {
    // 中途半端な％は出さない。止まっているのに「取り込み中」とも言わない。接続が戻れば
    //   自動で続きから取り切る設計(content 側の transient retry / gap-catchup)に合わせた文言。
    return {
      mode: 'stalled',
      text: '過去ログを遡り中（接続が戻りしだい続きを取り込みます）'
    };
  }
  if (running) {
    // まだ走っている=進捗中。％でなく「取り込み中」状態名(数字で不安にさせない)。
    return { mode: 'fetching', text: '過去ログを取り込み中…' };
  }
  // v0.1.764: backfill 状態が popup に届いていない(KEY_BACKFILL_PROGRESS は done=1 時しか書かれない=
  //   走行中/再アーム中は null)ケースでも、記録中(recordingActive)の生放送なら backfill は働いている/
  //   働こうとしている。ここで従来の「約N%」へフォールバックしていたのが、ユーザーの「％がまだ出てる・
  //   約束が守られてない」の正体。％は二度と出さず「取り込み中」を既定にする(実質達成は上で complete)。
  if (args && args.recordingActive) {
    return { mode: 'fetching', text: '過去ログを取り込み中…' };
  }
  // 記録OFF/タイムシフト等(backfill 文脈でない)=静かに(比較行は公式件数だけ)。
  return { mode: 'hidden', text: '' };
}

/**
 * 診断用: 取り込みが途中で止まったときに、止まった理由(stopReason)と公式件数との
 * 残りギャップを「人が読める短い接尾辞」にして返す純関数。
 *
 * 目的（fix/broadcast-bulk-catchup・2026-05-31）:
 *   「ある放送だけ 7% で止まる」原因を切り分けるため、記録カードのヒント末尾に
 *   実際の stopReason（no_progress / reached_start / cap_elapsed / cap_rows など）と、
 *   公式件数までの残り件数を出して、利用者が見たまま報告できるようにする。
 *
 * 表示するのは「まだ取り切れていない」状態（partial / paused / no_entry）のときだけ。
 * caught_up / done / retry_started では付けない（達成感を濁さない）。
 *
 * @param {{ stopReason?: string }} progress
 * @param {{
 *   officialCount?: number|null,
 *   recordedCount?: number|null,
 *   backfillWaitingOthers?: number
 * }} [opts]
 * @returns {string} 例: '（理由: no_progress・残り約1,169件）'。出さないときは ''。
 */
export function backfillStuckDiagnosticsSuffix(progress, opts = {}) {
  const reason = String((progress && progress.stopReason) || '').trim();
  const official = Number(opts && opts.officialCount);
  const recorded = Number(opts && opts.recordedCount);
  const waitingOthers = Number(opts && opts.backfillWaitingOthers);
  const parts = [];
  if (reason) parts.push(`理由: ${reason}`);
  if (
    Number.isFinite(official) &&
    official > 0 &&
    Number.isFinite(recorded) &&
    recorded >= 0
  ) {
    const gap = Math.max(0, official - recorded);
    if (gap > 0) parts.push(`残り約${gap.toLocaleString('ja-JP')}件`);
  }
  if (
    Number.isFinite(waitingOthers) &&
    waitingOthers > 0 &&
    reason === 'reached_start'
  ) {
    parts.push(`他${waitingOthers}放送がバックフィル待ちの可能性`);
  }
  if (!parts.length) return '';
  return `（${parts.join('・')}）`;
}

/**
 * v0.1.999: backfill のスループット計器を1行に整形する純関数（状態速報の診断用）。
 *
 * 狙い（「推測で直さない」原則・reference_backfill_speed_meeting）: 「取り込みが遅い」の真の
 *   律速が seek（入口さがし）か否かを、ユーザーのスクショ1枚で確定できるようにする。現状の
 *   診断は stopReason/seg/rows は出すが【経過時間・再シード回数】が無く「1区画あたり何ms」を
 *   計算できなかった。この行で「経過Xs・区画Y・再シードZ回 → 約1区画Wms」を出す。
 *
 * 出力条件: elapsedMs と seg が意味を持つ値のときだけ（観測前/0 のときは空文字＝出さない）。
 * 計器のみ＝取り込み内容・順序・件数には一切触れない。
 *
 * @param {{ seg?: number, elapsedMs?: number, reseeds?: number }} progress
 * @returns {string} 例: 「⏱ 取得速度: 経過12.3秒・区画420・再シード8回 → 約1区画29ms」／材料不足なら ''
 */
export function backfillThroughputLine(progress) {
  const seg = Number(progress && progress.seg);
  const elapsedMs = Number(progress && progress.elapsedMs);
  const reseeds = Number(progress && progress.reseeds);
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return '';
  if (!Number.isFinite(seg) || seg <= 0) return '';
  const sec = (elapsedMs / 1000).toFixed(1);
  const perSegMs = Math.round(elapsedMs / seg);
  const reseedPart =
    Number.isFinite(reseeds) && reseeds > 0 ? `・再シード${reseeds.toLocaleString('ja-JP')}回` : '';
  return `⏱ 取得速度: 経過${sec}秒・区画${seg.toLocaleString('ja-JP')}${reseedPart} → 約1区画${perSegMs.toLocaleString('ja-JP')}ms`;
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

  // v0.1.685: reached_start 誤完了（大ギャップ）は黙って隠す。
  //   content の shouldRearmBackfillForOfficialGap が自動再 sweep するため、popup でメッセージを
  //   出すとユーザーに「ローディング中」と感じさせる（v0.1.657「完成だけドンと出す」設計に反する）。
  //   50%未満でも「取得中」として扱い、自動再 sweep が終わって 50%以上になったら表示する。
  //   ※本当に自動回復しない(maxRearms 超過等)場合は partial 表示が出る(stopReason が変わる)。
  if (phase === 'done' || phase === 'done_empty') {
    const official = Number(opts && opts.officialCount);
    const recorded = Number(opts && opts.recordedCount);
    if (
      Number.isFinite(official) &&
      official > 0 &&
      Number.isFinite(recorded) &&
      recorded >= 0 &&
      recorded < official * BACKFILL_FALSE_COMPLETION_RATIO
    ) {
      return { hidden: true, dataPhase: '', lead: '' };
    }
  }

  const lead = backfillRecordCardHint(progress, opts);
  if (!lead) {
    return { hidden: true, dataPhase: '', lead: '' };
  }
  // v0.1.453: phase が partial/no_entry/paused のいずれでも、文言が NEAR_COMPLETE_TEXT に
  //   差し替わっているなら caught_up data-phase を出す（CSS で明るめ背景＝「届いた ✨」感）。
  //   実機 2026-05-29: 公式 2,679・記録 2,679（100%）なのに no_entry で警告が出続ける問題を
  //   解消するため、phase が no_entry でも recordedCount >= 95% なら caught_up に。
  if (lead === BACKFILL_RECORD_HINT_NEAR_COMPLETE_TEXT) {
    return { hidden: false, dataPhase: 'caught_up', lead };
  }
  // 診断接尾辞（fix/broadcast-bulk-catchup）: まだ取り切れていない partial/paused/no_entry の
  //   ときだけ、止まった理由と残り件数を末尾に出す。原因切り分け用。
  const suffix = backfillStuckDiagnosticsSuffix(progress, opts);
  const leadWithDiag = suffix ? `${lead}${suffix}` : lead;
  return { hidden: false, dataPhase: phase, lead: leadWithDiag };
}
