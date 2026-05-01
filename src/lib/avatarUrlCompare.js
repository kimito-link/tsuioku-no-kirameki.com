/**
 * アバター URL の比較用ヘルパ（純粋関数）。
 *
 * 0.1.84 (Phase A refactor): 実装は src/shared/avatar/avatarUrlGuard.js に移管。
 * このファイルは re-export shim として残す（既存 import 互換のため）。
 *
 * 新しいコードからは shared/avatar/avatarUrlGuard.js を直接 import すること。
 */

export {
  avatarCompareKey,
  isSameAvatarUrl
} from '../shared/avatar/avatarUrlGuard.js';
