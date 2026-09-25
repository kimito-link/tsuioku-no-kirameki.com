#!/usr/bin/env node
/**
 * council-daily.mjs — 会議ハーネスの日課を1本にまとめる（2026-09-16 新設）
 *
 * ★何のために在るか
 *  会議を「最新版にする」作業は、実体が「scoutを回す → 日報を読む → 異常なら判断する」の
 *  繰り返しだった。前半（実行と異常判定）は定型なので他の頭脳（grok等）へ投げられる。
 *  後半（撤去するか・weightを動かすか）は判断なので投げてはいけない。
 *  **この境界をコードに埋め込む**のがこのスクリプトの役目。
 *
 * ★なぜ「全部おまかせ」にしないか（2026-09-16 に実際に踏みかけた）
 *  この日、CF勢6体が毎回 401 で落ちていた。紛らわしかったのは、トークンが
 *  /user/tokens/verify で **active** と出てゾーン一覧も200だったこと。「生きている」と
 *  誤認しやすく、機能別に叩いて初めて Workers AI だけ401と判明した。
 *  さらに真因は権限不足ではなく **環境変数の取り違え**（正しい CF_WORKERS_AI_TOKEN が
 *  最初から存在していた）。ここを自動化すると「トークン再発行」「CF勢6体撤去」という
 *  **間違った修理を自動実行する**。だから判断は必ず司令塔へ戻す。
 *
 * 使い方:
 *   node scripts/council-daily.mjs            # 日課を実行して handoff.md を更新
 *   node scripts/council-daily.mjs --dry-run  # 何もせず、やる内容だけ表示
 *
 * 他の頭脳へ投げるとき（正本: web-ios-android/docs/ai-workflows/MULTI-BRAIN-HOWTO.md §1b）:
 *   python ../web-ios-android/docs/ai-workflows/tools/dispatch.py --brain grok \
 *     --cwd "<このリポの絶対パス>" "node scripts/council-daily.mjs を実行し、出力の指示に従う"
 *
 * ★安全性の設計（fail-closed）
 *  - LINEUP / roleOf / weightOf を **書き換えない**。読むだけ。
 *  - 書き込むのは handoff.md と council-scout/ の生成物だけ。
 *  - 判断が要る事象を見つけたら NEEDS_JUDGMENT を立てて **exit 2 で止まる**（勝手に直さない）。
 *  - 異常ゼロの日も「異常なし」と明記して終わる（無言だと計器の死と区別できない）。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { todayJst } from './lib/today-jst.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');

// ★2026-09-26 修正（毎日必ず再発する時刻依存バグ）:
//  従来は `new Date().toISOString().slice(0,10)` ＝ **UTC の日付**だったが、
//  日報を書く scout-models.mjs は JST の日付でファイル名を決める。この不一致により
//  **JST 09:00 より前（UTC 15:00〜24:00）に回すと、daily は前日のファイル名を探して
//  「日報が見つからない」と誤判定**していた（exit 2 で止まる＝偽の赤）。
//  実測（2026-09-26 UTC 20:37）: daily=2026-09-25 / scout=2026-09-26。
//  日付の正本は scripts/lib/today-jst.mjs に一本化した（各所で自前計算しない）。
const today = todayJst();

const say = (m) => console.log(m);
const run = (cmd, args) => execFileSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 900000 });

/** 判断が要る事象。ここに挙がったら自動で直さず司令塔へ戻す。 */
const judgments = [];
/** 定型作業としてやったこと。 */
const done = [];

// ── 0. 前提: 古いブランチで回すと監視stateが汚染される（2026-08-21 の実事故）────
//    LINEUP件数が master と食い違う状態で scout を回すと、撤去済みモデルに
//    「消滅カウント」が入り、存在しないモデルの警告を永久に鳴らし続ける。
let branch = '';
try { branch = run('git', ['branch', '--show-current']).trim(); } catch { /* 取れなければ空 */ }
const countLineup = (src) => (src.match(/^ {2}\{ label:/gm) || []).length;
const lineupHere = countLineup(readFileSync(join(REPO_ROOT, 'scripts/council-lineup.mjs'), 'utf8'));
let lineupMaster = lineupHere;
try { lineupMaster = countLineup(run('git', ['show', 'master:scripts/council-lineup.mjs'])); } catch { /* master無し */ }

say(`[前提] branch=${branch || '(不明)'} / LINEUP=${lineupHere}体（master=${lineupMaster}体）`);
if (lineupHere !== lineupMaster) {
  judgments.push(
    `作業ツリーのLINEUP(${lineupHere}体)がmaster(${lineupMaster}体)と不一致。`
    + `この状態でscoutを回すと監視stateが汚染される（2026-08-21の実事故）。master相当のツリーで回し直すこと。`
  );
  say('[前提] ★中止: LINEUPがmasterと不一致。scoutは回さない（state汚染を防ぐ）。');
}

// ── 1. env の充足確認 ───────────────────────────────────────
//    欠けていると該当メンバーが無言で落ちる（2026-08-25の実事故＝16体中12体で半月）
if (!judgments.length) {
  try {
    const envOut = run('node', ['scripts/council-env.mjs']);
    const m = envOut.match(/有効\s*(\d+)\s*\/\s*(\d+)\s*体/);
    if (m && m[1] !== m[2]) {
      judgments.push(
        `env欠落で ${m[1]}/${m[2]}体しか会議に出られない。\`node scripts/council-env.mjs\` で欠落envと落ちるメンバーが判る。`
        + `★2026-09-16の実例: Workers AIは CF_WORKERS_AI_TOKEN が正で、CLOUDFLARE_API_TOKEN（ゾーンDNS用）だと401。`
        + `キーの値より先に**変数名の取り違え**を疑う。`
      );
      say(`[env] ★判断必要: 有効 ${m[1]}/${m[2]}体`);
    } else if (m) {
      done.push(`env充足を確認（有効 ${m[1]}/${m[2]}体）`);
      say(`[env] 有効 ${m[1]}/${m[2]}体（欠落なし）`);
    }
  } catch (e) {
    judgments.push(`council-env.mjs が失敗: ${String(e.message || e).slice(0, 140)}`);
  }
}

// ── 2. scout を回す（定型作業。他の頭脳に任せてよい部分）──────────
let briefPath = '';
if (!judgments.length) {
  if (DRY) {
    say('[scout] --dry-run のため実行しない');
  } else {
    try {
      // ★scout は完了メッセージを **stderr** に出す。execFileSync の戻り値は stdout だけなので
      //  `run()` では日報名が取れず、**異常判定が丸ごとスキップされて偽の緑になる**
      //  （2026-09-16 実装直後に踏んだ。「異常なし」と出たのに疎通不能3件を見落としていた）。
      //  stdio:'pipe' + stderr を明示的に読む。
      const r = execFileSync('node', ['scripts/scout-models.mjs'], {
        cwd: REPO_ROOT, encoding: 'utf8', timeout: 900000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      briefPath = '';
      // 生成物の実在から日報を特定する（出力の書式に依存しない方が壊れにくい）
      const todayBrief = join(REPO_ROOT, 'council-scout/briefs', `${today}.md`);
      if (existsSync(todayBrief)) briefPath = todayBrief;
      else {
        const m = String(r || '').match(/briefs[/\\]([\d-]+\.md)/);
        if (m) briefPath = join(REPO_ROOT, 'council-scout/briefs', m[1]);
      }
      if (!briefPath) {
        judgments.push('scoutは終了したが日報が見つからない（生成に失敗した可能性）。council-scout/briefs/ を確認すること。');
      } else {
        done.push(`scoutを実行（日報: ${today}.md）`);
      }
      say(`[scout] 完了 ${briefPath ? today + '.md' : '(日報不明)'}`);
    } catch (e) {
      judgments.push(`scoutの実行が失敗: ${String(e.message || e).slice(0, 180)}`);
    }
  }
}

// ── 3. 日報の異常を判定する（読むだけ・直さない）──────────────────
//    ★ここが「安全な定型」と「判断が要る」の境界。
//    既に確定している判別ルールだけを機械適用し、それ以外は全部 judgments へ送る。
if (briefPath && existsSync(briefPath)) {
  const brief = readFileSync(briefPath, 'utf8');
  const warnLines = brief.split('\n').filter((l) => /^-\s*⚠/.test(l));

  // (a) 認証エラー = 待っても直らない。変数名の取り違えを最初に疑う（今日の真因）。
  for (const line of warnLines.filter((l) => /認証エラー/.test(l))) {
    judgments.push(
      `認証エラー: ${line.replace(/^-\s*⚠\s*/, '').slice(0, 100)}`
      + ` → キーの値より先に**変数名の取り違え**を疑う（2026-09-16の真因）。`
    );
  }

  // (b) 有料化 = 撤去対象だが、撤去そのものは判断なので戻す。
  for (const line of warnLines.filter((l) => /有料化/.test(l))) {
    judgments.push(`有料化で無料枠から外れた: ${line.replace(/^-\s*⚠\s*/, '').slice(0, 100)} → 撤去と後継の検討が必要。`);
  }

  // (c) 疎通不能(429系) = 撤去条件（2026-08-31コード化: 全モデル429/カタログ消滅/課金要求）に
  //     非該当なら据え置き。日数が伸びること自体は新情報ではない＝毎日同じ警告が出るのは正常。
  const stalled = warnLines.filter((l) => /疎通不能/.test(l));
  if (stalled.length) {
    done.push(
      `疎通不能の警告${stalled.length}件は据え置き`
      + `（撤去条件=全モデル429/カタログ消滅/課金要求のいずれにも非該当。日数が伸びるのは新情報ではない）`
    );
    say(`[日報] 疎通不能 ${stalled.length}件 → 既知・据え置き`);
  }

  // (d) 新着候補 = 採否は必ず判断。実測を経ずに採用してはならない。
  const cand = brief.match(/## 新着候補[^\n]*\n([\s\S]*?)(?=\n## )/);
  if (cand && !/候補なし/.test(cand[1])) {
    const rows = (cand[1].match(/^\|/gm) || []).length - 2; // ヘッダ2行を除く
    if (rows > 0) {
      judgments.push(
        `新着候補が ${rows}件。採否は実測が必要（本番と同じエンドポイント・2並列200 OK・usage.cost=0・`
        + `統括プロンプトで**実際に仕事をするか本文で確認**）。`
        + `★速いだけで採ると「メタ返答しかしないモデル」を掴む（2026-09-09の実例）。`
      );
    }
  }

  // (e) 実会議の失敗率 = 単発と並列を区別する。並列のみの過負荷は撤去理由にならない。
  const perf = brief.match(/## 実会議の成績[^\n]*\n([\s\S]*?)(?=\n※)/);
  if (perf) {
    for (const row of perf[1].split('\n')) {
      const m = row.match(/^\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)%/);
      if (!m) continue;
      const [, label, n, , rate] = m;
      if (Number(rate) >= 50 && Number(n) >= 10) {
        judgments.push(
          `${label.trim()} が発言${n}回で失敗率${rate}%（撤去の目安に到達）。`
          + `ただし**単発プローブで生きているかを先に測る**。並列時のみの503は撤去理由にならない（2026-09-16の実例）。`
        );
      }
    }
  }

  // (f) カタログ取得の失敗 = 情報が無いだけで「変化なし」ではない
  for (const f of brief.match(/- ⚠ \w+: HTTP \d+/g) || []) {
    judgments.push(`${f.replace(/^- ⚠ /, '')} でカタログが取れていない（＝情報無し。変化なしの意味ではない）。トークン権限を疑う。`);
  }
}

// ── 4. handoff.md を書く ───────────────────────────────────
//    別PC・別AI・次セッションが再調査せずに続けられる形にする。
//    正本: web-ios-android/CLAUDE.md「デスクトップ／ノートPC・複数AI共通の開発継続ルール」
const status = judgments.length ? 'ブロック中' : '完了';
const nextAction = judgments.length
  ? '下の NEEDS_JUDGMENT を司令塔（Claude本体）が判断する。**自動で直さないこと。**'
  : '異常なし。次回の日課まで何もしない。';

const body = `# Handoff — 会議ハーネスの日課

STATUS: ${status}
ROOT_CAUSE: ${judgments.length ? '下記 NEEDS_JUDGMENT を参照（未判断）' : '－（異常なし）'}
FILES_CHANGED: ${DRY ? '－（dry-run）' : `council-scout/state.json, council-scout/briefs/${today}.md（いずれも生成物）`}
CHANGES: ${done.length ? done.join(' / ') : '－'}
TESTS_RUN: node scripts/council-env.mjs${DRY ? '' : ' / node scripts/scout-models.mjs'}
TEST_RESULT: ${judgments.length ? '異常あり（判断待ち）' : '異常なし'}
REMAINING_RISKS: ${judgments.length ? `${judgments.length}件の未判断事象` : 'なし'}
NEXT_ACTION: ${nextAction}
LAST_WORKED_ON: ${today}
WORKED_BY: council-daily.mjs（実行者: ${process.env.COUNCIL_DAILY_BY || 'unknown'}）
MACHINE_NOTES: -

## NEEDS_JUDGMENT（司令塔が判断する。ここを自動で直してはいけない）

${judgments.length ? judgments.map((j, i) => `${i + 1}. ${j}`).join('\n') : '（なし）'}

## この日課がやること・やらないこと

**やる**: env充足の確認 / scoutの実行 / 日報の異常判定 / この handoff.md の更新。

**やらない**: LINEUPの追加・撤去 / weightの変更 / roleOfの編集 / トークンの再発行。
これらは「トークンは有効なのにWorkers AIだけ401」のような紛らわしい状態の切り分けを伴い、
自動化すると**間違った修理を自動実行する**（2026-09-16に実際に踏みかけた）。

正本: \`scripts/council-daily.mjs\` の冒頭コメント / \`web-ios-android/docs/ai-workflows/MULTI-BRAIN-HOWTO.md\`
`;

if (DRY) {
  say('\n──── --dry-run: handoff.md に書く内容 ────');
  say(body);
} else {
  writeFileSync(join(REPO_ROOT, 'handoff.md'), body, 'utf8');
  say(`\n[handoff] 更新: ${join(REPO_ROOT, 'handoff.md')}`);
}

// ── 5. 終了コード: 判断が必要なら非0で止める（fail-closed）────────
//    他の頭脳から呼んだとき「緑なら何もしなくてよい」が機械的に分かる。
say('');
if (judgments.length) {
  say(`★司令塔の判断が必要: ${judgments.length}件`);
  judgments.forEach((j, i) => say(`  ${i + 1}. ${j}`));
  say('\n→ handoff.md を読んで Claude 本体に引き継ぐこと。自動で直さない。');
  process.exit(2);
}
say('異常なし。会議は最新版の状態。');
process.exit(0);
