/**
 * 読み上げアイテムが鮮度切れかどうか判定する純関数。
 *
 * v0.1.755 リアルタイム完璧化(星野ロミ会議): 合成が実時間に追いつかない時、古い未合成を破棄して
 *   「今喋ってること」だけ聞こえるようにする狙いで鮮度しきい値を積極短縮した。
 * v0.1.773 でさらに短縮(1800ms / backlog 1200ms)→「吹き出しは出るが音声がゼロ」回帰を生み、
 *   v0.1.781 で 2500ms / backlog 1200ms@3件 に戻して暫定回避。
 *
 * v0.1.782 わんコメ(OneComme 9.0.2)解析を踏まえた再設計:
 *   実バイナリ解析で、わんコメは読み上げの破棄を【件数ゲート1本(limitQueue=10 超で最古を捨てる)】で
 *   やっており、時間(鮮度)ゲートを一切持たないことが判明(reference_onecomme_asar_decode_2026-06-16)。
 *   件数ゲートだけでもラグは「キュー長 × 1本の再生時間」で有界になり、溢れたら必ず最古から捨てる=
 *   常に直近コメントが読まれ、かつ絶対にゼロ音声にならない。我々の v0.1.773 ゼロ音声回帰は、件数ゲートに
 *   加えて時間ゲートを再生1本ぶん(1〜3秒)より短く効かせ、再生待ち中に全部 stale 化させたのが原因=
 *   【時間ゲートの罠】。
 *
 *   そこで本再設計では:
 *     ・リアルタイム維持(古いものを捨てて今に追従)は【件数ゲート(pushVoiceQueue の最古drop)】が主軸。
 *       キュー上限を 12→8 に下げ、わんコメ同様にラグを小さく保つ(voicePlayer 側で変更)。
 *     ・この時間ゲートは【安全網】に格下げ。タブ凍結(visibilitychange でスロットリング)等で
 *       本当に何秒も放置された item だけを落とす高いしきい値にし、「再生順を待っているだけ」の item は
 *       絶対に落とさない。backlog 短縮(再生1本ぶんを下回る罠)は撤廃する。
 *
 * @param {number} enqueuedAt - enqueue時のDate.now()
 * @param {number} now - 現在時刻
 * @param {number} queueLength - 現在のキュー長(後方互換のため受け取るが安全網しきい値は一定)
 * @param {boolean} [isHighPriority=false] - ギフトなど確実に読みたいアイテムか
 * @returns {{ stale: boolean, reason: string }}
 */

/**
 * 通常コメントの安全網しきい値(ms)。これを超えた=タブ凍結等で本当に放置された item だけ捨てる。
 * v0.1.782: リアルタイム維持は件数ゲート(最古drop)が担うので、時間ゲートは「再生順を待っているだけ」の
 *   item を絶対に落とさない高さ(8秒)にする。キュー上限8 × 再生1本(~1秒)≒最大でも数秒の待ちは通す。
 *   これより低くすると再生待ち中の stale 化でゼロ音声に戻るため、二度と再生1本ぶんを下回らせない。
 */
export const VOICE_STALE_MS_NORMAL = 8000;
/**
 * v0.1.782: backlog 短縮は撤廃(=通常しきい値と同値)。件数ゲートがリアルタイム維持を担うため、
 *   時間ゲートをキュー長で短縮する必要がなくなった。後方互換のため定数は残すが NORMAL と同値にする。
 *   旧 export を参照するコードを壊さないための互換シム。
 */
export const VOICE_STALE_MS_BACKLOG = 8000;
/**
 * v0.1.782: 件数しきい値は実質無効化(到達不能な大きさ)。backlog 短縮を撤廃したので、
 *   どのキュー長でも通常(安全網)しきい値が使われる。後方互換のため残置。
 */
export const VOICE_STALE_BACKLOG_QUEUE = Number.POSITIVE_INFINITY;
/** ギフト等の高優先は確実に読みたいので長め(ms)。 */
export const VOICE_STALE_MS_HIGH_PRIORITY = 10000;

/**
 * @param {number} enqueuedAt - enqueue時のDate.now()
 * @param {number} now - 現在時刻
 * @param {number} queueLength - 現在のキュー長
 * @param {boolean} [isHighPriority=false] - ギフトなど確実に読みたいアイテムか
 * @returns {{ stale: boolean, reason: string }}
 */
export function isVoiceItemStale(enqueuedAt, now, queueLength, isHighPriority = false) {
  if (typeof enqueuedAt !== 'number' || typeof now !== 'number' || typeof queueLength !== 'number') {
    return { stale: false, reason: '' };
  }
  if (enqueuedAt > now || enqueuedAt <= 0) {
    return { stale: false, reason: '' };
  }

  const ageMs = now - enqueuedAt;

  // ギフト等は長め(確実に読む)。
  if (isHighPriority) {
    if (ageMs > VOICE_STALE_MS_HIGH_PRIORITY) {
      return { stale: true, reason: `age ${ageMs}ms > ${VOICE_STALE_MS_HIGH_PRIORITY}ms (high priority)` };
    }
    return { stale: false, reason: '' };
  }

  // v0.1.782: 通常コメントは安全網しきい値(8秒)一本。リアルタイム維持は件数ゲート
  //   (pushVoiceQueue の最古drop)が担うので、ここで再生待ちの item を落とすことはしない。
  //   backlog 短縮(再生1本ぶんを下回るとゼロ音声になる罠)は撤廃。queueLength は後方互換で
  //   受け取るが、しきい値はキュー長に依存しない(VOICE_STALE_BACKLOG_QUEUE=Infinity のため
  //   下の比較は常に NORMAL を選ぶ。明示のため NORMAL を直接使う)。
  const thresholdMs = VOICE_STALE_MS_NORMAL;
  if (ageMs > thresholdMs) {
    return { stale: true, reason: `age ${ageMs}ms > ${thresholdMs}ms (q: ${queueLength})` };
  }

  return { stale: false, reason: '' };
}
