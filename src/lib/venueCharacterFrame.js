/**
 * venueCharacterFrame.js
 *
 * 会場モードの「額縁(フレーム)」: ゆっくり3キャラ(りんく/こん太/たぬ姉)の全表情サムネを、
 * 画面の四辺に沿ってきれいに一周ぶん並べる描画モデル(純関数)。
 *
 * ユーザー要望(2026-06-16): 会場を額縁のように3キャラ全種類で囲みたい。配信映像(中央)と
 *   コメント欄の邪魔にならないこと。
 *
 * 設計:
 *   - 中央は空ける(タイルは四辺のみ)。各タイルは {edge, pos} を持ち、CSS が辺に沿って配置。
 *   - 画像は軽量な .thumb128 を使う(直前の性能改善の精神=会場を重くしない)。
 *   - 表情バリアントのみ使用(link-normal/fuji-background 等の非表情は除外)。
 *   - 3キャラを辺ごとに混ぜず「角で持ち回り」で均等分配=どの辺にも3キャラが散る見た目。
 *   - chrome 非依存: 画像URL解決は resolveUrl(=chrome.runtime.getURL)を注入してテスト可能に。
 */

const BASE = 'images/yukkuri-charactore-english';

/** 各キャラの .thumb128 表情バリアント(実在ファイルのみ)。 */
export const VENUE_FRAME_CHARACTER_THUMBS = Object.freeze({
  rinku: Object.freeze([
    `${BASE}/link/link-yukkuri-smile-mouth-open.thumb128.png`,
    `${BASE}/link/link-yukkuri-normal-mouth-open.thumb128.png`,
    `${BASE}/link/link-yukkuri-normal-mouth-closed.thumb128.png`,
    `${BASE}/link/link-yukkuri-blink-mouth-closed.thumb128.png`,
    `${BASE}/link/link-yukkuri-half-eyes-mouth-closed.thumb128.png`
  ]),
  konta: Object.freeze([
    `${BASE}/konta/kitsune-yukkuri-smile-mouth-open.thumb128.png`,
    `${BASE}/konta/kitsune-yukkuri-normal.thumb128.png`,
    `${BASE}/konta/kitsune-yukkuri-blink-mouth-closed.thumb128.png`,
    `${BASE}/konta/kitsune-yukkuri-half-eyes-mouth-closed.thumb128.png`
  ]),
  tanunee: Object.freeze([
    `${BASE}/tanunee/tanuki-yukkuri-smile-mouth-open.thumb128.png`,
    `${BASE}/tanunee/tanuki-yukkuri-normal-mouth-open.thumb128.png`,
    `${BASE}/tanunee/tanuki-yukkuri-normal-mouth-closed.thumb128.png`,
    `${BASE}/tanunee/tanuki-yukkuri-blink-mouth-closed.thumb128.png`,
    `${BASE}/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.thumb128.png`
  ])
});

/** 額縁を一周する辺の順(上→右→下→左)。 */
export const VENUE_FRAME_EDGES = Object.freeze(['top', 'right', 'bottom', 'left']);

/**
 * 3キャラのサムネを「キャラを持ち回り」でインターリーブした1本の配列にする。
 * 例: rinku0, konta0, tanunee0, rinku1, konta1, tanunee1, ... (各キャラの長さが違っても順に消化)。
 * @returns {string[]} 重複なしの全サムネ(インターリーブ順)。
 */
export function interleaveFrameThumbs() {
  const lists = [
    VENUE_FRAME_CHARACTER_THUMBS.rinku,
    VENUE_FRAME_CHARACTER_THUMBS.konta,
    VENUE_FRAME_CHARACTER_THUMBS.tanunee
  ];
  const out = [];
  const maxLen = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i += 1) {
    for (const list of lists) {
      if (i < list.length) out.push(list[i]);
    }
  }
  return out;
}

/**
 * タイルを四辺へ均等分配する。各タイルは pos(0..1・辺に沿った位置)を持つ。
 * 角の重なりを避けるため、pos は両端を少し内側に寄せる(余白 margin)。
 *
 * @param {number} count タイル総数
 * @returns {Array<{ edge: string, pos: number, edgeIndex: number }>}
 */
export function distributeFrameSlots(count) {
  const n = Math.max(0, Math.floor(count));
  if (!n) return [];
  // 4辺へできるだけ均等に割り振る(余りは先頭の辺から1枚ずつ)。
  const per = Math.floor(n / 4);
  const extra = n % 4;
  /** @type {Array<{ edge: string, pos: number, edgeIndex: number }>} */
  const slots = [];
  for (let e = 0; e < 4; e += 1) {
    const edge = VENUE_FRAME_EDGES[e];
    const onThisEdge = per + (e < extra ? 1 : 0);
    for (let k = 0; k < onThisEdge; k += 1) {
      // 辺上の位置: 等間隔。両端 margin=0.06 で角の被りを避ける。
      const pos = onThisEdge === 1 ? 0.5 : 0.06 + (k / (onThisEdge - 1)) * 0.88;
      slots.push({ edge, pos, edgeIndex: e });
    }
  }
  return slots;
}

/**
 * 会場額縁の全タイル描画モデルを返す。
 *
 * @param {((rel: string) => string)} [resolveUrl] 相対パス→拡張URL(chrome.runtime.getURL)。
 * @returns {Array<{ src: string, edge: string, pos: number }>} 四辺に分配済みのタイル。
 */
export function buildVenueCharacterFrame(resolveUrl) {
  const resolve = typeof resolveUrl === 'function' ? resolveUrl : (/** @type {string} */ rel) => rel;
  const thumbs = interleaveFrameThumbs();
  const slots = distributeFrameSlots(thumbs.length);
  return thumbs.map((rel, i) => ({
    src: resolve(rel),
    edge: slots[i].edge,
    pos: slots[i].pos
  }));
}
