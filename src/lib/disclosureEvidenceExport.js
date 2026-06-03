/**
 * 開示請求向け証拠パック（CSV + JSON + manifest + readme + 特定情報ドラフト）を組み立てる純関数。
 *
 * 設計方針:
 *   - プロバイダ責任制限法に基づく開示請求で必要になりやすい
 *     「サービス名・配信・コメント番号・投稿者 ID・日時・本文」を1セットで出す
 *   - SHA-256 で改ざん検知可能な副本を生成する
 *   - 裁判所・運営・弁護士へ渡しやすい特定情報たたき台（statement）を同梱する
 */

import { csvEscapeField } from './reportCommentsCsv.js';
import { collectDisclosureFlaggedCommentEntries } from './disclosureRequestMode.js';

export const DISCLOSURE_EVIDENCE_CSV_BOM = '\ufeff';

/** 証拠パックの目的（UI・manifest・readme で共通） */
export const DISCLOSURE_EVIDENCE_PURPOSE =
  'ニコニコ生放送に関する開示請求（プロバイダ責任制限法に基づく発信者情報開示請求等）に提出できるよう、コメント特定情報を整理した証拠パックです。';

/** 補足（過度に否定的な免責ではなく、実務上の注意） */
export const DISCLOSURE_EVIDENCE_LEGAL_NOTE =
  '裁判所の判断や運営側の対応は個別事情により異なります。損害賠償請求等の複雑な案件では、スクリーンショット等と合わせ弁護士にご相談ください。';

const CSV_HEADERS = Object.freeze([
  'seq',
  'commentNo',
  'liveId',
  'watchUrl',
  'userId',
  'is184',
  'userProfileUrl',
  'nickname',
  'text',
  'capturedAtJst',
  'capturedAtUtc',
  'vpos',
  'flagRuleId',
  'flagLevel',
  'matchedText',
  'rowSha256',
  'storageId'
]);

/**
 * @param {number} ms
 * @returns {string}
 */
export function formatDisclosureTimestampJst(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '';
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
      .format(new Date(ms))
      .replace(' ', 'T')
      .concat('+09:00');
  } catch {
    return '';
  }
}

/**
 * @param {string} userId
 * @returns {string}
 */
export function buildNiconicoUserProfileUrl(userId) {
  const uid = String(userId || '').trim();
  if (!/^\d{1,18}$/.test(uid)) return '';
  return `https://www.nicovideo.jp/user/${uid}`;
}

/**
 * @param {string} liveId
 * @returns {string}
 */
export function buildNiconicoWatchUrl(liveId) {
  const lv = String(liveId || '').trim();
  if (!/^lv\d+$/i.test(lv)) return '';
  return `https://live.nicovideo.jp/watch/${lv.toLowerCase()}`;
}

/**
 * @param {string} liveId
 * @param {number} exportedAtMs
 * @returns {string}
 */
export function buildDisclosureExportId(liveId, exportedAtMs) {
  const lv = String(liveId || 'unknown').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const t = Number.isFinite(exportedAtMs) ? exportedAtMs : Date.now();
  return `disclosure-${lv || 'unknown'}-${t}`;
}

/**
 * 行単位の整合性ハッシュ用 canonical JSON。
 * @param {Record<string, unknown>} row
 * @returns {string}
 */
export function canonicalDisclosureRowJson(row) {
  return JSON.stringify(row);
}

/**
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function computeSha256HexUtf8(text) {
  const payload = String(text ?? '');
  if (!globalThis.crypto?.subtle) {
    throw new Error('SHA-256 requires crypto.subtle');
  }
  const enc = new TextEncoder();
  const hash = await globalThis.crypto.subtle.digest('SHA-256', enc.encode(payload));
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * @param {Array<Record<string, unknown>>} flagged
 * @param {{ liveId?: string, watchUrl?: string }} meta
 * @returns {Promise<{ csv: string, rowDigests: string[] }>}
 */
export async function buildDisclosureEvidenceCsvWithDigests(flagged, meta = {}) {
  const liveId = String(meta.liveId || '').trim();
  const watchUrl = String(meta.watchUrl || buildNiconicoWatchUrl(liveId)).trim();
  const rows = [CSV_HEADERS.join(',')];
  /** @type {string[]} */
  const rowDigests = [];

  for (let i = 0; i < flagged.length; i++) {
    const c = flagged[i] || {};
    const uid = c.userId == null ? '' : String(c.userId);
    const is184 = uid.startsWith('a:');
    const at =
      typeof c.capturedAt === 'number' && Number.isFinite(c.capturedAt) && c.capturedAt > 0
        ? c.capturedAt
        : 0;
    const vposStr =
      typeof c.vpos === 'number' && Number.isFinite(c.vpos) ? String(c.vpos) : '';
    const flag = /** @type {{ ruleId?: string, level?: string, matchedText?: string }} */ (
      c.disclosureFlag || {}
    );
    const canonical = {
      seq: i + 1,
      commentNo: String(c.commentNo || '').trim(),
      liveId,
      watchUrl,
      userId: uid,
      text: String(c.text || ''),
      capturedAtUtc: at ? new Date(at).toISOString() : '',
      capturedAtJst: formatDisclosureTimestampJst(at)
    };
    const rowSha256 = await computeSha256HexUtf8(canonicalDisclosureRowJson(canonical));
    rowDigests.push(rowSha256);
    const cells = [
      String(i + 1),
      csvEscapeField(c.commentNo),
      csvEscapeField(liveId),
      csvEscapeField(watchUrl),
      csvEscapeField(uid),
      is184 ? 'true' : 'false',
      csvEscapeField(buildNiconicoUserProfileUrl(uid)),
      csvEscapeField(c.nickname),
      csvEscapeField(c.text),
      csvEscapeField(formatDisclosureTimestampJst(at)),
      csvEscapeField(at ? new Date(at).toISOString() : ''),
      vposStr,
      csvEscapeField(flag.ruleId),
      csvEscapeField(flag.level),
      csvEscapeField(flag.matchedText),
      rowSha256,
      csvEscapeField(c.id)
    ];
    rows.push(cells.join(','));
  }
  return {
    csv: `${DISCLOSURE_EVIDENCE_CSV_BOM}${rows.join('\r\n')}\r\n`,
    rowDigests
  };
}

/**
 * @param {Array<Record<string, unknown>>} flagged
 * @param {{ liveId?: string, watchUrl?: string, broadcastTitle?: string, broadcasterUserId?: string, exportId?: string }} meta
 * @returns {Promise<string>}
 */
export async function buildDisclosureEvidenceRowsJson(flagged, meta = {}) {
  const liveId = String(meta.liveId || '').trim();
  const watchUrl = String(meta.watchUrl || buildNiconicoWatchUrl(liveId)).trim();
  /** @type {Record<string, unknown>[]} */
  const items = [];
  for (let i = 0; i < flagged.length; i++) {
    const c = flagged[i] || {};
    const uid = c.userId == null ? '' : String(c.userId);
    const at =
      typeof c.capturedAt === 'number' && Number.isFinite(c.capturedAt) && c.capturedAt > 0
        ? c.capturedAt
        : 0;
    const flag = /** @type {{ ruleId?: string, level?: string, matchedText?: string }} */ (
      c.disclosureFlag || {}
    );
    /** @type {Record<string, unknown>} */
    const row = {
      seq: i + 1,
      commentNo: String(c.commentNo || '').trim(),
      liveId,
      watchUrl,
      serviceName: 'ニコニコ生放送',
      userId: uid,
      is184: uid.startsWith('a:'),
      userProfileUrl: buildNiconicoUserProfileUrl(uid),
      nickname: String(c.nickname || '').trim(),
      text: String(c.text || ''),
      capturedAtJst: formatDisclosureTimestampJst(at),
      capturedAtUtc: at ? new Date(at).toISOString() : '',
      vpos: typeof c.vpos === 'number' && Number.isFinite(c.vpos) ? c.vpos : null,
      flagRuleId: String(flag.ruleId || ''),
      flagLevel: String(flag.level || ''),
      matchedText: String(flag.matchedText || ''),
      storageId: String(c.id || '').trim()
    };
    row.rowSha256 = await computeSha256HexUtf8(canonicalDisclosureRowJson(row));
    items.push(row);
  }
  const payload = {
    schemaVersion: 1,
    exportId: String(meta.exportId || '').trim(),
    purpose: 'disclosure_request_evidence_rows',
    evidencePurpose: DISCLOSURE_EVIDENCE_PURPOSE,
    liveId,
    watchUrl,
    broadcastTitle: String(meta.broadcastTitle || '').trim(),
    broadcasterUserId: String(meta.broadcasterUserId || '').trim(),
    rowCount: items.length,
    rows: items
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/**
 * 開示請求の「特定発信者情報」たたき台（弁護士・運営提出用）。
 *
 * @param {Array<Record<string, unknown>>} flagged
 * @param {{ liveId?: string, watchUrl?: string, broadcastTitle?: string, exportedAtJst?: string }} meta
 * @returns {string}
 */
export function buildDisclosureEvidenceStatement(flagged, meta = {}) {
  const liveId = String(meta.liveId || '').trim();
  const watchUrl = String(meta.watchUrl || buildNiconicoWatchUrl(liveId)).trim();
  const title = String(meta.broadcastTitle || '').trim();
  const exportedAtJst = String(meta.exportedAtJst || '').trim();
  const lines = [
    '【開示請求用】特定発信者情報（たたき台）',
    '',
    DISCLOSURE_EVIDENCE_PURPOSE,
    '',
    '--- 対象サービス・配信 ---',
    `サービス名: ニコニコ生放送（live.nicovideo.jp）`,
    `配信 ID (liveId): ${liveId || '（要確認）'}`,
    `配信 URL: ${watchUrl || '（要確認）'}`,
    title ? `配信タイトル（記録時）: ${title}` : '',
    exportedAtJst ? `証拠書き出し日時 (JST): ${exportedAtJst}` : '',
    '',
    '--- 特定を求める投稿（該当コメント） ---',
    ''
  ].filter(Boolean);

  for (let i = 0; i < flagged.length; i++) {
    const c = flagged[i] || {};
    const uid = c.userId == null ? '' : String(c.userId);
    const at =
      typeof c.capturedAt === 'number' && Number.isFinite(c.capturedAt) && c.capturedAt > 0
        ? c.capturedAt
        : 0;
    const jst = formatDisclosureTimestampJst(at);
    const commentNo = String(c.commentNo || '').trim() || '（番号不明）';
    const text = String(c.text || '').trim();
    lines.push(`(${i + 1})`);
    lines.push(`  コメント番号: ${commentNo}`);
    lines.push(`  投稿者 ID: ${uid || '（不明）'}${uid.startsWith('a:') ? ' ※184匿名。プロバイダ開示が必要' : ''}`);
    if (c.nickname) lines.push(`  表示名（記録時）: ${String(c.nickname).trim()}`);
    lines.push(`  投稿日時 (JST): ${jst || '（不明）'}`);
    lines.push(`  投稿内容: ${text || '（本文なし）'}`);
    lines.push('');
  }

  lines.push('--- 補足 ---');
  lines.push(
    '上記は、端末内に記録したコメントログから抽出した副本です。同一内容の CSV・JSON・manifest に SHA-256 ハッシュが付いています。'
  );
  lines.push('原本は拡張の記録データ（端末内）に残っています。');
  lines.push('');
  lines.push(`※ ${DISCLOSURE_EVIDENCE_LEGAL_NOTE}`);
  lines.push('');
  return lines.join('\n');
}

/**
 * @param {{
 *   exportedAtMs?: number,
 *   exportId?: string,
 *   extensionVersion?: string,
 *   liveId?: string,
 *   watchUrl?: string,
 *   broadcastTitle?: string,
 *   broadcasterUserId?: string,
 *   recordWindow?: { firstCommentAtJst?: string, lastCommentAtJst?: string },
 *   flaggedCommentCount?: number,
 *   fileHashes?: Record<string, string>
 * }} meta
 * @returns {string}
 */
export function buildDisclosureEvidenceManifest(meta = {}) {
  const exportedAtMs =
    typeof meta.exportedAtMs === 'number' && Number.isFinite(meta.exportedAtMs)
      ? meta.exportedAtMs
      : Date.now();
  const payload = {
    schemaVersion: 2,
    purpose: 'disclosure_request_evidence_bundle',
    evidencePurpose: DISCLOSURE_EVIDENCE_PURPOSE,
    legalNote: DISCLOSURE_EVIDENCE_LEGAL_NOTE,
    exportId: String(meta.exportId || buildDisclosureExportId(meta.liveId, exportedAtMs)).trim(),
    exportedAtJst: formatDisclosureTimestampJst(exportedAtMs),
    exportedAtUtc: new Date(exportedAtMs).toISOString(),
    extensionVersion: String(meta.extensionVersion || '').trim(),
    liveId: String(meta.liveId || '').trim(),
    watchUrl: String(meta.watchUrl || buildNiconicoWatchUrl(meta.liveId)).trim(),
    broadcastTitle: String(meta.broadcastTitle || '').trim(),
    broadcasterUserId: String(meta.broadcasterUserId || '').trim(),
    recordWindow: meta.recordWindow || {},
    flaggedCommentCount: Number(meta.flaggedCommentCount) || 0,
    detectionRulesVersion: 'commentKindnessNudge-v1',
    files: meta.fileHashes || {}
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/**
 * @param {{
 *   liveId?: string,
 *   watchUrl?: string,
 *   flaggedCommentCount?: number,
 *   exportedAtJst?: string,
 *   exportId?: string,
 *   fileHashes?: Record<string, string>
 * }} meta
 * @returns {string}
 */
export function buildDisclosureEvidenceReadme(meta = {}) {
  const liveId = String(meta.liveId || '').trim();
  const watchUrl = String(meta.watchUrl || buildNiconicoWatchUrl(liveId)).trim();
  const count = Number(meta.flaggedCommentCount) || 0;
  const exportedAtJst = String(meta.exportedAtJst || '').trim();
  const exportId = String(meta.exportId || '').trim();
  const hashes = meta.fileHashes || {};
  return [
    '追憶のきらめき — 開示請求用 証拠パック',
    '',
    '【このパックについて】',
    DISCLOSURE_EVIDENCE_PURPOSE,
    'コメント番号・userId・日時・本文・SHA-256 整合性記録を揃えており、',
    '開示請求（プロバイダ責任制限法に基づく発信者情報開示請求等）に提出する証拠として十分使えます。',
    '',
    `書き出し ID: ${exportId || '（不明）'}`,
    `配信 ID: ${liveId || '（不明）'}`,
    `配信 URL: ${watchUrl || '（不明）'}`,
    `書き出し日時 (JST): ${exportedAtJst || '（不明）'}`,
    `該当コメント件数: ${count}`,
    '',
    '【同梱ファイル】',
    '- disclosure-evidence-*.csv … コメント一覧（Excel 向け UTF-8 BOM）',
    '- disclosure-rows-*.json … 構造化データ（プログラム処理・弁護士提出用）',
    '- disclosure-statement-*.txt … 特定発信者情報たたき台（そのまま添付可）',
    '- disclosure-manifest-*.json … 配信・書き出し・全ファイル SHA-256',
    '',
    '【整合性（改ざん検知）】',
    '各 CSV 行には rowSha256 列があります。manifest.json の files に各ファイルの SHA-256 が記録されています。',
    hashes.csv ? `- CSV SHA-256: ${hashes.csv}` : '- CSV SHA-256: （manifest を参照）',
    hashes.rowsJson ? `- JSON SHA-256: ${hashes.rowsJson}` : '',
    hashes.statementTxt ? `- 特定情報 SHA-256: ${hashes.statementTxt}` : '',
    '',
    '【提出時に添えるとより強いもの】',
    '1. 配信ページのスクリーンショット（URL バー・コメント番号が見えるもの）',
    '2. ニコニコ側への通報履歴（実施した場合）',
    '3. 本パック一式（CSV + JSON + statement + manifest）',
    '',
    '【注意】',
    DISCLOSURE_EVIDENCE_LEGAL_NOTE,
    '記録 ON より前のコメントは含まれません。原本は端末内の拡張記録データです。',
    ''
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * @param {unknown[]} comments
 * @param {{
 *   liveId?: string,
 *   watchUrl?: string,
 *   broadcastTitle?: string,
 *   broadcasterUserId?: string,
 *   extensionVersion?: string,
 *   exportedAtMs?: number
 * }} [meta]
 */
export async function buildDisclosureEvidenceBundle(comments, meta = {}) {
  const flagged = /** @type {Record<string, unknown>[]} */ (
    collectDisclosureFlaggedCommentEntries(Array.isArray(comments) ? comments : [])
  );
  const exportedAtMs =
    typeof meta.exportedAtMs === 'number' && Number.isFinite(meta.exportedAtMs)
      ? meta.exportedAtMs
      : Date.now();
  const liveId = String(meta.liveId || '').trim();
  const watchUrl = String(meta.watchUrl || buildNiconicoWatchUrl(liveId)).trim();
  const exportId = buildDisclosureExportId(liveId, exportedAtMs);
  /** @type {number[]} */
  const timestamps = flagged
    .map((c) => c.capturedAt)
    .filter((t) => typeof t === 'number' && Number.isFinite(t) && t > 0)
    .map((t) => /** @type {number} */ (t));
  let firstAt = 0;
  let lastAt = 0;
  for (const t of timestamps) {
    if (!firstAt || t < firstAt) firstAt = t;
    if (!lastAt || t > lastAt) lastAt = t;
  }

  const { csv } = await buildDisclosureEvidenceCsvWithDigests(flagged, { liveId, watchUrl });
  const rowsJson = await buildDisclosureEvidenceRowsJson(flagged, {
    liveId,
    watchUrl,
    broadcastTitle: meta.broadcastTitle,
    broadcasterUserId: meta.broadcasterUserId,
    exportId
  });
  const exportedAtJst = formatDisclosureTimestampJst(exportedAtMs);
  const statementTxt = buildDisclosureEvidenceStatement(flagged, {
    liveId,
    watchUrl,
    broadcastTitle: meta.broadcastTitle,
    exportedAtJst
  });

  /** @type {Record<string, string>} */
  const fileHashes = {
    csv: await computeSha256HexUtf8(csv),
    rowsJson: await computeSha256HexUtf8(rowsJson),
    statementTxt: await computeSha256HexUtf8(statementTxt)
  };

  const readme = buildDisclosureEvidenceReadme({
    liveId,
    watchUrl,
    flaggedCommentCount: flagged.length,
    exportedAtJst,
    exportId,
    fileHashes
  });
  fileHashes.readme = await computeSha256HexUtf8(readme);

  const manifestJson = buildDisclosureEvidenceManifest({
    ...meta,
    exportId,
    liveId,
    watchUrl,
    exportedAtMs,
    flaggedCommentCount: flagged.length,
    fileHashes,
    recordWindow: {
      firstCommentAtJst: formatDisclosureTimestampJst(firstAt),
      lastCommentAtJst: formatDisclosureTimestampJst(lastAt)
    }
  });
  fileHashes.manifest = await computeSha256HexUtf8(manifestJson);

  return {
    exportId,
    csv,
    rowsJson,
    statementTxt,
    manifestJson,
    readme,
    flaggedCount: flagged.length,
    exportedAtMs,
    fileHashes
  };
}
