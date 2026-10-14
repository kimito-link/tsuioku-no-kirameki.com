/**
 * lane-import-diff — 「/live/ の集計を拡張へ輸入したら、いまの応援レーンと何が違うか」を数字にする(読み取り専用)。
 *
 * 何をするか
 *   1. 実機データを複製した使い捨てプロファイルで拡張を起動する(NLS_SEED_EXT_DIR・実機のファイルは変更しない)。
 *   2. 拡張の保存データ(コメント=IndexedDB と chrome.storage、ギフト/広告の公式順位、現行の応援レーンの鏡)を読む。
 *   3. /live/ と【同じ純モジュール】(liveCommentTally.js / liveLaneBuckets.js)を、その保存コメントにそのまま当てる。
 *   4. 人物の集合・先頭の並び・段の人数を、拡張の現行レーン(鏡)と並べて出す。
 *   5. 応援コメントのアイコングリッドの食い違い要因(userId 空の行・配信者の行・1人あたり最大件数)も出す。
 *
 * 使い方(Windows。NLS_SEED_EXT_DIR は実機 Chrome の「Profile NN」。README 参照)
 *   NLS_SEED_EXT_DIR="C:/Users/<you>/AppData/Local/Google/Chrome/User Data/Profile 45" \
 *     node scripts/perf-ab/lane-import-diff.mjs --lv lv351588945
 *   --all で鏡のある配信すべて(古い順に最大 --max 件・既定 6)。
 *
 * ★何も書き込まない。結果は標準出力だけ。
 */
import { launchWithExtension, shutdown, parseArgs, REPO_ROOT } from './common.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = parseArgs();
const lib = (name) => import(pathToFileURL(path.join(REPO_ROOT, 'src', 'lib', name)).href);
const { createCommentTally } = await lib('liveCommentTally.js');
const { laneBuckets } = await lib('liveLaneBuckets.js');

/** 拡張プロセス(SW)の中で、保存データを読み出す(書かない)。 */
const readFromExtension = async (sw, lvArg, all, max) => {
  return sw.evaluate(async ({ lvArg, all, max }) => {
    const bag = await chrome.storage.local.get(null);
    const lvs = [];
    if (lvArg) lvs.push(lvArg.toLowerCase());
    else if (all) {
      for (const k of Object.keys(bag)) {
        const m = /^nls_lane_mirror_v2_(lv\d+)$/.exec(k);
        if (m) lvs.push(m[1]);
      }
      lvs.sort();
    }
    const pick = lvs.slice(-max);
    const openDb = () => new Promise((res, rej) => {
      const r = indexedDB.open('nls_comment_db_v1', 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onupgradeneeded = () => { r.transaction.abort(); rej(new Error('no-db')); };
    });
    let db = null;
    try { db = await openDb(); } catch { db = null; }
    const readIdb = (lid) => new Promise((res) => {
      if (!db) { res([]); return; }
      try {
        const out = [];
        const tx = db.transaction('comments', 'readonly');
        const idx = tx.objectStore('comments').index('byLive');
        const cur = idx.openCursor(IDBKeyRange.only(lid));
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) { res(out); return; }
          const v = c.value;
          out.push({ userId: v.userId, commentNo: v.commentNo, nickname: v.nickname, avatarUrl: v.avatarUrl, capturedAt: v.capturedAt });
          c.continue();
        };
        cur.onerror = () => res(out);
      } catch { res([]); }
    });
    const result = [];
    for (const lid of pick) {
      const idbComments = await readIdb(lid);
      const main = bag[`nls_comments_${lid}`];
      // 小さい配信は storage の本体配列、大きい配信は IndexedDB に保存される。ある方を使う(多い方)。
      const mainRows = Array.isArray(main)
        ? main.map((v) => ({ userId: v?.userId, commentNo: v?.commentNo, nickname: v?.nickname, avatarUrl: v?.avatarUrl, capturedAt: v?.capturedAt }))
        : [];
      const comments = idbComments.length >= mainRows.length ? idbComments : mainRows;
      result.push({
        lid,
        comments,
        mainArrayLen: Array.isArray(main) ? main.length : -1,
        koken: bag[`nls_koken_api_contrib_${lid}`] || null,
        nicoad: bag[`nls_nicoad_api_ranking_${lid}`] || null,
        mirror: bag[`nls_lane_mirror_v2_${lid}`] || null,
        snap: bag[`nls_watch_snapshot_${lid}`] || null
      });
    }
    return result;
  }, { lvArg, all, max });
};

const uidOfUrl = (u) => (/\/user\/(\d+)/.exec(String(u || '')) || [])[1] || '';

/** 拡張が保存した正規化済みの順位行を、/live/ の API と同じ「生の形」へ戻す。 */
const rawGift = (rows) => (Array.isArray(rows) ? rows : []).map((r, i) => ({
  rank: r.rank ?? i + 1, supporterId: uidOfUrl(r.userPageUrl) || undefined, supporterName: r.name,
  supporterThumbnailUrl: r.thumbnailUrl || '', contribution: r.contribution, userPageUrl: r.userPageUrl || ''
}));
const rawAd = (rows) => (Array.isArray(rows) ? rows : []).map((r, i) => ({
  rank: r.rank ?? i + 1, userId: uidOfUrl(r.userPageUrl) || undefined, advertiserName: r.name,
  totalContribution: r.contribution, userPageUrl: r.userPageUrl || '', thumbnailUrl: r.thumbnailUrl || ''
}));

const TIERS_EXT = ['link', 'gift', 'ad', 'konta', 'tanu'];
const TIERS_LIVE = ['link', 'konta', 'gift', 'tanu'];

const analyze = (d) => {
  const broadcaster = String(d.snap?.broadcasterUserId || '').trim();
  const comments = d.comments;
  const emptyUid = comments.filter((c) => !String(c.userId ?? '').trim()).length;
  const broadcasterRows = broadcaster ? comments.filter((c) => String(c.userId ?? '').trim() === broadcaster).length : -1;
  const perUid = new Map();
  for (const c of comments) {
    const u = String(c.userId ?? '').trim();
    if (u) perUid.set(u, (perUid.get(u) || 0) + 1);
  }
  const maxPerUid = [...perUid.values()].reduce((a, b) => Math.max(a, b), 0);
  // userId 空の行の正体(誰のコメントか)を、ニックネームの多い順に見る。配信者本人・運営・匿名のどれかを切り分ける。
  const emptyByNick = new Map();
  for (const c of comments) {
    if (String(c.userId ?? '').trim()) continue;
    const k = String(c.nickname ?? '').trim() || '(ニックネームなし)';
    emptyByNick.set(k, (emptyByNick.get(k) || 0) + 1);
  }
  const emptyNicks = [...emptyByNick.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5);

  const mkTally = (limit) => {
    const t = createCommentTally({ broadcasterUid: broadcaster, limit });
    t.add(comments);
    return t.result();
  };
  const tallyAll = mkTally(1e9);
  const tallyTop10 = mkTally(10);
  const liveFor = (tally) => ({
    liveId: d.lid,
    gift: { rankers: rawGift(d.koken?.rows) },
    ad: { ranking: rawAd(d.nicoad?.rows) },
    comment: { rankers: tally.rankers, commenters: tally.commenters, comments: tally.comments }
  });
  const buckets10 = laneBuckets(liveFor(tallyTop10));
  const bucketsAll = laneBuckets(liveFor(tallyAll));

  const mirror = d.mirror || {};
  const extTier = (t) => (Array.isArray(mirror[t]) ? mirror[t].map((c) => String(c.userId || '').trim()).filter(Boolean) : []);
  const liveTier = (b, t) => (b[t] || []).map((x) => x.uid);

  const rows = [];
  for (const te of TIERS_EXT) {
    for (const tl of TIERS_LIVE) {
      const a = new Set(extTier(te));
      const b = new Set(liveTier(bucketsAll, tl));
      if (!a.size && !b.size) continue;
      let both = 0;
      for (const u of a) if (b.has(u)) both += 1;
      if (both === 0 && (te !== tl)) continue;
      rows.push({ ext: te, live: tl, extN: a.size, liveN: b.size, both });
    }
  }
  const head = (arr, n = 6) => arr.slice(0, n).join(',');
  return {
    lid: d.lid,
    comments: comments.length,
    mainArrayLen: d.mainArrayLen,
    emptyUid,
    emptyNicks,
    broadcaster,
    broadcasterRows,
    uniqueUids: perUid.size,
    maxPerUid,
    tallyAll: { commenters: tallyAll.commenters, anon: tallyAll.anonCommenters },
    mirrorCounts: Object.fromEntries(TIERS_EXT.map((t) => [t, extTier(t).length])),
    liveCounts: { top10: Object.fromEntries(TIERS_LIVE.map((t) => [t, liveTier(buckets10, t).length])),
      all: Object.fromEntries(TIERS_LIVE.map((t) => [t, liveTier(bucketsAll, t).length])) },
    overlap: rows,
    firstOrder: {
      extLink: head(extTier('link')), liveLink: head(liveTier(bucketsAll, 'link')),
      extTanu: head(extTier('tanu')), liveTanu: head(liveTier(bucketsAll, 'tanu'))
    }
  };
};

const { ctx, sw, userDataDir } = await launchWithExtension({});
try {
  const lvArg = args.lv && args.lv !== 'true' ? String(args.lv) : '';
  const max = Math.max(1, Number(args.max) || 6);
  const dumps = await readFromExtension(sw, lvArg, !lvArg, max);
  if (!dumps.length) console.log('対象の配信が見つかりません(NLS_SEED_EXT_DIR を設定しましたか? --lv か --all を指定しましたか?)');
  for (const d of dumps) {
    const r = analyze(d);
    console.log(`\n=== ${r.lid} ===`);
    console.log(`保存コメント ${r.comments}件(IDB または storage 本体の多い方) / storage 本体配列 ${r.mainArrayLen} / userId 空 ${r.emptyUid}件 / 配信者uid ${r.broadcaster || '(不明)'} の行 ${r.broadcasterRows}件`);
    console.log(`userId 空の行のニックネーム上位: ${JSON.stringify(r.emptyNicks)}`);
    console.log(`ユニーク uid ${r.uniqueUids} / 1人あたり最大 ${r.maxPerUid}件 / /live/ 集計(配信者除外・uid空は捨てる) 人数 ${r.tallyAll.commenters}(匿名 ${r.tallyAll.anon})`);
    console.log('拡張の現行レーン(鏡)の人数:', JSON.stringify(r.mirrorCounts));
    console.log('/live/ 規則の段の人数 top10 :', JSON.stringify(r.liveCounts.top10));
    console.log('/live/ 規則の段の人数 全員  :', JSON.stringify(r.liveCounts.all));
    console.log('人物の重なり(拡張の段 × /live/ の段 / 同じ人の数):');
    for (const o of r.overlap) console.log(`  拡張 ${o.ext}(${o.extN}) × /live/ ${o.live}(${o.liveN}) → 同じ人 ${o.both}`);
    console.log('先頭の並び(uid):');
    console.log(`  拡張 link : ${r.firstOrder.extLink}`);
    console.log(`  /live/ link: ${r.firstOrder.liveLink}`);
    console.log(`  拡張 tanu : ${r.firstOrder.extTanu}`);
    console.log(`  /live/ tanu: ${r.firstOrder.liveTanu}`);
  }
} catch (e) {
  console.error('ERR', String(e && e.stack ? e.stack : e));
} finally {
  await shutdown(ctx, userDataDir);
  process.exit(0);
}
