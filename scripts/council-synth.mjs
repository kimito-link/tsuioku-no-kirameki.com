// council-synth.mjs — 会議の②統合（全員の回答を1案に束ねる工程）の「誰に・どの順で頼むか」を決める純粋関数。
//
// 使い方: meeting.mjs の統合ブロックが呼ぶ。
//   orderSynthChain(chain, digestChars) … 入力の大きさで、物理的に受け取れない候補を後ろへ回す
//   shouldWaitAndRetry(errorMessage)    … 429のとき「待てば通る」か「待っても絶対に通らない」かを分ける
//
// なぜ要るか（2026-10-28 実会議・COUNCIL_FULL=1・20体で観測）:
//   統合digestが11686字になり、3候補が全部崩れた。
//   1. groq/gpt-oss-120b … 429 → 65秒待って再試行 → 413「Request too large」。
//      無料枠のTPM(1分の上限)は8000トークンで、入力そのものが上限を超えていた＝待っても絶対に通らない。
//      それなのに筆頭として毎回65秒待っていた。
//   2. cloudflare/nemotron-120b … 推論で出力上限を使い切り本文なし（上限3000でも同じ→統合の順番で gemini の後ろへ）。
//   3. gemini-2.5-flash … 280字で途中切れ（思考トークンが出力上限を食った。meeting.mjs の geminiChat 側で対処）。
//   meeting.mjs の compressAnswer コメント(2026-08-16)が「再挑戦するなら統合役をTPMの緩い別プロバイダにして
//   全文を渡す方向が筋」と書いている。ここはその方向の実装: 入力を削らず、受け取れる候補へ先に渡す。
//   ★入力を削る案は採らない（削った統合を「全員を読んだ統合」として記録するのは fail-closed 違反、同コメント参照）。

/** 日本語の会議文の「1字あたりトークン数」の見積もり（meeting.mjs のdigestログと429の Requested 値で校正する前提の仮値）。 */
export const TOKENS_PER_CHAR = 1.3;

/** 統合プロンプトのうち digest 以外（指示文・system・出力上限の予約）にかかるトークンの見積もり。 */
export const SYNTH_OVERHEAD_TOKENS = 3000;

/** プロバイダ別の「1リクエストで受け取れる最大トークン」。無料枠のTPMがそのまま1回の上限になるものだけ書く。
 *  載っていないプロバイダは「十分大きい」とみなして並べ替えない。 */
export const SYNTH_REQUEST_LIMIT = {
  groq: 8000, // 無料枠 gpt-oss-120b の TPM。413 の本文 "Limit 8000" で実測確認（2026-10-28）
};

/** digest の字数から、統合1回のリクエストの見積もりトークンを出す。 */
export function estimateSynthTokens(digestChars) {
  return Math.ceil(Number(digestChars || 0) * TOKENS_PER_CHAR) + SYNTH_OVERHEAD_TOKENS;
}

/**
 * 統合候補の並びを、入力の大きさに合わせて組み替える。
 * 受け取れない候補は捨てずに末尾へ回す（見積もりが外れて通る可能性を残す・候補を黙って消さない）。
 * 順位以外は変えない（同じ組の中では元の能力優先の順を保つ）。
 * @param {{label:string, provider?:string}[]} chain
 * @param {number} digestChars
 * @returns {{ chain: object[], moved: string[] }}
 */
export function orderSynthChain(chain, digestChars) {
  const est = estimateSynthTokens(digestChars);
  const fits = [];
  const tooBig = [];
  for (const c of chain || []) {
    const limit = SYNTH_REQUEST_LIMIT[c?.provider];
    (limit && est > limit ? tooBig : fits).push(c);
  }
  return { chain: [...fits, ...tooBig], moved: tooBig.map(c => c.label), estimatedTokens: est };
}

/**
 * 429/413 のエラー文から「待って同じ入力で再試行すれば通るか」を判定する。
 * 通るのは「1分の上限(TPM)が一時的に埋まっている」ときだけ。
 * 次のときは待っても絶対に通らないので false:
 *  - 413 / "Request too large"（入力そのものが上限超え）
 *  - "Limit N ... Requested M" で M > N（1回の要求が上限を超えている）
 *  - 1日の上限(TPD)の枯渇
 */
export function shouldWaitAndRetry(message) {
  const msg = String(message || '');
  if (!/tokens per minute|\bTPM\b/i.test(msg)) return false;
  if (/\b413\b|request too large/i.test(msg)) return false;
  if (/tokens per day|\bTPD\b/i.test(msg)) return false;
  const limit = msg.match(/Limit\s*:?\s*(\d+)/i);
  const requested = msg.match(/Requested\s*:?\s*(\d+)/i);
  if (limit && requested && Number(requested[1]) > Number(limit[1])) return false;
  return true;
}
