/**
 * voiceKeys.js — 読み上げ設定の storage キーの【正本】。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★なぜ要るか（2026-09-04・実測で発見）
 * ─────────────────────────────────────────────────────────────────────────
 *   読み上げの3キーは storageKeys.js に無く、【2箇所で二重定義】されていた:
 *     src/extension/comeview-entry.js:136-139  const VOICE_..._KEY = 'nls_voice_...'
 *     src/lib/voicePlayer.js:168-170           get VOICE_..._KEY() { return 'nls_voice_...' }
 *
 *   ★二重定義は「片方だけ直す」事故を必ず生む。このリポは同型の事故を既に踏んでいる:
 *     v0.1.1324「キーに生 url を混ぜたせいで、同じ配信が別キーになり読めた全件を捨てた」
 *
 *   ★「正本1つ・コピーを散らさない」は github/CLAUDE.md の原則。
 *     キー文字列は storageKeys.js に集約するのが本来だが、読み上げ系は
 *     voicePlayer.js（L0の再生エンジン）が持つ性格が強いので、
 *     ★storageKeys.js を肥大させず【読み上げ専用の正本】をここに置く。
 *     どちらにせよ「文字列が書かれている場所は1箇所」を守る。
 *
 * ★このモジュールは定数のみ（DOM も chrome API も触らない＝L0）。
 * @module voiceKeys
 */

/** 読み上げ ON/OFF。 */
export const KEY_VOICE_READING_ENABLED = 'nls_voice_reading_enabled_v1';

/** キャラごとの声の割り当て。 */
export const KEY_VOICE_ASSIGNMENTS = 'nls_voice_assignments_v1';

/** 名前も読み上げるか。 */
export const KEY_VOICE_READ_NAME_ENABLED = 'nls_voice_read_name_enabled_v1';
