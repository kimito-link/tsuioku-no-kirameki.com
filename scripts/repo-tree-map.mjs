// repo-tree-map.mjs
// リポジトリのディレクトリツリー＋各ディレクトリの「役割」を自動生成する(2026-06-18 ユーザー提案)。
//
// 動機: 「このディレクトリは何の担当か(色・速度・コメント・レポート…)」が一目で分かれば、
//   人間も AI も『これどこに置く/どこを直す』を間違えない。AGENTS.md §4(ファイル配置)の視覚版。
//
// 設計(feature-map.mjs と同じ流儀):
//   - ツリーは git 追跡ファイルから自動生成(手書きしない=実体とズレない)。
//   - 各ディレクトリの「役割の一言説明」だけ人間が決める(下の ROLES 辞書)。
//     辞書に無いディレクトリは「未記入」として赤く出る → 足すだけ。推測で埋めない。
//   - 出力 = docs/repo-tree-map.md(AI はテキストで読め・GitHub で diff 追える正本)
//           + docs/repo-tree-map.html(色付き視覚ビュー)。dist には入れない。
//   - `--check`: 再生成して既存と差分が出たら exit 1(verify:cc で腐り検知)。新規依存ゼロ。
//
// 役割辞書の足し方: 新しいディレクトリを作って未記入で赤く出たら、ROLES に1行足す。
//   tags は機能ドメイン(色/速度/コメント/レポート/会場/応援/記録/診断…)を自由語で。

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const OUT_DIR = join(ROOT, 'docs');
const OUT_MD = join(OUT_DIR, 'repo-tree-map.md');
const OUT_HTML = join(OUT_DIR, 'repo-tree-map.html');

/** ツリーに含めるトップレベル(これ以外=ドット系/生成物は除外) */
const MAX_DEPTH = 2; // トップ + 2 階層まで(src/lib/... は src/lib で止める)

/**
 * 役割辞書(人間が決める正本)。key = リポジトリ相対のディレクトリパス。
 * role = 一言の役割。tags = 機能ドメイン(色/速度/コメント/レポート 等の自由語)。
 * 辞書に無いディレクトリは「未記入(要追記)」として出力に赤く出る。
 * @type {Record<string, { role: string, tags?: string[] }>}
 */
const ROLES = {
  'extension': { role: '拡張本体の配布版ソース(ここを編集)。manifest/background/各 html', tags: ['配布', 'manifest'] },
  'extension/images': { role: 'アイコン・ロゴのマスター画像', tags: ['画像'] },
  'extension/dist': { role: 'ビルド成果物(content/popup/status 等の bundle)。build が生成', tags: ['ビルド成果物'] },
  'extension/sound': { role: '読み上げ・完了音などの音声素材', tags: ['音声'] },

  'src': { role: 'LP 側 + 純粋関数ライブラリの源', tags: ['ソース'] },
  'src/lib': { role: '純粋関数ライブラリ(unit test 対象)。色・速度・コメント・レポート等の計算ロジックの大半', tags: ['色', '速度', 'コメント', 'レポート', '純粋関数'] },
  'src/domain': { role: 'ドメイン正本(応援レーンの集約・列ポリシー等。識別子判定など)', tags: ['応援', '集約', '識別子'] },
  'src/extension': { role: 'バンドル entry(content/popup/venue/status/offscreen/backfill-sw 等=機能境界)', tags: ['entry', '記録', '会場', '応援'] },
  'src/shared': { role: '複数機能で共有する小部品(アバター URL ガード等)', tags: ['共有', 'アバター'] },
  'src/data': { role: '保存コメントからレーン候補を読む acquirer / source 層', tags: ['コメント', '取得'] },
  'src/images': { role: 'LP / CWS 提出物のマスター画像', tags: ['画像'] },
  'src/sound': { role: '音声素材(src 側)', tags: ['音声'] },
  'src/fixtures': { role: 'テスト用フィクスチャ', tags: ['テスト'] },

  'tsuioku-no-kirameki': { role: '本番 LP の配信ディレクトリ(Cloudflare Pages へ deploy)', tags: ['LP', '公開'] },
  'tsuioku-no-kirameki/articles': { role: '技術記事(防御的公開)。手法を再利用可能な形で解説', tags: ['記事', '公開'] },
  'tsuioku-no-kirameki/images': { role: 'LP 用の favicon・OG 画像等', tags: ['画像'] },
  'tsuioku-no-kirameki/sound': { role: 'LP 公開用の音声素材(エール音等)', tags: ['音声', '公開'] },

  'docs': { role: '設計正本・マインドマップ・フロー図・feature-map(AI/人間向け)', tags: ['設計', 'レポート'] },
  'docs/feature-map': { role: '機能ごと依存図(自動生成)。誰が storage を書き/読むか', tags: ['依存図', '自動生成'] },
  'docs/article-assets': { role: '記事用の画像・動画・音声アセット', tags: ['記事', '画像'] },
  'docs/policies': { role: '運用方針メモ(統計の失敗モード等)', tags: ['方針'] },
  'docs/releases': { role: 'リリース関連メモ(CWS 公開 API 設定・版ごとの記事下書き)', tags: ['リリース'] },
  'docs/research': { role: 'ディープリサーチ成果(ギフトランキング等の調査)', tags: ['調査', 'レポート'] },
  'docs/workflows': { role: '開発ワークフロー設計(TDD/UI-UX ロードマップ等)', tags: ['ワークフロー'] },

  'council': { role: '会議(COUNCIL)の問い・回答・統合(SYNTHESIS)。設計判断の根拠', tags: ['会議', '設計'] },
  'scripts': { role: 'ビルド・検証・自動生成スクリプト(build/feature-map/repo-tree-map 等)', tags: ['ビルド', '自動生成'] },
  'scripts/xserver': { role: 'Xserver 向け webhook(git pull デプロイ)スクリプト', tags: ['デプロイ', 'webhook'] },
  'tests': { role: 'E2E / contract テスト(layer 依存・描画 spec 等)', tags: ['テスト'] },
  'tests/contract': { role: 'レイヤ依存などアーキテクチャ契約のテスト', tags: ['テスト', '契約'] },
  'tests/e2e': { role: 'Playwright の E2E(描画 spec・クリップ崩れ検出等)', tags: ['テスト', 'E2E', '描画'] },
  'tools': { role: '補助ツール(LP overflow 監査・MCP サーバ等)', tags: ['ツール'] },
  'tools/mcp-nicolive': { role: 'ニコ生状態を読む MCP サーバ(司令塔の状態取得用)', tags: ['MCP', '診断'] },
  'app': { role: 'Web 版状態ページのアプリ(app.js + dist)', tags: ['Web版'] },
  'app/dist': { role: 'Web 版アプリのビルド成果物', tags: ['ビルド成果物'] },
  'api': { role: 'サーバレス API(status エンドポイント)', tags: ['API'] },
  'memory': { role: 'セッション横断の知見・引き継ぎ(AI のメモリ)。コミット対象外も混在', tags: ['メモリ', '知見'] },
  'memory/archive': { role: '過去セッションの引き継ぎ(HANDOFF)アーカイブ', tags: ['メモリ', '履歴'] },
  'memory/avatar-parts': { role: 'アバター素材(顔シート等)の参考画像', tags: ['アバター', '画像'] }
};

/**
 * 機能 → 担当ファイルの逆引き索引(「○○を司るのはここ」)。人間が決める正本。
 * 「あの挙動どこ?」に一発で答えるための索引。ディレクトリマップ(場所→役割)の逆向き。
 *
 * すべて実コードで裏取りした担当のみ載せる(推測で『担当』を正本化しない)。
 * paths は実在必須(`--check` でファイル消失/リネームを検知=腐り防止)。
 * 新しい機能を足すときは、実際に grep して司っているファイルを確かめてから1行足す。
 * @type {{ feature: string, desc: string, paths: string[], tags?: string[] }[]}
 */
const FEATURES = [
  { feature: 'コメント送信(確認/プロファイル)', desc: '拡張から watch のコメント欄へ送信し、入力欄の変化で成功を推定。送信経路の手元プロファイルも', paths: ['src/lib/commentSubmitConfirm.js', 'src/lib/commentSubmitProfiling.js'], tags: ['送信', 'コメント'] },
  { feature: 'popup スクロール(要素を見せる)', desc: '.nl-main などスクロール親で、子要素を見せるための scrollTop 加算 delta を計算', paths: ['src/lib/nlMainScrollReveal.js'], tags: ['popup', 'スクロール'] },
  { feature: '会場ドラッグスクロール(パン)', desc: '会場を左ドラッグで縦スクロール(パン)する純ロジック。venueBar が pointer を配線して呼ぶ', paths: ['src/lib/venueDragScroll.js'], tags: ['会場', 'スクロール'] },
  { feature: 'コメント収穫(DOM 観測)', desc: 'watch の仮想スクロールを送りながら DOM 上のコメント行を拾い集める。受理判定は nicoliveDom', paths: ['src/lib/commentHarvest.js', 'src/lib/nicoliveDom.js'], tags: ['コメント', '取得', 'DOM'] },
  { feature: '過去ログ取得(バックフィル巡回)', desc: 'NDGR の backward URI を辿り配信開始まで遡って過去コメントを取り込む巡回エンジン(純ロジック)', paths: ['src/lib/ndgrBackfillCrawl.js'], tags: ['過去ログ', '取得'] },
  { feature: 'コメント重複除去(NDGR)', desc: '再送/再接続/relay overlap の重複を liveId+messageId の canonical key で排除', paths: ['src/lib/ndgrMessageDedupe.js'], tags: ['コメント', '重複除去'] },
  { feature: '応援レーン集約(誰が候補か)', desc: '保存コメント行を userId 単位に畳み込みレーン候補を作る唯一の集約正本(popup/venue 共通)', paths: ['src/lib/userLaneCandidatesFromStorage.js'], tags: ['応援', '集約'] },
  { feature: '人物タイル描画(丸サムネ)', desc: 'popup 応援アイコン列の「1人ぶんのタイル(丸サムネ+ID+名前)」生成の正本 DOM ビルダー', paths: ['src/lib/personTileDom.js'], tags: ['応援', '描画'] },
  { feature: '会場の席割り', desc: '150席上限+入れ替えで席を割り当てる。席資格(venueParticipantKey)もここ', paths: ['src/lib/venueSeats.js'], tags: ['会場', '席'] },
  { feature: '背景群衆(来場者数の表現)', desc: '席に出せない来場者数(PV)を背景群衆 Canvas の密度で描く', paths: ['src/lib/crowdRasterizer.js'], tags: ['会場', '色', '描画'] },
  { feature: '読み上げ(再生/キュー/年齢ゲート)', desc: 'コメント読み上げの再生・キュー上限・年齢ゲート・ロード状態', paths: ['src/lib/voicePlayer.js', 'src/lib/voiceReadQueue.js', 'src/lib/voiceAgeGate.js'], tags: ['読み上げ', '音声'] },
  { feature: 'ギフト投擲演出', desc: '会場でギフト/広告を投げ主サムネから中央映像へ投げる演出の純関数群', paths: ['src/lib/giftThrowProjectile.js'], tags: ['ギフト', '演出'] },
  { feature: '吹き出し寿命管理', desc: '会場の吹き出しの表示上限・追い出し(eviction)ライフサイクル', paths: ['src/lib/venueBubbleLifecycle.js'], tags: ['会場', '吹き出し'] },
  { feature: 'HTMLレポート生成', desc: 'マーケ/イベント順位/タイムライン等を1枚の HTML レポートに組み立てる(popup-entry 内)', paths: ['src/extension/popup-entry.js'], tags: ['レポート'] },
  { feature: '状態速報の整形', desc: '記録件数・取得率・バックフィル進捗・レーン状態などの状態テキストを整形', paths: ['src/lib/statusFormat.js'], tags: ['レポート', '診断'] },
  { feature: '記録件数の単調化(減らない表示)', desc: 'per-live ゲートで記録件数の表示が後退しないようにする', paths: ['src/lib/monotonicCommentCount.js'], tags: ['記録', 'コメント'] },
  { feature: 'storage キー定義', desc: 'chrome.storage のキー名の正本(nls_comments_<lv> 等)', paths: ['src/lib/storageKeys.js'], tags: ['storage'] }
];

/** ツリーから除外するトップレベル(ドット系・生成物・巨大画像ディレクトリ等) */
const SKIP_TOP = new Set(['.git', '.github', '.husky', '.cursor', '.takt', 'node_modules', 'build', '.artifacts']);

/** git 追跡ファイル一覧 */
function trackedFiles() {
  const out = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

/**
 * ディレクトリツリー(MAX_DEPTH まで)を組み、各ノードに直下ファイル数/総ファイル数を持たせる。
 * @returns {Map<string, { dir: string, depth: number, ownFiles: number, totalFiles: number, children: Set<string> }>}
 */
function buildTree(files) {
  /** @type {Map<string, any>} */
  const nodes = new Map();
  const ensure = (dir, depth) => {
    if (!nodes.has(dir)) {
      nodes.set(dir, { dir, depth, ownFiles: 0, totalFiles: 0, children: new Set() });
    }
    return nodes.get(dir);
  };
  for (const f of files) {
    const parts = f.split('/');
    if (parts.length === 1) continue; // ルート直下ファイルはツリーに出さない(下で別集計)
    if (SKIP_TOP.has(parts[0])) continue;
    // このファイルが寄与する祖先ディレクトリ(MAX_DEPTH まで)
    let prev = null;
    const limit = Math.min(parts.length - 1, MAX_DEPTH);
    for (let d = 1; d <= limit; d++) {
      const dir = parts.slice(0, d).join('/');
      const node = ensure(dir, d);
      node.totalFiles += 1;
      if (prev) prev.children.add(dir);
      prev = node;
    }
    // 直下ファイル数(そのディレクトリが「葉として」持つファイル)
    const ownDir = parts.slice(0, Math.min(parts.length - 1, MAX_DEPTH)).join('/');
    // parts.length-1 が limit を超える(深い)場合、ownFiles ではなく totalFiles のみ増やす
    if (parts.length - 1 <= MAX_DEPTH) {
      ensure(ownDir, parts.length - 1).ownFiles += 1;
    }
  }
  return nodes;
}

/** ルート直下のファイル数(設定ファイル類) */
function rootFileCount(files) {
  return files.filter((f) => !f.includes('/')).length;
}

/** depth 1 のトップレベルディレクトリを名前順で */
function topDirs(nodes) {
  return [...nodes.values()].filter((n) => n.depth === 1).map((n) => n.dir).sort();
}

/** role 辞書を引く(無ければ null) */
function roleOf(dir) {
  return ROLES[dir] || null;
}

/**
 * FEATURES の paths のうち、git 追跡に存在しないもの(消失/リネーム)を返す。
 * @param {Set<string>} trackedSet
 * @returns {{ feature: string, path: string }[]}
 */
function featureDeadPaths(trackedSet) {
  const dead = [];
  for (const f of FEATURES) {
    for (const p of f.paths) {
      if (!trackedSet.has(p)) dead.push({ feature: f.feature, path: p });
    }
  }
  return dead;
}

/** ---- Markdown 出力 ---- */
function renderMarkdown(nodes, files) {
  const lines = [];
  lines.push('# リポジトリ ディレクトリマップ（自動生成）');
  lines.push('');
  lines.push('> `scripts/repo-tree-map.mjs` が git 追跡ファイルから自動生成。**手で編集しない**（再生成で上書き）。');
  lines.push('> 役割の一言説明は同スクリプトの `ROLES` 辞書が正本。**未記入**のディレクトリは下に ⚠️ で出るので `ROLES` に1行足す。');
  lines.push('> 視覚ビュー: [repo-tree-map.html](repo-tree-map.html) ／ 機能依存図: [feature-map/index.md](feature-map/index.md) ／ 配置ルール正本: [AGENTS.md](../AGENTS.md) §4。');
  lines.push('');
  lines.push(`ルート直下の設定ファイル: ${rootFileCount(files)} 件（package.json / *.config.js / AGENTS.md 等）`);
  lines.push('');

  const missing = [];
  const tops = topDirs(nodes);
  for (const top of tops) {
    const node = nodes.get(top);
    const r = roleOf(top);
    if (!r) missing.push(top);
    const roleTxt = r ? r.role : '⚠️ 未記入（ROLES に追記）';
    const tags = r?.tags?.length ? `  〔${r.tags.join(' / ')}〕` : '';
    lines.push(`## \`${top}/\` — ${roleTxt}${tags}`);
    lines.push(`<sub>ファイル ${node.totalFiles} 件</sub>`);
    lines.push('');
    // 子(depth 2)
    const kids = [...node.children].sort();
    for (const kid of kids) {
      const kn = nodes.get(kid);
      const kr = roleOf(kid);
      if (!kr) missing.push(kid);
      const krTxt = kr ? kr.role : '⚠️ 未記入（ROLES に追記）';
      const ktags = kr?.tags?.length ? `  〔${kr.tags.join(' / ')}〕` : '';
      const name = kid.split('/').slice(1).join('/');
      lines.push(`- \`${name}/\`（${kn.totalFiles} 件） — ${krTxt}${ktags}`);
    }
    if (kids.length) lines.push('');
  }

  // 機能 → 担当ファイル 逆引き索引(「○○を司るのはここ」)
  lines.push('---');
  lines.push('');
  lines.push('# 機能 → 担当ファイル 逆引き索引（「○○を司るのはここ」）');
  lines.push('');
  lines.push('> 「あの挙動どこ?」の逆引き。`scripts/repo-tree-map.mjs` の `FEATURES` 辞書が正本（実コードで裏取りした担当のみ）。');
  lines.push('> 新しい機能を足すときは、実際に grep して司っているファイルを確かめてから `FEATURES` に1行足す。');
  lines.push('');
  const trackedSet = new Set(files);
  for (const f of FEATURES) {
    const tags = f.tags?.length ? `  〔${f.tags.join(' / ')}〕` : '';
    lines.push(`### ${f.feature}${tags}`);
    lines.push(f.desc);
    lines.push('');
    for (const p of f.paths) {
      const exists = trackedSet.has(p);
      const link = exists ? `[\`${p}\`](../${p})` : `\`${p}\` ⚠️ **見つからない（消失/リネーム）**`;
      lines.push(`- ${link}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  if (missing.length) {
    lines.push(`## ⚠️ 役割が未記入のディレクトリ（${missing.length}）`);
    lines.push('');
    lines.push('以下は `ROLES` 辞書に説明が無い。`scripts/repo-tree-map.mjs` の `ROLES` に1行足してから再生成すること。');
    lines.push('');
    for (const m of missing) lines.push(`- \`${m}/\``);
    lines.push('');
  } else {
    lines.push('✅ すべてのディレクトリに役割が記入済み。');
    lines.push('');
  }
  return { md: lines.join('\n'), missing };
}

/** ---- HTML 出力（色付き視覚ビュー） ---- */
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderHtml(nodes, files, missing) {
  const tops = topDirs(nodes);
  const cards = [];
  for (const top of tops) {
    const node = nodes.get(top);
    const r = roleOf(top);
    const cls = r ? 'dir' : 'dir miss';
    const role = r ? escapeHtml(r.role) : '⚠️ 未記入（ROLES 辞書に追記）';
    const tags = (r?.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    const kids = [...node.children].sort().map((kid) => {
      const kn = nodes.get(kid);
      const kr = roleOf(kid);
      const kcls = kr ? 'kid' : 'kid miss';
      const krole = kr ? escapeHtml(kr.role) : '⚠️ 未記入';
      const ktags = (kr?.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
      const name = escapeHtml(kid.split('/').slice(1).join('/'));
      return `<div class="${kcls}"><div class="kname">${name}/ <span class="cnt">${kn.totalFiles}</span></div><div class="krole">${krole} ${ktags}</div></div>`;
    }).join('');
    cards.push(`<section class="${cls}">
      <div class="dhead"><span class="dname">${escapeHtml(top)}/</span><span class="cnt">${node.totalFiles} 件</span></div>
      <div class="drole">${role} ${tags}</div>
      ${kids ? `<div class="kids">${kids}</div>` : ''}
    </section>`);
  }
  const missBanner = missing.length
    ? `<div class="banner warn">⚠️ 役割が未記入のディレクトリ ${missing.length} 件: ${missing.map((m) => `<code>${escapeHtml(m)}</code>`).join(' ')} — <code>scripts/repo-tree-map.mjs</code> の <code>ROLES</code> に追記</div>`
    : `<div class="banner ok">✅ すべてのディレクトリに役割が記入済み</div>`;

  // 機能 → 担当ファイル 逆引き索引
  const trackedSet = new Set(files);
  const featureCards = FEATURES.map((f) => {
    const tags = (f.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    const paths = f.paths.map((p) => {
      const exists = trackedSet.has(p);
      return exists
        ? `<code class="path">${escapeHtml(p)}</code>`
        : `<code class="path dead">${escapeHtml(p)} ⚠️ 見つからない</code>`;
    }).join('');
    return `<section class="feat">
      <div class="fhead"><span class="fname">${escapeHtml(f.feature)}</span> ${tags}</div>
      <div class="fdesc">${escapeHtml(f.desc)}</div>
      <div class="fpaths">${paths}</div>
    </section>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>リポジトリ ディレクトリマップ — 君斗りんくの追憶のきらめき</title>
<style>
  :root{ --bg:#0f1115; --panel:#161922; --ink:#e6e8ec; --sub:#aab0bb; --muted:#7b8390; --line:#2a2f3a;
    --ok:#2f7d4a; --warn:#b5485f; --tag-bg:#1d2740; --tag-bd:#3f5b8c; --tag-ink:#bcd2f6; }
  body{ margin:0; padding:28px 20px; background:var(--bg); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Sans","Yu Gothic UI",sans-serif; }
  .wrap{ max-width:1040px; margin:0 auto; }
  h1{ font-size:21px; margin:0 0 4px; }
  .meta{ color:var(--muted); font-size:12px; margin:0 0 18px; line-height:1.6; }
  .meta a{ color:#7fa8e0; }
  .banner{ border-radius:10px; padding:10px 14px; font-size:13px; margin:0 0 18px; line-height:1.6; }
  .banner.ok{ background:rgba(47,125,74,.16); border:1px solid var(--ok); color:#b8f0cf; }
  .banner.warn{ background:rgba(181,72,95,.16); border:1px solid var(--warn); color:#f6c7d2; }
  .banner code{ background:rgba(255,255,255,.08); padding:1px 5px; border-radius:4px; }
  section.dir{ background:var(--panel); border:1.5px solid var(--line); border-radius:12px;
    padding:14px 18px; margin:0 0 14px; }
  section.dir.miss{ border-color:var(--warn); background:rgba(181,72,95,.08); }
  .dhead{ display:flex; align-items:baseline; gap:10px; }
  .dname{ font-size:16px; font-weight:700; color:#fff; font-family:"Menlo","Consolas",monospace; }
  .cnt{ font-size:11px; color:var(--muted); }
  .drole{ font-size:13px; color:var(--sub); margin:5px 0 0; line-height:1.6; }
  .kids{ margin-top:10px; display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:8px; }
  .kid{ background:rgba(255,255,255,.03); border:1px solid var(--line); border-radius:8px; padding:8px 11px; }
  .kid.miss{ border-color:var(--warn); }
  .kname{ font-family:"Menlo","Consolas",monospace; font-size:12.5px; color:var(--ink); }
  .krole{ font-size:11.5px; color:var(--muted); margin-top:3px; line-height:1.5; }
  .tag{ display:inline-block; font-size:10px; padding:1px 7px; border-radius:999px; margin:2px 3px 0 0;
    background:var(--tag-bg); border:1px solid var(--tag-bd); color:var(--tag-ink); }
  .legend{ margin-top:22px; font-size:12.5px; color:var(--sub); background:var(--panel);
    border:1px solid var(--line); border-radius:12px; padding:14px 18px; line-height:1.9; }
  .legend b{ color:var(--ink); }
  .secttl{ font-size:17px; font-weight:700; color:#fff; margin:30px 0 6px; }
  .secsub{ font-size:12px; color:var(--muted); margin:0 0 14px; line-height:1.6; }
  section.feat{ background:var(--panel); border:1px solid var(--line); border-radius:10px;
    padding:11px 16px; margin:0 0 9px; }
  .fhead{ display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
  .fname{ font-size:14.5px; font-weight:700; color:#ffe3b8; }
  .fdesc{ font-size:12.5px; color:var(--sub); margin:4px 0 7px; line-height:1.6; }
  .fpaths{ display:flex; gap:6px; flex-wrap:wrap; }
  .path{ font-family:"Menlo","Consolas",monospace; font-size:11.5px; background:rgba(255,255,255,.06);
    border:1px solid var(--line); border-radius:6px; padding:2px 7px; color:#bcd2f6; }
  .path.dead{ color:#f6c7d2; border-color:var(--warn); background:rgba(181,72,95,.12); }
</style>
</head>
<body>
<div class="wrap">
  <h1>リポジトリ ディレクトリマップ</h1>
  <p class="meta">
    どのディレクトリが何の担当か（色・速度・コメント・レポート…）を一目で。<code>scripts/repo-tree-map.mjs</code> が git 追跡ファイルから自動生成（手編集しない）。<br>
    テキスト正本: <a href="repo-tree-map.md">repo-tree-map.md</a> ／ 機能依存図: <a href="feature-map/index.md">feature-map/index.md</a> ／ 配置ルール: <a href="../AGENTS.md">AGENTS.md</a> §4。
  </p>
  ${missBanner}
  ${cards.join('\n')}

  <div class="secttl">機能 → 担当ファイル 逆引き索引（「○○を司るのはここ」）</div>
  <p class="secsub">「あの挙動どこ?」の逆引き。<code>FEATURES</code> 辞書が正本（実コードで裏取りした担当のみ）。赤いパスは消失/リネームで <code>FEATURES</code> 更新が必要。</p>
  ${featureCards}

  <div class="legend">
    <p><b>読み方</b></p>
    <p>● 上半分 = ディレクトリマップ（場所 → 役割）。各カード = トップレベルディレクトリ。タグ〔色 / コメント / レポート…〕が担当ドメイン。<br>
    ● 下半分 = 機能逆引き（機能 → 担当ファイル）。「送信を司るのはどこ?」に一発で答える索引。<br>
    ● <b>赤枠/赤パス</b> = 役割未記入のディレクトリ or 消えた担当ファイル。辞書を直して再生成する。<br>
    ● ファイル件数は git 追跡分（生成物 <code>build/</code> や <code>.git</code> 等は除外）。</p>
  </div>
</div>
</body>
</html>
`;
}

/** ---- main ---- */
function generate() {
  const files = trackedFiles();
  const nodes = buildTree(files);
  const { md, missing } = renderMarkdown(nodes, files);
  const html = renderHtml(nodes, files, missing);
  const dead = featureDeadPaths(new Set(files));
  return { md, html, missing, dead };
}

const isCheck = process.argv.includes('--check');
const { md, html, missing, dead } = generate();

if (isCheck) {
  let fail = false;
  for (const [path, content] of [[OUT_MD, md], [OUT_HTML, html]]) {
    const cur = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (cur !== content) {
      fail = true;
      console.error(`[repo-tree-map] drift: ${path} は最新ではありません。\`npm run tree-map\` を実行してコミットしてください。`);
    }
  }
  // FEATURES の担当ファイルが消失/リネームしていたら失敗(逆引き索引の腐り検知)
  for (const d of dead) {
    fail = true;
    console.error(`[repo-tree-map] FEATURES の担当ファイルが見つかりません: "${d.feature}" → ${d.path}（FEATURES を更新して \`npm run tree-map\`）`);
  }
  if (fail) process.exit(1);
  console.log('[repo-tree-map] up to date.');
  if (missing.length) {
    console.warn(`[repo-tree-map] 注意: 役割未記入 ${missing.length} 件: ${missing.join(', ')}`);
  }
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_MD, md, 'utf8');
  writeFileSync(OUT_HTML, html, 'utf8');
  console.log(`[repo-tree-map] wrote ${OUT_MD} and ${OUT_HTML}`);
  if (missing.length) {
    console.warn(`[repo-tree-map] 役割未記入 ${missing.length} 件(ROLES に追記推奨): ${missing.join(', ')}`);
  }
  for (const d of dead) {
    console.warn(`[repo-tree-map] FEATURES の担当ファイルが見つかりません: "${d.feature}" → ${d.path}`);
  }
}
