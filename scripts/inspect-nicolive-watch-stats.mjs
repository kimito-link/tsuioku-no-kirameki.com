#!/usr/bin/env node
/**
 * ニコ生 watch ページの HTML から、来場・同接まわりの数値がどう埋め込まれているかを CLI で確認する。
 *
 * 使い方:
 *   node scripts/inspect-nicolive-watch-stats.mjs lv123456789
 *   node scripts/inspect-nicolive-watch-stats.mjs https://live.nicovideo.jp/watch/lv123456789
 *   node scripts/inspect-nicolive-watch-stats.mjs --interval 15 lv123456789   # 15 秒ごとに再取得
 *
 * 注意:
 * - 取得できるのは「初期 HTML / embedded-data」中心です。視聴セッション WebSocket の生メッセージは
 *   ブラウザの DevTools → Network → WS、または拡張の page-intercept 経由で見る必要があります。
 * - ログイン状態で見えている数値と、未ログイン fetch では差が出ることがあります。
 */

const UA_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function usage() {
  console.error(`使い方:
  node scripts/inspect-nicolive-watch-stats.mjs <lv... または watch URL>
  node scripts/inspect-nicolive-watch-stats.mjs --interval 15 <lv...>

環境変数:
  NICOLIVE_COOKIE  任意。ログイン済み Cookie ヘッダ用（例: user_session=...）
`);
}

function normalizeWatchUrl(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (/^lv\d+$/i.test(s)) {
    return `https://live.nicovideo.jp/watch/${s.toLowerCase()}`;
  }
  if (s.startsWith('http://') || s.startsWith('https://')) {
    try {
      const u = new URL(s);
      if (!u.hostname.includes('nicovideo.jp')) return null;
      return u.toString();
    } catch {
      return null;
    }
  }
  return null;
}

/** @param {string} html @param {string} marker */
function extractQuotedAttrAfterMarker(html, marker) {
  const start = html.indexOf(marker);
  if (start === -1) return null;
  let i = start + marker.length;
  let acc = '';
  for (; i < html.length; i += 1) {
    if (html.startsWith('&quot;', i)) {
      acc += '"';
      i += '&quot;'.length - 1;
      continue;
    }
    if (html.startsWith('&amp;', i)) {
      acc += '&';
      i += '&amp;'.length - 1;
      continue;
    }
    if (html.startsWith('&#39;', i)) {
      acc += "'";
      i += '&#39;'.length - 1;
      continue;
    }
    if (html[i] === '"') break;
    acc += html[i];
  }
  return acc;
}

/** @param {string} html */
function tryParseEmbeddedDataProps(html) {
  const idx = html.indexOf('id="embedded-data"');
  if (idx === -1) return { error: 'id="embedded-data" が見つかりません' };
  const chunk = html.slice(idx, idx + 2_500_000);
  const raw = extractQuotedAttrAfterMarker(chunk, 'data-props="');
  if (raw == null) {
    const raw2 = chunk.match(/data-props='([^']*)'/)?.[1];
    if (raw2 == null) return { error: 'data-props を読み取れませんでした' };
    try {
      return { props: JSON.parse(raw2) };
    } catch (e) {
      return { error: `JSON パース失敗 (single-quoted): ${e}` };
    }
  }
  try {
    return { props: JSON.parse(raw) };
  } catch (e) {
    return { error: `JSON パース失敗 (double-quoted): ${e}` };
  }
}

/** @param {unknown} v */
function summarizeNumberLike(v) {
  if (v == null) return String(v);
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^\d+$/.test(v)) return parseInt(v, 10);
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 120);
  return String(v);
}

/**
 * @param {unknown} obj
 * @param {string} prefix
 * @param {string[]} lines
 */
function walkFlatNumbers(obj, prefix, lines, depth = 0) {
  if (depth > 8 || obj == null) return;
  if (typeof obj !== 'object' || Array.isArray(obj)) return;
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'number' && Number.isFinite(v)) {
      lines.push(`  ${p} = ${v}`);
    } else if (typeof v === 'string' && /^\d{1,12}$/.test(v)) {
      lines.push(`  ${p} = "${v}" (数値文字列)`);
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      walkFlatNumbers(v, p, lines, depth + 1);
    }
  }
}

/** @param {string} html */
function regexScanHtml(html) {
  const patterns = [
    ['watchCount', /"watchCount"\s*:\s*(\d+)/g],
    ['watching / watchingCount', /"watching(?:Count)?"\s*:\s*(\d+)/gi],
    ['viewers', /"viewers"\s*:\s*(\d+)/g],
    ['viewerCount', /"viewerCount"\s*:\s*(\d+)/g],
    ['viewCount', /"viewCount"\s*:\s*(\d+)/g],
    ['commentCount', /"commentCount"\s*:\s*(\d+)/g],
    ['comments (JSON key)', /"comments"\s*:\s*(\d+)/g]
  ];
  /** @type {Record<string, Set<string>>} */
  const out = {};
  for (const [label, re] of patterns) {
    const set = new Set();
    let m;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(html)) !== null) {
      set.add(m[1]);
    }
    out[label] = set;
  }
  return out;
}

async function fetchHtml(url, cookieHeader) {
  const headers = {
    'User-Agent': UA_CHROME,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
  };
  if (cookieHeader) headers.Cookie = cookieHeader;
  const res = await fetch(url, { redirect: 'follow', headers });
  const text = await res.text();
  return { ok: res.ok, status: res.status, url: res.url, text };
}

function printReport(html, meta) {
  console.log('\n--- 取得メタ ---');
  console.log(`  finalUrl: ${meta.url}`);
  console.log(`  http: ${meta.status} ok=${meta.ok}`);
  console.log(`  html.length: ${html.length}`);

  console.log('\n--- HTML 正規表現スキャン（重複値は Set でまとめています）---');
  const scan = regexScanHtml(html);
  for (const [label, set] of Object.entries(scan)) {
    const arr = [...set].slice(0, 12);
    console.log(
      `  ${label}: ${arr.length ? arr.join(', ') : '(一致なし)'}${set.size > 12 ? ' …' : ''}`
    );
  }

  console.log('\n--- embedded-data → program.statistics ---');
  const parsed = tryParseEmbeddedDataProps(html);
  if (parsed.error) {
    console.log(`  (失敗) ${parsed.error}`);
    return;
  }
  const stats = parsed.props?.program?.statistics;
  if (!stats || typeof stats !== 'object') {
    console.log('  program.statistics がありません');
    console.log(
      '  program keys:',
      parsed.props?.program && typeof parsed.props.program === 'object'
        ? Object.keys(parsed.props.program).slice(0, 40).join(', ')
        : '(なし)'
    );
    return;
  }
  console.log('  program.statistics (生):');
  console.log(JSON.stringify(stats, null, 2));

  console.log('\n--- program 配下の数値っぽいフィールド（深さ制限あり）---');
  const lines = [];
  walkFlatNumbers(parsed.props.program, 'program', lines);
  lines.sort();
  console.log(lines.join('\n') || '  (なし)');

  const wsUrl = parsed.props?.site?.relive?.webSocketUrl;
  if (typeof wsUrl === 'string' && wsUrl.startsWith('wss://')) {
    console.log('\n--- WebSocket URL（ブラウザまたは wscat で接続確認）---');
    console.log(`  ${wsUrl.slice(0, 120)}${wsUrl.length > 120 ? '…' : ''}`);
  }

  console.log('\n--- 解釈メモ（拡張の現行ロジック）---');
  console.log(
    '  来場者数カード: statistics の watchCount を優先（WS/HTML の watchCount）。'
  );
  console.log(
    '  推定同時の「直接値」: viewers / watching* / viewerCount / viewCount（watchCount は使わない）。'
  );
  console.log(
    '  もし API 上で「同接」と「累計来場」が別キーではなく、どちらも同じオーダーの数なら、カード同士が近い値のままになります。その場合はキー名の再調査が必要です。'
  );
}

async function main() {
  const argv = process.argv.slice(2);
  let intervalSec = 0;
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--interval' && argv[i + 1]) {
      intervalSec = Math.max(5, parseInt(argv[i + 1], 10) || 0);
      i += 1;
    } else {
      rest.push(argv[i]);
    }
  }
  const target = rest[0];
  const url = normalizeWatchUrl(target);
  if (!url) {
    usage();
    process.exit(1);
  }

  const cookie = process.env.NICOLIVE_COOKIE || '';

  const runOnce = async () => {
    const t0 = Date.now();
    console.log(`\n======== ${new Date().toISOString()} 取得開始 ========`);
    try {
      const { ok, status, url: finalUrl, text } = await fetchHtml(url, cookie);
      printReport(text, { ok, status, url: finalUrl });
    } catch (e) {
      console.error('fetch 失敗:', e);
    }
    console.log(`\n経過: ${Date.now() - t0} ms`);
  };

  await runOnce();
  if (intervalSec > 0) {
    console.log(`\n--interval ${intervalSec}s: Ctrl+C で終了`);
    setInterval(runOnce, intervalSec * 1000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
