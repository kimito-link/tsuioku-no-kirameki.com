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
//
// 2026-11-10 追加: 統合文が手順(1)〜(4)を飛ばす件の根本修正。ここに「統合役へ渡す文」と「手順が書かれたかの検査」を置く。
//   buildSynthSystem()        … 統合役だけの system（役割・出力の型）。モデル名から決まる役割文は使わない
//   buildSynthPrompt(digest)  … 統合役へ渡す本文（全員の回答＋手順）
//   checkSynthAnswer(answer)  … 手順4つと見出し4つが実際に書かれたかを見る
//   pickLeastIncomplete(list) … 全候補が手順を欠いたとき、欠けの最も少ない1件を選ぶ
//
// なぜ飛ばされていたか（council/*-answers.json に残る統合12件を数えた実測・手順4つがそろったもの 0/12）:
//   1. system がモデル名から決まっていた。統合の筆頭 groq/gpt-oss-120b は名前から「批判役」になり、
//      「(0)擁護 (1)初期評価 (2)反証 (3)修正指示 の順で必ず書け」を system で受け取っていた。
//      → 4件中3件が「(0) 擁護」で始まる批判文を「統合」として記録していた（統合そのものをしていない）。
//   2. 批判役以外には system の【出力の型】が「見出しは4つのまま。増やさないこと」と命じていた。
//      本文側の「(1)〜(4)を書いてから最終案」と正面からぶつかり、system が勝って手順が消えた。
//   3. 出力上限が1600トークンで、手順4つ＋4見出しを書き切る余裕が無かった。
//   4. 手順が欠けても成功として記録していた（欠けに気づく仕組みが無かった）。
//   対処はそれぞれ 1・2 → buildSynthSystem / 3 → SYNTH_MAX_TOKENS / 4 → checkSynthAnswer。

import { DESIGN_STANCE } from './council-roles.mjs';

/** 日本語の会議文の「1字あたりトークン数」の見積もり（meeting.mjs のdigestログと429の Requested 値で校正する前提の仮値）。 */
export const TOKENS_PER_CHAR = 1.3;

/** 統合の出力上限（トークン）。手順4つ＋4見出しを書き切るための値。通常の回答は1600のまま。
 *  名簿(council-lineup)の opts に max_tokens を実測で決めてあるモデルは、そちらを優先する（meeting.mjs の outOpts）。 */
export const SYNTH_MAX_TOKENS = 3000;

/** 統合プロンプトのうち digest 以外にかかるトークンの見積もり = 指示文・system の約1400 ＋ 出力上限の予約。
 *  出力上限を変えたらここも連動する（Groq は入力＋出力上限の合計で1回の上限を数える）。 */
export const SYNTH_OVERHEAD_TOKENS = 1400 + SYNTH_MAX_TOKENS;

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

// ── 統合役へ渡す文と、手順が書かれたかの検査（2026-11-10） ─────────────────────────

/** 手順の印「(2)判定」が書かれたかを見る正規表現を作る。全角の括弧・数字、丸数字、太字の記号(**)の揺れは許す。
 *  語だけ（例「判定」）では見ない——手順4の文中にも「(2)の判定」と出るので、番号と語の組で見る。 */
function stepMark(n, name) {
  const zen = '０１２３４５６７８９'[n];
  const maru = '⓪①②③④⑤'[n];
  return new RegExp(`(?:[（(]\\s*[${n}${zen}]\\s*[)）]|${maru}|手順\\s*[${n}${zen}][.．:：]?)[\\s*＊]*${name}`);
}

/** 統合の手順。name は出力に必ず書かせる語。文(ask)と検査(found)を1か所に置いて、片方だけ変わるずれを防ぐ。 */
export const SYNTH_STEPS = [
  { n: 1, name: '対立点',
    ask: 'メンバー間で結論が食い違う点を箇条書きで挙げる。批判役同士の指摘が食い違う場合も対立点として挙げる。無ければ「対立なし」と書く。' },
  { n: 2, name: '判定',
    ask: '各対立点についてどちらを採るか理由付きで決める。単なる折衷は禁止。両者の前提を組み替えて両立させる第三案が実在する場合のみ、それを採ってよい。' },
  { n: 3, name: '少数意見',
    ask: '多数派の前提そのものを否定する意見があれば、無視せず「採用/却下＋理由」を書く。【最重要】印の付いた批判が最終案で解決されているかを必ず確かめる。無ければ「該当なし」と書く。' },
  { n: 4, name: '自己検証',
    ask: '自分の統合ロジックを2文で要約し、(2)の判定と矛盾していないことを確かめる。' },
].map(s => ({ ...s, found: stepMark(s.n, s.name) }));

/** 最終案の4見出し（council-roles の DEFAULT_FORMAT と同じ4つ。meeting.mjs の compressAnswer がこの見出しで切り出す）。 */
export const SYNTH_BLOCKS = [
  { name: '結論', found: /^#{1,4}\s*\**\s*結論/m },
  { name: '根拠', found: /^#{1,4}\s*\**\s*根拠/m },
  { name: '反論・リスク', found: /^#{1,4}\s*\**\s*反論/m },
  { name: '具体案', found: /^#{1,4}\s*\**\s*具体案/m },
];

/**
 * 統合役だけの system。モデル名に関係なく同じ文を渡す（批判役の型や「見出しは4つまで」を混ぜない）。
 * 判断基準(DESIGN_STANCE)は会議の全員と同じものを入れる。
 */
export function buildSynthSystem({ baseSystem = '' } = {}) {
  const role =
    '【あなたの役割】あなたは会議の『統括役』です。メンバー全員の回答を読み、1つの案に束ねます。' +
    '自分の新しい案を足す場ではなく、出た意見を裁いて決める場です。あれもこれもにせず、何を捨てるかまで決めること。';
  const format =
    '【出力の型】次の順で、見出しをこのとおりに書くこと。手順を省いて最終案から書き始めてはいけません。\n' +
    '## 統合の手順\n' +
    SYNTH_STEPS.map(s => `(${s.n})${s.name}: …`).join('\n') + '\n' +
    SYNTH_BLOCKS.map(b => `## ${b.name}`).join('\n') + '\n' +
    '手順(1)〜(4)はそれぞれ3行以内で短く。字数は最終案の4見出しに使うこと。';
  return [baseSystem, DESIGN_STANCE, role, format].filter(Boolean).join('\n\n');
}

/** 統合役へ渡す本文。digest は入力を削らずそのまま入れる（削った統合を全員分として記録しない）。 */
export function buildSynthPrompt(digest) {
  return `【会議メンバー全員の回答（批判・修正済み）】\n${digest}\n\n` +
    `あなたは統括役。まず「## 統合の手順」の見出しの下に、次の4つをこの順で書くこと:\n` +
    SYNTH_STEPS.map(s => `(${s.n})${s.name}: ${s.ask}`).join('\n') + '\n' +
    `そのあとに最終案を ${SYNTH_BLOCKS.map(b => `「## ${b.name}」`).join('')} の4見出しで書く。優先順位を付け、何を捨てるかまで決める。あれもこれもにしない。` +
    `最終案は『A案/B案どちらにしますか』と問い返さず、【判断基準】の順（ガードレール→LTV÷CPA→回収の早さ→保守の手間の少なさ）で1案に断定する。`;
}

/**
 * 統合文に、手順4つと見出し4つが実際に書かれているかを見る。
 * 見るのは「その語が書かれたか」まで。中身が正しいかは判定しない（意味の判定は機械ではできない）。
 * @returns {{ ok: boolean, missingSteps: string[], missingBlocks: string[] }}
 */
export function checkSynthAnswer(answer) {
  const text = String(answer || '');
  const missingSteps = SYNTH_STEPS.filter(s => !s.found.test(text)).map(s => `(${s.n})${s.name}`);
  const missingBlocks = SYNTH_BLOCKS.filter(b => !b.found.test(text)).map(b => b.name);
  return { ok: missingSteps.length === 0 && missingBlocks.length === 0, missingSteps, missingBlocks };
}

/**
 * 全候補が手順を欠いたときに、欠けの最も少ない1件を選ぶ（同数なら先の候補＝能力優先の順を保つ）。
 * @param {{ check: { missingSteps: string[], missingBlocks: string[] } }[]} list
 */
export function pickLeastIncomplete(list) {
  const lack = (x) => x.check.missingSteps.length + x.check.missingBlocks.length;
  return (list || []).reduce((best, x) => (!best || lack(x) < lack(best) ? x : best), null);
}
