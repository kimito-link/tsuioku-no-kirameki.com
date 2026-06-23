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

const POLL_INTERVAL_MS = 60_000;
let _timerId = null;
let _lastLaneSig = ' init';

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

/** レーン案内(ガイド行)の顔。app/images/yukkuri/ に同梱(拡張の相対パスではなく app 配下)。 */
const _LANE_FACES = {
  faceLink: 'images/yukkuri/link/link-yukkuri-half-eyes-mouth-closed.png',
  faceGift: 'images/yukkuri/konta/kitsune-yukkuri-half-eyes-mouth-closed.png',
  faceAd: 'images/yukkuri/konta/kitsune-yukkuri-half-eyes-mouth-closed.png',
  faceKonta: 'images/yukkuri/konta/kitsune-yukkuri-half-eyes-mouth-closed.png',
  faceTanu: 'images/yukkuri/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.png'
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

/** @param {{ generatedAt?: string, laneMirror?: any, statCardsMirror?: any }} jsonBlob */
function render(jsonBlob) {
  hideError();
  renderLaneMirror(jsonBlob.laneMirror || null);
  const stamp = document.getElementById('updatedAt');
  if (stamp) {
    const t = jsonBlob.generatedAt ? new Date(jsonBlob.generatedAt) : null;
    stamp.textContent = t
      ? `最終送信 ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
      : '';
  }
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
