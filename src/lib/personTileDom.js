// @ts-nocheck — DOM 専用; 候補行は popup 由来のゆるい形をそのまま渡す
/**
 * 人物タイル(丸サムネ＋ID＋ニックネーム)の DOM ビルダー（person-tile-unify 第2コミット・2026-06-17）。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 目的: popup 応援アイコン列の「1人ぶんのタイル」を作る処理を、ループ本体から
 *   純 DOM ビルダー buildPersonTileEl に切り出して【1つの正本】にする。
 *   将来 venue(会場の席)もこのビルダーでタイル本体を作り、popup と顔ぶれ・見た目を
 *   一致させる(第3コミット)。設計正本: docs/person-tile-architecture.md /
 *   council/person-tile-unify-SYNTHESIS.md(§描画層)。
 *
 * 【厳守(退化ガード)】
 *   - 生成する DOM(タグ・class・属性・子の順序)を【1バイトも変えない】。これは
 *     renderStoryUserLaneDom.js:fillLaneTier のループ本体をそのまま移したもの。
 *     見た目不変は personTileDom.test.js の characterization test で固定する。
 *   - レイアウト(横並び・innerHTML クリア・hidden 制御)は呼び出し側の責務。
 *     ここは「タイル1個の要素」を返すだけ(SYNTHESIS §描画層: タイル本体は共通・
 *     レイアウトは呼び出し側)。
 *   - venue 専用の吹き出し・読み上げ・ギフト演出は、呼び出し側がこの要素に被せる
 *     (タイル本体は触らない)。
 * ───────────────────────────────────────────────────────────────────────────
 */

import { isNumericNicoUserId } from '../domain/user/identity.js';
import { nicoUserPageUrl } from './nicoUserPage.js';

/**
 * @typedef {{
 *   displaySrc: string,
 *   title: string,
 *   meta: { idLine: string, nameLine: string },
 *   entry: { userId?: string }
 * }} PersonTileItem
 */

/**
 * @typedef {{
 *   storyAvatarLoadGuard: { pickDisplaySrc: (s: string) => string, noteRemoteAttempt: (img: HTMLImageElement, requested: string) => void },
 *   isHttpOrHttpsUrl: (u: unknown) => boolean,
 *   storyTileUsesYukkuriTvStyle: (requested: string, display: string) => boolean,
 *   upgradeAnonymousAvatarImage?: (img: HTMLImageElement, userKey: string, sizePx?: number) => unknown
 * }} PersonTileIo
 */

/**
 * 候補1件から人物タイル要素を1個作って返す純 DOM ビルダー。
 * 数値 ID(5〜14桁)なら <a>(ユーザーページリンク)、それ以外は <span>。
 *
 * @param {PersonTileItem} p 候補行(popup 由来のゆるい形)
 * @param {PersonTileIo} io アバター解決・URL 判定などの I/O 注入
 * @returns {HTMLElement} cell 要素(img + meta を内包・呼び出し側が好きな親へ append)
 */
export function buildPersonTileEl(p, io) {
  const fullUid = String(p.entry?.userId || '').trim();
  // 本登録の数値 ID ならニコニコのユーザーページにリンク。
  // リンク可否は domain 正本 isNumericNicoUserId(^\d{5,14}$=本登録)・URL は nicoUserPageUrl に
  // 寄せる(旧インライン /^\d{5,14}$/ の重複を排し、venue 席のリンク判定と同一基準にしてドリフト防止)。
  const pageUrl = nicoUserPageUrl(fullUid);
  const isLinkable = isNumericNicoUserId(fullUid) && pageUrl !== '';
  const cell = isLinkable
    ? document.createElement('a')
    : document.createElement('span');
  cell.className = 'nl-story-userlane-cell';
  if (isLinkable) {
    /** @type {HTMLAnchorElement} */ (cell).href = pageUrl;
    /** @type {HTMLAnchorElement} */ (cell).target = '_blank';
    /** @type {HTMLAnchorElement} */ (cell).rel = 'noopener noreferrer';
    cell.classList.add('nl-story-userlane-cell--linkable');
  }

  const img = document.createElement('img');
  img.className = 'nl-story-userlane-avatar';
  const requestedLane = p.displaySrc;
  const displayLane = io.storyAvatarLoadGuard.pickDisplaySrc(requestedLane);
  img.src = displayLane;
  io.storyAvatarLoadGuard.noteRemoteAttempt(img, requestedLane);
  img.classList.toggle(
    'nl-avatar--tv-fallback',
    io.storyTileUsesYukkuriTvStyle(requestedLane, displayLane)
  );
  img.alt = '';
  const tip =
    fullUid && fullUid !== p.meta.idLine ? `${p.title} | ${fullUid}` : p.title;
  img.title = tip;
  cell.title = tip;
  img.decoding = 'async';
  // 2026-06-22 会場「全員500人」: 当初 loading="lazy" を入れたが【撤回】。会場の席は段(tier)が
  //   CSS 3D変形(translateZ/scale)で動くため、ブラウザの「ビューポート内」判定が崩れ lazy 画像が
  //   ロードされず【サムネが出ない】実機症状を招いた(状態速報で確認)。正しい遅延化は会場側の
  //   IntersectionObserver(会議PR・3D変形を考慮した可視判定)で別途行う=ここでは即ロードに戻す。
  if (io.isHttpOrHttpsUrl(img.src)) {
    img.referrerPolicy = 'no-referrer';
  }
  if (
    fullUid &&
    requestedLane.startsWith('data:image/svg+xml') &&
    typeof io.upgradeAnonymousAvatarImage === 'function'
  ) {
    io.upgradeAnonymousAvatarImage(img, fullUid, 64);
  }

  const metaEl = document.createElement('span');
  metaEl.className = 'nl-story-userlane-meta';
  const idRow = document.createElement('span');
  idRow.className = 'nl-story-userlane-meta__id';
  idRow.textContent = p.meta.idLine;
  const nameRow = document.createElement('span');
  nameRow.className = 'nl-story-userlane-meta__name';
  nameRow.textContent = p.meta.nameLine;
  metaEl.appendChild(idRow);
  metaEl.appendChild(nameRow);

  cell.appendChild(img);
  cell.appendChild(metaEl);
  return cell;
}
