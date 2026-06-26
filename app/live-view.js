// @ts-nocheck
/**
 * 純Web版 応援ライブビュー（拡張なし・PC/スマホ共通）。
 *
 * ★方針（reference_liveview_popup_wholesale_copy.md）= 拡張内 応援ライブビュー
 *   （popup.html を iframe で丸ごと出す＝完璧）と「まったく同じ＝コピー」にする。
 *   セクションを1個ずつ独自に組み立てて足すのは【禁止・ユーザーが何度も否定】。
 *
 * このエントリは:
 *   1) `globalThis.chrome` を【本物 popup-entry を import する前に】シムとして設置する。
 *      - storage.local.get … 設定キーの既定値＋鏡キー（snapshot 由来）を返す（受動モード）。
 *      - runtime.getURL … `/app/<path>` へ（純Web配下のアセット）。
 *      - runtime.id … truthy（popup の hasExtensionContext() を満たす）。
 *      - storage.set/remove・onChanged・tabs/windows/scripting 等 … no-op スタブ。
 *   2) `?v=<token>` の snapshot を GET し、鏡（laneMirror/statCardsMirror/northStarMirror）を
 *      popup が読む storage キーに載せる。
 *   3) 本物 `popup-entry.js` を dynamic import で起動する（dock=liveview=受動ビュー：
 *      書かない/注入しない/外部 fetch しない）。popup.js 自身が初回ロード幕を外し・利用規約
 *      ゲートを隠し・hidden セクションを reveal する＝本物そっくりの骨格になる。
 *   4) popup が（生データ無しのため）空に描いた応援レーン/数字カード/北極星レーン/配信者カード/
 *      応援者ランキングを、本物の paint 関数で snapshot の鏡から塗り直す（似せて自作しない）。
 *   5) 60 秒ポーリングで snapshot を再取得し鏡を塗り直す（popup 本体は受動＝自律 refresh しない）。
 *
 * URL は popup と同じく `?inline=1&dock=liveview&lv=<lv>` 相当を満たす必要がある。
 *   実際の閲覧 URL は `/live-view?v=<token>`。lv は snapshot 由来で location に焼く（下記 seedLocationParams）。
 *
 * @module live-view-web
 */

// ── 本物の描画関数（chrome 非依存・全て再利用＝似せて自作しない）─────────────
import { KEY_LANE_MIRROR } from '../src/lib/laneMirrorKey.js';
import { KEY_STAT_CARDS_MIRROR } from '../src/lib/statCardsMirrorKey.js';
import { KEY_NORTH_STAR_MIRROR } from '../src/lib/northStarMirrorKey.js';
import { restoreLaneMirrorBuckets } from '../src/lib/laneMirror.js';
import {
  paintStoryUserLaneDomFilled,
  paintStoryUserLaneDomEmptyGuides
} from '../src/extension/story/renderStoryUserLaneDom.js';
import { createSupportAvatarLoadGuard } from '../src/lib/supportGrowthAvatarLoad.js';
import {
  isHttpOrHttpsUrl,
  NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS
} from '../src/lib/supportGrowthTileSrc.js';
import { storyTileUsesYukkuriTvStyle } from '../src/lib/storyTileTvStyle.js';
import {
  applyStoryAvatarTvFallbackClass,
  removeStoryAvatarTvFallbackClass
} from '../src/lib/storyAvatarTvFallbackClass.js';
import { paintStatCardsMirrorValues } from '../src/lib/statCardsMirrorDom.js';
import { buildStatCardsMirrorSignature } from '../src/lib/statCardsMirror.js';
import { buildChikuranCardModel } from '../src/lib/chikuranCard.js';
import { buildChikuranHeaderDom } from '../src/lib/chikuranHeaderDom.js';
import { anonymousIdenticonDataUrl } from '../src/lib/anonymousIdenticon.js';
// 公式値レーン(ギフト貢献度ランキング/広告ランキング)を本物の strip 描画で出す。popup と同じ lib を再利用(似せて自作しない)。
import { officialDomRankingRowsToStripRooms } from '../src/lib/officialDomRankingRowsToStripRooms.js';
import { renderTopSupportRankStripInto } from '../src/lib/paintTopSupportRankStyleIntoElement.js';
import { buildNorthStarAdRankingStatsHtml } from '../src/lib/buildNorthStarAdRankingStatsHtml.js';
import { restoreNorthStarMirrorRows } from '../src/lib/northStarMirror.js';
// 第2段(council/liveview-wholesale-root-SYNTHESIS.md): コメントタイムライン鏡(最新N件)を純Webで描いて
//   「コメントが進む動き」を出す。popup と同じ本物 lib を再利用(似せて自作しない)。
import { restoreCommentTimelineRows } from '../src/lib/commentTimelineMirror.js';
import { buildCommentTickerLatestHtml } from '../src/lib/commentTickerLatestHtml.js';
// 第1段(council/liveview-wholesale-root-SYNTHESIS.md): スナップショット丸ごと1枚の鮮度を【1回だけ】判定し、
//   全レーンを一斉に出す/一斉に「古い」とする。per-section の個別鮮度ドロップ(=レーンがバラバラに消える)を廃止。
import {
  evaluateSnapshotFreshness,
  formatSnapshotStalenessBanner
} from '../src/lib/liveviewSnapshotFreshness.js';

const POLL_INTERVAL_MS = 60_000;
/** 鏡の鮮度ガード（status-entry.js の MIRROR_FRESH_MS と同値＝3分）。 */
const MIRROR_FRESH_MS = 3 * 60 * 1000;

let _timerId = null;
let _bootStarted = false;
let _lastStatCardsSig = ' init';
let _lastLaneSig = ' init';
/** 直近 snapshot（popup boot 後の塗り直し・onChanged 橋渡しで使う）。 */
let _latestSnapshot = null;
/** シムの合成 storage（popup が get で読む）。鏡キーをここに載せる。 */
const _shimStore = Object.create(null);
/** onChanged リスナ（popup が登録。snapshot 更新時に発火させて受動再描画を促す）。 */
const _onChangedListeners = [];

/* ───────────────────────── chrome シム ───────────────────────── */

/**
 * popup の設定キー既定値（dock=liveview 受動ビューで読むだけ。書かない）。
 *   無いと undefined でも popup 側は normalize で既定に倒すが、明示で安定させる。
 *   ★ここは「設定の見た目」だけ＝鏡（実データ）は別途 _shimStore に載せる。
 */
const _CONFIG_DEFAULTS = {
  nls_recording_enabled: false,
  nls_anonymous_identicon_enabled_v1: true
};

/** get の3シグネチャ（string / array / object-defaults / null=全件）を満たして合成 storage を返す。 */
function shimStorageGet(keys) {
  const out = Object.create(null);
  const pick = (k) => {
    if (k in _shimStore) out[k] = _shimStore[k];
    else if (k in _CONFIG_DEFAULTS) out[k] = _CONFIG_DEFAULTS[k];
  };
  if (keys == null) {
    // get(null)=全件。合成 storage と既定をまとめて返す。
    for (const k of Object.keys(_CONFIG_DEFAULTS)) out[k] = _CONFIG_DEFAULTS[k];
    for (const k of Object.keys(_shimStore)) out[k] = _shimStore[k];
  } else if (typeof keys === 'string') {
    pick(keys);
  } else if (Array.isArray(keys)) {
    for (const k of keys) pick(k);
  } else if (typeof keys === 'object') {
    // object-defaults: 既定値を出発点に、合成 storage で上書き。
    for (const k of Object.keys(keys)) {
      out[k] = k in _shimStore ? _shimStore[k] : keys[k];
    }
  }
  return Promise.resolve(out);
}

/** chrome.runtime.getURL: 拡張内相対パス → 純Web `/app/<path>`。 */
function shimGetURL(path) {
  const rel = String(path || '').replace(/^[./]+/, '');
  return `/app/${rel}`;
}

/** 本物 popup-entry を import する【前に】グローバル chrome を設置する。 */
function installChromeShim() {
  const noop = () => {};
  const okPromise = () => Promise.resolve();
  const shim = {
    // hasExtensionContext() は runtime.id && storage.local を見る（popup-entry.js:2795）。
    runtime: {
      id: 'tsuioku-liveview-web',
      getURL: shimGetURL,
      getManifest: () => ({ version: '0.0.0-web' }),
      lastError: undefined,
      sendMessage: () => Promise.resolve(undefined),
      onMessage: { addListener: noop, removeListener: noop },
      connect: () => ({ postMessage: noop, onMessage: { addListener: noop }, disconnect: noop })
    },
    storage: {
      local: {
        get: (keys) => shimStorageGet(keys),
        set: okPromise, // 受動ビュー：呼ばれても no-op（INLINE_PASSIVE で基本呼ばれない）
        remove: okPromise,
        clear: okPromise
      },
      session: {
        get: () => Promise.resolve(Object.create(null)),
        set: okPromise,
        remove: okPromise
      },
      onChanged: {
        addListener: (fn) => { if (typeof fn === 'function') _onChangedListeners.push(fn); },
        removeListener: (fn) => {
          const i = _onChangedListeners.indexOf(fn);
          if (i >= 0) _onChangedListeners.splice(i, 1);
        }
      }
    },
    // 受動ビューでは触られない領域（INLINE_PASSIVE ガード）。万一呼ばれても落とさない no-op。
    tabs: {
      query: () => Promise.resolve([]),
      sendMessage: () => Promise.resolve(undefined),
      reload: okPromise,
      create: () => Promise.resolve({}),
      update: () => Promise.resolve({})
    },
    windows: {
      create: () => Promise.resolve({}),
      getCurrent: () => Promise.resolve({}),
      getLastFocused: () => Promise.resolve(null),
      update: () => Promise.resolve({}),
      remove: okPromise
    },
    scripting: { executeScript: () => Promise.resolve([]) },
    downloads: { download: () => Promise.resolve(0) },
    webNavigation: { getAllFrames: () => Promise.resolve([]) }
  };
  // ★Chrome ブラウザは通常ページでも `window.chrome`（runtime/storage 無しのスタブ）を生やす。
  //   そのため「未定義なら設置」だと素通りしてシムが入らず、popup が storage を読めない（全部 — のまま）。
  //   本物の拡張 context（runtime.id がある）でない限り、シムで上書きする。
  const existing = globalThis.chrome;
  const isRealExtensionContext = !!(existing && existing.runtime && existing.runtime.id && existing.storage && existing.storage.local);
  if (!isRealExtensionContext) {
    globalThis.chrome = shim;
  }
}

/**
 * popup が `?inline=1&dock=liveview&lv=<lv>` を読むので、閲覧 URL（`/live-view?v=token`）に
 *   不足パラメータを足す（history.replaceState＝リロードなし）。lv は snapshot から焼く。
 * @param {string} lv
 */
function seedLocationParams(lv) {
  try {
    const u = new URL(location.href);
    u.searchParams.set('inline', '1');
    u.searchParams.set('dock', 'liveview');
    if (lv) u.searchParams.set('lv', lv);
    if (u.href !== location.href) history.replaceState(null, '', u.href);
  } catch {
    /* no-op */
  }
}

/** snapshot の鏡を popup が読む storage キーに載せ、onChanged を発火（受動再描画を促す）。 */
function seedMirrorsIntoStore(jsonBlob) {
  const changes = Object.create(null);
  const put = (key, val) => {
    const oldValue = _shimStore[key];
    _shimStore[key] = val;
    changes[key] = { oldValue, newValue: val };
  };
  if (jsonBlob && jsonBlob.laneMirror) put(KEY_LANE_MIRROR, jsonBlob.laneMirror);
  if (jsonBlob && jsonBlob.statCardsMirror) put(KEY_STAT_CARDS_MIRROR, jsonBlob.statCardsMirror);
  if (jsonBlob && jsonBlob.northStarMirror) put(KEY_NORTH_STAR_MIRROR, jsonBlob.northStarMirror);
  // popup が登録済みの onChanged を発火（純Webでは本物 storage が無いので手動橋渡し）。
  if (Object.keys(changes).length && _onChangedListeners.length) {
    for (const fn of _onChangedListeners.slice()) {
      try { fn(changes, 'local'); } catch { /* no-op */ }
    }
  }
}

/* ───────────────── 鏡 → 本物 paint（popup の DOM へ）───────────────── */

const _laneDomIo = {
  storyAvatarLoadGuard: createSupportAvatarLoadGuard({
    fallbackSrc: NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS,
    onFallbackApplied: applyStoryAvatarTvFallbackClass,
    onRemoteSuccess: removeStoryAvatarTvFallbackClass
  }),
  isHttpOrHttpsUrl,
  storyTileUsesYukkuriTvStyle
  // upgradeAnonymousAvatarImage は chrome.runtime.getURL 依存＝純Webでは渡さない（匿名は identicon を直出し）。
};

/** 応援レーン案内（ガイド行）の顔。popup と同じ画像を /app/images/ から。 */
const _LANE_FACES = {
  faceLink: '/app/images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.thumb128.png',
  faceGift: '/app/images/yukkuri-charactore-english/konta/kitsune-yukkuri-half-eyes-mouth-closed.thumb128.png',
  faceAd: '/app/images/yukkuri-charactore-english/konta/kitsune-yukkuri-half-eyes-mouth-closed.thumb128.png',
  faceKonta: '/app/images/yukkuri-charactore-english/konta/kitsune-yukkuri-half-eyes-mouth-closed.thumb128.png',
  faceTanu: '/app/images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.thumb128.png'
};

/** 数字カード鏡: 本物 popup DOM の #liveStatCards 配下へ値を入れる（似せて自作しない）。
 *   ★第1段: 個別の鮮度ドロップは廃止(全レーンを揃えて出すため鮮度判定はスナップショット丸ごと1回に集約)。 */
function paintStatCardsMirror(snap) {
  if (!snap || typeof snap !== 'object') return;
  const sig = buildStatCardsMirrorSignature(snap);
  if (sig === _lastStatCardsSig) return;
  _lastStatCardsSig = sig;
  paintStatCardsMirrorValues(document, snap);
}

/** 応援レーン鏡: 本物 popup DOM の #sceneStoryUserLane* へ顔つきで描く（似せて自作しない）。 */
function paintLaneMirror(snap) {
  if (!snap || typeof snap !== 'object') return;
  const $id = (id) => document.getElementById(id);
  const els = {
    stack: $id('sceneStoryUserLaneStack'),
    laneLink: $id('sceneStoryUserLaneLink'),
    laneGift: $id('sceneStoryUserLaneGift'),
    laneAd: $id('sceneStoryUserLaneAd'),
    laneKonta: $id('sceneStoryUserLaneKonta'),
    laneTanu: $id('sceneStoryUserLaneTanu'),
    hintLink: $id('sceneStoryUserLaneLinkHint'),
    linkWrap: $id('sceneStoryUserLaneLinkWrap'),
    giftWrap: $id('sceneStoryUserLaneGiftWrap'),
    adWrap: $id('sceneStoryUserLaneAdWrap'),
    guideTop: $id('sceneStoryUserLaneGuideTop'),
    guideLinesTop: $id('sceneStoryUserLaneGuideLinesTop'),
    guideMidGift: $id('sceneStoryUserLaneGuideMidGift'),
    guideLinesMidGift: $id('sceneStoryUserLaneGuideLinesMidGift'),
    guideMidAd: $id('sceneStoryUserLaneGuideMidAd'),
    guideLinesMidAd: $id('sceneStoryUserLaneGuideLinesMidAd'),
    guideMidKonta: $id('sceneStoryUserLaneGuideMidKonta'),
    guideLinesMidKonta: $id('sceneStoryUserLaneGuideLinesMidKonta'),
    guideMidTanu: $id('sceneStoryUserLaneGuideMidTanu'),
    guideLinesMidTanu: $id('sceneStoryUserLaneGuideLinesMidTanu'),
    guideBottom: $id('sceneStoryUserLaneGuideBottom'),
    guideLinesBottom: $id('sceneStoryUserLaneGuideLinesBottom')
  };
  if (!els.stack || !els.laneLink || !els.laneGift || !els.laneKonta || !els.laneTanu) return;

  const buckets = restoreLaneMirrorBuckets(snap);
  const totalCells =
    buckets.link.length + buckets.gift.length + buckets.ad.length + buckets.konta.length + buckets.tanu.length;
  const pickedLength = Math.max(0, Math.floor(Number(snap.pickedLength) || 0) || totalCells);
  const totalCandidates = Math.max(0, Math.floor(Number(snap.totalCandidates) || 0));

  const sig =
    `${String(snap.liveId || '')}|${Number(snap.capturedAt) || 0}|` +
    `${buckets.link.length}|${buckets.gift.length}|${buckets.ad.length}|${buckets.konta.length}|${buckets.tanu.length}|` +
    `${pickedLength}|${totalCandidates}`;
  if (sig === _lastLaneSig) return;
  _lastLaneSig = sig;

  if (totalCells === 0) {
    paintStoryUserLaneDomEmptyGuides(els, _LANE_FACES);
    return;
  }
  paintStoryUserLaneDomFilled(els, _LANE_FACES, buckets, pickedLength, _laneDomIo, { totalCandidates });
}

/** strip 描画(公式値レーン/応援者ランキング)の共通 IO。popup と同じ本物 lib に渡す。 */
const _STRIP_DEFAULT_THUMB = '/app/images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png';
const _stripIo = {
  defaultThumbSrc: _STRIP_DEFAULT_THUMB,
  anonymousFallbackThumbSrc: NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS,
  anonymousIdenticonResolver: (uid) => anonymousIdenticonDataUrl(uid),
  avatarLoadGuard: _laneDomIo.storyAvatarLoadGuard
  // teardownWaitingUi/setLaneHidden/syncLaneGadget 等は lib 既定(no-op/安全動作)に委ねる(純Web相当)。
};

/**
 * 北極星レーン鏡（ギフト貢献度ランキング）。
 *   snapshot は `{ lanes: { contributionRanking: rows[] } }`。popup と同じ本物経路で描く＝似せて自作しない:
 *   rows → officialDomRankingRowsToStripRooms → renderTopSupportRankStripInto（popup の
 *   refreshNorthStarContributionRankingLaneAsync と同じ recipe）。host は popup.html コピーの
 *   #northStarLaneBody-contributionRanking。
 * @param {any} snap northStarMirror スナップショット
 */
function paintNorthStarContributionMirror(snap) {
  const body = document.getElementById('northStarLaneBody-contributionRanking');
  if (!body) return;
  const rows =
    restoreNorthStarMirrorRows(snap, 'contributionRanking').length
      ? restoreNorthStarMirrorRows(snap, 'contributionRanking')
      : (snap && Array.isArray(snap.contributionRanking) && snap.contributionRanking) || null;
  if (!rows || !rows.length) return; // データ無し=popup の空状態のまま(死にリンクにしない)
  try {
    const rooms = officialDomRankingRowsToStripRooms(rows.slice(0, 10), { userKeyKind: 'contrib' });
    renderTopSupportRankStripInto(body, rooms, {
      noteText: '公式の貢献度ランキング（niconico の表示に準拠）',
      unitSuffix: '貢',
      ariaLabel: '貢献度ランキング',
      isNorthStarBody: true,
      ..._stripIo
    });
  } catch {
    /* no-op: 北極星レーンは best-effort(壊れても他レーンを巻き込まない) */
  }
}

/**
 * 北極星レーン鏡（ニコニ広告の貢献度ランキング）。
 *   snapshot は `{ lanes: { adRanking: rows[] } }`。popup の refreshNorthStarAdRankingLane の filled 経路と
 *   同じ recipe で描く＝似せて自作しない: rows → officialDomRankingRowsToStripRooms('ad') →
 *   renderTopSupportRankStripInto + buildNorthStarAdRankingStatsHtml の beforeNote。host は
 *   popup.html コピーの #northStarLaneBody-adRanking。
 *   ★累計pt(programAdPts)は鏡に持たないので null＝統計行は「—」表示（popup でも未取得時は同じ表示＝ズレない）。
 * @param {any} snap northStarMirror スナップショット
 */
function paintNorthStarAdMirror(snap) {
  const body = document.getElementById('northStarLaneBody-adRanking');
  if (!body) return;
  const rows = restoreNorthStarMirrorRows(snap, 'adRanking');
  if (!rows || !rows.length) return; // データ無し=popup の空状態のまま(死にリンクにしない)
  try {
    const adRows = rows.slice(0, 10);
    const rooms = officialDomRankingRowsToStripRooms(adRows, { userKeyKind: 'ad' });
    let rankingSum = 0;
    for (const row of adRows) {
      const c = Number(row?.contribution);
      if (Number.isFinite(c) && c > 0) rankingSum += c;
    }
    const beforeNoteHtml = buildNorthStarAdRankingStatsHtml({
      programAdPts: null, // 累計pt は鏡に無い＝popup の未取得時と同じ「—」
      rankingContributionSum: rankingSum,
      rankingRowCount: adRows.length
    });
    renderTopSupportRankStripInto(body, rooms, {
      noteText:
        'ニコニ広告の貢献度ランキング（公式ページ相当）。画面上部の累計ptなどと、各行の「貢」は指標や期間が異なり一致しないことがあります',
      unitSuffix: '貢',
      ariaLabel: '広告ランキング',
      beforeNoteHtml,
      isNorthStarBody: true,
      ..._stripIo
    });
  } catch {
    /* no-op: 北極星レーンは best-effort(壊れても他レーンを巻き込まない) */
  }
}

/**
 * 北極星レーン鏡を全レーン塗る（貢献度＋広告）。レーンは「キーを足すだけ」で増やす設計＝
 *   星野ロミ理論の丸ごと（拡張内プレビューと同じ全レーンを純Webにも出す）。
 * @param {any} snap northStarMirror スナップショット
 */
function paintNorthStarMirror(snap) {
  paintNorthStarContributionMirror(snap);
  paintNorthStarAdMirror(snap);
}

/** 配信者カード（ちくらん風ヘッダー）: 本物 buildChikuranHeaderDom で popup の配信者ヘッダーへ。 */
function paintBroadcasterCard(live) {
  const host =
    document.getElementById('broadcasterCardHost') ||
    document.querySelector('#casterBanner');
  if (!host) return;
  const model = buildChikuranCardModel(live);
  if (!model) return;
  // ★第1段: 個別の鮮度ドロップは廃止(鮮度判定はスナップショット丸ごと1回=paintAllMirrors 側で実施)。
  try {
    host.replaceChildren(buildChikuranHeaderDom(model));
    if (host.hidden) host.hidden = false;
    host.style.removeProperty('display');
  } catch {
    /* no-op */
  }
}

/** 応援者ランキング: popup の本物 host #topSupportRankStrip に、本物 strip 描画で🥇🥈🥉を顔つき表示。
 *   送信 rows {userId,name,count,avatarUrl,isAnonymous} を strip-room {userKey,nickname,count,avatarUrl} に
 *   変換して renderTopSupportRankStripInto（popup と同じ lib）で描く＝似せて自作しない。 */
function paintSupporterRanking(topSupporters) {
  const strip = document.getElementById('topSupportRankStrip');
  if (!strip) return;
  const rows = topSupporters && Array.isArray(topSupporters.rows) ? topSupporters.rows : null;
  if (!rows || !rows.length) return;
  try {
    const rooms = rows
      .map((r) => ({
        userKey: String(r.userId || r.userKey || ''),
        nickname: String(r.name || r.nickname || ''),
        count: Number(r.count) || 0,
        avatarUrl: String(r.avatarUrl || '')
      }))
      .filter((room) => room.userKey || room.nickname);
    if (!rooms.length) return;
    renderTopSupportRankStripInto(strip, rooms, {
      noteText: '記録した応援コメントをユーザー別に数えた件数の多い順',
      unitSuffix: '件',
      ariaLabel: '記録した応援コメントをユーザー別に数えた件数の多い順',
      ..._stripIo
    });
    strip.hidden = false;
    strip.removeAttribute('aria-hidden');
  } catch {
    /* no-op */
  }
}

/** 第2段: コメントタイムライン鏡の最新1件を本物 popup のティッカー DOM(#commentTickerSegA)に塗る。
 *   poll/onChanged のたびに最新行が変わる=純Webでも「コメントが進む動き」が見える。本物 lib
 *   buildCommentTickerLatestHtml を再利用(似せて自作しない)。 */
let _lastTimelineSig = ' init';
function paintCommentTimelineMirror(snap) {
  const segA = document.getElementById('commentTickerSegA');
  const segB = document.getElementById('commentTickerSegB');
  const scroll = document.getElementById('commentTickerScroll');
  const viewport = document.getElementById('commentTickerViewport');
  if (!segA) return;
  const rows = restoreCommentTimelineRows(snap);
  if (!rows.length) return; // データ無し=popup の空状態(placeholder)のまま(死に画面にしない)
  const latest = rows[rows.length - 1]; // restore は古→新=末尾が最新
  const sig = `${String(snap?.liveId || '')}|${Number(snap?.capturedAt) || 0}|${rows.length}|${String(latest.text || '')}`;
  if (sig === _lastTimelineSig) return;
  _lastTimelineSig = sig;
  try {
    if (scroll) scroll.classList.add('is-paused', 'is-latest-only');
    if (segB) segB.innerHTML = '';
    if (viewport) viewport.classList.remove('is-empty');
    // 匿名(a:)や数値IDのリンクは純Webでは付けない(referrer 露出を避ける)=span のまま。
    segA.innerHTML = buildCommentTickerLatestHtml({
      label: String(latest.name || ''),
      avatarSrc: String(latest.avatarUrl || ''),
      textShown: String(latest.text || '').slice(0, 72),
      userPageHref: ''
    });
  } catch {
    /* no-op: ティッカーは best-effort(壊れても他レーンを巻き込まない) */
  }
}

/** snapshot の全鏡を本物 paint で popup DOM に塗る（signature ガード有効＝変化時のみ）。
 *   ★第1段(council/liveview-wholesale-root-SYNTHESIS.md): スナップショット丸ごとの鮮度を【1回だけ】判定し、
 *     新鮮なら全レーンを一斉に塗る・古ければ1枚バナーで知らせる(per-section でバラバラに消さない=全レーンが揃う)。 */
function paintAllMirrors(jsonBlob) {
  if (!jsonBlob || typeof jsonBlob !== 'object') return;
  const fresh = evaluateSnapshotFreshness(jsonBlob, Date.now(), MIRROR_FRESH_MS);
  const banner = formatSnapshotStalenessBanner(fresh);
  if (banner) showStaleBanner(banner);
  else hideStaleBanner();
  // 古くても「全レーンを揃えて」塗る(バラバラに消すより、古い旨を1枚で伝えた上で丸ごと見せる方が誠実)。
  paintBroadcasterCard(Array.isArray(jsonBlob.lives) ? jsonBlob.lives[0] : null);
  paintStatCardsMirror(jsonBlob.statCardsMirror || null);
  paintLaneMirror(jsonBlob.laneMirror || null);
  paintNorthStarMirror(jsonBlob.northStarMirror || null);
  paintSupporterRanking(jsonBlob.topSupporters || null);
  paintCommentTimelineMirror(jsonBlob.commentTimelineMirror || null);
}

/**
 * signature ガードを無視して全鏡を塗り直す。
 *   popup の空描画が私の paint を上書きした後だと、signature が同じため通常 paint は skip される。
 *   clobber に勝つには signature をリセットして強制再描画する必要がある（settle repaint / poll で使う）。
 */
function forcePaintAllMirrors() {
  _lastStatCardsSig = ' force';
  _lastLaneSig = ' force';
  _lastTimelineSig = ' force';
  const wasPainting = _painting;
  _painting = true; // 自分の paint 由来の mutation を observer に無視させる
  try {
    paintAllMirrors(_latestSnapshot);
  } finally {
    if (!wasPainting) setTimeout(() => { _painting = false; }, 0);
  }
}

/* ───────────────────────── データ取得 ───────────────────────── */

function liveIdFromSnapshot(jsonBlob) {
  try {
    const fromLane = String(jsonBlob?.laneMirror?.liveId || '').trim().toLowerCase();
    if (/^lv\d{1,15}$/.test(fromLane)) return fromLane;
    const fromLive = String(jsonBlob?.lives?.[0]?.liveId || jsonBlob?.lives?.[0]?.lv || '')
      .trim()
      .toLowerCase();
    if (/^lv\d{1,15}$/.test(fromLive)) return fromLive;
  } catch {
    /* no-op */
  }
  return '';
}

async function fetchSnapshot(token) {
  const res = await fetch(`/api/status?v=${encodeURIComponent(token)}`, { cache: 'no-store' });
  if (res.status === 404) {
    showError('まだデータがありません。PC の拡張で「📱 スマホへ送信」を押してください。');
    return null;
  }
  if (!res.ok) {
    showError(`取得に失敗しました (HTTP ${res.status})`);
    return null;
  }
  const json = await res.json();
  const data = json?.data;
  if (!data || typeof data !== 'object') {
    showError('データの形式が不正です。');
    return null;
  }
  return data;
}

/** 初回: snapshot を取得→鏡を storage へ→lv を URL に焼く→本物 popup を起動。 */
async function bootWithSnapshot(token) {
  const jsonBlob = await fetchSnapshot(token);
  if (!jsonBlob) return;
  hideError();
  _latestSnapshot = jsonBlob;
  seedMirrorsIntoStore(jsonBlob);
  seedLocationParams(liveIdFromSnapshot(jsonBlob));

  if (!_bootStarted) {
    _bootStarted = true;
    // ★本物 popup-entry を起動（chrome シムは設置済み）。dock=liveview=受動ビュー。
    //   import 後、popup の initPopup が DOMContentLoaded で走り、初回ロード幕を外す。
    await import('../src/extension/popup-entry.js');
    // ★popup は生コメントデータを持たないので、応援レーン/数字カードを「空」に塗り直す。
    //   その空描画が【私の鏡 paint を上書き（clobber）する】。clobber は (a) 初回 refresh と
    //   (b) ユーザーが <details> を開く等で起きる再描画、の両方で発生する。
    //   → MutationObserver で「popup がレーン/カードを触ったら鏡を塗り直す」自己修復に統一する
    //     （settle 窓だけだと、窓を過ぎた後のユーザー操作 clobber を取りこぼす）。
    startSelfHealingRepaint();
  } else {
    forcePaintAllMirrors();
  }
}

/** 自己修復 repaint の二重発火を抑える（自分の paint で observer が再発火するのを無視するフラグ）。 */
let _painting = false;
let _healScheduled = false;
let _observer = null;

/**
 * popup の再描画（初回 refresh・<details> 開閉など）でレーン/数字カードが空に戻されたら、鏡を塗り直す。
 *   - MutationObserver: 監視対象が変化したら、自分の paint 由来でなければ force 再描画を1回スケジュール。
 *   - _painting フラグ: 自分の paint 中の mutation は無視（無限ループ防止）。
 *   - 保険の低頻度 tick: observer が取りこぼしても 2.5 秒ごとに必ず塗り直す（passive popup は重くない）。
 */
function startSelfHealingRepaint() {
  const healNow = () => {
    _painting = true;
    try { forcePaintAllMirrors(); } catch { /* no-op */ }
    // microtask 後にフラグを下ろす（自分の DOM 変更が observer に拾われ終わってから）。
    setTimeout(() => { _painting = false; }, 0);
  };
  const scheduleHeal = () => {
    if (_healScheduled) return;
    _healScheduled = true;
    setTimeout(() => { _healScheduled = false; healNow(); }, 60);
  };

  // 監視対象: 応援レーンのスタックと数字カード（popup が空に塗り直す要素）。
  const targets = ['sceneStoryUserLaneStack', 'liveStatCards', 'casterBanner']
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  try {
    _observer = new MutationObserver(() => {
      if (_painting) return; // 自分の paint 由来は無視
      scheduleHeal();
    });
    for (const t of targets) {
      _observer.observe(t, { childList: true, subtree: true, characterData: true });
    }
  } catch {
    /* MutationObserver 不可環境: 低頻度 tick だけで担保 */
  }

  // 初回の settle（observer 登録前の描画も拾う）+ 保険の低頻度 tick。
  healNow();
  setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    healNow();
  }, 2500);
}

async function refresh(token) {
  const jsonBlob = await fetchSnapshot(token);
  if (!jsonBlob) return;
  hideError();
  _latestSnapshot = jsonBlob;
  seedMirrorsIntoStore(jsonBlob); // onChanged 橋渡しで popup の受動再描画も促す
  forcePaintAllMirrors(); // poll でも clobber を踏み消して鏡を確実に出す
}

function startPolling(token) {
  if (_timerId) clearInterval(_timerId);
  _timerId = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    refresh(token).catch(() => {});
  }, POLL_INTERVAL_MS);
}

/* ───────────────────────── エラー表示 ───────────────────────── */

/** popup.html には専用 errorBox が無いので、無ければ動的に1つ用意（最小・死に画面回避）。 */
function ensureErrorBox() {
  let el = document.getElementById('lvWebErrorBox');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lvWebErrorBox';
    el.setAttribute('role', 'alert');
    el.style.cssText =
      'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:99999;max-width:90vw;' +
      'padding:10px 14px;border-radius:10px;background:#fff3f3;color:#9a2c2c;border:1px solid #f0c0c0;' +
      'font:13px/1.6 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.12);';
    el.hidden = true;
    (document.body || document.documentElement).appendChild(el);
  }
  return el;
}

function showError(msg) {
  const el = ensureErrorBox();
  el.hidden = false;
  el.textContent = msg;
}

function hideError() {
  const el = document.getElementById('lvWebErrorBox');
  if (el) el.hidden = true;
}

/** 「この画面は N 秒前の状態です」バナー(鮮度切れを1箇所で・エラーではないので穏やかな配色)。 */
function ensureStaleBanner() {
  let el = document.getElementById('lvWebStaleBox');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lvWebStaleBox';
    el.setAttribute('role', 'status');
    el.style.cssText =
      'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:99998;max-width:90vw;' +
      'padding:8px 14px;border-radius:10px;background:#fff8e8;color:#7a5a18;border:1px solid #f0dca0;' +
      'font:13px/1.6 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.10);';
    el.hidden = true;
    (document.body || document.documentElement).appendChild(el);
  }
  return el;
}

function showStaleBanner(msg) {
  const el = ensureStaleBanner();
  el.hidden = false;
  el.textContent = msg;
}

function hideStaleBanner() {
  const el = document.getElementById('lvWebStaleBox');
  if (el) el.hidden = true;
}

/* ───────────────────────── 起動 ───────────────────────── */

function bootstrap() {
  // ★最優先: 本物 popup-entry を import する前に chrome シムを設置。
  installChromeShim();

  const token = new URLSearchParams(location.search).get('v') || '';
  if (!token) {
    showError('URL に閲覧トークン（?v=...）がありません。PC の拡張の状態速報ページから「📱 スマホへ送信」してください。');
    return;
  }
  bootWithSnapshot(token).catch((err) => {
    showError('通信エラー: ' + String((err && err.message) || err));
  });
  startPolling(token);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
}
