#!/usr/bin/env node
/**
 * スマホ版のデモ(/live-view?v=demo)の土台 app/demo/snapshot.json を作る。
 *   ★実在の人・配信のデータは一切使わない。形(キーと型)だけ本物のまとめに合わせ、中身はすべて作り物。
 *   名前は作り物・顔は3キャラの絵・ID は実在しない桁(10桁の 99999900xx)か匿名(a:demo-)。
 *   コメントの流れ(commentTimelineMirror)は app/live-view-demo-feed.js が端末の中で毎回作る。
 *
 * 使い方: node scripts/build-phone-demo-snapshot.mjs  (app/demo/snapshot.json を書き直す)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_LIVE_ID } from '../app/live-view-demo-feed.js';

const OUT = fileURLToPath(new URL('../app/demo/snapshot.json', import.meta.url));
const T = 1_790_000_000_000; // 固定の時刻(読み込むときに live-view-demo-feed.js が「いま」へずらす)
// 顔は https の絶対 URL にする。ギフト表・ギフトの並びは http(s) の画像しか使わず、無いと
// 数字の ID からニコニコの画像を作りに行く(作り物の ID で本物の人の顔を読まないため)。
const ORIGIN = 'https://app.tsuioku-no-kirameki.com';
const FACE = {
  link: ORIGIN + '/app/images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-open.thumb128.png',
  konta: ORIGIN + '/app/images/yukkuri-charactore-english/konta/kitsune-yukkuri-smile-mouth-open.thumb128.png',
  tanu: ORIGIN + '/app/images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-smile-mouth-open.thumb128.png'
};
const NAMES = ['ほしぞら', 'もちもち', 'そらいろ', 'たけのこ', 'ねこまる', 'ゆきだるま', 'みかん', 'さくら餅', 'こはる', 'あおば', 'しろくま', 'つきみ'];
const TEXTS = ['こんばんは!', 'がんばれー!', '8888888', 'いまの面白かった', 'また来ます!', '待ってました〜'];
const uid = (i) => String(9999990001 + i);
const face = (i) => [FACE.link, FACE.konta, FACE.tanu][i % 3];
const texts = (i) => [TEXTS[i % TEXTS.length], TEXTS[(i + 2) % TEXTS.length], TEXTS[(i + 4) % TEXTS.length]];

/** 数字 ID の人(りんく・こん太・ギフト・広告の段)。 */
function named(i, idLine, stats) {
  const name = NAMES[i % NAMES.length];
  return { displaySrc: face(i), idLine: idLine || uid(i), nameLine: name, recentTexts: texts(i), stats, title: `${name}（${uid(i)}）`, userId: uid(i) };
}
/** 匿名の人(たぬ姉の段)。顔は ID から作る絵。 */
function anon(i) {
  const id = `a:demo${String(i).padStart(4, '0')}`;
  return { displaySrc: '', idLine: `${id.slice(0, 6)}…`, nameLine: '匿名', recentTexts: texts(i + 1), stats: { c: 3 + (i % 7) }, title: `匿名（${id}）`, userId: id };
}

const tiers = {
  link: Array.from({ length: 8 }, (_, i) => named(i, '', { c: 30 - i * 2, ...(i < 3 ? { g: 1000 - i * 300 } : {}) })),
  konta: Array.from({ length: 8 }, (_, i) => named(i + 8, '', { c: 20 - i })),
  gift: Array.from({ length: 5 }, (_, i) => named(i, 'ギフト', { c: 30 - i * 2, g: 1000 - i * 150 })),
  ad: Array.from({ length: 4 }, (_, i) => named(i + 4, '広告', { a: 3000 - i * 500 })),
  tanu: Array.from({ length: 24 }, (_, i) => anon(i))
};
const perTier = Object.fromEntries(Object.entries(tiers).map(([k, v]) => [k, { tileH: 0, tileW: 0, visible: v.length }]));
const total = Object.values(tiers).reduce((n, v) => n + v.length, 0);
const bundle = { bundleCapturedAt: T, bundleGen: 1, bundleLiveId: DEMO_LIVE_ID };
const ranking = (n, key, base) =>
  Array.from({ length: n }, (_, i) => ({ contribution: base - i * Math.floor(base / (n + 1)), isAnonymous: false, name: NAMES[(i + key) % NAMES.length], rank: i + 1, thumbnailUrl: face(i), userPageUrl: '' }));

const snapshot = {
  generatedAt: new Date(T).toISOString(),
  snapshotMeta: { capturedAt: T },
  overview: 'デモ配信(作り物のデータ)',
  lives: [
    {
      lv: DEMO_LIVE_ID,
      liveId: DEMO_LIVE_ID,
      broadcasterName: 'りんく(デモ)',
      title: 'デモ配信 — 追憶のきらめき ライブビュー',
      thumbnailUrl: '/app/images/yukkuri-charactore-english/link/link-yukkuri-fuji-background.png',
      viewerCountSource: 'embedded',
      recordedCount: 1280,
      officialCommentCount: 1300,
      officialRatePct: 98,
      watchCount: 2400,
      adPoints: 9000,
      giftPoints: 3200,
      elapsedSec: 3600,
      capturedAt: T,
      endedAt: null,
      recording: true
    }
  ],
  laneMirror: {
    ...tiers,
    ...bundle,
    capturedAt: T,
    contentHash: 'demo0001',
    domSelf: { dpr: 1, fingerprint: 'demo0001', fingerprintFor: 'demo0001', measured: true, measuredAt: T, perTier },
    liveId: DEMO_LIVE_ID,
    pickedLength: total,
    totalCandidates: total,
    writer: 'demo',
    writerId: 'demo'
  },
  statCardsMirror: {
    ...bundle,
    capturedAt: T,
    concurrent: { estIsPlaceholder: false, estText: '~120', subText: 'デモの数字' },
    liveId: DEMO_LIVE_ID,
    official: {
      adPts: { isPlaceholder: false, text: '9,000' },
      comments: { isPlaceholder: false, text: '1,300' },
      eventGiftPts: { isPlaceholder: true, text: '—' },
      eventRank: { isPlaceholder: true, text: '—' },
      eventTitle: { isPlaceholder: true, text: '—' },
      giftPts: { isPlaceholder: false, text: '3,200' },
      streamAge: { isPlaceholder: false, text: '1時間0分' },
      summaryText: 'デモ: 来2,400 · コ1,300 · 経1時間0分 · 広9,000 · 累3,200',
      viewers: { isPlaceholder: false, text: '2,400' }
    },
    recordsBreakdownLine: '内訳: 通常 1,280',
    recordsIngestLine: '✓ デモのデータです',
    recordsIsPlaceholder: false,
    recordsOfficialLine: '公式 1,300 件(デモ)',
    recordsText: '1,280',
    visitor: { isPlaceholder: false, text: '2,400' }
  },
  northStarMirror: {
    ...bundle,
    capturedAt: T,
    lanes: { adRanking: ranking(4, 4, 3000), contributionRanking: ranking(6, 0, 1000) },
    liveId: DEMO_LIVE_ID
  },
  topSupporters: null,
  giftHistoryMirror: {
    ariaLabel: 'ギフトを投げた人(デモ)',
    ...bundle,
    capturedAt: T,
    ledgerRows: Array.from({ length: 6 }, (_, i) => ({
      itemName: ['ハート', 'くす玉', '花火'][i % 3],
      points: [100, 500, 1000][i % 3],
      senderAvatarUrl: face(i),
      senderLabel: NAMES[i % NAMES.length],
      source: 'demo',
      thumbnailUrl: '',
      timeLabel: `${20 + i}:0${i}`,
      userId: uid(i)
    })),
    ledgerTotalCount: 6,
    liveId: DEMO_LIVE_ID,
    noteText: 'デモのギフト',
    officialProgramGiftPts: 3200,
    payloadSource: 'demo',
    pointsSumAll: 3200,
    pointsSumDisplayed: 3200,
    rooms: Array.from({ length: 5 }, (_, i) => ({ avatarUrl: face(i), count: 5 - i, nickname: NAMES[i % NAMES.length], userKey: uid(i) })),
    unitSuffix: 'pt'
  },
  roomHeatMirror: { active: 12, ...bundle, capturedAt: T, heatPercent: 55, heatText: '増加が大きい', liveId: DEMO_LIVE_ID, total: 30 },
  sessionSummaryMirror: {
    ...bundle,
    capturedAt: T,
    liveId: DEMO_LIVE_ID,
    rows: Array.from({ length: 6 }, (_, i) => ({
      capturedAt: T - (5 - i) * 600_000,
      commentStorageCount: 200 * (i + 1),
      giftUserCount: i + 1,
      officialCommentCount: 210 * (i + 1),
      peakConcurrentEstimate: 60 + i * 10,
      uniqueKnownCommenters: 20 + i * 5
    }))
  },
  phoneVoice: ''
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(snapshot)}\n`);
console.log(`wrote ${OUT} (${JSON.stringify(snapshot).length} bytes)`);
