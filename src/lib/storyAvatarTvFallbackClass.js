// storyAvatarTvFallbackClass.js
// 人物タイル/アイコンの「リモートサムネ取得失敗→ゆっくりTVスタイルへ落とす」class 付け外しの正本。
//
// 経緯(person-tile-unify 第3コミット・2026-06-22): popup-entry.js のローカル関数だったが、
//   会場(venueBar.js)の席アバターも同じ avatar load guard を使うため lib に抽出。popup と会場が
//   同じ本物を import して createSupportAvatarLoadGuard のコールバックに渡す(スタブ化しない)。
//   ★退化ガード: popup-entry.js の applyStoryAvatarTvFallbackClass /
//     removeStoryAvatarTvFallbackClass をそのまま移したもの。挙動を変えない。

import { isHttpOrHttpsUrl } from './supportGrowthTileSrc.js';

/**
 * リモートサムネが読めずフォールバック画像に差し替わったとき、対象 img の種別に応じた
 * TV-fallback クラスを付ける(ニコニコ公式 defaults アイコンは TV 化しない)。
 * @param {HTMLImageElement} img
 */
export function applyStoryAvatarTvFallbackClass(img) {
  if (!(img instanceof HTMLImageElement)) return;
  try {
    const s = String(img.currentSrc || img.src || '');
    if (/nicoaccount\/usericon\/defaults\//i.test(s)) return;
  } catch {
    // no-op
  }
  if (img.classList.contains('nl-story-userlane-avatar')) {
    img.classList.add('nl-avatar--tv-fallback');
    return;
  }
  if (img.classList.contains('nl-story-growth-icon')) {
    img.classList.add('nl-story-growth-icon--tv-fallback');
    return;
  }
  if (img.classList.contains('nl-story-detail-img')) {
    img.classList.add('nl-story-detail-img--tv-fallback');
  }
}

/**
 * リモートサムネ取得に成功したとき、TV-fallback クラスを外して http は no-referrer にする。
 * @param {HTMLImageElement} img
 */
export function removeStoryAvatarTvFallbackClass(img) {
  if (!(img instanceof HTMLImageElement)) return;
  img.classList.remove(
    'nl-story-growth-icon--tv-fallback',
    'nl-story-detail-img--tv-fallback',
    'nl-avatar--tv-fallback'
  );
  if (isHttpOrHttpsUrl(img.src)) {
    img.referrerPolicy = 'no-referrer';
  }
}
