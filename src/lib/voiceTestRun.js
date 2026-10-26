// voiceTestRun.js — 読み上げを「決まった形のコメント」で流して測る試験(開発版だけ・2026-10-26)。
//
// 背景: りんく「確かめるのも全部やってほしい」。実配信まかせでは短いコメントしか来ず、長文や
//   「一度に10件」を試せなかった。ここは本物のコメントと同じ入口(コメビュ enqueueVoiceTimelineItems /
//   会場 VoicePlayer.enqueue)に試験用のコメントを流し、終わったら計器の差分を1つの記録に残す。
//   ★ストアに出す版では動かない(manifest に key がある開発版だけ=stage-submission.py が key を落とす)。
//   ★ニコ生にコメントを送ることは無い(読み上げの列に入れるだけ)。

/** 試験の結果を残す storage キー(直近 VOICE_TEST_REPORT_KEEP 件の配列)。 */
export const VOICE_TEST_REPORT_KEY = 'nls_voice_test_report_v1';
export const VOICE_TEST_REPORT_KEEP = 20;
/** 試験を始める runtime メッセージの type。target は 'comeview' か 'venue'。 */
export const VOICE_TEST_MESSAGE = 'NLS_VOICE_TEST';
export const VOICE_TEST_KINDS = Object.freeze(['short', 'long', 'burst']);

/**
 * 開発版(manifest に key がある)だけ試験を許す。
 * @param {unknown} manifest
 * @returns {boolean}
 */
export function isVoiceTestAllowed(manifest) {
  const key = /** @type {any} */ (manifest)?.key;
  return typeof key === 'string' && key.length > 0;
}

const SHORT_TEXTS = Object.freeze(['こんばんは', 'わこつ', '888', 'かわいい', 'すごい', 'なるほど', 'おつかれさま', 'きたー', 'ありがとう', 'それな']);
const LONG_TEXTS = Object.freeze([
  '今日の配信もすごく楽しみにしていました、仕事が終わってからずっと待っていたので本当にうれしいです',
  'さっきの話の続きなんですけど、あの場面で右に曲がっていたらどうなっていたのかずっと気になっています',
  '初見です、友達にすすめられて来てみたんですが雰囲気がとてもよくて、これからも見に来ようと思いました',
  'ギフトを送ろうと思ったんですけど、どれがいいのか迷っているうちに配信が終わりそうになってあせりました',
  '明日は早起きしないといけないのでそろそろ寝ますが、最後まで見られなくて残念です、またアーカイブで見ます',
  'このゲームは昔やったことがあるんですが、ここのボスがとても強くて何回も負けたのを思い出して笑っています',
  'みなさんのコメントを読んでいると、同じところで同じように驚いている人がたくさんいて一体感がすごいですね',
  '音量はちょうどいいです、さっきより声が聞き取りやすくなったので、そのままの設定でいいと思いますよ本当に',
  '配信のサムネイルがとてもかわいかったので思わずクリックしてしまいました、今日はどんな内容になるんですか',
  'いつも楽しい時間をありがとうございます、来週の配信も予定を空けて待っているので無理せずがんばってください'
]);

/**
 * 試験で流すコメントと、前のコメントからの間隔(ms)。userId は毎回新しい(=初めての声も試す)。
 * @param {unknown} kind 'short'(1.5秒おき)/ 'long'(40字以上・4秒おき)/ 'burst'(1秒以内に全部)
 * @param {unknown} count
 * @param {string} runId
 * @returns {{ gapMs: number, item: { kind: 'comment', userId: string, nickname: string, text: string } }[]}
 */
export function buildVoiceTestItems(kind, count, runId) {
  const k = VOICE_TEST_KINDS.includes(/** @type {any} */ (kind)) ? /** @type {string} */ (kind) : 'short';
  const n = Math.max(1, Math.min(30, Math.floor(Number(count)) || 10));
  const texts = k === 'long' ? LONG_TEXTS : SHORT_TEXTS;
  const gap = k === 'long' ? 4000 : k === 'burst' ? 100 : 1500;
  return Array.from({ length: n }, (_, i) => ({
    gapMs: i === 0 ? 0 : gap,
    item: {
      kind: 'comment',
      userId: `voicetest-${runId}-${i}`,
      nickname: `試験${i + 1}`,
      text: texts[i % texts.length]
    }
  }));
}

/**
 * diag の数値の差分(後 − 前)。EMA・最大値・直近値は差分にせず「後」の値をそのまま入れる。
 * @param {Record<string, any>} before
 * @param {Record<string, any>} after
 */
export function diffVoiceDiag(before, after) {
  /** @type {Record<string, number|string>} */
  const out = {};
  for (const [key, v] of Object.entries(after || {})) {
    if (typeof v === 'string') { out[key] = v; continue; }
    const a = Number(v);
    if (!Number.isFinite(a)) continue;
    const cumulative = /Total$|Samples$|^spoken|Count$/.test(key);
    out[key] = cumulative ? a - (Number(before?.[key]) || 0) : a;
  }
  return out;
}

/**
 * 試験を1回流して、終わったら結果を返す(write があれば保存も)。
 * @param {{
 *   kind: unknown, count?: unknown, mode: string, label?: string,
 *   enqueue: (items: Record<string, any>[]) => void,
 *   getDiag: () => Record<string, any>,
 *   isIdle: () => boolean,
 *   write?: (report: Record<string, any>) => Promise<unknown> | unknown,
 *   now?: () => number,
 *   sleep?: (ms: number) => Promise<void>,
 *   timeoutMs?: number
 * }} o
 */
export async function runVoiceTest(o) {
  const now = typeof o.now === 'function' ? o.now : () => Date.now();
  const sleep = typeof o.sleep === 'function' ? o.sleep : (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
  const runId = `${now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const plan = buildVoiceTestItems(o.kind, o.count, runId);
  const before = JSON.parse(JSON.stringify(o.getDiag() || {}));
  const startedAt = now();
  for (const { gapMs, item } of plan) {
    if (gapMs > 0) await sleep(gapMs);
    const at = now();
    o.enqueue([{ ...item, at, receivedAt: at }]);
  }
  const lastEnqueuedAt = now();
  const deadline = startedAt + (Number(o.timeoutMs) > 0 ? Number(o.timeoutMs) : 180_000);
  let idleStreak = 0;
  let timedOut = false;
  // 最後のコメントを入れてから、列が空で鳴っていない状態が2回続いたら終わり(最低2秒は待つ)。
  while (idleStreak < 2 || now() - lastEnqueuedAt < 2000) {
    if (now() > deadline) { timedOut = true; break; }
    await sleep(500);
    idleStreak = o.isIdle() ? idleStreak + 1 : 0;
  }
  const after = JSON.parse(JSON.stringify(o.getDiag() || {}));
  const report = {
    mode: o.mode,
    label: typeof o.label === 'string' ? o.label : '',
    kind: plan.length && o.kind ? String(o.kind) : 'short',
    count: plan.length,
    runId,
    startedAt,
    finishedAt: now(),
    timedOut,
    delta: diffVoiceDiag(before, after)
  };
  if (typeof o.write === 'function') {
    try { await o.write(report); } catch { /* 保存できなくても試験は終わる */ }
  }
  return report;
}

/**
 * chrome.storage.local の記録へ1件足す(直近 VOICE_TEST_REPORT_KEEP 件)。
 * @param {{ get: (k: string) => Promise<Record<string, any>>, set: (v: Record<string, any>) => Promise<unknown> }} storage
 * @param {Record<string, any>} report
 */
export async function appendVoiceTestReport(storage, report) {
  const bag = await storage.get(VOICE_TEST_REPORT_KEY);
  const prev = Array.isArray(bag?.[VOICE_TEST_REPORT_KEY]) ? bag[VOICE_TEST_REPORT_KEY] : [];
  await storage.set({ [VOICE_TEST_REPORT_KEY]: [...prev, report].slice(-VOICE_TEST_REPORT_KEEP) });
}
