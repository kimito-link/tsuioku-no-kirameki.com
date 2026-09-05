#!/usr/bin/env node
/**
 * pick-live-for-check.mjs — 検証に使う実配信を【自動で1つ選ぶ】。
 *
 * ■ なぜ要るか(2026-08-18 ユーザー:「ちくらんから任意の放送を選ぶのも自動化したい」)
 *   黒画面・レーン描画の検証には「いまコメントが流れている実配信」が要る。
 *   毎回ユーザーに選ばせて開かせるのは私が手作業を依頼しているのと同じ
 *   [[never-make-user-run-commands-i-can-run]]。
 *
 * ■ ★どこから取るか(実測で決定)
 *   ちくらん(chikuwachan.com)ではなく【ニコ生公式ランキング】を使う。
 *   理由: chikuwachan は host_permissions に無く、足すと【ストア再審査】が要る。
 *        公式ランキングは `https://*.nicovideo.jp/*` で既に許可済み。
 *   ★実測: userPrograms 50件 → 検証に使える 39件 → 先頭はコメント6,291件。
 *
 * ■ 使い方
 *   node scripts/pick-live-for-check.mjs            … 1件選んで表示
 *   node scripts/pick-live-for-check.mjs --rank 2   … 3番目を選ぶ
 *   node scripts/pick-live-for-check.mjs --json     … 機械が読む形で出す
 *   node scripts/pick-live-for-check.mjs --list 10  … 候補を10件並べる
 *
 * @module pick-live-for-check
 */
import {
  NICOLIVE_RANKING_URL,
  extractEmbeddedData,
  listRankingPrograms,
  pickProgramForCheck,
  watchUrlFor
} from '../src/lib/nicoliveRankingPick.js';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : dflt;
};

const asJson = process.argv.includes('--json');
const listN = Number(arg('list', '0')) || 0;

const res = await fetch(NICOLIVE_RANKING_URL, {
  headers: { 'user-agent': 'Mozilla/5.0 (compatible; tsuioku-check/1.0)' }
});
if (!res.ok) {
  console.error(JSON.stringify({ error: 'fetch-failed', status: res.status }));
  process.exit(2);
}
const html = await res.text();
const data = extractEmbeddedData(html);
// ★取れなかったことを「配信が無い」と言わない [[zero-count-may-mean-unmeasured-2026-08-04]]
if (!data) {
  console.error(JSON.stringify({
    error: 'unparsed',
    hint: 'embedded-data が読めない(ニコ生側の構造が変わった可能性)',
    htmlLen: html.length
  }, null, 2));
  process.exit(3);
}

const programs = listRankingPrograms(data, { includeOfficial: process.argv.includes('--official') });
if (programs.length === 0) {
  console.error(JSON.stringify({ error: 'empty', hint: 'ranking は読めたが配信が0件' }, null, 2));
  process.exit(3);
}

const opts = {
  rank: Number(arg('rank', '0')) || 0,
  minComments: Number(arg('min-comments', '100')) || 100,
  allowSensitive: process.argv.includes('--allow-sensitive'),
  allowFollowerOnly: process.argv.includes('--allow-follower-only')
};

if (listN > 0) {
  const rows = [];
  for (let i = 0; i < listN; i++) {
    const r = pickProgramForCheck(programs, { ...opts, rank: i });
    if (!r.program) break;
    rows.push({ rank: i, lv: r.program.lv, comments: r.program.commentCount,
                watch: r.program.watchCount, title: r.program.title.slice(0, 40) });
  }
  console.log(asJson ? JSON.stringify(rows, null, 2)
    : rows.map((r) => `${String(r.rank).padStart(2)}  ${r.lv}  コメント${String(r.comments).padStart(6)}  来場${String(r.watch).padStart(5)}  ${r.title}`).join('\n'));
  process.exit(0);
}

const picked = pickProgramForCheck(programs, opts);
if (!picked.program) {
  console.error(JSON.stringify({ error: picked.reason, candidates: picked.candidates, total: programs.length }, null, 2));
  process.exit(4);
}
const out = {
  lv: picked.program.lv,
  url: watchUrlFor(picked.program.lv),
  title: picked.program.title,
  comments: picked.program.commentCount,
  watch: picked.program.watchCount,
  candidates: picked.candidates,
  total: programs.length
};
console.log(asJson ? JSON.stringify(out, null, 2)
  : `${out.lv}  コメント${out.comments} / 来場${out.watch}\n${out.title}\n${out.url}\n(候補${out.candidates}件 / 全${out.total}件)`);
