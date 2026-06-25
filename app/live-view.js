// @ts-nocheck
/**
 * 純Web版 応援ライブビュー(拡張なし・PC/スマホ共通レスポンシブ)。
 *
 *   - URL の ?v=<token> を読み、GET /api/status?v=<token> で jsonBlob を取得。
 *   - jsonBlob.laneMirror / jsonBlob.statCardsMirror(拡張が「スマホへ送信」で相乗りさせた鏡
 *     スナップショット)を、popup と同じ【本物の描画関数】で描く=見た目そっくり(似せて自作しない)。
 *   - 拡張に依存しない純 Web。chrome.* は一切使わない。データは PC 拡張が送信した時点のスナップショット。
 *   - 60 秒ポーリングで自動更新(document.hidden 時は休む)。app/app.js と同じデータフロー。
 *
 * 設計: council/liveview-web-public-SYNTHESIS.md(案1=鏡スナップショット送信+純Web再描画)。
 *
 * @module live-view-web
 */

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
// 数字カード鏡: status と同じ純DOMビルダー(本物)を再利用=似せて自作しない・popup と必ず一致。
import { paintStatCardsMirrorValues } from '../src/lib/statCardsMirrorDom.js';
import { buildStatCardsMirrorSignature } from '../src/lib/statCardsMirror.js';
import { isEpochFresh } from '../src/lib/watchUrlFreshness.js';
// 配信者カード(ちくらん風ヘッダー): status と同じ本物 buildChikuranHeaderDom を再利用。データは lives[0]。
import { buildChikuranCardModel } from '../src/lib/chikuranCard.js';
import { buildChikuranHeaderDom } from '../src/lib/chikuranHeaderDom.js';
// 応援者ランキング(顔つき): status と同じ本物の行ビルダー+タイル変換を再利用。データは送信された topSupporters。
import { buildSupporterRankingRows } from '../src/lib/supporterRankingDom.js';
import { supporterRowToPersonTile } from '../src/lib/supporterRowToPersonTile.js';
import { buildPersonTileEl } from '../src/lib/personTileDom.js';
import { deriveAvatarUrlFromUid } from '../src/lib/deriveAvatarUrlFromUid.js';
import { anonymousIdenticonDataUrl } from '../src/lib/anonymousIdenticon.js';
import { storyUserLaneMetaLines } from '../src/lib/storyUserLaneMeta.js';

const POLL_INTERVAL_MS = 60_000;
/** 数字カード鏡の鮮度ガード(status-entry.js の MIRROR_FRESH_MS と同値=3分)。 */
const MIRROR_FRESH_MS = 3 * 60 * 1000;
let _timerId = null;
let _lastLaneSig = ' init';
let _lastStatCardsSig = ' init';

/**
 * 応援レーン鏡のアバター読み込みガード(popup/status と同設定の本物=createSupportAvatarLoadGuard)。
 *   fallback を先に出してプローブ成功時だけ差し替え=404 フリッカー防止。純Webでも同じ挙動。
 */
const _laneDomIo = {
  storyAvatarLoadGuard: createSupportAvatarLoadGuard({
    fallbackSrc: NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS,
    onFallbackApplied: applyStoryAvatarTvFallbackClass,
    onRemoteSuccess: removeStoryAvatarTvFallbackClass
  }),
  isHttpOrHttpsUrl,
  storyTileUsesYukkuriTvStyle
  // ★upgradeAnonymousAvatarImage は chrome.runtime.getURL に依存するため純Webでは渡さない
  //   (buildPersonTileEl 側で optional=typeof チェック。匿名は displaySrc の identicon をそのまま出す)。
};

/** レーン案内(ガイド行)の顔。app/images/yukkuri/ に同梱。
 *   ★絶対パス /app/images/ にする(ページURLは /live-view=ルートなので相対 images/ は /images/ に解決され 404。
 *   dist/app.js の script src を /app/dist/ にしたのと同じ理由。これで pre-existing の顔割れも直る)。 */
const _LANE_FACES = {
  faceLink: '/app/images/yukkuri/link/link-yukkuri-half-eyes-mouth-closed.png',
  faceGift: '/app/images/yukkuri/konta/kitsune-yukkuri-half-eyes-mouth-closed.png',
  faceAd: '/app/images/yukkuri/konta/kitsune-yukkuri-half-eyes-mouth-closed.png',
  faceKonta: '/app/images/yukkuri/konta/kitsune-yukkuri-half-eyes-mouth-closed.png',
  faceTanu: '/app/images/yukkuri/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.png'
};

/** 応援者ランキングの行ビルダーに渡す I/O(本物再利用)。tileIo は avatar 導出/meta、domIo は _laneDomIo を流用
 *   (匿名 identicon は displaySrc をそのまま=upgradeAnonymousAvatarImage を渡さない純Web方針)。 */
const _supporterRankingDomIo = {
  supporterRowToPersonTile,
  buildPersonTileEl,
  tileIo: {
    deriveAvatarUrlFromUid: (uid) => deriveAvatarUrlFromUid(uid),
    anonymousIdenticonDataUrl,
    storyUserLaneMetaLines: (entry, http) => storyUserLaneMetaLines(entry, http)
  },
  domIo: _laneDomIo
};

bootstrap();

function bootstrap() {
  const token = new URLSearchParams(location.search).get('v') || '';
  if (!token) {
    showError('URL に閲覧トークン(?v=...)がありません。PC の拡張の状態速報ページから「📱 スマホへ送信」してください。');
    return;
  }
  refresh(token);
  startPolling(token);
}

function startPolling(token) {
  if (_timerId) clearInterval(_timerId);
  _timerId = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    refresh(token);
  }, POLL_INTERVAL_MS);
}

async function refresh(token) {
  try {
    const res = await fetch(`/api/status?v=${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (res.status === 404) {
      showError('まだデータがありません。PC の拡張で「📱 スマホへ送信」を押してください。');
      return;
    }
    if (!res.ok) {
      showError(`取得に失敗しました (HTTP ${res.status})`);
      return;
    }
    const json = await res.json();
    const data = json?.data;
    if (!data || typeof data !== 'object') {
      showError('データの形式が不正です。');
      return;
    }
    render(data);
  } catch (err) {
    showError('通信エラー: ' + String((err && err.message) || err));
  }
}

/** @param {{ generatedAt?: string, lives?: any[], laneMirror?: any, statCardsMirror?: any }} jsonBlob */
function render(jsonBlob) {
  hideError();
  renderBroadcasterCard(Array.isArray(jsonBlob.lives) ? jsonBlob.lives[0] : null);
  renderStatCardsMirror(jsonBlob.statCardsMirror || null);
  renderLaneMirror(jsonBlob.laneMirror || null);
  renderSupporterRanking(jsonBlob.topSupporters || null);
  const stamp = document.getElementById('updatedAt');
  if (stamp) {
    const t = jsonBlob.generatedAt ? new Date(jsonBlob.generatedAt) : null;
    stamp.textContent = t
      ? `最終送信 ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
      : '';
  }
}

/**
 * 配信者カード: popup 上部の配信者ヘッダー(サムネ+名前+タイトル+メトリクス)をそっくり描く。
 *   status-entry.js#buildChikuranHeaderEl と同じ recipe(本物 buildChikuranCardModel→buildChikuranHeaderDom)。
 *   データは送信済みの lives[0]。lv が無い(配信無し)なら hidden。鮮度ガードは lives[].capturedAt で。
 * @param {any} live lives[0]
 */
function renderBroadcasterCard(live) {
  const section = document.getElementById('broadcasterCardLane');
  const host = document.getElementById('broadcasterCardHost');
  if (!section || !host) return;
  const model = buildChikuranCardModel(live);
  if (!model) {
    section.hidden = true;
    host.replaceChildren();
    return;
  }
  // 鮮度ガード(数字カードと同型): capturedAt が古い=配信終了後の残骸=隠す。
  const capturedAt = Number(live && live.capturedAt);
  if (capturedAt && !isEpochFresh(capturedAt, Date.now(), MIRROR_FRESH_MS)) {
    section.hidden = true;
    host.replaceChildren();
    return;
  }
  section.hidden = false;
  host.replaceChildren(buildChikuranHeaderDom(model));
}

/**
 * 応援者ランキング: popup/status と同じ本物の行ビルダー(buildSupporterRankingRows)で🥇🥈🥉を顔つき描画。
 *   データは送信された topSupporters({ liveId, rows })。rows が空/未送信なら hidden。
 *   ★status の buildSupporterExpander と同一見た目(v0.1.937)・supporterRowToPersonTile→buildPersonTileEl 再利用。
 * @param {{ liveId?: string, rows?: any[] }|null} topSupporters
 */
function renderSupporterRanking(topSupporters) {
  const section = document.getElementById('supporterRankingLane');
  const host = document.getElementById('supporterRankingHost');
  if (!section || !host) return;
  const rows = topSupporters && Array.isArray(topSupporters.rows) ? topSupporters.rows : null;
  if (!rows || !rows.length) {
    section.hidden = true;
    host.replaceChildren();
    return;
  }
  section.hidden = false;
  host.replaceChildren(buildSupporterRankingRows(rows, _supporterRankingDomIo));
}

/**
 * 数字カード鏡: popup 上部の「記録・推定同時接続・来場者数」+公式統計チップをそっくり描く。
 *   status-entry.js#renderStatCardsMirror と同じ recipe(本物 paintStatCardsMirrorValues を再利用)。
 *   ガード(null/鮮度/signature)も status と同型。データは拡張が送信した statCardsMirror スナップショット。
 * @param {any} snap
 */
function renderStatCardsMirror(snap) {
  const section = document.getElementById('statCardsMirror');
  if (!section) return;
  // popup 未起動/未送信=スナップショット無し=セクションごと隠す(死にリンク回避)。
  if (!snap || typeof snap !== 'object') {
    section.hidden = true;
    _lastStatCardsSig = ' init';
    return;
  }
  // 鮮度ガード: capturedAt が古ければ「配信が終わった後の残骸」=隠す(status と同型)。
  if (!isEpochFresh(Number(snap.capturedAt), Date.now(), MIRROR_FRESH_MS)) {
    section.hidden = true;
    _lastStatCardsSig = ' stale';
    return;
  }
  // signature ガード: 変化が無ければ値セットを skip(表示状態は維持)。
  const sig = buildStatCardsMirrorSignature(snap);
  if (sig === _lastStatCardsSig) {
    section.hidden = false;
    return;
  }
  _lastStatCardsSig = sig;
  section.hidden = false;
  // 値セットは本物 paintStatCardsMirrorValues(status と共有)=似せて自作しない・popup と必ず一致。
  paintStatCardsMirrorValues(document, snap);
}

/**
 * 応援レーン鏡: popup の応援レーン(りんく/こん太/広告/たぬ姉)を顔(avatar)込みでそっくり描く。
 *   status-entry.js / 拡張 live-view と同じ recipe(本物 paintStoryUserLaneDomFilled + buildPersonTileEl)。
 *   データは拡張が送った laneMirror スナップショット → restoreLaneMirrorBuckets で paint が受ける形に復元。
 * @param {any} snap
 */
function renderLaneMirror(snap) {
  const section = document.getElementById('laneMirrorLane');
  const empty = document.getElementById('laneEmpty');
  if (!section) return;
  if (!snap || typeof snap !== 'object') {
    section.hidden = true;
    if (empty) {
      empty.hidden = false;
      empty.textContent = 'まだ応援レーンのデータがありません。PC の拡張で配信を開いてから「📱 スマホへ送信」してください。';
    }
    _lastLaneSig = ' init';
    return;
  }

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
  if (!els.stack || !els.laneLink || !els.laneGift || !els.laneKonta || !els.laneTanu) {
    section.hidden = true;
    return;
  }

  const buckets = restoreLaneMirrorBuckets(snap);
  const totalCells =
    buckets.link.length + buckets.gift.length + buckets.ad.length + buckets.konta.length + buckets.tanu.length;
  const pickedLength = Math.max(
    0,
    Math.floor(Number(snap.pickedLength) || 0) || totalCells
  );
  const totalCandidates = Math.max(0, Math.floor(Number(snap.totalCandidates) || 0));

  const sig =
    `${String(snap.liveId || '')}|${Number(snap.capturedAt) || 0}|` +
    `${buckets.link.length}|${buckets.gift.length}|${buckets.ad.length}|${buckets.konta.length}|${buckets.tanu.length}|` +
    `${pickedLength}|${totalCandidates}`;
  if (sig === _lastLaneSig) {
    section.hidden = false;
    if (empty) empty.hidden = true;
    return;
  }
  _lastLaneSig = sig;

  section.hidden = false;
  if (empty) empty.hidden = true;

  const metaEl = document.getElementById('laneMirrorMeta');
  if (metaEl) {
    metaEl.textContent =
      totalCells > 0 ? `いま ${pickedLength}人を表示中` : 'この配信ではまだ応援レーンに出る人がいません。';
  }

  if (totalCells === 0) {
    paintStoryUserLaneDomEmptyGuides(els, _LANE_FACES);
    return;
  }
  paintStoryUserLaneDomFilled(els, _LANE_FACES, buckets, pickedLength, _laneDomIo, { totalCandidates });
}

function showError(msg) {
  const el = document.getElementById('errorBox');
  if (el) {
    el.hidden = false;
    el.textContent = msg;
  }
}

function hideError() {
  const el = document.getElementById('errorBox');
  if (el) el.hidden = true;
}
