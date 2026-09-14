// @ts-nocheck
/**
 * /live/ 用「支えた人ランキング」の収集・配信 Vercel Serverless Function。
 *
 *   GET /api/live-ranking            保存済みの集計を返す(公開ページが叩く)
 *   GET /api/live-ranking?refresh=1  収集し直して保存する(x-share-key 認証・cron/手動用)
 *
 * ■ 設計（api/status.js と同じ流儀。★npm 依存ゼロ・fetch と Upstash REST だけ）
 *   - ストアは Upstash Redis。キーは `live:ranking:latest`。
 *     ★既存の `status:latest:<token>` とは【別系統】にする。
 *       理由: status 側は「拡張ユーザーが同意して送ったスナップショット」で、
 *       同意設計(autoPublishDecision.js の optedIn ゲート)と privacy.html に直結している。
 *       ★こちらは「ニコ生が公開しているランキングを読むだけ」で性質が違う。混ぜない。
 *   - 収集は【サーバが取って配る】(ユーザー選択)。理由:
 *       ・見る人が増えてもニコ生への負荷が一定
 *       ・ブラウザ直叩きは CORS で本文を読めない(拡張は SW 特権で回避している)
 *
 * ■ ★2026-09-05 の実測（この実装の前提。推測ではない）
 *   - `https://live.nicovideo.jp/ranking` は 200 で、HTML から lv が 65件 取れる
 *     （他に試した notifybox.content=404 / recommend-contents v1=503 v2=400 / search=403）
 *   - 先頭8件の watch ページはすべて `status":"ON_AIR"` ＝ランキングは放送中のみだった
 *     ★ただし8件での確認。65件全部と、終了番組が何を返すかは【未検証】
 *   - koken/nicoad は認証不要で 200（各 lib のヘッダコメントの実測記述どおり）
 *   - nicoad を 30本連続・間隔ゼロで叩いて全部 200（★継続ポーリングは未測定）
 *
 * ■ ★取得の上限を「発明しない」
 *   MAX_LIVES は実測(30本OK)の範囲内に収める。★実測していない数字へ広げない。
 */

const STORE_KEY = 'live:ranking:latest';
/**
 * ★2026-09-14 追加: 3 枠目「コメントで応援した人」の集計。
 *   ★収集元が違うので【別キー】にする。ギフト/広告はニコ生が公開しているランキングを
 *   そのまま出すのに対し、こちらは **当サイトが数えた件数**(GitHub Actions の
 *   scripts/live-comment-tally.mjs が POST してくる)。性質が違うものを 1 つの値に混ぜない。
 *   ★片方が落ちてももう片方は出る(合流は GET のときだけ・attachComments)。
 */
const COMMENTS_KEY = 'live:comments:latest';
/** 1 配信ぶんの順位表の長さ(送られてきた値が長くてもここで切る)。 */
const COMMENT_RANKERS_MAX = 10;
/** 表示名の最大長(送られてきた値が長くてもここで切る)。 */
const COMMENT_NAME_MAX = 80;
/**
 * ★2026-09-14 「リアルタイム取得を売りにする」: 見る人が ?refresh=1 を叩いたら【鍵なしでも】収集する。
 *   ただし乱打でニコ生を叩かないよう、前回の収集から PUBLIC_REFRESH_MIN_MS 未満なら保存済みを返す(throttled)。
 *   同時に複数の閲覧者が叩いても収集は 1 本だけ(Redis の SET NX ロック。TTL は収集所要 1.2〜5 秒の余裕で 30 秒)。
 *   cron(x-share-key つき)は従来どおり無条件に収集する。
 */
const PUBLIC_REFRESH_MIN_MS = 60 * 1000;
const REFRESH_LOCK_KEY = 'live:ranking:refresh-lock';
const REFRESH_LOCK_TTL_SECONDS = 30;
const TTL_SECONDS = 60 * 60; // 1 時間(収集が止まっても古い値が残り続けないように)
/**
 * ★1回の収集で【中身まで取る】配信数。
 *   放送中/個人配信かの判定(watch ページ)は候補全件に対して並列で行う。
 *   ★実測(2026-09-05): 83件の watch を並列取得して 1,210ms。逐次より速い。
 */
const MAX_LIVES = 20;
/**
 * ★チャンネル/公式番組(TV番組)を除外し、個人配信だけを対象にする。
 *
 *   ユーザーの言葉:「これTV番組」「配信者にしてほしい」
 *   ★実測(2026-09-05): /ranking の【上位20件は 19件がチャンネル】だった。
 *     一方、全83件まで見ると【放送中×個人配信が 49件】ある。
 *   ⟹ 上位を切るのではなく、全件を判定してから個人配信だけ残す。
 *
 *   判定は watch ページの埋め込み JSON:
 *     個人配信   providerType:"community" / supplierType:"user"
 *     TV番組など providerType:"official"|"channel" / supplierType:"channel"
 */
const SUPPLIER_TYPE_RE = /supplierType&quot;:&quot;([a-z]+)/;
/** ランキングHTMLから拾う lv の形。 */
const LV_RE = /lv\d{6,15}/g;
/** watch ページの埋め込み JSON は HTML エスケープされている(&quot;)。素の "status" では見つからない。 */
const ON_AIR_RE = /status&quot;:&quot;ON_AIR&quot;/;
/** 番組名。★watch ページは放送中判定で既に取っているので【追加リクエストは増えない】。 */
const OG_TITLE_RE = /<meta property="og:title" content="([^"]*)"/;
/**
 * ★並び順の材料（同上・追加リクエストなし）。
 *   ニコ生には【同時視聴数の API が無い】(src/lib/concurrentEstimate.js:4 が明記)。
 *   取れるのは累計来場者数(watchCount)とコメント数と開始時刻。
 *   ★ここでは推定値を計算せず【材料だけ】返す。推定の式の正本は concurrentEstimate.js に置く。
 */
const WATCH_COUNT_RE = /watchCount&quot;:(\d+)/;
const COMMENT_COUNT_RE = /commentCount&quot;:(\d+)/;
const BEGIN_TIME_RE = /beginTime&quot;:(\d+)/;
/**
 * ★2026-09-14 追加: ちくわちゃん風に「配信サムネ・配信者・時間」を出すための材料。
 *   ★どれも watch ページ(放送中判定で既に取っている)の埋め込み JSON から拾う＝追加リクエストなし。
 *   ★実物(lv351386196 で実測)の形:
 *     supplier":{"supplierType":"user","name":"ミュントゥ","pageUrl":"http://www.nicovideo.jp/user/142919600",...}
 *     programProviderId":"142919600","icons":{"uri50x50":"https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/14291/142919600.jpg?…","uri150x150":"…"}
 *     screenshot":{"urlSet":{"large":"…thumbnail-854x480/screenshot.jpg","middle":"…640x360…","small":"…352x198…","micro":"…160x90…"}}
 *     "endTime":1789367607   (放送中は予定終了時刻。★`scheduledEndTime` も同じ値で並ぶので、キーの引用符ごと当てて取り違えない)
 *   ★取れなければ空('' / 0)。表示側が代替(キャラの顔・「—」)を出す(AGENTS.md §3.6 fail-soft)。
 */
const SUPPLIER_BLOCK_RE = /supplier&quot;:\{(.*?)\}/;
const SUPPLIER_NAME_RE = /&quot;name&quot;:&quot;(.*?)&quot;,/;
const SUPPLIER_PAGE_URL_RE = /&quot;pageUrl&quot;:&quot;(.*?)&quot;/;
const PROVIDER_ID_RE = /programProviderId&quot;:&quot;(\d+)&quot;/;
const ICON_50_RE = /uri50x50&quot;:&quot;([^&]*)&quot;/;
const ICON_150_RE = /uri150x150&quot;:&quot;([^&]*)&quot;/;
const SCREENSHOT_SET_RE = /screenshot&quot;:\{&quot;urlSet&quot;:\{(.*?)\}/;
const END_TIME_RE = /&quot;endTime&quot;:(\d+)/;

/** ★watch ページの埋め込み JSON は HTML エンティティで包まれている。素の文字列に戻す(og:title と supplier.name で共用)。 */
function unescapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** ★外から来た URL は http(s) だけ通す(それ以外は '' = 無い扱い)。 */
function httpUrlOrEmpty(u) {
  const v = unescapeHtml(u).trim();
  return /^https?:\/\//i.test(v) ? v : '';
}

async function upstash(command) {
  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!base || !token) throw new Error('KV env missing');
  const res = await fetch(base, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const json = await res.json();
  return json?.result;
}

/**
 * ★1本あたりの上限時間。
 *   Promise.all は【一番遅い1本】に引きずられる。相手が半開きのまま返さないと
 *   収集全体が Vercel の実行時間まで待たされ、500 で終わる。
 *   ★実測(2026-09-05)は watch 83件を並列で 1,210ms。8秒はその6倍以上＝
 *   正常な遅さでは当たらず、異常な1本だけを切れる値。★npm 不要(Node 18+)。
 */
const FETCH_TIMEOUT_MS = 8000;

/** 失敗しても全体を止めない fetch(JSON)。★1配信の失敗で他を巻き添えにしない。 */
async function fetchJsonSafe(url) {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchTextSafe(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  }
}

/**
 * ★同時実行数に上限を付けて map する。
 *   Promise.all で83本を一斉に開くと、相手にも自分のテールにも優しくない。
 *   ★上限12の根拠(★実測で決めた。最初の見積もりは外れた):
 *     72件を実際に測ると 無制限=700ms / 8並列=1,780ms / 12並列=1,278ms。
 *     ★「8でも実測と同じ速さ」という当初の見積もりは【誤り】で、2.5倍遅かった。
 *     12なら無制限との差は約0.6秒に収まり、同時接続の山も1/6に削れる。
 *   ★見積もりではなく計測値を採用している。
 */
async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** ★同時に開く本数の上限(上記の根拠による)。 */
const FETCH_CONCURRENCY = 12;

/** ランキングページから lv を拾う(重複除去・順序維持)。 */
function pickLiveIdsFromRankingHtml(html) {
  const out = [];
  const seen = new Set();
  const m = String(html || '').match(LV_RE) || [];
  for (const lv of m) {
    const id = lv.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * ★放送中だけを残す。★形ではなく実際の watch ページの status を見る。
 * 取れなかったときは【落とす】(fail-closed)。理由: 終了番組を「今この瞬間」に出す方が害が大きい。
 */
async function probeWatchPage(lv) {
  const html = await fetchTextSafe(`https://live.nicovideo.jp/watch/${lv}`);
  // ★fetched=false は「そもそも取れなかった」。★HTMLは取れたが読めない(仕様変更)と区別するため。
  if (!html) return { onAir: false, fetched: false, title: '' };
  const m = html.match(OG_TITLE_RE);
  // ★og:title は HTML エンティティを含みうる。表示側で二重エスケープしないよう素の形に戻す。
  const title = m ? unescapeHtml(m[1]).trim().slice(0, 120) : '';
  // ★配信者(supplier)。★ブロックを先に切り出してから中を読む(キーの並び順に依存しない)。
  const sb = html.match(SUPPLIER_BLOCK_RE);
  const sname = sb ? sb[1].match(SUPPLIER_NAME_RE) : null;
  const spage = sb ? sb[1].match(SUPPLIER_PAGE_URL_RE) : null;
  const pid = html.match(PROVIDER_ID_RE);
  const i50 = html.match(ICON_50_RE);
  const i150 = html.match(ICON_150_RE);
  // ★配信画面のスクショ(ニコ生が定期更新する画像)。4サイズとも URL だけを持つ。
  const ss = html.match(SCREENSHOT_SET_RE);
  const shot = (key) => {
    if (!ss) return '';
    const mm = ss[1].match(new RegExp(`&quot;${key}&quot;:&quot;([^&]*)&quot;`));
    return mm ? httpUrlOrEmpty(mm[1]) : '';
  };
  const numAt = (re) => {
    const mm = html.match(re);
    return mm ? Number(mm[1]) || 0 : 0;
  };
  const st = html.match(SUPPLIER_TYPE_RE);
  return {
    fetched: true,
    onAir: ON_AIR_RE.test(html),
    // ★'user' 以外(channel 等)は TV番組・公式番組なので落とす。取れなければ落とす(fail-closed)。
    isUserBroadcast: !!st && st[1] === 'user',
    title,
    watchCount: numAt(WATCH_COUNT_RE),
    commentCount: numAt(COMMENT_COUNT_RE),
    beginTime: numAt(BEGIN_TIME_RE),
    endTime: numAt(END_TIME_RE),
    streamer: {
      id: pid ? String(pid[1]) : '',
      name: sname ? unescapeHtml(sname[1]).trim().slice(0, 80) : '',
      pageUrl: spage ? httpUrlOrEmpty(spage[1]) : '',
      icon50: i50 ? httpUrlOrEmpty(i50[1]) : '',
      icon150: i150 ? httpUrlOrEmpty(i150[1]) : ''
    },
    thumbnail: { large: shot('large'), middle: shot('middle'), small: shot('small'), micro: shot('micro') }
  };
}

/** 1配信ぶんの「支えた人」を集める。★rank はニコ生側が持っているので自前で計算しない。 */
async function collectOne(lv, meta) {
  const [gift, ad] = await Promise.all([
    fetchJsonSafe(`https://api.koken.nicovideo.jp/v1/userperspective/contents/gift/live/${lv}/ranking?rank=10`),
    fetchJsonSafe(`https://api.nicoad.nicovideo.jp/v1/contents/live/${lv}/ranking/contribution?limit=10`)
  ]);
  const giftRankers = Array.isArray(gift?.data?.rankers) ? gift.data.rankers : [];
  const adRanking = Array.isArray(ad?.data?.ranking) ? ad.data.ranking : [];
  if (!giftRankers.length && !adRanking.length) return null;
  // ★ranking エンドポイントの data は【rankers だけ】(実測 2026-09-05)。
  //   totalPoint は histories 側にしかない。最初それを読んで「ギフト計=0 なのに支援者12人」
  //   という矛盾を出した。★無い項目を読まず、返ってきた行から足す。
  const giftTotal = giftRankers.reduce((sum, r) => sum + (Number(r?.contribution) || 0), 0);
  return {
    liveId: lv,
    title: String(meta.title || ''),
    // ★並び順の材料。画面側が推定に使う（ここでは推定しない）。
    watchCount: Number(meta.watchCount) || 0,
    commentCount: Number(meta.commentCount) || 0,
    beginTime: Number(meta.beginTime) || 0,
    endTime: Number(meta.endTime) || 0,
    watchUrl: `https://live.nicovideo.jp/watch/${lv}`,
    // ★配信者・配信サムネ(2026-09-14)。無ければ空のまま載せる(表示側が代替を出す)。
    streamer: meta.streamer || { id: '', name: '', pageUrl: '', icon50: '', icon150: '' },
    thumbnail: meta.thumbnail || { large: '', middle: '', small: '', micro: '' },
    giftTotal,
    adTotal: Number(ad?.data?.contentTotalContribution) || 0,
    // ★生の形のまま載せる。画面側が既存の正規化関数
    //   (normalizeKokenRankingResponse / normalizeNicoadRankingResponse)を使えるようにするため。
    gift: gift?.data ? { rankers: giftRankers } : null,
    ad: ad?.data ? { ranking: adRanking } : null
  };
}

/** ★export はローカル検証用(node から実データを1回集めて画面に流す)。Vercel は default export しか見ない。 */
export async function collect() {
  const html = await fetchTextSafe('https://live.nicovideo.jp/ranking');
  const all = pickLiveIdsFromRankingHtml(html);
  if (!all.length) return { ok: false, error: 'no live ids' };

  // ★候補は【全件】見る。上位だけ見るとチャンネルで埋まって個人配信が入らない(実測: 上位20の19件)。
  //   watch の取得は並列なので、83件でも約1.2秒(実測)。
  const probes = await mapPool(all, FETCH_CONCURRENCY, (lv) => probeWatchPage(lv));
  const onAir = all
    .map((lv, i) => ({ lv, meta: probes[i] }))
    .filter((x) => x.meta.onAir && x.meta.isUserBroadcast)
    // ★中身(ギフト/広告)を取るのはここで絞ってから。API 呼び出し数を実測範囲に保つ。
    .slice(0, MAX_LIVES);

  const collected = await mapPool(onAir, FETCH_CONCURRENCY, (x) => collectOne(x.lv, x.meta));
  const lives = collected.filter(Boolean);
  // ★watch を1枚でも読めたか。★「通信が全部こけた」と「仕様が変わって読めない」を分ける材料。
  const probeOk = probes.filter((p) => p && p.fetched).length;
  return {
    ok: true,
    capturedAt: Date.now(),
    scanned: all.length,
    probeOk,
    onAir: onAir.length,
    lives
  };
}

/** ★api/status.js の readBody と同じ(Vercel は req.body を自動 parse することがある)。 */
function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return null;
}

/** 文字列を長さで切る(外から来た値をそのまま保存しない)。 */
function str(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** 0 以上の整数(でっち上げない・読めなければ 0)。 */
function nonNegInt(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * ★送られてきた 1 配信ぶんを【許可したキーだけ】に絞って作り直す。
 *   知らないキーは捨てる(保存形が送り主の都合で膨らまないように)。
 * @param {unknown} v
 * @returns {object|null} 形が違えば null
 */
function sanitizeCommentEntry(v) {
  if (!v || typeof v !== 'object') return null;
  const src = /** @type {any} */ (v);
  const rankersIn = Array.isArray(src.rankers) ? src.rankers.slice(0, COMMENT_RANKERS_MAX) : [];
  const rankers = [];
  for (const r of rankersIn) {
    if (!r || typeof r !== 'object') continue;
    const uid = str(r.uid, 64);
    if (!uid) continue;
    rankers.push({
      rank: nonNegInt(r.rank) || rankers.length + 1,
      uid,
      name: str(r.name, COMMENT_NAME_MAX),
      count: nonNegInt(r.count),
      anon: r.anon === true
    });
  }
  return {
    rankers,
    commenters: nonNegInt(src.commenters),
    comments: nonNegInt(src.comments),
    anonCommenters: nonNegInt(src.anonCommenters),
    stopReason: str(src.stopReason, 64),
    segments: nonNegInt(src.segments),
    bytes: nonNegInt(src.bytes),
    ms: nonNegInt(src.ms),
    partial: src.partial === true
  };
}

/**
 * 保存済みのコメント集計を lives に合流させる。★読み手に返す直前だけで呼ぶ。
 *   ★`lives[]` に無い liveId は捨てる(集計だけが残って幽霊の行が出ないように)。
 *   ★集計が無い/壊れているときは `comment: null` のまま返す＝画面が「集計待ち」を出す
 *     (空の順位表を出して「誰も居ない」と嘘をつかない)。
 * @param {any} payload
 * @returns {Promise<any>}
 */
async function attachComments(payload) {
  if (!payload || !Array.isArray(payload.lives)) return payload;
  let stored = null;
  try {
    const raw = await upstash(['GET', COMMENTS_KEY]);
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    stored = null;
  }
  const byLive = stored && stored.byLive && typeof stored.byLive === 'object' ? stored.byLive : null;
  const lives = payload.lives.map((l) => {
    const id = String((l && l.liveId) || '');
    const hit = byLive && Object.prototype.hasOwnProperty.call(byLive, id) ? sanitizeCommentEntry(byLive[id]) : null;
    return { ...l, comment: hit };
  });
  const out = { ...payload, lives };
  if (stored && Number(stored.at) > 0) {
    out.commentsCapturedAt = Number(stored.at);
    out.commentsMeta = {
      at: Number(stored.at) || 0,
      runMs: nonNegInt(stored.runMs),
      bytes: nonNegInt(stored.bytes),
      segments: nonNegInt(stored.segments),
      ok: nonNegInt(stored.ok_n),
      ng: nonNegInt(stored.ng),
      skipped: nonNegInt(stored.skipped),
      reasons: stored.reasons && typeof stored.reasons === 'object' ? stored.reasons : {}
    };
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    // ★コメント集計の投入(GitHub Actions の scripts/live-comment-tally.mjs だけが叩く)。
    //   ★これ以外の POST は従来どおり 405。
    if (req.method === 'POST' && String(req.query?.ingest || '') === 'comments') {
      const want = process.env.STATUS_INGEST_KEY;
      const sent = String(req.headers['x-share-key'] || '');
      if (!want || sent !== want) {
        res.status(401).json({ ok: false, error: 'unauthorized' });
        return;
      }
      const body = readBody(req);
      if (!body || typeof body !== 'object' || !body.byLive || typeof body.byLive !== 'object') {
        res.status(400).json({ ok: false, error: 'bad body' });
        return;
      }
      const lives = nonNegInt(body.lives);
      const okN = nonNegInt(body.ok_n);
      /** @type {Record<string, object>} */
      const byLive = {};
      for (const [id, v] of Object.entries(body.byLive)) {
        if (!/^lv\d{6,15}$/i.test(String(id))) continue;
        const entry = sanitizeCommentEntry(v);
        if (entry) byLive[String(id).toLowerCase()] = entry;
      }
      // ★★空で上書きしない(STORE_KEY 側と同じ掟)。
      //   1 配信も集計できていないのに保存すると、良い値を空で潰して TTL 1 時間ぶん
      //   「コメント集計待ち」が続く。★「配信が 0 件だった」は正常なので保存する。
      if (lives >= 1 && (okN === 0 || Object.keys(byLive).length === 0)) {
        res.status(502).json({ ok: false, error: 'zero tallies — not stored', lives, ok_n: okN });
        return;
      }
      const stored = {
        ok: true,
        at: Date.now(),
        runMs: nonNegInt(body.runMs),
        lives,
        ok_n: okN,
        ng: nonNegInt(body.ng),
        skipped: nonNegInt(body.skipped),
        segments: Object.values(byLive).reduce((s, v) => s + (Number(/** @type {any} */ (v).segments) || 0), 0),
        bytes: Object.values(byLive).reduce((s, v) => s + (Number(/** @type {any} */ (v).bytes) || 0), 0),
        reasons: body.reasons && typeof body.reasons === 'object' ? body.reasons : {},
        byLive
      };
      await upstash(['SET', COMMENTS_KEY, JSON.stringify(stored), 'EX', String(TTL_SECONDS)]);
      res.status(200).json({ ok: true, stored: true, lives: Object.keys(byLive).length });
      return;
    }

    if (req.method !== 'GET') {
      res.status(405).json({ ok: false, error: 'method not allowed' });
      return;
    }

    // ★収集は書き込み。cron は x-share-key で無条件に、閲覧者は鍵なしで【1 分に 1 回まで】(上の定数)。
    if (String(req.query?.refresh || '') === '1') {
      const key = String(req.headers['x-share-key'] || '');
      const want = process.env.STATUS_INGEST_KEY;
      const trusted = !!want && key === want;
      if (!trusted) {
        // 閲覧者からの更新要求: 新鮮なら保存済みをそのまま返す(ニコ生を叩かない)。
        const rawNow = await upstash(['GET', STORE_KEY]);
        let stored = null;
        try { stored = rawNow ? JSON.parse(rawNow) : null; } catch { stored = null; }
        const ageMs = stored && Number(stored.capturedAt) > 0 ? Date.now() - Number(stored.capturedAt) : Infinity;
        if (stored && ageMs < PUBLIC_REFRESH_MIN_MS) {
          res.status(200).json({ ...(await attachComments(stored)), refreshed: false, throttled: true, nextAllowedInMs: PUBLIC_REFRESH_MIN_MS - ageMs });
          return;
        }
        // 同時に来た他の閲覧者は保存済みを返す(収集は 1 本だけ)。
        const locked = await upstash(['SET', REFRESH_LOCK_KEY, String(Date.now()), 'NX', 'EX', String(REFRESH_LOCK_TTL_SECONDS)]);
        if (locked !== 'OK') {
          if (stored) { res.status(200).json({ ...(await attachComments(stored)), refreshed: false, inFlight: true }); return; }
          res.status(404).json({ ok: false, error: 'not collected yet', inFlight: true });
          return;
        }
      }
      const payload = await collect();
      if (!payload.ok) {
        res.status(502).json(payload);
        return;
      }
      // ★★空を保存しない。ここが無いと【良いデータを空で上書き】して静かに壊れる。
      //   起きる筋道(実際に再現した): ニコ生がHTMLの埋め込み形式を変える
      //   → ON_AIR_RE / SUPPLIER_TYPE_RE が全滅 → 全件 onAir:false
      //   → lives:[] のまま ok:true で返り、SET されて TTL 1時間 空になる。
      //   ★しかも HTTP 200 + stored:true なので workflow は緑のまま＝誰も気づかない。
      if (!payload.lives.length) {
        res.status(502).json({
          ok: false,
          error: 'zero lives — not stored',
          // ★どこで途切れたかを数字で残す(次に読む人が推測しなくて済むように)
          scanned: payload.scanned,
          probeOk: payload.probeOk,
          onAir: payload.onAir,
          hint: payload.probeOk === 0
            ? 'watch を1枚も取得できていない(通信/遮断の疑い)'
            : 'watch は取得できているのに放送中の個人配信が0件(HTML仕様変更の疑い)'
        });
        return;
      }
      await upstash(['SET', STORE_KEY, JSON.stringify(payload), 'EX', String(TTL_SECONDS)]);
      if (!trusted) {
        // ★閲覧者には集めたての本体をそのまま返す(もう一往復させない=リアルタイム性)。
        try { await upstash(['DEL', REFRESH_LOCK_KEY]); } catch { /* TTL で消える */ }
        res.status(200).json({ ...(await attachComments(payload)), refreshed: true });
        return;
      }
      res.status(200).json({ ok: true, stored: true, onAir: payload.onAir, lives: payload.lives.length });
      return;
    }

    const raw = await upstash(['GET', STORE_KEY]);
    if (!raw) {
      // ★「まだ集めていない」を「壊れている」と混ぜない(3値の掟と同じ思想)。
      res.status(404).json({ ok: false, error: 'not collected yet' });
      return;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      res.status(500).json({ ok: false, error: 'broken payload' });
      return;
    }
    res.status(200).json(await attachComments(data));
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message ? e.message : e) });
  }
}
