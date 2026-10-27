// voiceTestRun.js — 読み上げを「決まった形のコメント」で流して測る試験(開発版だけ・2026-10-26)。
//
// 背景: りんく「確かめるのも全部やってほしい」。実配信まかせでは短いコメントしか来ず、長文や
//   「一度に10件」を試せなかった。ここは本物のコメントと同じ入口(コメビュ enqueueVoiceTimelineItems /
//   会場 VoicePlayer.enqueue)に試験用のコメントを流し、終わったら計器の差分を1つの記録に残す。
//   ★ストアに出す版では動かない(manifest に key がある開発版だけ=stage-submission.py が key を落とす)。
//   ★ニコ生にコメントを送ることは無い(読み上げの列に入れるだけ)。

import { voiceStyleLevelsSnapshot } from './voiceStream.js';

/** 試験の結果を残す storage キー(直近 VOICE_TEST_REPORT_KEEP 件の配列)。 */
export const VOICE_TEST_REPORT_KEY = 'nls_voice_test_report_v1';
export const VOICE_TEST_REPORT_KEEP = 20;
/** 試験を始める runtime メッセージの type。target は 'comeview' か 'venue'。 */
export const VOICE_TEST_MESSAGE = 'NLS_VOICE_TEST';
export const VOICE_TEST_KINDS = Object.freeze(['short', 'long', 'burst', 'mixed']);

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
 * v0.1.1799: 'mixed' = 本番の流れに近い、決まった並び(毎回同じ=前後の版を比べられる)。
 *   [前からの間隔ms, 長文か]。短文が続く所・長文が続く所・3件いっぺん・しばらく静か、を混ぜた約2分。
 */
const MIXED_PLAN = Object.freeze([
  [0, false], [1200, false], [2500, true], [800, false], [300, false],
  [300, false], [4000, true], [3000, true], [1500, false], [6000, false],
  [500, true], [500, false], [2000, false], [7000, true], [2500, true],
  [1000, false], [200, false], [200, false], [200, true], [9000, false],
  [3500, true], [1800, false], [1200, false], [4500, true], [600, false],
  [600, true], [5000, false], [2200, true], [1400, false], [3000, false]
]);

/**
 * 試験で流すコメントと、前のコメントからの間隔(ms)。userId は毎回新しい(=初めての声も試す)。
 * @param {unknown} kind 'short'(1.5秒おき)/ 'long'(40字以上・7秒おき=読み終わるより先に次が来ない間隔)/ 'burst'(1秒以内に全部)
 *   / 'mixed'(短文と長文・間隔ばらばらの決まった並び・最大30件)
 * @param {unknown} count
 * @param {string} runId
 * @returns {{ gapMs: number, item: { kind: 'comment', userId: string, nickname: string, text: string } }[]}
 */
export function buildVoiceTestItems(kind, count, runId) {
  const k = VOICE_TEST_KINDS.includes(/** @type {any} */ (kind)) ? /** @type {string} */ (kind) : 'short';
  const n = Math.max(1, Math.min(30, Math.floor(Number(count)) || 10));
  if (k === 'mixed') {
    return MIXED_PLAN.slice(0, n).map(([gapMs, isLong], i) => ({
      gapMs,
      item: {
        kind: 'comment',
        userId: `voicetest-${runId}-${i}`,
        nickname: `試験${i + 1}`,
        text: (isLong ? LONG_TEXTS : SHORT_TEXTS)[i % 10]
      }
    }));
  }
  const texts = k === 'long' ? LONG_TEXTS : SHORT_TEXTS;
  // v0.1.1773: 長文は1件約5〜6秒の声なので、4秒おきだと読むより来る方が速く、どの PC でも遅れが積もった。
  const gap = k === 'long' ? 7000 : k === 'burst' ? 100 : 1500;
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
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      // 失敗の理由別の数(synthFailReasons)など、1段下の数も差分にする(v0.1.1773)。
      const prev = before?.[key] && typeof before[key] === 'object' ? before[key] : {};
      for (const [sub, sv] of Object.entries(v)) {
        const n = Number(sv);
        if (!Number.isFinite(n)) continue;
        const d = n - (Number(prev[sub]) || 0);
        if (d !== 0) out[`${key}.${sub}`] = d;
      }
      continue;
    }
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
 *   prepare?: () => void,
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
  // v0.1.1773: 開いた時に読み込んだ昔のコメント(待ち行列)を捨て、鳴り終わるのを待ってから始める
  //   (コメビュは配信のさかのぼり分が試験の前に並び、声までの時間を5〜7秒に見せていた)。
  if (typeof o.prepare === 'function') { try { o.prepare(); } catch { /* no-op */ } }
  const settleBy = now() + 15_000;
  while (!o.isIdle() && now() < settleBy) await sleep(250);
  // 声ごとの大きさの最小/最大は「その回の分」だけを見る(差分にできない値なので、始めに戻す)。
  const live = o.getDiag();
  if (live && typeof live === 'object') { live.outRmsDbMin = 999; live.outRmsDbMax = -999; live.e2eMaxMs = 0; live.bgInitMaxMs = 0; live.lastPlayIssue = ''; }
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
  const delta = diffVoiceDiag(before, after);
  const e2eN = Number(delta.e2eSampleTotal) || 0;
  const report = {
    mode: o.mode,
    label: typeof o.label === 'string' ? o.label : '',
    kind: plan.length && o.kind ? String(o.kind) : 'short',
    count: plan.length,
    runId,
    startedAt,
    finishedAt: now(),
    timedOut,
    // v0.1.1774: この回だけの「声が出るまで」の平均・最大(e2eAvgMs は過去の回を引きずる)。
    e2eRunAvgMs: e2eN > 0 ? Math.round((Number(delta.e2eSumMsTotal) || 0) / e2eN) : -1,
    e2eRunMaxMs: e2eN > 0 ? Number(delta.e2eMaxMs) || 0 : -1,
    // v0.1.1776: 試験の間に混ざった本物のコメントの件数(声の差・遅れの見え方に効く)。計器が無ければ -1。
    otherItems: Number.isFinite(Number(delta.voiceEnqueuedTotal)) ? Math.max(0, Number(delta.voiceEnqueuedTotal) - plan.length) : -1,
    // v0.1.1783: 声ごとの素の最大振幅・RMS(このページで覚えている分)。声ごとの差の直し方を決める材料。
    styleLevels: voiceStyleLevelsSnapshot(),
    delta
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
