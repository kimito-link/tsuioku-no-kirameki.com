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
import { classifyFeatureCategory } from '../src/lib/classifyFeatureCategory.js';
import { buildChangelogLineage } from '../src/lib/changelogLineage.js';
import { EXTENSION_CHANGELOG } from '../src/lib/changelog.js';

const ROOT = resolve(process.cwd());
const OUT_DIR = join(ROOT, 'docs');
const OUT_MD = join(OUT_DIR, 'repo-tree-map.md');
const OUT_HTML = join(OUT_DIR, 'repo-tree-map.html');
const OUT_CODE_TREE_HTML = join(OUT_DIR, 'code-tree.html');
const OUT_CODE_TREE_MD = join(OUT_DIR, 'code-tree.md');
const OUT_FEATURE_SITEMAP_HTML = join(OUT_DIR, 'feature-sitemap.html');
const OUT_FEATURE_SITEMAP_MD = join(OUT_DIR, 'feature-sitemap.md');

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
  'app/images': { role: '純Web版 応援ライブビューの同梱画像(ゆっくり顔)', tags: ['Web版', '画像'] },
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
  { feature: '会場読み上げ診断(遅延の切り分け)', desc: '会場モード(comeview)の読み上げ待機件数/間引き/最終発話/合成msを観測し KEY_VOICE_DIAG 経由で status 速報へ集約。「たまに遅れる」の真因(キュー詰まり/合成遅延)を F12 不要で割る純観測', paths: ['src/lib/voiceDiag.js', 'src/lib/voiceDiagKey.js', 'src/extension/comeview-entry.js', 'src/extension/status-entry.js'], tags: ['読み上げ', '診断', '集約'] },
  { feature: 'パネル描画診断(白化/ローディング固着)', desc: 'popup/埋め込みパネルの paint 所要ms・描画見送り・【パネルが白(未描画)か】【ローディング幕が継続中か】を nls_perf_diag_<lv> に観測し status 速報へ。「スクロールで白・放置で固着」を DOM/F12 不要で切り分ける純観測', paths: ['src/lib/perfDiag.js', 'src/extension/popup-entry.js', 'src/extension/status-entry.js'], tags: ['表示', '診断', '白フラッシュ'] },
  { feature: 'ギフト投擲演出', desc: '会場でギフト/広告を投げ主サムネから中央映像へ投げる演出の純関数群', paths: ['src/lib/giftThrowProjectile.js'], tags: ['ギフト', '演出'] },
  { feature: '吹き出し寿命管理', desc: '会場の吹き出しの表示上限・追い出し(eviction)ライフサイクル', paths: ['src/lib/venueBubbleLifecycle.js'], tags: ['会場', '吹き出し'] },
  { feature: 'HTMLレポート生成', desc: 'マーケ/イベント順位/タイムライン等を1枚の HTML レポートに組み立てる(popup-entry 内)', paths: ['src/extension/popup-entry.js'], tags: ['レポート'] },
  { feature: 'レポートのコメント源(全件storage)', desc: 'HTML/メディアキットレポートは storage の全件(IDB→チャンク→テール)を読む。popup を当該配信で開いていても表示用キャップ済みエントリで上書きしない(v0.1.853 断線根治)。空のときだけ表示エントリにフォールバック', paths: ['src/lib/pickCommentsForExport.js', 'src/extension/popup-entry.js'], tags: ['レポート', 'コメント', '記録'] },
  { feature: 'レポート内容プレビュー(DL前のリアルタイム可視化)', desc: 'HTML/マーケ/メディアキットの主要KPI(本文数/コメントした人=gap正本/分速/ヘビー・一度きり%/来場/沈黙視聴者推定)をレポートが使う純関数(aggregateMarketingReport/analyzeAudienceEngagementGap)で集計し、保存せず status 速報へ。popup が KEY_REPORT_PREVIEW へ15秒間引き publish→status が読む(voiceDiag と同じ storage ブリッジ)。過小集計を保存前に発見できる純観測(v0.1.858)。「コメントした人」はレポート本体と同じ gap.uniqueCommenters を正本に統一(v0.1.859・marketing の uniqueUsers は匿名で過大なので表示しない)', paths: ['src/lib/reportPreview.js', 'src/lib/reportPreviewKey.js', 'src/lib/reportPreviewPublish.js', 'src/extension/popup-entry.js', 'src/extension/status-entry.js'], tags: ['レポート', '診断', '集約'] },
  { feature: '応援ライブビュー(リアルタイム盛り上がり・新規タブ)', desc: 'ちくらんカードの「🔥応援ライブビューを開く」で live-view.html?lv=... を新規タブで開く(chrome.runtime.getURL)。chrome.storage を2秒購読し盛り上がり🔥(分速→computeHeatLevel)/応援者ランキング🏆(配信者タイル先頭)/🔗りんく列(数値ID+個人サムネ・categorizeUsersForThumbGrid)/🎁ギフト列(nls_gift_users_<lv>・buildGiftThrowerLaneEntries)/コメント数/来場をリアルタイム再描画。配色は popup(dark)の正確な変数に完全一致。データ取得を createLiveViewDataSource に隔離=将来サーバー公開版(拡張不要で URL 閲覧)へ移植可能(描画は不変)。Web/iOS/Android への土台(v0.1.871-875)', paths: ['extension/live-view.html', 'src/extension/live-view-entry.js', 'src/lib/heatLevel.js', 'src/lib/userThumbGrid.js', 'src/lib/userLaneMergeGiftThrowers.js'], tags: ['表示', 'リアルタイム', 'レポート'] },
  { feature: '盛り上がり判定(熱量・移植可能な純関数)', desc: '分速コメントから盛り上がり段階(idle/warm/hot/blazing)+スコア(バー幅%)を出す純関数 computeHeatLevel。拡張API非依存=Web/モバイルでそのまま再利用。閾値 8/30/100 per 分・score=min(100,cpm/2)。負/NaN は idle(v0.1.871)', paths: ['src/lib/heatLevel.js'], tags: ['リアルタイム', '集計', '表示'] },
  { feature: '診断/ちくらん タブ+カードクリックで応援者展開', desc: '状態ページ【上部ナビ(.map-nav・地図リンクと同列)】に「📊診断/🏆ちくらん」切替を統合(v0.1.870)。body.tab-chikuran で診断系レーンを CSS 非表示・配信カードに集中。各配信カードに details「🏆応援者ランキングを見る」=クリックで topSupporters を🥇🥈🥉展開。応援者データは popup で開いている配信ぶんだけ(reportPreview.liveId 一致)=その配信は展開・他は popup で開く案内(死にリンクにしない)。signature に reportPreview を含めて応援者到着時にカード再構築。将来の Kimito Link ランキングの入口(v0.1.869)', paths: ['src/extension/status-entry.js', 'extension/status.html', 'src/lib/supporterRanking.js'], tags: ['診断', '表示', 'ナビ'] },
  { feature: 'ちくらん風 配信カード(サムネ+来場+コメント+ギフト)', desc: 'ニコ生公式「注目番組ランキング(ちくらん)」風に、状態ページの配信カード上部へ サムネ画像+配信者名+タイトル+経過/来場/コメント/ギフト を1段表示。表示モデルは純関数 buildChikuranCardModel が正本(取れない値は null=空欄を0と偽らない・サムネ無しは枠+🎥・img onerror で壊れ画像を消す)。サムネ URL は snapshot.thumbnailUrl(og:image/channel thumb・summarizeOneLive が中継)。CSP は img-src 無指定で nicovideo CDN 画像を許可(既存 avatar と同じ)。健康チェック/詳細/放送ボタンは下に残す(v0.1.866)', paths: ['src/lib/chikuranCard.js', 'src/extension/status-entry.js', 'src/extension/content-entry.js'], tags: ['診断', '表示', 'レポート'] },
  { feature: '応援者ランキング(ちくらん風・将来の Kimito Link ランキング)', desc: '視聴中1配信の「コメントした人」を件数順に🥇🥈🥉付きで表示(段階A)。aggregateMarketingReport.topUsers(件数順・既存)を整形=新規取得ゼロ。匿名(a:hash/anon:/空)は「(匿名)」と明記し過大を予告(信頼度メーターと同方針)。0件除外。reportPreview の record に topSupporters として同梱し popup→storage→status の既存ブリッジに乗る(新規キー無し)。将来は複数配信横断の累計(段階B)へ拡張する土台(v0.1.865)', paths: ['src/lib/supporterRanking.js', 'src/lib/reportPreview.js', 'src/extension/status-entry.js'], tags: ['レポート', '診断', '表示'] },
  { feature: '状態→放送の導線(配信カードから watch へ)', desc: '状態ページの配信ごとカードに「放送へ行く」状態別ボタン。今そのタブを開いていれば tabs.update で切替(別ウィンドウは windows.update で前面化)・無ければ tabs.create で新規タブ・終了済みは「終了済み」と予告して開く。切替失敗(タブ閉鎖)は新規タブにフォールバック=押しても何も起きないを構造的に潰す。lv 不正はボタンを出さない(死にリンク回避)。判定は純関数 pickOpenAction が正本・新規storage/ページ/権限ゼロ(tabs 既存)。星野ロミ式会議で A案採用(v0.1.864)', paths: ['src/lib/watchLink.js', 'src/extension/status-entry.js'], tags: ['診断', '表示', 'ナビ'] },
  { feature: '数字の自己矛盾の自動検知(self-verifying)', desc: '状態速報が自分の出した数字どうしを照合し、論理的に不可能/桁違いの食い違いを⚠に出す。コメントした人>来場・のべ別キー>本文数・レポート本文が記録総数の半分未満(過小集計の疑い)・記録が公式を大きく上回る(別配信混入/二重計上の疑い)・公式値の DOM↔NDGR 乖離(ギフトpt/広告pt が2経路で食い違う・v0.1.863)。人が目で照合しなくても診断が自動で気づく(v0.1.859・statusActionAdvisor の対処カードに統合)', paths: ['src/lib/numberConsistency.js', 'src/lib/statusActionAdvisor.js'], tags: ['診断', 'レポート', '記録'] },
  { feature: '診断の信頼度メーター(数値の意味注釈)', desc: '各数値に「どういう意味か・どれだけ信頼できるか」の短い注釈を付け、確定値と推定値・正本と過大値の取り違えを防ぐ。コメントした人=匿名主体なら推定寄り(NDGR未受信は更に不確か)・のべ別キー=匿名で過大・沈黙視聴者=推定・取得率=backfill中は暫定。NDGR接続/uid率/backfill状態から機械的に決まるものだけ(推測の信頼度を盛らない)。reportPreview の速報行に統合(v0.1.861)', paths: ['src/lib/metricConfidence.js', 'src/lib/reportPreview.js', 'src/extension/status-entry.js'], tags: ['診断', 'レポート', '表示'] },
  { feature: '時系列トレンド(スナップショットで見えない劣化検知)', desc: 'status が主要KPI(記録/公式/取得率/来場)を30秒間引きで storage リング(KEY_STATUS_TREND・上限120点≈1時間)に積み、analyzeTrend が「記録が止まっている(公式だけ増える=取りこぼし)」「取得率が単調に下がり続け>=10pt低下」を時間変化で検知。瞬間のスナップショットでは正常に見える劣化を捕まえる診断3層目(信頼度メーター=値の意味/自己矛盾=瞬間の食い違い/トレンド=時間変化)。statusActionAdvisor の対処カードに統合(v0.1.862)', paths: ['src/lib/statusTrend.js', 'src/lib/statusTrendKey.js', 'src/extension/status-entry.js', 'src/lib/statusActionAdvisor.js'], tags: ['診断', '記録', '集約'] },
  { feature: '状態速報の整形', desc: '記録件数・取得率・バックフィル進捗・レーン状態などの状態テキストを整形', paths: ['src/lib/statusFormat.js'], tags: ['レポート', '診断'] },
  { feature: '記録件数の単調化(減らない表示)', desc: 'per-live ゲートで記録件数の表示が後退しないようにする', paths: ['src/lib/monotonicCommentCount.js'], tags: ['記録', 'コメント'] },
  { feature: 'storage キー定義', desc: 'chrome.storage のキー名の正本(nls_comments_<lv> 等)', paths: ['src/lib/storageKeys.js'], tags: ['storage'] },
  { feature: 'AI診断の状態速報集約', desc: 'popup の AI診断コピー固有情報を別キーへ書き、status.html(状態速報)の AI共有まとめに集約。status を見れば全部わかる', paths: ['src/lib/aiSharePopupDiagKey.js', 'src/extension/status-entry.js'], tags: ['診断', 'レポート', '集約'] },
  { feature: '状態速報の全体マインドマップ', desc: 'status.html を開けば今の状態を枝(概要/コメント取得/北極星/過去ログ/健全性/popup診断)で俯瞰。🟢🟡🔴⚪ の badge 付き折りたたみツリー(外部依存ゼロ)', paths: ['src/lib/statusMindmapModel.js', 'src/extension/status-entry.js'], tags: ['診断', 'レポート', 'マインドマップ'] },
  { feature: '状態速報の対処カード(症状→原因→次の一手)', desc: '既知パターン辞書で fastDiag/popupDiag を照合し「症状→原因(推定)→次の一手」を重大度順カードで提示。直せない原因は status の外と正直に出す(COUNCIL status-allinone)', paths: ['src/lib/statusActionAdvisor.js', 'src/extension/status-entry.js'], tags: ['診断', '対処', '自己解決'] },
  { feature: 'サイト健全性検証(リンク切れ防止)', desc: '公開ページ(LP/記事/docs)の相対内部リンク先がディスクに実在するか静的照合。外部リンクは叩かない(依存/プライバシー/速度ゼロ)。docs/site-health.md に出力・腐り検知', paths: ['src/lib/siteLinkHealth.js', 'scripts/site-health.mjs'], tags: ['Web', '健全性', 'リンク'] },
  { feature: '影響範囲マップ(変えたら何が壊れるか)', desc: 'esbuild の import 到達グラフを逆引きし「このファイルを変えたら、どの機能(entry)が壊れうるか」を波及機能数の降順で一覧。docs/feature-map/impact-map.md。新規ビルド/依存ゼロ(reach 再利用)', paths: ['scripts/feature-map.mjs', 'docs/feature-map/impact-map.md'], tags: ['影響範囲', '依存図', '実装前ゲート'] },
  { feature: '全体マップ(全地図への入口)', desc: '地図・診断・検証への唯一の入口ハブ。「どこを直す/何が壊れる/今の状態/壊れてないか/公開記事」を1枚から辿れる。迷ったらここ起点(AGENTS.md §10)', paths: ['docs/MAP.md'], tags: ['ハブ', '入口', '地図'] },
  { feature: '影響範囲ゲート(規律を自動化)', desc: '星野ロミ式「規律を自動ゲートに」。diff から影響大(複数機能波及)の変更ファイルを検出し波及先機能を列挙。警告のみ(摩擦ゼロ)・--strict で exit1。AGENTS.md §10 のルールを diff 発火に', paths: ['scripts/impact-check.mjs', 'docs/feature-map/impact-map.json'], tags: ['影響範囲', '自動ゲート', '再発防止'] }
];

/**
 * 機能を「データの一生 + 横断」の大分類に束ねる(人間が決める正本)。
 * docs/feature-sitemap.html(添付イメージ型のカード+線マップ)で「トップ→分類→機能」の階層を作るため。
 * key = FEATURES[].feature の完全一致。ここに無い機能は「その他」に入る(=分類追記の合図)。
 * 分類の並びは CATEGORY_ORDER で固定(取得→記録→…の流れ順)。
 * @type {Record<string, string>}
 */
const FEATURE_CATEGORY = {
  'コメント送信(確認/プロファイル)': '📤 送信',
  'コメント収穫(DOM 観測)': '📥 取得',
  '過去ログ取得(バックフィル巡回)': '📥 取得',
  'コメント重複除去(NDGR)': '📥 取得',
  '記録件数の単調化(減らない表示)': '💾 記録',
  'storage キー定義': '💾 記録',
  '応援レーン集約(誰が候補か)': '🧮 集計',
  '人物タイル描画(丸サムネ)': '🪟 表示・演出',
  '会場の席割り': '🪟 表示・演出',
  '背景群衆(来場者数の表現)': '🪟 表示・演出',
  '会場ドラッグスクロール(パン)': '🪟 表示・演出',
  '吹き出し寿命管理': '🪟 表示・演出',
  'ギフト投擲演出': '🪟 表示・演出',
  '読み上げ(再生/キュー/年齢ゲート)': '🔊 読み上げ',
  'popup スクロール(要素を見せる)': '🪟 表示・演出',
  'HTMLレポート生成': '📊 レポート',
  '状態速報の整形': '🩺 診断・地図',
  'AI診断の状態速報集約': '🩺 診断・地図',
  '状態速報の全体マインドマップ': '🩺 診断・地図',
  '状態速報の対処カード(症状→原因→次の一手)': '🩺 診断・地図',
  'サイト健全性検証(リンク切れ防止)': '🩺 診断・地図',
  '影響範囲マップ(変えたら何が壊れるか)': '🩺 診断・地図',
  '全体マップ(全地図への入口)': '🩺 診断・地図',
  '影響範囲ゲート(規律を自動化)': '🩺 診断・地図'
};
/** 大分類の表示順(データの流れ順 + 横断)。 */
const CATEGORY_ORDER = ['📤 送信', '📥 取得', '💾 記録', '🧮 集計', '🪟 表示・演出', '🔊 読み上げ', '📊 レポート', '🩺 診断・地図', 'その他'];

/**
 * 各分類を、りんく・こん太・たぬ姉が知識のない人にも分かるよう噛み砕いて解説する(公式LP の口調)。
 * マインドマップ/サイトマップで分類ノードに添える。{ link, konta, tanu } の3キャラ一言ずつ。
 * @type {Record<string, { link: string, konta: string, tanu: string }>}
 */
const CATEGORY_CHARA_NOTE = {
  '📤 送信': {
    link: 'コメントを配信に送る係なのだ。',
    konta: 'ちゃんと送れたか確かめてるのだ。',
    tanu: '送った人の手元メモも残すのだ。'
  },
  '📥 取得': {
    link: 'コメントを集めてくる入り口なのだ。',
    konta: '今のコメントも、過去のコメントも拾うのだ。',
    tanu: '同じものは1回だけにする掃除もここなのだ。'
  },
  '💾 記録': {
    link: '集めたコメントを安全にしまう係なのだ。',
    konta: '数えた件数が減って見えないように守るのだ。',
    tanu: 'しまう場所(キー)の名前もここで決めるのだ。'
  },
  '🧮 集計': {
    link: 'バラバラのコメントを「人ごと」にまとめるのだ。',
    konta: '誰が応援してくれたか分かるようにするのだ。',
    tanu: '応援レーンの素になる大事な計算なのだ。'
  },
  '🪟 表示・演出': {
    link: '画面に見えるものは、ほぼここなのだ。',
    konta: '会場の席・群衆・吹き出し・ギフトの演出なのだ。',
    tanu: '応援アイコンの丸い顔もここで描くのだ。'
  },
  '🔊 読み上げ': {
    link: 'コメントを声で読み上げる係なのだ。',
    konta: '順番待ちや年齢のチェックもするのだ。',
    tanu: '読みすぎないよう上限も決めてるのだ。'
  },
  '📊 レポート': {
    link: '配信のまとめを1枚の絵にする係なのだ。',
    konta: '順位やタイムラインを見やすくするのだ。',
    tanu: '後で振り返るときに役立つのだ。'
  },
  '🩺 診断・地図': {
    link: '今このページ(状態)を作ってる係なのだ。',
    konta: '困りごとを「症状→原因→次の一手」で出すのだ。',
    tanu: 'このマップたちも、ここが作ってるのだ。'
  },
  'その他': {
    link: 'まだ分類していない機能なのだ。',
    konta: '見つけたら分類してあげるのだ。',
    tanu: 'FEATURE_CATEGORY に1行足すだけなのだ。'
  }
};

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
 * FEATURES の paths のうち、消失/リネームしたもの(実体が無い)を返す。
 * git 追跡 or ディスク上に在れば OK(新規ファイルはコミット前=未追跡でも実在すれば誤検知しない)。
 * @param {Set<string>} trackedSet
 * @returns {{ feature: string, path: string }[]}
 */
function featureDeadPaths(trackedSet) {
  const dead = [];
  for (const f of FEATURES) {
    for (const p of f.paths) {
      const ok = trackedSet.has(p) || existsSync(join(ROOT, p));
      if (!ok) dead.push({ feature: f.feature, path: p });
    }
  }
  return dead;
}

/** Mermaid ノード ID 用に安全化(英数_のみ・日本語等は除去)。衝突回避に index を付ける。 */
function mmId(prefix, i) {
  return `${prefix}${i}`;
}
/** Mermaid ラベル用エスケープ("内に " を入れられないので全角に逃がす・改行は除去) */
function mmLabel(s) {
  return String(s).replace(/"/g, '”').replace(/[\r\n]+/g, ' ');
}

/**
 * ROLES/FEATURES 辞書から Mermaid マインドマップ(graph LR=左→右の枝分かれ)を2枚作る。
 * feature-map と同じ graph LR 記法。GitHub で自動描画。辞書更新で自動再生成=腐らない。
 */
function renderMindmaps(nodes) {
  const lines = [];
  lines.push('## マインドマップ（自動生成・GitHub で図として表示）');
  lines.push('');
  lines.push('> `ROLES` / `FEATURES` 辞書から自動生成。辞書を更新すれば図も自動更新。');
  lines.push('');

  // 1) ディレクトリツリー型(リポジトリ → トップ → サブ)
  lines.push('### ディレクトリツリー（場所 → 役割）');
  lines.push('');
  lines.push('```mermaid');
  lines.push('graph LR');
  lines.push('  ROOT["リポジトリ"]');
  const tops = topDirs(nodes);
  tops.forEach((top, ti) => {
    const r = roleOf(top);
    const tid = mmId('d', ti);
    const tlabel = mmLabel(`${top}/${r?.tags?.length ? ' 〔' + r.tags.join('/') + '〕' : ''}`);
    lines.push(`  ROOT --> ${tid}["${tlabel}"]`);
    const kids = [...nodes.get(top).children].sort();
    kids.forEach((kid, ki) => {
      const kr = roleOf(kid);
      const kid_ = mmId(`d${ti}_`, ki);
      const name = kid.split('/').slice(1).join('/');
      const klabel = mmLabel(`${name}/${kr?.tags?.length ? ' 〔' + kr.tags.join('/') + '〕' : ''}`);
      lines.push(`  ${tid} --> ${kid_}["${klabel}"]`);
    });
  });
  lines.push('```');
  lines.push('');

  // 2) 機能逆引き型(中心 → 機能 → 担当ファイル)
  lines.push('### 機能逆引き（機能 → 担当ファイル）');
  lines.push('');
  lines.push('```mermaid');
  lines.push('graph LR');
  lines.push('  HUB["機能"]');
  FEATURES.forEach((f, fi) => {
    const fid = mmId('f', fi);
    lines.push(`  HUB --> ${fid}["${mmLabel(f.feature)}"]`);
    f.paths.forEach((p, pi) => {
      const pid = mmId(`f${fi}_`, pi);
      const base = p.split('/').slice(1).join('/'); // src/ を落として短く
      lines.push(`  ${fid} --> ${pid}["${mmLabel(base)}"]`);
    });
  });
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

/** ---- Markdown 出力 ---- */
function renderMarkdown(nodes, files) {
  const lines = [];
  lines.push('# リポジトリ ディレクトリマップ（自動生成）');
  lines.push('');
  lines.push('> `scripts/repo-tree-map.mjs` が git 追跡ファイルから自動生成。**手で編集しない**（再生成で上書き）。');
  lines.push('> 役割の一言説明は同スクリプトの `ROLES` 辞書が正本。**未記入**のディレクトリは下に ⚠️ で出るので `ROLES` に1行足す。');
  lines.push('> 下にマインドマップ（GitHub で図として表示）→ ディレクトリ一覧 → 機能逆引き索引 の順。');
  lines.push('> **全部の地図への入口: [MAP.md](MAP.md)** ／ 視覚ビュー: [repo-tree-map.html](repo-tree-map.html) ／ 機能依存図: [feature-map/index.md](feature-map/index.md) ／ 配置ルール正本: [AGENTS.md](../AGENTS.md) §4。');
  lines.push('');
  lines.push(`ルート直下の設定ファイル: ${rootFileCount(files)} 件（package.json / *.config.js / AGENTS.md 等）`);
  lines.push('');

  // マインドマップ(GitHub で図として表示)を先頭に
  lines.push(renderMindmaps(nodes));
  lines.push('---');
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

/* ── 全地図共通ナビ(どこからでもたどれる)──────────────────────────────
 * 正本はここ1か所。3地図テンプレ(repo-tree-map / code-tree / feature-sitemap)が
 * <div class="wrap"> 直後で ${navHeaderHtml('...')} を呼ぶ=ドリフトゼロ。
 * 設計正本: council/nav-header-SYNTHESIS.md(星野ロミ式・死にリンクを作らない)。 */

/** 共通ナビの CSS(3テンプレの <style> に NAV_CSS を1回ずつ差し込む=実体は1か所)。 */
const NAV_CSS = `
  .map-nav{ display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px; margin:0 0 16px;
    padding:8px 0; border-bottom:1px solid var(--line); }
  .map-nav .nav-item{ font-size:12.5px; text-decoration:none; color:#9fb6da;
    border:1px solid transparent; border-radius:999px; padding:3px 11px; line-height:1.5; white-space:nowrap; }
  .map-nav a.nav-item:hover{ border-color:var(--line); color:#cfe0ff; }
  .map-nav .nav-here{ color:#fff; font-weight:700; border-bottom:2px solid var(--accent,#ec4899);
    border-radius:6px 6px 0 0; }
  .map-nav .nav-ext{ color:#7fa8e0; }
  .map-nav .nav-back{ cursor:pointer; background:rgba(255,255,255,.04); color:#cfe0ff;
    border:1px solid var(--line); border-radius:7px; padding:3px 10px; font:inherit; font-size:12.5px; }
  .map-nav .nav-back:hover{ border-color:var(--accent,#ec4899); color:#fff; }
  .map-nav .nav-note{ font-size:11.5px; color:var(--muted); margin-left:auto; white-space:nowrap; }
  @media (max-width:520px){ .map-nav .nav-note{ margin-left:0; flex-basis:100%; } }`;

/** 全地図共通ナビ。active = 'feature-sitemap' | 'code-tree' | 'repo-tree-map'。
 *  地図→地図 は相対リンク。status は公開URL不在ゆえ死にリンクにせず、到達可能な代替入口
 *  (MAP.md・GitHub)を渡し、状態ページは補足テキストで案内(星野ロミ式・失敗体験の除去)。 */
function navHeaderHtml(active) {
  const pages = [
    ['feature-sitemap', '🧠 機能マップ', 'feature-sitemap.html'],
    ['code-tree', '🌳 コードの地図', 'code-tree.html'],
    ['repo-tree-map', '🧭 逆引き索引', 'repo-tree-map.html'],
  ];
  const items = pages.map(([key, label, href]) =>
    key === active
      ? `<span class="nav-item nav-here" aria-current="page">${escapeHtml(label)}</span>`
      : `<a class="nav-item" href="${href}">${escapeHtml(label)}</a>`
  ).join('');
  // v0.1.983: 共通ヘッダーに「← 戻る」を常設(要望: 地図を押すと元の場所に戻れない)。
  //   地図→地図と辿った後でも history.back() で1つ前へ。履歴が無い(直接/新規タブで開いた)ときは
  //   何も起きないと迷うので、その場合は MAP 入口へフォールバック移動する。どの地図でも同じ位置に出す。
  const backBtn =
    `<button type="button" class="nav-item nav-back" `
    + `onclick="if(history.length>1){history.back()}else{location.href='MAP.md'}" `
    + `title="1つ前のページに戻る(無ければ入口へ)">← 戻る</button>`;
  return `<nav class="map-nav" aria-label="地図ナビ">${backBtn}${items}`
    + `<a class="nav-item nav-ext" href="MAP.md">🗺️ 入口(MAP)</a>`
    + `<a class="nav-item nav-ext" href="https://github.com/kimito-link/tsuioku-no-kirameki.com" target="_blank" rel="noopener">📦 ソース</a>`
    + `<span class="nav-note" title="状態ページは拡張のアイコンから開けます">📊 状態は拡張アイコンから</span></nav>`;
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
${NAV_CSS}
</style>
</head>
<body>
<div class="wrap">
  ${navHeaderHtml('repo-tree-map')}
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

/* ============================================================================
 * 完全網羅ツリー(code-tree): 全ファイルを「毛細血管」まで枝分かれで描く(2026-06-20 ユーザー要望)。
 *   添付イメージのツリー構造で、各ファイルが「何をするか」を AI も人間も開けば分かる。
 *   役割は各ファイルの【先頭コメント】から自動抽出(src の 97% が既に持っている=人手辞書ゼロ)。
 *   役割が取れないファイルは赤=「説明が無い箇所」が一目で分かる(=改善対象を晒す)。
 *   出力 docs/code-tree.html(ネイティブ <details> 折りたたみ・依存ゼロ・no CDN)+ AI用 docs/code-tree.md。
 *   全部ひらけば毛細血管・畳めば俯瞰。`--check` で腐り検知(verify:cc)。
 * ========================================================================== */

/** 役割を抽出する対象拡張子(ソースのみ。画像/音声/json 等は役割文を持たない)。 */
const ROLE_EXT = /\.(mjs|js|ts|jsx|tsx)$/;

/**
 * テストファイルか(.test.* / .spec.*)。役割コメント対象外(テストは名前で何をテストするか自明)。
 * 3箇所で同じ判定が要るので正本を1つに(ドリフト防止)。
 * @param {string} name ベース名
 */
function isTestFile(name) {
  return /\.(test|spec)\.(mjs|js|ts|jsx|tsx)$/.test(name);
}

/** 役割コメントを持つべき「ソース」か(対象拡張子 かつ テストでない)。 */
function isRoleSource(name) {
  return ROLE_EXT.test(name) && !isTestFile(name);
}

/**
 * データの一生「取得→記録→集計→表示」の背骨(spine)。code-tree の冒頭に出す“流れ”の見出し。
 * 枝葉(個々の純関数)は下のツリー本体で見るので、ここは各段の代表ファイルだけ(実コードで裏取り済み)。
 * storage キーの断線検知(broadcaster バグ型)は `npm run feature-map -- --check`(機械ゲート)が担う。
 * @type {{ id:string, label:string, emoji:string, desc:string, files:string[] }[]}
 */
const SPINE_STAGES = [
  { id: 'acquire', label: '取得', emoji: '📡', desc: 'NDGR(protobuf直読み)+watch DOM観測でコメント/ギフトを集める',
    files: ['src/extension/content-entry.js', 'src/extension/page-intercept-entry.js'] },
  { id: 'record', label: '記録', emoji: '💾', desc: 'IndexedDB / chunk / tail バッファへ永続化(記録本体)',
    files: ['src/extension/content-entry.js', 'src/extension/offscreen-entry.js', 'src/extension/backfill-sw-entry.js'] },
  { id: 'aggregate', label: '集計', emoji: '🧮', desc: '保存データ→応援レーン/会場/ランキング/プロフィールへ畳み込む',
    files: ['src/domain', 'src/data', 'src/lib'] },
  { id: 'display', label: '表示', emoji: '🪟', desc: 'パネル(応援レーン)/会場/状態ページへ描く',
    files: ['src/extension/popup-entry.js', 'src/extension/venueBar.js', 'src/extension/status-entry.js'] }
];

/** code-tree から除外するトップ(ツリーが巨大化する生成物/メモ等。SKIP_TOP に加えて)。 */
const CODE_TREE_SKIP_TOP = new Set([...SKIP_TOP, 'memory', 'council', '.artifacts']);

/** code-tree から除外するパス断片(ビルド成果物=役割コメントが無くて当然=改善対象ではない)。 */
const CODE_TREE_SKIP_PATH = [/(^|\/)dist\//, /\.min\.js$/];

/**
 * code-tree(完全網羅ツリー)に載せるファイルか。生成物 dist は除外する。
 * @param {string} f ROOT 相対パス
 */
function inCodeTree(f) {
  const parts = f.split('/');
  if (parts.length === 1) return false; // ルート直下は別扱い
  if (CODE_TREE_SKIP_TOP.has(parts[0])) return false;
  if (CODE_TREE_SKIP_PATH.some((re) => re.test(f))) return false;
  return true;
}

/**
 * ファイルの先頭コメントから「役割の1行」を抽出する純関数。
 *   //  行コメントが続く塊、または /* ... *\/ ブロックの最初の意味ある行を拾う。
 *   ファイル名の再掲(例 "// foo.js")や @ts-... ディレクティブ、区切り線(===,---,***)は飛ばす。
 * 取れなければ null(=役割不明=赤)。
 * @param {string} text ファイル内容(先頭数 KB で十分)
 * @param {string} fileName ベース名(再掲スキップ用)
 * @returns {string|null}
 */
function extractRoleDoc(text, fileName) {
  const head = text.slice(0, 4000);
  /** @type {string[]} */
  const lines = [];
  // 先頭の行コメント(// …)が何行続いても、その後に /** */ ブロックがあれば両方を候補に集める。
  // 例: 1行目 `// @ts-nocheck …` → 2行目から `/** 役割 */` のパターン(personTileDom 型)を救う。
  // 先頭コメント領域を「種類を問わず」集める: 行コメント(//)・ブロック(/* */)・import・空行が
  //   どの順で来ても、実コード(export/function/const 等)が始まるまで読み進める。
  //   例 content-entry.js は `/* eslint */` → `// @ts-nocheck` → `// 役割` → import の順 = 1ループで救う。
  //   ブロックの過剰追跡を避けるため最大8ステップ・ブロックは最大3個まで。
  let rest = head.trimStart();
  // shebang(#!/usr/bin/env node)は飛ばす(CLI スクリプトの役割は2行目以降にある)。
  rest = rest.replace(/^#![^\n]*\n?/, '').trimStart();
  let blocks = 0;
  for (let step = 0; step < 8; step++) {
    rest = rest.replace(/^\s*\n/, '').replace(/^[ \t]+/, '');
    const imp = /^import\b[^\n]*\n?/.exec(rest);
    if (imp) { rest = rest.slice(imp[0].length); continue; }
    const ln = /^\/\/+[^\n]*\n?/.exec(rest);
    if (ln) { lines.push(ln[0].replace(/^\/\/+\s?/, '').trim()); rest = rest.slice(ln[0].length); continue; }
    if (rest.startsWith('/*') && blocks < 3) {
      blocks += 1;
      const end = rest.indexOf('*/');
      const block = end >= 0 ? rest.slice(2, end) : rest.slice(2);
      for (const l of block.split('\n')) lines.push(l.replace(/^\s*\*+\s?/, '').trim());
      rest = end >= 0 ? rest.slice(end + 2) : '';
      continue;
    }
    break; // 実コード開始 or これ以上コメント無し
  }

  const base = fileName.replace(ROLE_EXT, '');
  const isFileName = (s) => {
    const bare = s.replace(/[`'"]/g, '').trim();
    return bare.toLowerCase() === fileName.toLowerCase() || bare.toLowerCase() === base.toLowerCase();
  };
  for (const l of lines) {
    if (!l) continue;
    if (/^[=\-*_~#]{3,}$/.test(l)) continue; // 区切り線
    if (/^@(ts-|type|param|returns|typedef|module|file|fileoverview)/.test(l)) continue; // JSDoc/TS ディレクティブ
    if (/^(eslint|prettier|globalThis|import|export)\b/.test(l)) continue;
    if (isFileName(l)) continue; // ファイル名だけの行(crowdRasterizer.js / // foo.js)はスキップ
    // 行頭にファイル名が再掲されている場合だけ除去(末尾の .js 等は本文なので消さない)
    const noFile = l.replace(/^[`'"]?[\w-]+\.(mjs|js|ts|jsx|tsx)[`'"]?\s*[:：—-]\s*/i, '').trim();
    const cand = noFile || l;
    if (isFileName(cand)) continue;
    if (cand.length >= 4) return cand.length > 110 ? cand.slice(0, 108) + '…' : cand;
  }
  return null;
}

/**
 * 全ファイルから「ディレクトリ→ファイル」の完全ツリーを組む(深さ無制限=毛細血管)。
 * @param {string[]} files git 追跡ファイル(ROOT 相対・/区切り)
 * @returns {{ name: string, path: string, dirs: Map<string,any>, files: string[] }} root ノード
 */
function buildFullTree(files) {
  const root = { name: '', path: '', dirs: new Map(), files: [] };
  for (const f of files) {
    if (!inCodeTree(f)) continue;
    const parts = f.split('/');
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!cur.dirs.has(seg)) {
        cur.dirs.set(seg, { name: seg, path: parts.slice(0, i + 1).join('/'), dirs: new Map(), files: [] });
      }
      cur = cur.dirs.get(seg);
    }
    cur.files.push(parts[parts.length - 1]);
  }
  return root;
}

/**
 * ツリーの各ファイルの役割を抽出してマップに。役割不明(ソースなのに取れない)も数える。
 * @param {string[]} files
 * @returns {{ roleByPath: Map<string,string|null>, unknownSrc: string[], total: number }}
 */
function collectFileRoles(files) {
  /** @type {Map<string, string|null>} */
  const roleByPath = new Map();
  const unknownSrc = [];
  let total = 0;
  for (const f of files) {
    if (!inCodeTree(f)) continue;
    const parts = f.split('/');
    const base = parts[parts.length - 1];
    if (!isRoleSource(base)) {
      roleByPath.set(f, null);
      continue;
    }
    total += 1;
    let role = null;
    try {
      role = extractRoleDoc(readFileSync(join(ROOT, f), 'utf8'), base);
    } catch { role = null; }
    roleByPath.set(f, role);
    if (!role) unknownSrc.push(f);
  }
  return { roleByPath, unknownSrc, total };
}

/** ディレクトリノードの総ファイル数(再帰)。畳んだ summary に件数を出す用。 */
function countTreeFiles(node) {
  let n = node.files.length;
  for (const d of node.dirs.values()) n += countTreeFiles(d);
  return n;
}

/**
 * 完全網羅ツリーの HTML をネイティブ <details> で再帰生成(添付イメージの枝分かれ・依存ゼロ)。
 * @param {ReturnType<typeof buildFullTree>} root
 * @param {ReturnType<typeof collectFileRoles>} roles
 */
function renderCodeTreeHtml(root, roles) {
  const { roleByPath, unknownSrc, total } = roles;

  /** 1ディレクトリ(枝)を <details> で。子ディレクトリ→ファイルの順。 */
  const renderDir = (node, depth) => {
    const dirNames = [...node.dirs.keys()].sort();
    const fileNames = [...node.files].sort();
    const kids = [];
    for (const dn of dirNames) kids.push(renderDir(node.dirs.get(dn), depth + 1));
    for (const fn of fileNames) {
      const path = node.path ? `${node.path}/${fn}` : fn;
      const role = roleByPath.get(path);
      const isSrc = isRoleSource(fn);
      const unknown = isSrc && !role;
      const roleTxt = role
        ? `<span class="frole">${escapeHtml(role)}</span>`
        : unknown
          ? '<span class="frole miss">⚠️ 役割コメント無し（先頭に1行説明を)</span>'
          : '';
      kids.push(`<div class="f${unknown ? ' miss' : ''}"><span class="fn">${escapeHtml(fn)}</span>${roleTxt}</div>`);
    }
    const count = countTreeFiles(node);
    const open = depth <= 1 ? ' open' : '';
    return `<details class="d"${open}><summary>📁 ${escapeHtml(node.name)}/ <span class="cnt">${count}</span></summary><div class="branch">${kids.join('')}</div></details>`;
  };

  const topDirsHtml = [...root.dirs.keys()].sort().map((dn) => renderDir(root.dirs.get(dn), 1)).join('\n');
  const banner = unknownSrc.length
    ? `<div class="banner warn">⚠️ 役割コメントが無いソース ${unknownSrc.length} / ${total} 件 — 赤いファイルの先頭に1行「何をするか」を書けば消えます（AIも人間も迷わない）。</div>`
    : `<div class="banner ok">✅ 全 ${total} ソースに役割コメントあり（毛細血管まで説明済み）。</div>`;

  // 冒頭の「データの流れ(背骨)」= 取得→記録→集計→表示。各段の代表ファイルを出す(枝葉は下のツリー)。
  const spineCards = SPINE_STAGES.map((s, i) => {
    const fileChips = s.files.map((f) => `<code class="sf">${escapeHtml(f)}</code>`).join('');
    const arrow = i < SPINE_STAGES.length - 1 ? '<div class="sarrow">↓</div>' : '';
    return `<div class="sstage"><div class="shead"><span class="snum">${i + 1}</span>`
      + `<span class="semoji">${escapeHtml(s.emoji)}</span><span class="sname">${escapeHtml(s.label)}</span></div>`
      + `<div class="sdesc">${escapeHtml(s.desc)}</div><div class="sfiles">${fileChips}</div></div>${arrow}`;
  }).join('');
  const spineHtml = `<details class="spine" open><summary>🦴 データの流れ（取得→記録→集計→表示）</summary>`
    + `<div class="spinebody">${spineCards}</div>`
    + `<div class="spinenote">この4段が根幹。値が作られても次の段へ届かない「断線」（過去の broadcaster バグ型）は`
    + ` <code>npm run feature-map -- --check</code> が機械的に検知して止めます。各ファイルの中身は下のツリーで。</div></details>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>コード全ツリー（毛細血管まで）— 君斗りんくの追憶のきらめき</title>
<style>
  :root{ --bg:#0f1115; --panel:#161922; --ink:#e6e8ec; --sub:#aab0bb; --muted:#7b8390; --line:#2a2f3a;
    --ok:#2f7d4a; --warn:#b5485f; --tag-bg:#1d2740; --tag-bd:#3f5b8c; --tag-ink:#bcd2f6; }
  body{ margin:0; padding:28px 20px; background:var(--bg); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Sans","Yu Gothic UI",sans-serif; }
  .wrap{ max-width:1040px; margin:0 auto; }
  h1{ font-size:21px; margin:0 0 4px; }
  .meta{ color:var(--muted); font-size:12px; margin:0 0 14px; line-height:1.6; }
  .meta a{ color:#7fa8e0; }
  .ctrl{ margin:0 0 14px; display:flex; gap:8px; }
  .ctrl button{ background:var(--tag-bg); border:1px solid var(--tag-bd); color:var(--tag-ink);
    border-radius:8px; padding:5px 12px; font-size:12px; cursor:pointer; }
  .banner{ border-radius:10px; padding:10px 14px; font-size:13px; margin:0 0 16px; line-height:1.6; }
  .banner.ok{ background:rgba(47,125,74,.16); border:1px solid var(--ok); color:#b8f0cf; }
  .banner.warn{ background:rgba(181,72,95,.16); border:1px solid var(--warn); color:#f6c7d2; }
  details.spine{ background:var(--panel); border:1px solid var(--line); border-radius:12px;
    padding:6px 16px 14px; margin:0 0 18px; }
  details.spine > summary{ cursor:pointer; font-size:15px; font-weight:700; color:#fff; padding:8px 0; }
  .spinebody{ display:flex; flex-direction:column; gap:0; }
  .sstage{ background:rgba(255,255,255,.03); border:1px solid var(--line); border-radius:10px; padding:9px 13px; }
  .shead{ display:flex; align-items:center; gap:9px; }
  .snum{ display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px;
    border-radius:50%; background:var(--tag-bg); border:1px solid var(--tag-bd); color:var(--tag-ink);
    font-size:12px; font-weight:700; }
  .semoji{ font-size:16px; } .sname{ font-size:15px; font-weight:700; color:#fff; }
  .sdesc{ font-size:12px; color:var(--sub); margin:4px 0 7px; line-height:1.55; }
  .sfiles{ display:flex; gap:6px; flex-wrap:wrap; }
  .sf{ font-family:"Menlo","Consolas",monospace; font-size:11px; background:rgba(255,255,255,.06);
    border:1px solid var(--line); border-radius:6px; padding:2px 7px; color:#bcd2f6; }
  .sarrow{ text-align:center; color:var(--tag-bd); font-size:15px; line-height:1.4; }
  .spinenote{ font-size:11.5px; color:var(--muted); margin-top:10px; line-height:1.6; }
  details.d{ margin:2px 0; }
  details.d > summary{ cursor:pointer; font-family:"Menlo","Consolas",monospace; font-size:13px;
    color:#cfe0ff; padding:3px 6px; border-radius:6px; list-style:none; }
  details.d > summary::-webkit-details-marker{ display:none; }
  details.d > summary::before{ content:"▸ "; color:var(--muted); }
  details.d[open] > summary::before{ content:"▾ "; }
  details.d > summary:hover{ background:rgba(255,255,255,.04); }
  .cnt{ color:var(--muted); font-size:11px; font-family:inherit; }
  .branch{ margin-left:14px; padding-left:12px; border-left:1px solid var(--line); }
  .f{ display:flex; gap:10px; align-items:baseline; padding:2px 6px; border-radius:6px; }
  .f:hover{ background:rgba(255,255,255,.03); }
  .f.miss{ background:rgba(181,72,95,.08); }
  .fn{ font-family:"Menlo","Consolas",monospace; font-size:12px; color:var(--ink); flex:0 0 auto; min-width:180px; }
  .frole{ font-size:12px; color:var(--sub); line-height:1.5; }
  .frole.miss{ color:#f6c7d2; }
  .legend{ margin-top:20px; font-size:12.5px; color:var(--sub); background:var(--panel);
    border:1px solid var(--line); border-radius:12px; padding:14px 18px; line-height:1.9; }
  .legend b{ color:var(--ink); }
${NAV_CSS}
</style>
</head>
<body>
<div class="wrap">
  ${navHeaderHtml('code-tree')}
  <h1>🌳 コード全ツリー（毛細血管まで）</h1>
  <p class="meta">
    まず上の「データの流れ」で根幹を掴み、下のツリーで全ファイルの「何をするか」（先頭コメントから自動抽出）まで。
    <b>畳めば俯瞰・開けば毛細血管</b>。<code>scripts/repo-tree-map.mjs</code> が自動生成（手編集しない・no CDN）。<br>
    全地図の入口: <a href="MAP.md">MAP.md</a> ／ 役割の逆引き: <a href="repo-tree-map.html">repo-tree-map.html</a> ／
    AI用テキスト: <a href="code-tree.md">code-tree.md</a>。
  </p>
  ${banner}
  ${spineHtml}
  <div class="ctrl">
    <button onclick="document.querySelectorAll('details.d').forEach(d=>d.open=true)">全部ひらく</button>
    <button onclick="document.querySelectorAll('details.d').forEach(d=>d.open=false)">全部とじる</button>
  </div>
  ${topDirsHtml}
  <div class="legend">
    <b>読み方</b>: 📁=ディレクトリ（クリックで開閉・数字=配下ファイル数）。その下が中のファイルと役割。<br>
    <b style="color:#f6c7d2">赤いファイル</b>=先頭に役割コメントが無いソース＝「何をするか」が説明されていない箇所。
    そのファイルの先頭に1行コメントを足せば緑になり、AIも人間も迷わなくなる（=エラーの芽を消す）。<br>
    役割は各ファイルの先頭コメントから機械抽出（人手辞書ゼロ＝腐らない）。<code>npm run tree-map -- --check</code> が
    verify:cc でこのツリーの最新性を検証する。
  </div>
</div>
</body>
</html>
`;
}

/**
 * 完全網羅ツリーの Markdown(AI/GitHub 用のテキスト正本)。インデントでツリーを表す。
 * @param {ReturnType<typeof buildFullTree>} root
 * @param {ReturnType<typeof collectFileRoles>} roles
 */
function renderCodeTreeMd(root, roles) {
  const { roleByPath, unknownSrc, total } = roles;
  const lines = [];
  lines.push('# 🌳 コード全ツリー（毛細血管まで・自動生成）');
  lines.push('');
  lines.push('> `npm run tree-map` で再生成。手で編集しない（`--check` が verify:cc で腐りを検知）。');
  lines.push('> 全ファイルと「何をするか」（各ファイルの先頭コメントから自動抽出）。視覚版: [code-tree.html](code-tree.html)。');
  lines.push('> ⚠️ の付いたソースは先頭に役割コメントが無い＝説明を1行足すと AI も人間も迷わない。');
  lines.push('');
  // データの流れ(背骨)= 取得→記録→集計→表示。根幹を先に。
  lines.push('## 🦴 データの流れ（取得→記録→集計→表示）');
  lines.push('');
  for (let i = 0; i < SPINE_STAGES.length; i++) {
    const s = SPINE_STAGES[i];
    lines.push(`${i + 1}. ${s.emoji} **${s.label}** — ${s.desc}`);
    for (const f of s.files) lines.push(`   - \`${f}\``);
    if (i < SPINE_STAGES.length - 1) lines.push('   ↓');
  }
  lines.push('');
  lines.push('> 値が次の段へ届かない「断線」(broadcaster バグ型)は `npm run feature-map -- --check` が機械検知。');
  lines.push('');

  lines.push(unknownSrc.length
    ? `## ⚠️ 役割コメントが無いソース ${unknownSrc.length} / ${total} 件`
    : `✅ 全 ${total} ソースに役割コメントあり。`);
  if (unknownSrc.length) {
    for (const f of unknownSrc) lines.push(`- \`${f}\``);
  }
  lines.push('');
  lines.push('## 全ファイルツリー');
  lines.push('');

  const walk = (node, depth) => {
    const pad = '  '.repeat(depth);
    for (const dn of [...node.dirs.keys()].sort()) {
      const child = node.dirs.get(dn);
      lines.push(`${pad}- 📁 **${dn}/** (${countTreeFiles(child)})`);
      walk(child, depth + 1);
    }
    for (const fn of [...node.files].sort()) {
      const path = node.path ? `${node.path}/${fn}` : fn;
      const role = roleByPath.get(path);
      const isSrc = isRoleSource(fn);
      const suffix = role ? ` — ${role}` : (isSrc ? ' — ⚠️ 役割コメント無し' : '');
      lines.push(`${pad}- \`${fn}\`${suffix}`);
    }
  };
  walk(root, 0);
  lines.push('');
  return lines.join('\n');
}

/* ============================================================================
 * 機能サイトマップ(feature-sitemap): 添付イメージ型の「トップ→分類→機能」カード+線マップ。
 *   既存 FEATURES(機能名/役割desc/担当ファイル)を FEATURE_CATEGORY で大分類に束ね、各機能を
 *   役割つきカードで縦に並べる。AI も人間も「どの機能が・何をして・どのファイルか」を1枚で掴める。
 *   依存ゼロ(素の HTML+CSS・no CDN)。AI 用に docs/feature-sitemap.md も出す。`--check` で腐り検知。
 * ========================================================================== */

/** FEATURES をカテゴリ順にグルーピングして返す。 */
function groupFeaturesByCategory() {
  /** @type {Map<string, typeof FEATURES>} */
  const byCat = new Map();
  for (const f of FEATURES) {
    const cat = FEATURE_CATEGORY[f.feature] || 'その他';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(f);
  }
  return CATEGORY_ORDER.filter((c) => byCat.has(c)).map((cat) => ({ cat, features: byCat.get(cat) }));
}

/** 手動 FEATURES が既に paths で持つファイル集合(自動分類で重複表示しないため)。 */
function manualFeaturePathSet() {
  const s = new Set();
  for (const f of FEATURES) for (const p of f.paths || []) s.add(p);
  return s;
}

/**
 * v0.1.840(マップ網羅化 第2): 全ソースを classifyFeatureCategory で自動分類し、カテゴリ別に
 *   { path, role } を返す。手動 FEATURES が既に載せたファイルは除外(重複回避)。
 *   roleByPath = collectFileRoles().roleByPath(先頭コメント由来の役割)。
 * @param {Map<string,string|null>} roleByPath
 * @returns {Map<string, {path:string, role:string|null}[]>}
 */
function classifyAllSourceFiles(roleByPath) {
  const manual = manualFeaturePathSet();
  /** @type {Map<string, {path:string, role:string|null}[]>} */
  const byCat = new Map();
  for (const [path, role] of roleByPath.entries()) {
    if (role == null) continue; // 役割コメントが無い(=非ソース/生成物)は対象外。
    if (manual.has(path)) continue; // 手動 FEATURES に載っている代表は重複させない。
    const cat = classifyFeatureCategory(path, role);
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push({ path, role });
  }
  for (const arr of byCat.values()) arr.sort((a, b) => a.path.localeCompare(b.path));
  return byCat;
}

/** 分類ごとの枝の色(MindMeister 風の色分け)。CATEGORY_ORDER と対応。 */
const CATEGORY_COLOR = {
  '📤 送信': '#e0794a', '📥 取得': '#4a8de0', '💾 記録': '#9b6fe0',
  '🧮 集計': '#3fae8e', '🪟 表示・演出': '#e05a8d', '🔊 読み上げ': '#d6a73a',
  '📊 レポート': '#5aa7e8', '🩺 診断・地図': '#6fae5a', 'その他': '#7b8390'
};

/**
 * 機能マインドマップ HTML(MindMeister 風・中心→分類枝→機能・色分け・キャラ解説)。依存ゼロ。
 * 横方向のツリー: 左に中心ノード、右へ分類が枝分かれ。各分類に色とりんく/こん太/たぬ姉の解説。
 * @param {string[]} files 実在検証用(消えた担当ファイルを赤く)
 */
function renderFeatureSitemapHtml(files, roleByPath) {
  const trackedSet = new Set(files);
  const groups = groupFeaturesByCategory();
  const autoByCat = classifyAllSourceFiles(roleByPath || new Map());
  // 手動 FEATURES が1つも無いカテゴリも、自動分類でファイルがあれば枝を出す(網羅)。
  const catsWithManual = new Set(groups.map((g) => g.cat));
  const extraCats = CATEGORY_ORDER.filter((c) => autoByCat.has(c) && !catsWithManual.has(c));
  const allGroups = [...groups, ...extraCats.map((cat) => ({ cat, features: [] }))]
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.cat) - CATEGORY_ORDER.indexOf(b.cat));
  const branches = allGroups.map(({ cat, features }) => {
    const color = CATEGORY_COLOR[cat] || '#7b8390';
    const note = CATEGORY_CHARA_NOTE[cat];
    const charaRows = note
      ? `<div class="mm-chara">`
        + `<div class="mm-c"><img src="../extension/images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-open.thumb128.png" alt="りんく" loading="lazy"><span>${escapeHtml(note.link)}</span></div>`
        + `<div class="mm-c"><img src="../extension/images/yukkuri-charactore-english/konta/kitsune-yukkuri-smile-mouth-open.thumb128.png" alt="こん太" loading="lazy"><span>${escapeHtml(note.konta)}</span></div>`
        + `<div class="mm-c"><img src="../extension/images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-smile-mouth-open.thumb128.png" alt="たぬ姉" loading="lazy"><span>${escapeHtml(note.tanu)}</span></div>`
        + `</div>`
      : '';
    const leaves = features.map((f) => {
      const paths = (f.paths || []).map((p) => {
        const ok = trackedSet.has(p) || existsSync(join(ROOT, p));
        return ok ? `<code class="mm-path">${escapeHtml(p)}</code>` : `<code class="mm-path dead">${escapeHtml(p)} ⚠️</code>`;
      }).join('');
      return `<div class="mm-leaf"><div class="mm-fname">${escapeHtml(f.feature)}</div>`
        + `<div class="mm-fdesc">${escapeHtml(f.desc)}</div><div class="mm-paths">${paths}</div></div>`;
    }).join('');
    // v0.1.840: このカテゴリの全担当ファイル(自動分類)を折りたたみで網羅表示(手動代表の下層)。
    const auto = autoByCat.get(cat) || [];
    const autoRows = auto.map((a) =>
      `<div class="mm-auto-row"><code class="mm-path">${escapeHtml(a.path)}</code>`
      + `<span class="mm-auto-role">${escapeHtml(a.role || '')}</span></div>`
    ).join('');
    const autoBlock = auto.length
      ? `<details class="mm-auto"><summary>🗂 このカテゴリの全担当ファイル(自動分類) <span class="mm-cnt">${auto.length}</span></summary>`
        + `<div class="mm-auto-list">${autoRows}</div></details>`
      : '';
    const totalCnt = features.length + auto.length;
    return `<details class="mm-branch" open style="--branch:${color}">`
      + `<summary><span class="mm-cat">${escapeHtml(cat)}</span><span class="mm-cnt">${totalCnt}</span></summary>`
      + `${charaRows}<div class="mm-leaves">${leaves}</div>${autoBlock}</details>`;
  }).join('');

  // v0.1.841(修正系譜マップ): changelog 全版を系統で枝化。同系統のバグを過去にどう直したかを辿る=再発防止。
  const lineage = buildChangelogLineage(EXTENSION_CHANGELOG);
  const lineageBranches = lineage.map((b) => {
    const vers = b.versions.map((v) =>
      `<div class="lin-v"><span class="lin-ver">v${escapeHtml(v.version)}</span>`
      + `<span class="lin-date">${escapeHtml(v.date)}</span>`
      + `<span class="lin-sum">${escapeHtml(v.summary)}</span></div>`
    ).join('');
    const open = b.versions.length >= 5 ? '' : ''; // 既定は畳む(情報過多回避)。
    return `<details class="lin-branch"${open}><summary>${escapeHtml(b.tag)}<span class="lin-cnt">${b.versions.length}版</span></summary>`
      + `<div class="lin-vers">${vers}</div></details>`;
  }).join('');
  const lineageHtml = `<div class="lin">
    <div class="lin-title">🧬 修正系譜マップ(この系統のバグを過去にどう直したか)</div>
    <p class="lin-sub">changelog 全 ${EXTENSION_CHANGELOG.length} 版を「バグ系統」で束ねた枝。同じ系統をまた触るとき、ここを開けば過去の修正と「なぜ毎回触るか」が一目で分かる(再発防止)。新しい順。<code>npm run tree-map</code> で自動生成。</p>
    ${lineageBranches}
  </div>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>機能マインドマップ — 君斗りんくの追憶のきらめき</title>
<style>
  :root{ --bg:#0f1115; --panel:#161922; --ink:#e6e8ec; --sub:#aab0bb; --muted:#7b8390; --line:#2a2f3a;
    --warn:#b5485f; --accent:#ec4899; }
  body{ margin:0; padding:28px 20px; background:var(--bg); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Sans","Yu Gothic UI",sans-serif; }
  .wrap{ max-width:1180px; margin:0 auto; }
  h1{ font-size:21px; margin:0 0 4px; }
  .meta{ color:var(--muted); font-size:12px; margin:0 0 18px; line-height:1.6; }
  .meta a{ color:#7fa8e0; }
  .mm{ display:flex; align-items:flex-start; gap:0; }
  .mm-center{ flex:0 0 auto; align-self:center; background:linear-gradient(135deg,#ec4899,#6366f1);
    color:#fff; font-weight:700; font-size:15px; padding:14px 18px; border-radius:16px;
    box-shadow:0 4px 16px rgba(0,0,0,.4); text-align:center; line-height:1.5; }
  .mm-trunk{ flex:0 0 28px; align-self:stretch; border-left:2px solid var(--line); margin-left:14px; }
  .mm-branches{ flex:1 1 auto; display:grid; gap:12px; }
  details.mm-branch{ background:var(--panel); border:1px solid var(--line); border-left:5px solid var(--branch);
    border-radius:12px; padding:8px 14px; }
  details.mm-branch > summary{ cursor:pointer; display:flex; align-items:center; gap:10px; list-style:none;
    font-size:16px; font-weight:700; color:#fff; padding:4px 0; }
  details.mm-branch > summary::-webkit-details-marker{ display:none; }
  details.mm-branch > summary::before{ content:"▸"; color:var(--branch); font-size:14px; }
  details.mm-branch[open] > summary::before{ content:"▾"; }
  .mm-cat{ color:var(--branch); }
  .mm-cnt{ font-size:11px; color:var(--muted); font-weight:400; }
  .mm-chara{ display:flex; gap:8px; flex-wrap:wrap; margin:6px 0 10px; }
  .mm-c{ display:flex; align-items:center; gap:6px; background:rgba(255,255,255,.04);
    border:1px solid var(--line); border-radius:999px; padding:3px 10px 3px 3px; }
  .mm-c img{ width:30px; height:30px; object-fit:contain; }
  .mm-c span{ font-size:11px; color:var(--sub); line-height:1.4; }
  .mm-leaves{ display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:8px; }
  .mm-leaf{ background:rgba(255,255,255,.03); border:1px solid var(--line);
    border-left:3px solid var(--branch); border-radius:8px; padding:8px 11px; }
  .mm-fname{ font-size:13px; font-weight:700; color:#ffe3b8; }
  .mm-fdesc{ font-size:11.5px; color:var(--sub); margin:4px 0 6px; line-height:1.55; }
  .mm-paths{ display:flex; gap:5px; flex-wrap:wrap; }
  .mm-path{ font-family:"Menlo","Consolas",monospace; font-size:10.5px; background:rgba(255,255,255,.06);
    border:1px solid var(--line); border-radius:5px; padding:1px 6px; color:#bcd2f6; }
  .mm-path.dead{ color:#f6c7d2; border-color:var(--warn); background:rgba(181,72,95,.12); }
  details.mm-auto{ margin-top:8px; border-top:1px dashed var(--line); padding-top:6px; }
  details.mm-auto > summary{ cursor:pointer; font-size:12px; color:var(--sub); list-style:none; }
  details.mm-auto > summary::-webkit-details-marker{ display:none; }
  details.mm-auto > summary::before{ content:"▸ "; color:var(--branch); }
  details.mm-auto[open] > summary::before{ content:"▾ "; }
  .mm-auto-list{ display:grid; gap:3px; margin-top:6px; }
  .mm-auto-row{ display:flex; gap:8px; align-items:baseline; flex-wrap:wrap; }
  .mm-auto-row .mm-path{ flex:0 0 auto; }
  .mm-auto-role{ font-size:11px; color:var(--muted); line-height:1.5; }
  /* 🧬 修正系譜マップ(同系統のバグを過去にどう直したか) */
  .lin{ margin-top:22px; }
  .lin-title{ font-size:16px; font-weight:700; color:#fff; margin:0 0 4px; }
  .lin-sub{ font-size:12px; color:var(--muted); margin:0 0 12px; line-height:1.6; }
  details.lin-branch{ background:var(--panel); border:1px solid var(--line); border-left:4px solid var(--accent,#ec4899);
    border-radius:10px; padding:7px 13px; margin:0 0 8px; }
  details.lin-branch > summary{ cursor:pointer; list-style:none; font-size:14px; font-weight:700; color:#fff; display:flex; gap:8px; align-items:center; }
  details.lin-branch > summary::-webkit-details-marker{ display:none; }
  details.lin-branch > summary::before{ content:"▸"; color:var(--accent,#ec4899); }
  details.lin-branch[open] > summary::before{ content:"▾"; }
  .lin-cnt{ font-size:11px; color:var(--muted); font-weight:400; }
  .lin-vers{ margin:8px 0 2px; border-left:2px solid var(--line); padding-left:12px; display:grid; gap:5px; }
  .lin-v{ display:flex; gap:8px; align-items:baseline; flex-wrap:wrap; }
  .lin-ver{ font-family:"Menlo","Consolas",monospace; font-size:11px; color:#bcd2f6; flex:0 0 auto; }
  .lin-date{ font-size:10.5px; color:var(--muted); flex:0 0 auto; }
  .lin-sum{ font-size:12px; color:var(--sub); line-height:1.5; }
  .ctrl{ margin:0 0 14px; display:flex; gap:8px; }
  .ctrl button{ background:rgba(255,255,255,.06); border:1px solid var(--line); color:var(--ink);
    border-radius:8px; padding:5px 12px; font-size:12px; cursor:pointer; }
  .legend{ margin-top:20px; font-size:12.5px; color:var(--sub); background:var(--panel);
    border:1px solid var(--line); border-radius:12px; padding:14px 18px; line-height:1.9; }
  .legend b{ color:var(--ink); }
  @media (max-width:640px){ .mm{ flex-direction:column; } .mm-center{ align-self:stretch; margin-bottom:10px; }
    .mm-trunk{ display:none; } }
${NAV_CSS}
</style>
</head>
<body>
<div class="wrap">
  ${navHeaderHtml('feature-sitemap')}
  <h1>🧠 機能マインドマップ(りんく・こん太・たぬ姉の解説つき)</h1>
  <p class="meta">
    アプリ全体から「分類 → 機能 → 役割 → 担当ファイル」へ枝分かれ。分類ごとに色分けし、りんく・こん太・たぬ姉が
    やさしく解説します。<code>scripts/repo-tree-map.mjs</code> から自動生成(手編集しない・no CDN)。<br>
    全地図の入口: <a href="MAP.md">MAP.md</a> ／ 全ファイル: <a href="code-tree.html">code-tree.html</a> ／
    逆引き索引: <a href="repo-tree-map.html">repo-tree-map.html</a> ／ AI用テキスト: <a href="feature-sitemap.md">feature-sitemap.md</a>。
  </p>
  <div class="ctrl">
    <button onclick="document.querySelectorAll('details.mm-branch').forEach(d=>d.open=true)">全部ひらく</button>
    <button onclick="document.querySelectorAll('details.mm-branch').forEach(d=>d.open=false)">全部とじる</button>
  </div>
  <div class="mm">
    <div class="mm-center">🌟<br>君斗りんく<br><span style="font-size:11px;font-weight:400;">アプリ全体</span></div>
    <div class="mm-trunk"></div>
    <div class="mm-branches">${branches}</div>
  </div>
  ${lineageHtml}
  <div class="legend">
    <b>読み方</b>: 左=アプリ全体(中心)。右へ枝分かれするのが<b>分類</b>(色ごと)。分類を開くと、3キャラの解説と、
    その分類の<b>機能</b>(太字=機能名・その下=何をするか・最下段=担当ファイル)が出ます。<br>
    <b style="color:#f6c7d2">赤いファイル</b>=消えた/リネームされた担当。新機能は <code>FEATURES</code> /
    <code>FEATURE_CATEGORY</code> に1行。<code>npm run tree-map -- --check</code> が腐りを検知。
  </div>
</div>
</body>
</html>
`;
}

/** 機能サイトマップ Markdown(AI/GitHub 用のテキスト正本)。 */
function renderFeatureSitemapMd(files, roleByPath) {
  const trackedSet = new Set(files);
  const autoByCat = classifyAllSourceFiles(roleByPath || new Map());
  const lines = [];
  lines.push('# 🗺️ 機能サイトマップ(何が・何をして・どのファイルか・自動生成)');
  lines.push('');
  lines.push('> `npm run tree-map` で再生成。手で編集しない(`--check` が verify:cc で腐りを検知)。');
  lines.push('> 全機能を「分類 → 機能 → 役割 → 担当ファイル」で。代表は手動 FEATURES・残りは自動分類で全網羅。視覚版: [feature-sitemap.html](feature-sitemap.html)。');
  lines.push('');
  const manualGroups = groupFeaturesByCategory();
  const catsWithManual = new Set(manualGroups.map((g) => g.cat));
  const extraCats = CATEGORY_ORDER.filter((c) => autoByCat.has(c) && !catsWithManual.has(c));
  const allGroups = [...manualGroups, ...extraCats.map((cat) => ({ cat, features: [] }))]
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.cat) - CATEGORY_ORDER.indexOf(b.cat));
  for (const { cat, features } of allGroups) {
    lines.push(`## ${cat}`);
    lines.push('');
    const note = CATEGORY_CHARA_NOTE[cat];
    if (note) {
      lines.push(`> 🦊りんく: ${note.link}`);
      lines.push(`> 🦊こん太: ${note.konta}`);
      lines.push(`> 🦝たぬ姉: ${note.tanu}`);
      lines.push('');
    }
    for (const f of features) {
      lines.push(`- **${f.feature}** — ${f.desc}`);
      for (const p of (f.paths || [])) {
        const ok = trackedSet.has(p) || existsSync(join(ROOT, p));
        lines.push(`  - \`${p}\`${ok ? '' : ' ⚠️ 見つからない'}`);
      }
    }
    // v0.1.840: このカテゴリの全担当ファイル(自動分類・手動代表の重複は除く)を網羅。
    const auto = autoByCat.get(cat) || [];
    if (auto.length) {
      lines.push(`<details><summary>🗂 このカテゴリの全担当ファイル(自動分類) ${auto.length}</summary>`);
      lines.push('');
      for (const a of auto) lines.push(`- \`${a.path}\` — ${a.role || ''}`);
      lines.push('');
      lines.push('</details>');
    }
    lines.push('');
  }
  // v0.1.841(修正系譜マップ): changelog 全版を系統で枝化(AI/GitHub 用テキスト)。
  lines.push('## 🧬 修正系譜マップ(この系統のバグを過去にどう直したか)');
  lines.push('');
  lines.push(`> changelog 全 ${EXTENSION_CHANGELOG.length} 版を「バグ系統」で束ねた枝。同系統をまた触るとき、過去の修正と「なぜ毎回触るか」を辿る(再発防止)。新しい順。`);
  lines.push('');
  for (const b of buildChangelogLineage(EXTENSION_CHANGELOG)) {
    lines.push(`### ${b.tag} (${b.versions.length}版)`);
    for (const v of b.versions) lines.push(`- \`v${v.version}\` ${v.date} — ${v.summary}`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * v0.1.840(マップ網羅化 第2・腐り検知): 全ソース(役割コメントを持つファイル)が逆引きに
 *   1つ以上出ているか検証する。手動 FEATURES または自動分類のどちらかに入っていれば OK。
 *   'その他'(未分類)に落ちた件数を返す(--check で件数を警告し、分類キー追加 or 手動 FEATURES を喚起)。
 * @param {Map<string,string|null>} roleByPath
 * @returns {{ total:number, misc:number, miscFiles:string[] }}
 */
function assertAllFilesIndexed(roleByPath) {
  const autoByCat = classifyAllSourceFiles(roleByPath);
  const manual = manualFeaturePathSet();
  let total = 0;
  const miscFiles = [];
  for (const [path, role] of roleByPath.entries()) {
    if (role == null) continue;
    total += 1;
    if (manual.has(path)) continue;
    if (classifyFeatureCategory(path, role) === 'その他') miscFiles.push(path);
  }
  void autoByCat;
  return { total, misc: miscFiles.length, miscFiles };
}

/** ---- main ---- */
function generate() {
  const files = trackedFiles();
  const nodes = buildTree(files);
  const { md, missing } = renderMarkdown(nodes, files);
  const html = renderHtml(nodes, files, missing);
  const dead = featureDeadPaths(new Set(files));
  const fullTree = buildFullTree(files);
  const roles = collectFileRoles(files);
  const codeTreeHtml = renderCodeTreeHtml(fullTree, roles);
  const codeTreeMd = renderCodeTreeMd(fullTree, roles);
  const featureSitemapHtml = renderFeatureSitemapHtml(files, roles.roleByPath);
  const featureSitemapMd = renderFeatureSitemapMd(files, roles.roleByPath);
  // v0.1.840: 全ソースが逆引き(手動 or 自動分類)に1つ以上出ているか。'その他'(未分類)件数も返す。
  const indexCoverage = assertAllFilesIndexed(roles.roleByPath);
  return { md, html, missing, dead, codeTreeHtml, codeTreeMd, featureSitemapHtml, featureSitemapMd, indexCoverage };
}

const isCheck = process.argv.includes('--check');
const { md, html, missing, dead, codeTreeHtml, codeTreeMd, featureSitemapHtml, featureSitemapMd, indexCoverage } = generate();

if (isCheck) {
  let fail = false;
  for (const [path, content] of [[OUT_MD, md], [OUT_HTML, html], [OUT_CODE_TREE_HTML, codeTreeHtml], [OUT_CODE_TREE_MD, codeTreeMd], [OUT_FEATURE_SITEMAP_HTML, featureSitemapHtml], [OUT_FEATURE_SITEMAP_MD, featureSitemapMd]]) {
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
  // v0.1.840: 逆引き網羅の腐り検知(warn)。'その他'(未分類)が増えたら分類キーワード追加を喚起。
  if (indexCoverage && indexCoverage.misc > 0) {
    console.warn(`[repo-tree-map] 注意: 逆引きで未分類(その他)${indexCoverage.misc} / ${indexCoverage.total} 件。classifyFeatureCategory に分類キーを足すか手動 FEATURES に載せると精度が上がります。`);
  }
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_MD, md, 'utf8');
  writeFileSync(OUT_HTML, html, 'utf8');
  writeFileSync(OUT_CODE_TREE_HTML, codeTreeHtml, 'utf8');
  writeFileSync(OUT_CODE_TREE_MD, codeTreeMd, 'utf8');
  writeFileSync(OUT_FEATURE_SITEMAP_HTML, featureSitemapHtml, 'utf8');
  writeFileSync(OUT_FEATURE_SITEMAP_MD, featureSitemapMd, 'utf8');
  console.log(`[repo-tree-map] wrote ${OUT_MD}, ${OUT_HTML}, code-tree, feature-sitemap`);
  if (missing.length) {
    console.warn(`[repo-tree-map] 役割未記入 ${missing.length} 件(ROLES に追記推奨): ${missing.join(', ')}`);
  }
  for (const d of dead) {
    console.warn(`[repo-tree-map] FEATURES の担当ファイルが見つかりません: "${d.feature}" → ${d.path}`);
  }
}
