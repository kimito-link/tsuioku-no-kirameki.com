import { describe, it, expect } from 'vitest';
import { userLaneCandidatesFromStorage } from './userLaneCandidatesFromStorage.js';
import { normalizeLv } from '../shared/niconico/liveId.js';
import { pickStrongestAvatarUrlForUser } from './supportGrowthTileSrc.js';
import { isSameAvatarUrl } from './avatarUrlCompare.js';
import { isAvatarUrlForUserId } from './avatarBroadcasterGuard.js';
import { RECENT_TEXT_KEEP } from './recentTextRing.js';
import { pickBetterInterceptNickname } from './giftDisplayNickname.js';

/*
 * v0.1.1815: userLaneCandidatesFromStorage を軽くした版(並べ替えの省略・URL 重複の省略・配信ID正規化の使い回し・
 *   空本文判定の書き換え)が、変更前の実装と【出力まで同一】であることの固定。
 *   視聴ページに隠れて入っている popup が新着ごとに全件(3万行級)でこれを回し、コメビュまで重くしていた。
 *   基準(reference)は変更前の実装そのもの(下に写した・手を入れない)。
 */
/**
 * @param {unknown} row
 * @returns {string}
 */
function rowLiveId(row) {
  const o = /** @type {{ liveId?: unknown, lvId?: unknown }} */ (row);
  return String(o?.liveId ?? o?.lvId ?? '').trim();
}

/**
 * @param {unknown} row
 * @param {string} targetNorm normalizeLv 済みの比較キー
 * @returns {boolean}
 */
function rowMatchesLiveFilter(row, targetNorm) {
  if (!targetNorm) return true;
  const o = /** @type {{ liveId?: unknown, lvId?: unknown }} */ (row);
  const a = normalizeLv(o?.liveId);
  const b = normalizeLv(o?.lvId);
  return (Boolean(a) && a === targetNorm) || (Boolean(b) && b === targetNorm);
}

/**
 * @param {unknown} row
 * @returns {number}
 */
function rowCapturedAt(row) {
  const n = Number(/** @type {{ capturedAt?: unknown }} */ (row)?.capturedAt);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {readonly unknown[]|null|undefined} storedComments
 * @param {string|null|undefined} [liveId] 省略時は全 live を対象。非空のときは当該放送のみ。
 * @param {{ broadcasterUid?: string, broadcasterIconUrl?: string, requireText?: boolean }} [opts]
 *   0.1.79: ギフト演出 DOM での avatar 取り違え対策。
 *     コメ記録に焼き込まれた avatarUrl のうち、broadcaster icon と一致する URL は
 *     viewer (uid !== broadcasterUid) には紐付けず破棄する。
 *     未指定時はガード掛けず（false positive 回避）。
 *   ⚠️ broadcaster ガードを効かせるには `broadcasterUid` と `broadcasterIconUrl` を【両方】渡す。
 *     片方だけでは `Boolean(uid && iconUrl) = false` で guard が無効になる（意図的な設計）。
 *     これらの値の正本経路は src/lib/broadcastContext.js: content-entry.js が
 *     `nls_live_broadcaster_ctx_v1` に書き、venueBar.js 等が storage から読んで渡す。
 *     opts を省略・片方だけ渡すと、配信者アイコン付きの匿名行が会場/レーンに混入する既知バグ
 *     (v0.1.793) が再発する。DOM から直接取る案は standalone(venue.html) で content が動かず使えない。
 * @returns {readonly Readonly<UserLaneCandidateFromStorage>[]}
 */
function referenceLaneCandidates(storedComments, liveId, opts) {
  const filterByLive =
    arguments.length >= 2 && liveId != null && String(liveId).trim() !== '';
  const lidNorm = filterByLive ? String(liveId).trim() : '';
  const targetNorm = filterByLive ? normalizeLv(lidNorm) : '';
  const broadcasterUid = String(opts?.broadcasterUid ?? '').trim();
  const broadcasterIconUrl = String(opts?.broadcasterIconUrl ?? '').trim();
  const broadcasterGuardEnabled = Boolean(broadcasterUid && broadcasterIconUrl);
  const requireText = opts?.requireText === true;

  const allRows = Array.isArray(storedComments) ? storedComments : [];
  let rows = filterByLive
    ? allRows.filter((e) => rowMatchesLiveFilter(e, targetNorm))
    : allRows;
  if (requireText) {
    rows = rows.filter((e) =>
      Boolean(String(/** @type {{ text?: unknown }} */ (e)?.text ?? '').trim())
    );
  }
  // v0.1.373: 当ライブ一致 0 件のときに「全ライブ混在フォールバック」すると、
  //   別放送やおすすめ列由来で蓄積した別ユーザが「この配信の応援」と誤認されやすい。
  //   UI は空のままで正しく、ユーザーに誤情報を見せない（契約より UX を優先）。
  const useLidForOutput = filterByLive;

  /** @type {Map<string, unknown[]>} */
  const byUid = new Map();
  for (const row of rows) {
    const uid = String(/** @type {{ userId?: unknown }} */ (row)?.userId ?? '').trim();
    if (!uid) continue;
    const g = byUid.get(uid);
    if (g) g.push(row);
    else byUid.set(uid, [row]);
  }

  /** @type {UserLaneCandidateFromStorage[]} */
  const built = [];
  for (const [userId, group] of byUid) {
    // v0.1.901: 配信者本人(放送主)は「応援者(viewer)」ではないので席/レーンから除外する。
    //   実機(lv350805294 peropanda)で本人が会場席に座っていた=既存 guard は「配信者アイコンが
    //   他人に化けるのを剥がす」だけで【本人の候補そのものを落としていなかった】(真因)。
    //   本人除外は uid 一致だけで判定できる(iconUrl は不要=アイコン化け防止用)ので、
    //   broadcasterUid が取れていれば iconUrl の有無によらず本人を弾く。
    if (broadcasterUid && userId === broadcasterUid) {
      continue;
    }
    const chronological = [...group].sort(
      (a, b) => rowCapturedAt(a) - rowCapturedAt(b)
    );
    let observed = false;
    /** @type {string[]} */
    const urls = [];
    // 0.1.79: viewer uid が broadcaster 本人でない場合、broadcaster icon と
    // 一致する URL は除外する（ギフト演出 DOM 観測の取り違え後方互換補正）。
    const isBroadcasterHere =
      broadcasterGuardEnabled && userId === broadcasterUid;
    for (const g of chronological) {
      if (/** @type {{ avatarObserved?: boolean }} */ (g).avatarObserved === true) {
        observed = true;
      }
      const u = String(/** @type {{ avatarUrl?: unknown }} */ (g).avatarUrl ?? '').trim();
      if (!u) continue;
      // 0.1.83: 普遍ルール — URL の埋め込み uid とエントリ uid の不一致は弾く
      //   broadcaster 情報が無くても効く最強のガード（過去の汚染データも全て掃除）
      if (!isAvatarUrlForUserId(u, userId)) continue;
      if (
        broadcasterGuardEnabled &&
        !isBroadcasterHere &&
        isSameAvatarUrl(u, broadcasterIconUrl)
      ) {
        continue;
      }
      urls.push(u);
    }
    const avatarUrl = pickStrongestAvatarUrlForUser(userId, urls);

    const newestFirst = [...chronological].sort(
      (a, b) => rowCapturedAt(b) - rowCapturedAt(a)
    );
    let nickname = '';
    for (const g of chronological) {
      const n = String(/** @type {{ nickname?: unknown }} */ (g).nickname ?? '').trim();
      if (!n) continue;
      nickname = pickBetterInterceptNickname(userId, nickname, n);
    }

    const lastCapturedAt = Math.max(0, ...chronological.map(rowCapturedAt));

    // 会場 VIP常連光らせ(v0.1.734)用: このユーザーの実発言数とギフト回数を持たせる。
    //   これが無いと venue 側で全員 count=1 扱いになりスコアが閾値に届かず誰も光らない。
    const commentCount = chronological.length;
    let giftCount = 0;
    for (const g of chronological) {
      const gg = /** @type {{ isGift?: unknown, gift?: unknown, kind?: unknown }} */ (g);
      if (gg.isGift === true || gg.gift != null || gg.kind === 'gift') giftCount += 1;
    }

    const outLiveId = useLidForOutput
      ? lidNorm
      : rowLiveId(newestFirst[0] || chronological[chronological.length - 1] || {});

    // v0.1.1219: 会場ホバーカードで「この人が何を言っていたか」を数件読めるようにする。
    //   newestFirst は上で作った既存配列なので追加の走査はほぼゼロ(先頭N件だけ見る)。
    //   ★storage の追加読みもゼロ。ホバーのたびに読むと会場が重くなる(クリックパネルが
    //     「常時readを増やさない」と明記している方針と揃える)。
    /** @type {string[]} */
    const recentTexts = [];
    for (const g of newestFirst) {
      if (recentTexts.length >= RECENT_TEXT_KEEP) break;
      const t = String(/** @type {{ text?: unknown }} */ (g).text ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!t) continue;
      if (recentTexts[recentTexts.length - 1] === t) continue; // 直前と同一の連投は畳む
      recentTexts.push(t);
    }

    built.push({
      userId,
      nickname,
      avatarUrl,
      avatarObserved: observed,
      liveId: outLiveId,
      commentCount,
      giftCount,
      recentTexts,
      _laneSortAt: lastCapturedAt
    });
  }

  built.sort((a, b) => (b._laneSortAt || 0) - (a._laneSortAt || 0));

  const frozen = Object.freeze(
    built.map((row) =>
      Object.freeze({
        userId: row.userId,
        nickname: row.nickname,
        avatarUrl: row.avatarUrl,
        avatarObserved: row.avatarObserved,
        liveId: row.liveId,
        commentCount: row.commentCount,
        giftCount: row.giftCount,
        // v0.1.1219: ここはフィールドを個別に列挙する造りなので、足し忘れると
        //   上で作った値が黙って消える(実際に踏んだ)。新フィールドは必ずここにも足す。
        recentTexts: Object.freeze(row.recentTexts || []),
        _laneSortAt: row._laneSortAt
      })
    )
  );
  return /** @type {readonly Readonly<UserLaneCandidateFromStorage>[]} */ (frozen);
}


/** 再現できる乱数(テストが毎回同じ入力で走るように)。 */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeRows(seed, n) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const rows = [];
  for (let i = 0; i < n; i++) {
    const u = Math.floor(r() * 40);
    const anon = u % 4 === 0;
    const uid = pick([anon ? `a:x${u}` : String(10000000 + u), anon ? `a:x${u}` : String(10000000 + u), ' ' + (10000000 + u) + ' ', '', '99999999']);
    const own = `https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1000/${String(uid).trim()}.jpg`;
    rows.push({
      liveId: pick(['lv123', 'LV123', '123', 'lv999', undefined, ' lv123 ']),
      ...(r() < 0.3 ? { lvId: pick(['lv123', '123', 'lv5']) } : {}),
      commentNo: String(i + 1),
      text: pick(['こんにちは', '  ', '', 'わこつ\n  です', '\u3000', 'w', 'わこつ\n  です', undefined]),
      userId: uid,
      nickname: pick(['', 'たろう', 'Taro', 'たろう', '  ', 'ユーザー']),
      // 同時刻・逆順・不正値を混ぜる(並べ替えの省略が安定ソートと同じ並びになるかを見る)
      capturedAt: pick([1000 + i, 1000 + i, 1000 + Math.floor(i / 3), 5000 - i, 0, NaN, 'x', 1000]),
      avatarUrl: pick(['', own, own, own + '?1', 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/9999/99999999.jpg', 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg', 'not-a-url', own]),
      avatarObserved: r() < 0.4,
      ...(r() < 0.1 ? { isGift: true } : {})
    });
  }
  return rows;
}

describe('userLaneCandidatesFromStorage(軽量化版)は変更前と出力が同一', () => {
  const optsList = [
    undefined,
    { requireText: true },
    { broadcasterUid: '99999999', broadcasterIconUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/9999/99999999.jpg', requireText: true },
    { broadcasterUid: '99999999' }
  ];
  for (let seed = 1; seed <= 40; seed++) {
    it(`乱数入力 seed=${seed}`, () => {
      const rows = makeRows(seed, 30 + seed * 7);
      for (const opts of optsList) {
        for (const lid of ['lv123', '123', null, '']) {
          expect(userLaneCandidatesFromStorage(rows, lid, opts)).toEqual(referenceLaneCandidates(rows, lid, opts));
        }
        expect(userLaneCandidatesFromStorage(rows)).toEqual(referenceLaneCandidates(rows));
      }
    });
  }

  it('空・不正な入力', () => {
    for (const v of [null, undefined, [], [null], [{}], 'x']) {
      expect(userLaneCandidatesFromStorage(v, 'lv1')).toEqual(referenceLaneCandidates(v, 'lv1'));
    }
  });
});
