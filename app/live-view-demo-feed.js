/**
 * スマホ版(app/live-view)の「デモ」= PC が無くても動く作り物の配信(純関数)。
 *   App Store の審査員や、拡張を入れる前の人が、/live-view?v=demo で中身を試せるようにする。
 *
 * ■ サーバーには何も保存しない・何も送らない
 *   見本のまとめ(/app/demo/snapshot.json・人の名前やコメントは作り物に置き換え済み)を土台に、
 *   時間の経過に合わせて作り物のコメントとギフトを端末の中で足していく。
 * ■ 人は全員「匿名(a: で始まる ID)」=顔は ID から作る絵(ニコニコの画像サーバーに取りに行かない)。
 *
 * @module live-view-demo-feed
 */

export const DEMO_TOKEN = 'demo';
/** 作り物の配信番号(実在の配信を指さない桁)。 */
export const DEMO_LIVE_ID = 'lv900000000001';
/** 1行が流れる間隔(ms)。 */
export const DEMO_STEP_MS = 4_000;
/** 鏡に残す行数(本物の鏡と同じ上限)。 */
const DEMO_KEEP = 60;

/** 作り物の視聴者(匿名)。 */
const PEOPLE = [
  { userId: 'a:demo-hoshi', name: 'ほしぞら' },
  { userId: 'a:demo-mochi', name: 'もちもち' },
  { userId: 'a:demo-sora', name: 'そらいろ' },
  { userId: 'a:demo-take', name: 'たけのこ' },
  { userId: 'a:demo-neko', name: 'ねこまる' },
  { userId: 'a:demo-yuki', name: 'ゆきだるま' }
];

/** 流れる台本(1周したら最初に戻る)。gift は ギフト行。 */
const SCRIPT = [
  { p: 0, text: 'こんばんは!' },
  { p: 1, text: '待ってました〜' },
  { p: 2, text: '今日の配信たのしみ' },
  { p: 3, text: '音きこえてます' },
  { p: 4, gift: 'ハート', point: 100 },
  { p: 5, text: 'はじめて来ました' },
  { p: 0, text: 'ようこそ〜' },
  { p: 1, text: 'いまの面白かったw' },
  { p: 2, text: 'がんばれー!' },
  { p: 3, gift: 'くす玉', point: 500 },
  { p: 4, text: 'きれいな景色' },
  { p: 5, text: 'もうすぐ1時間' },
  { p: 0, text: '8888888' },
  { p: 1, text: 'また来ます!' },
  { p: 2, gift: '花火', point: 1000 },
  { p: 3, text: 'おつかれさまでした' }
];

/**
 * 台本の i 番目の行(コメント番号は i+1 から増え続ける)。
 * @param {number} i
 * @param {number} at
 */
export function demoRowAt(i, at) {
  const line = SCRIPT[i % SCRIPT.length];
  const who = PEOPLE[line.p % PEOPLE.length];
  if (line.gift) {
    return { at, name: who.name, text: line.gift, avatarUrl: '', userId: who.userId, kind: 'gift', itemName: line.gift, point: line.point };
  }
  return { at, name: who.name, text: line.text, avatarUrl: '', userId: who.userId, kind: 'comment', no: String(i + 1) };
}

/**
 * 経過時間に合わせたデモのまとめ。base(見本)の時刻と配信番号を「いま」に合わせ、コメント鏡を作り直す。
 * @param {{ base: any, startedAt: number, nowMs: number }} a
 * @returns {any}
 */
export function buildDemoSnapshot(a) {
  const base = a && a.base && typeof a.base === 'object' ? a.base : {};
  const nowMs = Number(a && a.nowMs) || 0;
  const startedAt = Number(a && a.startedAt) || nowMs;
  // 開いた瞬間から画面が寂しくないよう、12行ぶん過去から始める。
  const n = 12 + Math.max(0, Math.floor((nowMs - startedAt) / DEMO_STEP_MS));
  const from = Math.max(0, n - DEMO_KEEP);
  const rows = [];
  for (let i = from; i < n; i += 1) rows.push(demoRowAt(i, nowMs - (n - 1 - i) * DEMO_STEP_MS));
  // 見本の時刻は固定なので、鏡の時刻も「いま」に合わせる(古い状態の帯を出さない)。
  const withLive = (/** @type {any} */ m) =>
    m && typeof m === 'object' ? { ...m, liveId: DEMO_LIVE_ID, bundleLiveId: DEMO_LIVE_ID, capturedAt: nowMs, bundleCapturedAt: nowMs } : m;
  const lives = Array.isArray(base.lives) ? base.lives.map((/** @type {any} */ l, /** @type {number} */ k) => (k === 0 ? { ...l, liveId: DEMO_LIVE_ID, lv: DEMO_LIVE_ID, capturedAt: nowMs } : l)).slice(0, 1) : [];
  return {
    ...base,
    generatedAt: new Date(nowMs).toISOString(),
    lives,
    laneMirror: withLive(base.laneMirror),
    statCardsMirror: withLive(base.statCardsMirror),
    northStarMirror: withLive(base.northStarMirror),
    giftHistoryMirror: withLive(base.giftHistoryMirror),
    roomHeatMirror: withLive(base.roomHeatMirror),
    sessionSummaryMirror: withLive(base.sessionSummaryMirror),
    snapshotMeta: { capturedAt: nowMs },
    commentTimelineMirror: { liveId: DEMO_LIVE_ID, capturedAt: nowMs, rows, totalSeen: n },
    phoneVoice: '',
    statusReport: null
  };
}
