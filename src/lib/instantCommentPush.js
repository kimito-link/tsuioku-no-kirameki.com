/**
 * instantCommentPush.js
 *
 * 「コメント即時プッシュレーン(storage迂回)」の純関数部。
 *
 * 背景(2026-07-06): PC が重負荷(多重 Claude セッション等)のとき chrome.storage の往復が
 *   一律〜4秒化し、コメントが応援レーンに反映されるまで数秒〜十数秒かかる(取り込み自体は
 *   速い。遅いのは storage 経由の表示配達)。ユーザーが負荷源を閉じられない事情があるため、
 *   表示のホットパスから storage を外す。
 *
 * 経路: content-entry.js が自分の作ったインラインパネル iframe(popup.html?inline=1&lv=…)
 *   への参照を持っている。新着コメント行を取り込んだ直後に
 *   `iframe.contentWindow.postMessage({ type: NLS_LIVE_COMMENT_PUSH_TYPE, nonce, rows }, '*')`
 *   で同一タブ内直接配達する(storage 非経由・往復ゼロ)。nonce は content script が iframe src
 *   の `pn=` クエリに焼き込んだ値(lv と同様に自タブ内で完結)を毎メッセージに同梱し、iframe 側で
 *   照合する。
 *
 * ★セキュリティ裁定(設計判断): ページ世界のスクリプトも iframe へ postMessage 可能で、
 *   src 属性の nonce も DOM から読めるため、この経路は完全には偽装防止できない
 *   (isNlsInterceptTokenValid と同種の「generic/opportunistic な偽装を弾く層」に留まる)。
 *   よってプッシュ行は【表示の先出し】専用とし、
 *     (a) 記録・鏡・集計・演出/音のトリガには一切使わない(popup-entry.js 側は表示バッファへの
 *         合流のみ行い、storage へは書き戻さない)
 *     (b) storage 経由の正規行が到着したら正規行で置換する(commentNo dedupe)
 *     (c) 行データは既存の isValidChatRow(nlsInterceptAuth.js と同じ shape 検証)を通す
 *   最悪ケースは「自分のパネルに偽コメントが一瞬表示される」に限定される。
 *
 * 副作用なし、純関数のみ。
 */

import { isValidChatRow, sanitizeIncomingArray } from './nlsInterceptAuth.js';

/** postMessage の type 文字列(content→iframe 直送・storage 非経由)。 */
export const NLS_LIVE_COMMENT_PUSH_TYPE = 'NLS_LIVE_COMMENT_PUSH';

/** iframe src に焼き込む nonce クエリキー(lv と同じ経路で自タブ内完結)。 */
export const NLS_LIVE_COMMENT_PUSH_NONCE_PARAM = 'pn';

/**
 * 32 桁 hex の nonce を生成する(nlsInterceptAuth.generateNlsAuthToken と同じ方式・
 *   crypto.getRandomValues 優先・fallback は Date.now+Math.random)。
 * @returns {string}
 */
export function generateInstantPushNonce() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      let s = '';
      for (let i = 0; i < buf.length; i++) {
        s += buf[i].toString(16).padStart(2, '0');
      }
      return s;
    }
  } catch {
    /* fallback below */
  }
  const a = Date.now().toString(16);
  const b = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  const c = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return (a + b + c).slice(0, 32);
}

/**
 * 受信メッセージが「自分宛の即時プッシュ」として妥当かを検証する。
 * @param {{ data?: unknown }|null|undefined} eventLike window 'message' イベント相当
 * @param {string} expectedNonce iframe src の `pn=` から読んだ自分の nonce
 * @returns {boolean}
 */
export function isInstantCommentPushValid(eventLike, expectedNonce) {
  if (!expectedNonce) return false;
  if (!eventLike || !eventLike.data || typeof eventLike.data !== 'object') return false;
  const d = /** @type {{ type?: unknown, nonce?: unknown }} */ (eventLike.data);
  if (d.type !== NLS_LIVE_COMMENT_PUSH_TYPE) return false;
  return typeof d.nonce === 'string' && d.nonce === expectedNonce;
}

/**
 * 受信 rows を shape 検証する(nlsInterceptAuth.isValidChatRow と同じ規約=
 *   commentNo 1-10桁数字・text 4096字以内・userId 形式チェック)。
 * @param {unknown} raw
 * @returns {Array<{ commentNo?: string, text?: string, userId?: string|null }>|null}
 */
export function sanitizeInstantPushRows(raw) {
  return sanitizeIncomingArray(raw, isValidChatRow);
}

/**
 * プッシュ行1件を PopupCommentEntry 相当の「先出しエントリ」に整形する純関数。
 *   liveId を明示的に持たせ、popup 側の laneFeedEntries フィルタ(liveId 一致)を通過できるようにする。
 * @param {{ commentNo?: unknown, text?: unknown, userId?: unknown }} row
 * @param {string} liveId
 * @param {number} capturedAt
 * @returns {{ id: string, liveId: string, commentNo: string, text: string, userId: string|null, capturedAt: number, instantPush: true }}
 */
export function toInstantPushDisplayEntry(row, liveId, capturedAt) {
  const commentNo = String(row?.commentNo || '').trim();
  const lid = String(liveId || '').trim().toLowerCase();
  const uid = row?.userId != null ? String(row.userId).trim() || null : null;
  return {
    id: commentNo ? `instant-push:${lid}:${commentNo}` : `instant-push:${lid}:${capturedAt}:${Math.random().toString(36).slice(2, 8)}`,
    liveId: lid,
    commentNo,
    text: String(row?.text || ''),
    userId: uid,
    capturedAt: Number.isFinite(capturedAt) ? capturedAt : Date.now(),
    instantPush: true
  };
}

/**
 * @param {{ commentNo?: unknown }|null|undefined} entry
 * @returns {string} commentNo が数字列なら "no:<n>"、無ければ空文字(dedupe 対象外)
 */
function dedupeKeyForEntry(entry) {
  const no = String(entry?.commentNo || '').trim();
  return /^\d+$/.test(no) ? `no:${no}` : '';
}

/**
 * 「表示の先出し」バッファへ新規プッシュ行を合流する純関数。
 *   - 既に同じ commentNo が確定済み(storage 由来)一覧に存在するなら追加しない(正規到着で既に置換済み)。
 *   - 既存プッシュバッファに同じ commentNo があれば上書きしない(先着優先・多重送信の再エンキュー防止)。
 *   - 上限(maxBuffered)を超えたら古い順に間引く(メモリ有界)。
 * @param {ReadonlyArray<Record<string, unknown>>} existingPushBuffer 現在のプッシュバッファ(先出し中の行)
 * @param {ReadonlyArray<Record<string, unknown>>} confirmedEntries storage 由来の確定済み表示行(commentNo dedupe 対象)
 * @param {ReadonlyArray<Record<string, unknown>>} incomingDisplayEntries toInstantPushDisplayEntry で整形済みの新規行
 * @param {{ maxBuffered?: number }} [opts]
 * @returns {Record<string, unknown>[]} 更新後のプッシュバッファ
 */
export function mergeInstantPushBuffer(
  existingPushBuffer,
  confirmedEntries,
  incomingDisplayEntries,
  opts = {}
) {
  const maxBuffered = Math.max(1, Number(opts.maxBuffered) || 300);
  const confirmedKeys = new Set(
    (Array.isArray(confirmedEntries) ? confirmedEntries : [])
      .map(dedupeKeyForEntry)
      .filter(Boolean)
  );
  const out = (Array.isArray(existingPushBuffer) ? existingPushBuffer : []).filter((e) => {
    const key = dedupeKeyForEntry(e);
    // 正規到着済みなら先出し行は用済み(置換済み)なので落とす。
    return !(key && confirmedKeys.has(key));
  });
  const seenKeys = new Set(out.map(dedupeKeyForEntry).filter(Boolean));
  for (const incoming of Array.isArray(incomingDisplayEntries) ? incomingDisplayEntries : []) {
    const key = dedupeKeyForEntry(incoming);
    if (key) {
      if (seenKeys.has(key) || confirmedKeys.has(key)) continue;
      seenKeys.add(key);
    }
    out.push(incoming);
  }
  if (out.length > maxBuffered) {
    return out.slice(out.length - maxBuffered);
  }
  return out;
}

/**
 * 確定済み表示行(storage 由来) + 先出しプッシュバッファを合成し、レーン供給用の1本の配列にする。
 *   確定済み側に同じ commentNo があるプッシュ行は既に mergeInstantPushBuffer 側で除去されている
 *   前提だが、呼び出し順序ミスに備えて二重チェックする(冪等)。
 * @param {ReadonlyArray<Record<string, unknown>>} confirmedEntries
 * @param {ReadonlyArray<Record<string, unknown>>} pushBuffer
 * @returns {Record<string, unknown>[]}
 */
export function composeDisplayEntriesWithInstantPush(confirmedEntries, pushBuffer) {
  const confirmed = Array.isArray(confirmedEntries) ? confirmedEntries : [];
  const buffer = Array.isArray(pushBuffer) ? pushBuffer : [];
  if (!buffer.length) return confirmed;
  const confirmedKeys = new Set(confirmed.map(dedupeKeyForEntry).filter(Boolean));
  const extra = buffer.filter((e) => {
    const key = dedupeKeyForEntry(e);
    return !(key && confirmedKeys.has(key));
  });
  if (!extra.length) return confirmed;
  return [...confirmed, ...extra];
}

/**
 * EMA(指数移動平均)で push→表示 gapMs の平均を更新する純関数。
 *   giftEffectDiag.computeGiftGapAverage / commentPostDiag.computeCommentEchoAverage と同じ方式
 *   (窓バッファ無し=メモリ有界)。
 * @param {unknown} prevAvgMs 直前の平均値(-1=未計測)
 * @param {unknown} sampleMs 今回の実測値(ms)
 * @param {number} [alpha] EMA 係数(既定 0.3)
 * @returns {number} 更新後の平均値(整数丸め・-1=未計測のまま)
 */
export function computeInstantPushGapAverage(prevAvgMs, sampleMs, alpha = 0.3) {
  const sample = Number(sampleMs);
  if (!Number.isFinite(sample) || sample < 0) {
    const prev = Number(prevAvgMs);
    return Number.isFinite(prev) ? prev : -1;
  }
  const prev = Number(prevAvgMs);
  if (!Number.isFinite(prev) || prev < 0) return Math.round(sample);
  return Math.round(prev + alpha * (sample - prev));
}
