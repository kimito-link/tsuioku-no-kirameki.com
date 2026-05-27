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
