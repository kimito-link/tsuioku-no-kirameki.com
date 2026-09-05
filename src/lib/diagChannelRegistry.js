// diagChannelRegistry.js
// 計器チャンネルの台帳。HANDOFF-instrument-channels-2026-08-12.md §3。
//
// ★これは「データ(配列)+純関数」に留める。中央 DiagManager(クラス/シングルトン)は**作らない**
//   — バンドルが面ごとに別なのでインスタンス共有ができず、共有できたつもりの嘘になる(設計で却下済)。
//
// ★計器を1個足す = ここに1エントリ足す = diagChannelRegistry.contract.test.js の6ゲートが自動で掛かる。
//   これが「増やすほど断線が増える」を止める唯一の仕掛け。
//
// status の意味:
//   'wired'   … 書き手と読み手の両方が配線済み。G1/G3/G4 の対象になる。
//   'planned' … lib だけ先行して存在し、まだ配線していない。**黙って許さない**ために
//               明示的にこの印を置く(テストが planned 一覧を出力する)。配線した版で 'wired' へ移す。
//
// ★surface(面)をチャンネルIDに含める理由(失敗#8): 同名フィールドが2面にあるため、
//   venue.avatar と popup.avatar は**別チャンネル・別キー**として扱う。

import { KEY_COMMENT_POST_DIAG } from './commentPostDiagKey.js';
import { COMMENT_POST_DIAG_SCHEMA } from './commentPostDiag.js';

/**
 * @typedef {'popup'|'content'|'venue'|'sidepanel'|'status'} DiagSurface
 * @typedef {{
 *   id: string,
 *   key: string,
 *   surface: DiagSurface,
 *   writerFile: string,
 *   readerFile: string,
 *   schema: import('./diagSchemaCopy.js').DiagSchema,
 *   writerCount: number,
 *   readerCount: number,
 *   status: 'wired'|'planned',
 *   note?: string
 * }} DiagChannel
 */

/**
 * 全計器チャンネルの台帳。
 *
 * writerCount / readerCount は「キー定数がそのファイルで使われている出現回数」の期待値。
 *   ★数で断言する理由(wiring-test-must-assert-counts): 「1箇所以上ある」だと、
 *   2箇所必要な配線の片方が消えても緑のままになる。
 *
 * @type {ReadonlyArray<DiagChannel>}
 */
export const DIAG_CHANNELS = [
  {
    id: 'popup.commentPost',
    key: KEY_COMMENT_POST_DIAG,
    surface: 'popup',
    writerFile: 'src/extension/popup-entry.js',
    readerFile: 'src/extension/status-entry.js',
    schema: COMMENT_POST_DIAG_SCHEMA,
    // popup-entry.js: import 1 + publish 1 = 2 / status-entry.js: import 1 + get 2 = 3
    writerCount: 2,
    readerCount: 3,
    status: 'wired',
    note: 'コメント送信。v1354 で段(stage)フィールドを追加予定。'
  }
];

/** @param {DiagChannel['status']} status @returns {DiagChannel[]} */
export function channelsByStatus(status) {
  return DIAG_CHANNELS.filter((c) => c.status === status);
}

/** 配線済みチャンネルだけ返す(R層集約行・G1/G3/G4 の対象)。 @returns {DiagChannel[]} */
export function wiredChannels() {
  return channelsByStatus('wired');
}

/** @param {string} id @returns {DiagChannel|null} */
export function findChannel(id) {
  return DIAG_CHANNELS.find((c) => c.id === id) || null;
}
