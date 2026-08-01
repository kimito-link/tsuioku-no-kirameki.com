/**
 * 読み上げ合成が失敗した「どこで・なぜ」を名前で返す純関数(v0.1.1224)。
 *
 * 【なぜ必要か】
 * voicevoxClient.fetchSynthesizeVoice は失敗の全部を `null` に畳んで返す。返り値が同じなので、
 * 受け側は「合成に失敗した」としか言えない。2026-08-01 の実配信で
 *   `合成失敗17件(時間切れ1/その他16)`
 * が出たが、**その他16件の正体を誰も答えられない**状態だった。既存の分類は合成待ち時間が
 * タイムアウト上限(8000ms)に近いかどうかしか見ておらず、「速く null が返った」を
 * 一括りにしてしまう。
 *
 * ★[[instrument-must-name-the-cause-2026-08-01]]: 計器は症状でなく原因を出す。
 *   同じ症状(null)に複数の原因があると、開発者が必ず誤判定する(実際に今日5回踏んだ)。
 *
 * 【null になりうる経路(voicevoxClient.js 実コードから列挙)】
 *   1. audio_query が応答なし/HTTPエラー      → 'query_http'   (VOICEVOX は生きているが拒否)
 *   2. audio_query の JSON が壊れている        → 'query_body'
 *   3. synthesis が応答なし/HTTPエラー         → 'synth_http'
 *   4. synthesis の body 読み取り失敗          → 'synth_body'
 *   5. いずれかが時間切れ(AbortController)     → 'timeout'
 *   6. 例外(接続拒否=VOICEVOX 未起動/落ちた)   → 'unreachable'
 *
 * 「その他」に落ちていた大半は 6(接続不能) か 1(拒否) のはずで、この2つは意味が正反対:
 *   - unreachable = VOICEVOX が居ない/落ちた   → 拡張では直せない(ユーザーに起動を促す)
 *   - query_http  = 居るが処理を断っている     → 過負荷。投げる量を絞れば直る
 * 区別できないと打つ手を間違える。
 *
 * @module voiceSynthFailureReason
 */

/** 失敗理由トークン(状態速報の内訳ラベルにそのまま使う)。 */
export const VOICE_SYNTH_FAIL_REASONS = Object.freeze([
  'timeout',
  'unreachable',
  'query_http',
  'query_body',
  'synth_http',
  'synth_body',
  'unknown'
]);

/** 人間が読むラベル(状態速報は日本語で出す)。 @type {Record<string, string>} */
const REASON_LABEL = Object.freeze({
  timeout: '時間切れ',
  unreachable: '接続不能(VOICEVOX未起動/落ちた)',
  query_http: '解析拒否(過負荷の疑い)',
  query_body: '解析応答が不正',
  synth_http: '合成拒否(過負荷の疑い)',
  synth_body: '音声の受信失敗',
  unknown: '不明'
});

/**
 * 例外/応答から失敗理由を1つに決める。
 *
 * @param {{
 *   stage?: 'query'|'synth'|unknown,
 *   error?: unknown,
 *   httpStatus?: unknown,
 *   bodyInvalid?: unknown
 * }} [ev]
 * @returns {'timeout'|'unreachable'|'query_http'|'query_body'|'synth_http'|'synth_body'|'unknown'}
 */
export function classifyVoiceSynthFailureReason(ev) {
  const stage = String(ev?.stage || '');
  const msg = String(
    /** @type {any} */ (ev?.error)?.message ?? ev?.error ?? ''
  ).toLowerCase();

  // 時間切れは stage を問わず最優先(AbortController が投げる名前で判る)。
  if (msg.includes('timeout') || msg.includes('abort')) return 'timeout';

  // 接続そのものが張れない=VOICEVOX が居ない。fetch の TypeError('Failed to fetch') 等。
  if (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('econnrefused') ||
    msg.includes('connection refused') ||
    msg.includes('load failed')
  ) {
    return 'unreachable';
  }

  if (ev?.bodyInvalid === true) {
    return stage === 'synth' ? 'synth_body' : 'query_body';
  }

  const status = Number(ev?.httpStatus);
  if (Number.isFinite(status) && status > 0) {
    return stage === 'synth' ? 'synth_http' : 'query_http';
  }

  if (stage === 'synth') return 'synth_http';
  if (stage === 'query') return 'query_http';
  return 'unknown';
}

/**
 * 理由ごとの件数から状態速報の内訳を組み立てる。0件なら空文字(静かな計器)。
 *
 * @param {Record<string, unknown>|null|undefined} counts 理由トークン→件数
 * @returns {string}
 */
export function formatVoiceSynthFailureReasonLine(counts) {
  const c = counts && typeof counts === 'object' ? counts : {};
  /** @type {string[]} */
  const parts = [];
  let total = 0;
  for (const key of VOICE_SYNTH_FAIL_REASONS) {
    const n = Math.max(0, Math.floor(Number(/** @type {any} */ (c)[key]) || 0));
    if (n <= 0) continue;
    total += n;
    parts.push(`${REASON_LABEL[key]}${n}`);
  }
  if (total <= 0) return '';
  return `合成失敗の内訳(${total}件): ${parts.join(' / ')}`;
}

/**
 * 内訳から「次の一手」を1文で返す。原因ごとに打つ手が正反対なので言い切る。
 *
 * @param {Record<string, unknown>|null|undefined} counts
 * @returns {string} 対処文(判定できなければ空文字)
 */
export function adviseVoiceSynthFailure(counts) {
  const c = counts && typeof counts === 'object' ? counts : {};
  const n = (/** @type {string} */ k) =>
    Math.max(0, Math.floor(Number(/** @type {any} */ (c)[k]) || 0));
  const unreachable = n('unreachable');
  const overload = n('query_http') + n('synth_http');
  const timeout = n('timeout');
  const total = unreachable + overload + timeout + n('query_body') + n('synth_body') + n('unknown');
  if (total <= 0) return '';
  // 最も多い系統で助言を決める(拮抗時は「拡張では直せない」側を優先=誤った実装変更を防ぐ)。
  if (unreachable >= overload && unreachable >= timeout) {
    return 'VOICEVOX に接続できていません。起動しているか・ポート(既定50021)が合っているか確認してください(拡張側では直せません)。';
  }
  if (overload >= timeout) {
    return 'VOICEVOX は動いていますが処理を断っています=過負荷です。読み上げる件数/長さを絞ると改善します。';
  }
  return 'VOICEVOX の合成が時間内に終わっていません=処理が重い状態です。文字数制限を強めるか、より軽い設定を検討してください。';
}
