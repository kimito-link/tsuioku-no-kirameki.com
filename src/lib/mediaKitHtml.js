/**
 * 追憶メディアキットの共有用 single-file HTML。
 * chrome.* / DOM に依存せず、外部リソースも参照しない。
 */

import { escapeHtml, escapeAttr } from '../shared/html/escape.js';
import { comeviewAnonLabel } from './comeviewUserNotes.js';
import { deriveAvatarUrlFromUid } from './deriveAvatarUrlFromUid.js';

const RASTER_DATA_URL_RE = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

/** @param {unknown} value */
function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** @param {unknown} value */
function formatInteger(value) {
  const n = finiteNumber(value);
  return n == null ? '-' : Math.round(n).toLocaleString('ja-JP');
}

/** @param {unknown} value */
function formatDecimal(value, digits = 1) {
  const n = finiteNumber(value);
  if (n == null) return '-';
  return n.toLocaleString('ja-JP', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : digits,
    maximumFractionDigits: digits
  });
}

/** @param {unknown} value */
function formatSignedInteger(value) {
  const n = finiteNumber(value);
  if (n == null) return '-';
  const rounded = Math.round(n);
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('ja-JP')}`;
}

/** @param {unknown} visitors */
function formatVisitors(visitors) {
  if (!visitors || typeof visitors !== 'object') return '-';
  const record = /** @type {{ total?: unknown, average?: unknown }} */ (visitors);
  const total = finiteNumber(record.total);
  const average = finiteNumber(record.average);
  if (total == null && average == null) return '-';
  return `累計 ${formatInteger(total)} / 配信平均 ${formatDecimal(average)}`;
}

/** @param {unknown} points @param {unknown} count */
function formatGifts(points, count) {
  const p = finiteNumber(points);
  const c = finiteNumber(count);
  if (p == null && c == null) return '-';
  return `${formatInteger(p)} pt / ${formatInteger(c)} 件`;
}

/** @param {unknown} value */
function formatChatRate(value) {
  return finiteNumber(value) == null ? '-' : `${formatDecimal(value)} 件/分`;
}

/** @param {unknown} value */
function formatFrequency(value) {
  return finiteNumber(value) == null ? '-' : `週 ${formatDecimal(value)} 回配信`;
}

/** @param {unknown} value */
function formatPeople(value) {
  return finiteNumber(value) == null ? '-' : `${formatInteger(value)} 人`;
}

/** @param {unknown} value */
function formatGeneratedAt(value) {
  const n = finiteNumber(value);
  if (n == null || n <= 0) return '-';
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(n));
  } catch {
    return '-';
  }
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
function safeRasterDataUrl(raw) {
  const value = String(raw ?? '').trim();
  return RASTER_DATA_URL_RE.test(value) ? value : '';
}

/** CSP の img-src で許可している公式CDNのみ(それ以外のURLは頭文字にフォールバック)。 */
const REMOTE_ICON_RE = /^https:\/\/secure-dcdn\.cdn\.nimg\.jp\/[^\s"'<>]+$/i;

/**
 * v0.1.682: 配信者アイコンは data URL(あれば) > 公式CDNのhttps URL直接参照 > 頭文字。
 * 拡張側での fetch(CORS エラーの原因)はやめ、応援者サムネと同じ img 直接参照に統一。
 * @param {{ name?: unknown, iconUrl?: unknown }} broadcaster
 * @param {unknown} iconDataUrl
 */
function broadcasterAvatarHtml(broadcaster, iconDataUrl) {
  const embedded = safeRasterDataUrl(iconDataUrl || broadcaster?.iconUrl);
  const name = String(broadcaster?.name ?? '').trim();
  if (embedded) {
    return `<img class="avatar" src="${escapeAttr(embedded)}" alt="" width="88" height="88">`;
  }
  const remote = String(broadcaster?.iconUrl ?? '').trim();
  if (REMOTE_ICON_RE.test(remote)) {
    return `<img class="avatar" src="${escapeAttr(remote)}" alt="" width="88" height="88" loading="lazy">`;
  }
  const initial = Array.from(name || '配')[0] || '配';
  return `<div class="avatar avatar--fallback" aria-hidden="true">${escapeHtml(initial)}</div>`;
}

/**
 * PR4「応援者が主役」: 応援者の表示名(個人名 > 匿名NNN > ID)。
 * @param {{ userId?: unknown, name?: unknown }} entry
 */
function supporterDisplayName(entry) {
  const name = String(entry?.name ?? '').trim();
  if (name) return name;
  const uid = String(entry?.userId ?? '').trim();
  const anon = comeviewAnonLabel(uid);
  if (anon) return anon;
  return uid ? `ID:${uid}` : '応援者';
}

/**
 * 応援者サムネ: 記名uidは公式確定パターンURL(CSPで当該CDNのみ許可)・匿名は頭文字丸。
 * @param {{ userId?: unknown }} entry
 * @param {string} displayName
 */
function supporterAvatarHtml(entry, displayName) {
  const uid = String(entry?.userId ?? '').trim();
  const url = deriveAvatarUrlFromUid(uid);
  if (url) {
    return `<img class="s-avatar" src="${escapeAttr(url)}" alt="" width="40" height="40" loading="lazy">`;
  }
  const initial = Array.from(displayName || '応')[0] || '応';
  return `<span class="s-avatar s-avatar--fallback" aria-hidden="true">${escapeHtml(initial)}</span>`;
}

const SUPPORTER_MEDALS = ['🥇', '🥈', '🥉'];

/**
 * @param {Array<Record<string, unknown>>} entries
 * @param {(entry: Record<string, unknown>) => string} valueLabel
 */
function supporterListHtml(entries, valueLabel) {
  if (!entries.length) {
    return '<p class="s-empty">この期間の記録はまだありません</p>';
  }
  return `<ol class="s-list">${entries
    .map((entry, index) => {
      const displayName = supporterDisplayName(entry);
      const medal = SUPPORTER_MEDALS[index] || `${index + 1}`;
      return (
        `<li class="s-row">` +
        `<span class="s-rank">${escapeHtml(medal)}</span>` +
        supporterAvatarHtml(entry, displayName) +
        `<span class="s-name">${escapeHtml(displayName)}</span>` +
        `<span class="s-value">${escapeHtml(valueLabel(entry))}</span>` +
        `</li>`
      );
    })
    .join('')}</ol>`;
}

/**
 * 「この配信を支えた応援者たち」セクション(表彰トーン)。supporters が無ければ空文字。
 * @param {unknown} supportersRaw
 */
function supportersSectionHtml(supportersRaw) {
  if (!supportersRaw || typeof supportersRaw !== 'object') return '';
  const supporters = /** @type {{ giftTop?: unknown, commentTop?: unknown, regulars?: unknown }} */ (
    supportersRaw
  );
  const giftTop = Array.isArray(supporters.giftTop) ? supporters.giftTop : [];
  const commentTop = Array.isArray(supporters.commentTop) ? supporters.commentTop : [];
  const regulars =
    supporters.regulars && typeof supporters.regulars === 'object'
      ? /** @type {{ sampledLives?: unknown, supporters?: unknown, regulars?: unknown, ratio?: unknown }} */ (
          supporters.regulars
        )
      : null;
  if (!giftTop.length && !commentTop.length) return '';

  const ratio = regulars ? finiteNumber(regulars.ratio) : null;
  const regularsLine = regulars
    ? `<p class="s-regulars">🔁 常連さん(2配信以上): <strong>${formatInteger(
        regulars.regulars
      )}人</strong> / 集計できた応援者 ${formatInteger(regulars.supporters)}人${
        ratio != null ? `(${formatDecimal(ratio * 100, 0)}%)` : ''
      }・直近${formatInteger(regulars.sampledLives)}配信のコメントから</p>`
    : '';

  return `
      <section class="supporters">
        <h2>この配信を支えた応援者たち</h2>
        <p class="s-lead">配信の熱量をつくっているのは応援者のみなさんです。ニコ生上で公開されている応援(コメント・ギフト)の記録から表彰します。</p>
        <div class="s-grid">
          <div class="s-col">
            <h3>🎁 ギフト応援</h3>
            ${supporterListHtml(giftTop, (entry) => `${formatInteger(entry.points)} pt・${formatInteger(entry.count)} 件`)}
          </div>
          <div class="s-col">
            <h3>💬 コメント応援</h3>
            ${supporterListHtml(commentTop, (entry) => `${formatInteger(entry.count)} 件・${formatInteger(entry.liveCount)} 配信`)}
          </div>
        </div>
        ${regularsLine}
      </section>`;
}

/**
 * @param {Array<Record<string, unknown>>} windows
 * @param {(window: Record<string, unknown>) => string} formatter
 */
function metricCells(windows, formatter) {
  return windows
    .map((window) => `<td>${escapeHtml(formatter(window))}</td>`)
    .join('');
}

/**
 * @param {{
 *   windows?: Array<Record<string, unknown>>,
 *   broadcaster?: { name?: unknown, userId?: unknown, iconUrl?: unknown }
 * }} stats
 * @param {{
 *   generatedAtMs?: number,
 *   broadcasterIconDataUrl?: string,
 *   sourceLiveLimit?: number,
 *   sourceLiveLimitReached?: boolean
 * }} [options]
 * @returns {string}
 */
export function buildMediaKitHtml(stats, options = {}) {
  const windows = Array.isArray(stats?.windows) ? stats.windows : [];
  const broadcaster =
    stats?.broadcaster && typeof stats.broadcaster === 'object'
      ? stats.broadcaster
      : {};
  const broadcasterName = String(broadcaster.name ?? '').trim() || '配信者名 未取得';
  const broadcasterUserId = String(broadcaster.userId ?? '').trim();
  const generatedAtMs =
    finiteNumber(options.generatedAtMs) && Number(options.generatedAtMs) > 0
      ? Number(options.generatedAtMs)
      : Date.now();
  const sourceLiveLimit = Math.max(1, Math.floor(finiteNumber(options.sourceLiveLimit) || 60));
  const sourceLiveLimitReached = options.sourceLiveLimitReached === true;

  /** @type {Array<[string, (window: Record<string, unknown>) => string]>} */
  const metricSpecs = [
    ['フォロワー数', (window) => formatInteger(window.followers)],
    ['獲得フォロワー数', (window) => formatSignedInteger(window.followersGained)],
    ['平均同時視聴者数', (window) => formatDecimal(window.avgConcurrent)],
    ['最大同時視聴者数', (window) => formatInteger(window.maxConcurrent)],
    ['来場者数', (window) => formatVisitors(window.visitors)],
    ['コメント数（累計）', (window) => formatInteger(window.comments)],
    ['チャット率', (window) => formatChatRate(window.chatRatePerMin)],
    ['応援者数（ユニーク目安）', (window) => formatPeople(window.uniqueSupporters)],
    ['ギフト（累計）', (window) => formatGifts(window.giftPoints, window.giftCount)],
    ['配信頻度', (window) => formatFrequency(window.broadcastsPerWeek)],
    ['集計配信数', (window) => formatInteger(window.liveCount)]
  ];
  const metricRows = metricSpecs
    .map(
      ([label, formatter]) =>
        `<tr><th scope="row">${escapeHtml(label)}</th>${metricCells(
          windows,
          /** @type {(window: Record<string, unknown>) => string} */ (formatter)
        )}</tr>`
    )
    .join('\n');

  const limitNote = sourceLiveLimitReached
    ? `保存履歴が多いため、新しい順に最大${sourceLiveLimit}枠を集計しています。`
    : `処理負荷を抑えるため、集計対象は新しい順に最大${sourceLiveLimit}枠です。`;

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https://secure-dcdn.cdn.nimg.jp; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(broadcasterName)} - 追憶メディアキット</title>
  <style>
    :root {
      color-scheme: light;
      --nl-accent: #0f8fd8;
      --nl-accent-soft: #e8f5fc;
      --nl-ink: #152033;
      --nl-sub: #5f6b7a;
      --nl-line: #dce3ea;
      --nl-panel: #f7f9fb;
      --nl-success: #117a50;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #eef2f6;
      color: var(--nl-ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", sans-serif;
      line-height: 1.6;
    }
    main {
      width: min(1080px, calc(100% - 32px));
      margin: 32px auto;
      background: #fff;
      border: 1px solid var(--nl-line);
      border-radius: 18px;
      box-shadow: 0 16px 40px rgb(25 45 70 / 10%);
      overflow: hidden;
    }
    header {
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 30px;
      border-bottom: 1px solid var(--nl-line);
      background: linear-gradient(135deg, #fff 55%, var(--nl-accent-soft));
    }
    .avatar {
      flex: 0 0 88px;
      width: 88px;
      height: 88px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid #fff;
      box-shadow: 0 0 0 1px var(--nl-line);
      background: var(--nl-accent-soft);
    }
    .avatar--fallback {
      display: grid;
      place-items: center;
      color: var(--nl-accent);
      font-size: 34px;
      font-weight: 800;
    }
    .eyebrow {
      margin: 0 0 4px;
      color: var(--nl-accent);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    h1 { margin: 0; font-size: clamp(26px, 5vw, 42px); line-height: 1.25; }
    .identity { margin: 4px 0 0; color: var(--nl-sub); overflow-wrap: anywhere; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      margin-top: 12px;
      padding: 6px 11px;
      border: 1px solid #a8dcc8;
      border-radius: 999px;
      background: #effaf6;
      color: var(--nl-success);
      font-size: 13px;
      font-weight: 800;
    }
    .content { padding: 28px 30px 34px; }
    .lead { margin: 0 0 18px; color: var(--nl-sub); }
    .table-wrap { overflow-x: auto; border: 1px solid var(--nl-line); border-radius: 14px; }
    table { width: 100%; border-collapse: collapse; min-width: 720px; }
    th, td { padding: 14px 16px; border-bottom: 1px solid var(--nl-line); text-align: right; }
    thead th {
      background: var(--nl-panel);
      color: #364255;
      font-size: 13px;
      letter-spacing: .04em;
    }
    thead th:first-child, tbody th { text-align: left; }
    tbody th { width: 31%; background: #fbfcfd; font-weight: 700; }
    tbody td { font-variant-numeric: tabular-nums; font-weight: 700; white-space: nowrap; }
    tbody tr:last-child th, tbody tr:last-child td { border-bottom: 0; }
    .sources {
      margin-top: 24px;
      padding: 20px 22px;
      border-radius: 14px;
      background: var(--nl-panel);
      color: var(--nl-sub);
      font-size: 13px;
    }
    .sources h2 { margin: 0 0 8px; color: var(--nl-ink); font-size: 16px; }
    .sources p { margin: 0 0 8px; }
    .sources ul { margin: 8px 0 0; padding-left: 1.4em; }
    .generated { margin: 18px 0 0; color: var(--nl-sub); font-size: 12px; text-align: right; }
    .supporters { margin-top: 28px; }
    .supporters h2 { margin: 0 0 6px; font-size: 20px; }
    .s-lead { margin: 0 0 14px; color: var(--nl-sub); font-size: 13.5px; }
    .s-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .s-col { border: 1px solid var(--nl-line); border-radius: 14px; padding: 16px 18px; background: #fff; }
    .s-col h3 { margin: 0 0 10px; font-size: 15px; }
    .s-list { list-style: none; margin: 0; padding: 0; }
    .s-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px dashed var(--nl-line); }
    .s-row:last-child { border-bottom: 0; }
    .s-rank { flex: 0 0 1.8em; text-align: center; font-weight: 800; color: var(--nl-sub); }
    .s-avatar { flex: 0 0 40px; width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: var(--nl-accent-soft); border: 1px solid var(--nl-line); }
    .s-avatar--fallback { display: grid; place-items: center; color: var(--nl-accent); font-weight: 800; font-size: 17px; }
    .s-name { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
    .s-value { flex: 0 0 auto; font-variant-numeric: tabular-nums; color: var(--nl-sub); font-weight: 700; font-size: 13px; }
    .s-empty { margin: 0; color: var(--nl-sub); font-size: 13px; }
    .s-regulars { margin: 14px 2px 0; color: var(--nl-sub); font-size: 13.5px; }
    @media (max-width: 640px) {
      main { width: 100%; margin: 0; border: 0; border-radius: 0; }
      header { align-items: flex-start; padding: 22px 18px; }
      .avatar { flex-basis: 68px; width: 68px; height: 68px; }
      .content { padding: 22px 16px 28px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      ${broadcasterAvatarHtml(broadcaster, options.broadcasterIconDataUrl)}
      <div>
        <p class="eyebrow">追憶メディアキット</p>
        <h1>${escapeHtml(broadcasterName)}</h1>
        <p class="identity">${broadcasterUserId ? `ニコニコユーザーID: ${escapeHtml(broadcasterUserId)}` : 'ニコニコユーザーID: -'}</p>
        <span class="badge" aria-label="追憶のきらめきが記録した実測統計">✓ 追憶のきらめき 実測統計</span>
      </div>
    </header>
    <section class="content">
      <p class="lead">配信実績を30日・60日・90日の期間で比較できる、共有用の統計資料です。</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">指標</th>
              ${windows.map((window) => `<th scope="col">過去${escapeHtml(formatInteger(window.days))}日</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${metricRows}
          </tbody>
        </table>
      </div>
      ${supportersSectionHtml(/** @type {any} */ (stats)?.supporters)}
      <aside class="sources">
        <h2>データの出所</h2>
        <p><strong>以下の統計データは、追憶のきらめきが配信中にこのPCへ記録した公式値・実測値です。</strong></p>
        <ul>
          <li>フォロワー数は、ニコニコの公開プロフィールから配信時に取得したスナップショットです。</li>
          <li>来場者数とコメント数は公式表示値を優先し、未取得時のみこのPCの実測値で補います。</li>
          <li>同時視聴者数は配信中サンプルの推定値です。公式の同時接続数ではありません。</li>
          <li>チャット率は記録できたコメント数と、最初・最後のサンプル間の推定配信時間から算出します。</li>
          <li>応援者数は各配信で確認できた既知コメント投稿者数の最大値で、期間全体の厳密なユニーク人数ではありません。</li>
          <li>ギフトはこのPCに保存されたギフトイベントのポイント合計と件数です。</li>
          <li>${escapeHtml(limitNote)}</li>
          <li>応援者の表彰は、ニコ生上で公開されているコメント・ギフト情報(オープンデータ)の集計です。コメント応援と常連の集計は処理負荷を抑えるため直近の配信に限っています。</li>
        </ul>
      </aside>
      <p class="generated">生成日時: ${escapeHtml(formatGeneratedAt(generatedAtMs))}（日本時間）</p>
    </section>
  </main>
</body>
</html>`;
}
