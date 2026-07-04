/**
 * 状態速報(status.html の「AI共有」全文)を、コピー&貼り付けせずにターミナルへ取得する CLI。
 *
 * 背景(2026-07-04 ユーザー要望「診断コピーを押さなくてもリアルタイムで分かるようにしたい」・
 *   Fable設計): status.html は既に自動publish機構(v0.1.1016)を持っており、視聴中の配信があり
 *   status.html をどこかのタブで開いている間、既定120秒間隔で診断全文(statusReport)を
 *   ユーザー自身のクラウド(app.tsuioku-no-kirameki.com/api/status)へ POST している。
 *   このスクリプトはその GET エンドポイントを叩くだけ=拡張側の変更ゼロ・新規インフラゼロで、
 *   Claude Code が「ユーザーが診断コピーで貼るのとバイト一致のテキスト」を取得できる。
 *
 * 使い方:
 *   npm run status:live              # 1回だけ取得して表示
 *   npm run status:live -- --json    # jsonBlob 全体(parityVerdict 等含む)を表示
 *   npm run status:live -- --watch 20  # 20秒間隔でポーリングし、差分があった行だけ表示
 *
 * 前提: リポジトリ直下の .env に NL_STATUS_VIEW_TOKEN / NL_STATUS_APP_ORIGIN があること
 *   (build.mjs と同じ .env を読む)。status.html がどこかのタブで開かれ、視聴中の配信が
 *   無ければ古いスナップショットのまま=経過秒表示でそれを検知する(嘘をつかない診断の流儀)。
 */

try {
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile();
} catch {
  /* .env が無い/読めない時は無視 */
}

const VIEW_TOKEN = process.env.NL_STATUS_VIEW_TOKEN || '';
const APP_ORIGIN = process.env.NL_STATUS_APP_ORIGIN || 'https://app.tsuioku-no-kirameki.com';

const args = process.argv.slice(2);
const wantsJson = args.includes('--json');
const watchIdx = args.indexOf('--watch');
const watchSec = watchIdx >= 0 ? Math.max(5, Number(args[watchIdx + 1]) || 20) : 0;

if (!VIEW_TOKEN) {
  console.error(
    '❌ NL_STATUS_VIEW_TOKEN が .env にありません。\n' +
      '   リポジトリ直下の .env に NL_STATUS_VIEW_TOKEN=<拡張と同じ値> を設定してください。'
  );
  process.exit(1);
}

/** @returns {Promise<{ ok: boolean, data?: any, error?: string, httpStatus?: number }>} */
async function fetchLatest() {
  const url = `${APP_ORIGIN}/api/status?v=${encodeURIComponent(VIEW_TOKEN)}`;
  try {
    const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    if (res.status === 404) {
      return { ok: false, error: 'まだ何も送信されていません(status.html を開いて視聴中の配信を数秒待つ)' };
    }
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, httpStatus: res.status };
    }
    const json = await res.json();
    if (!json?.ok || !json.data) {
      return { ok: false, error: 'サーバー応答が不正' };
    }
    return { ok: true, data: json.data };
  } catch (e) {
    return { ok: false, error: `fetch失敗: ${e && e.message ? e.message : e}` };
  }
}

/** @param {string} iso @returns {string} */
function agoText(iso) {
  const at = Date.parse(String(iso || ''));
  if (!Number.isFinite(at)) return '不明';
  const sec = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (sec < 60) return `${sec}秒前`;
  if (sec < 3600) return `${Math.round(sec / 60)}分前`;
  return `${Math.round(sec / 3600)}時間前`;
}

/** @param {{ ok: boolean, data?: any, error?: string }} result */
function printOnce(result) {
  if (!result.ok) {
    console.log(`🔴 取得失敗: ${result.error}`);
    return;
  }
  const data = result.data;
  const generatedAt = data?.generatedAt;
  console.log(`── 状態速報(生成: ${agoText(generatedAt)}) ──────────────────────`);
  if (generatedAt) {
    const staleMs = Date.now() - Date.parse(generatedAt);
    if (staleMs > 5 * 60 * 1000) {
      console.log('⚠️ このスナップショットは5分以上古いです(配信終了/status.html未起動の可能性)。');
    }
  }
  if (wantsJson) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  const report = typeof data?.statusReport === 'string' ? data.statusReport : '';
  console.log(report || '(statusReport が空です。--json で全体を確認してください)');
}

/** 2回分のレポートを行単位で突き合わせ、変化した行だけ返す(--watch 用・コンテキスト膨張防止)。 */
function diffLines(prevText, nextText) {
  const prev = new Set(String(prevText || '').split('\n'));
  const next = String(nextText || '').split('\n');
  return next.filter((l) => l.trim() && !prev.has(l));
}

async function main() {
  if (!watchSec) {
    printOnce(await fetchLatest());
    return;
  }
  console.log(`👀 ${watchSec}秒間隔で監視します(Ctrl+Cで終了)。差分行のみ表示します。\n`);
  let prevReport = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await fetchLatest();
    if (!result.ok) {
      console.log(`[${new Date().toLocaleTimeString('ja-JP')}] 🔴 ${result.error}`);
    } else {
      const report = typeof result.data?.statusReport === 'string' ? result.data.statusReport : '';
      const changed = diffLines(prevReport, report);
      if (changed.length) {
        console.log(`[${new Date().toLocaleTimeString('ja-JP')}] 生成${agoText(result.data?.generatedAt)}:`);
        for (const l of changed) console.log(`  ${l}`);
      }
      prevReport = report;
    }
    await new Promise((r) => setTimeout(r, watchSec * 1000));
  }
}

main().catch((e) => {
  console.error('status-live 失敗:', e && e.message ? e.message : e);
  process.exit(1);
});
