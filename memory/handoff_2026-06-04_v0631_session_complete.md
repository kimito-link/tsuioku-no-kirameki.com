# 引継ぎ: 2026-06-04 大改修セッション(v0.1.620→631 一気通貫)

> 12時間にわたる長時間セッションで **15バージョン**を出荷。ブランチ
> `fix/koken-contrib-hidden-tab-stuck` に master との差 **30+ コミット**が
> 積み上がっている(未merge・PR #219 OPEN だが title は v0.1.616 のまま)。

## 0. 最重要: いまどこ?

- HEAD = `1cf4f2c` (v0.1.631)
- master との差 = 大量(30+ コミット・全部 squash merge 予定)
- 全部 npm run verify 全緑 (4914 tests)
- 実機検証 = 完璧に動作確認済(最終: 2026-06-04 13:55 だるまくん配信で 101% 完走+全項目表示)

## 1. このセッションの全成果 (15バージョン!)

| ver | 内容 | 状態 |
|---|---|---|
| 0.1.620 | データ無し配信レーン畳み(残課題1) | ✅ |
| 0.1.621 | backfill凍結解除+診断state(残課題3) | ✅ |
| 0.1.622 | ローディング点滅根治(待機UI/mirror/eventRankアトミック化) | ✅ |
| 0.1.623 | 他配信ユーザー混入根治(NDGR lv-identity 検証) | ✅ |
| 0.1.624 | 無限再起動ループ根治(visibility_paused 30秒クールダウン) | ✅ 「軽さ復活」 |
| 0.1.625 | 応援者帯枯渇根治(canReuseHeavyChunkRead 80%カバー条件) | ✅ |
| 0.1.626 | HTMLレポートに興味タグ来場セクション追加 | ✅ |
| 0.1.627 | 記録内訳併記+正規表現寛容化 | ✅ |
| 0.1.628 | 内訳常時表示+他経路上書き防止(undefined パス) | ✅ |
| 0.1.629 | **固定URL状態表示ページ追加** (status.html) | ✅ 新機能 |
| 0.1.630 | status タブベース列挙(過去全配信 475件→今開いている数件) | ✅ |
| 0.1.631 | status 配信者名/タイトル/来場/pt 表示(nls_watch_snapshot) | ✅ |

## 2. 状態表示ページ (v0.1.629-631・新機能!)

**ユーザー証言**「スクショ撮るのも、ワンクリックコピーも不要にしてほしい」を解消。

### URL
```
chrome-extension://edpellgokebgpjboflekdmmlnjgajnfn/status.html
```

### 表示内容
- 自動更新 2秒
- 概要(記録中 N 配信 / 累計 X 件 / 取得率 Y%)
- 配信ごとブロック(配信者名・タイトル・経過・記録/公式(取得率)・来場・pt・最終取込)
- AI に貼る用テキスト(textarea・全文+診断JSON・範囲選択→Ctrl+C)
- ボタン: 全部選択 / クリップボードコピー / JSON ダウンロード / 自動更新一時停止

### 設計上の重要点
- **完全リードオンリー**(storage write しない・background SW を起こさない)
- popup と独立(13.9k 行の重い初期化を取り込まない)
- データソース:
  - `chrome.tabs.query` で開いているニコ生 watch タブから lv 抽出(v0.1.630)
  - `nls_watch_snapshot_<lv>` から配信者名/タイトル/視聴/pt(v0.1.631)
  - `nls_panel_summary_<lv>` から記録数/公式数
- 純関数化が緩い(View レイヤなのでテストは KEY_AI_SHARE_FAST_DIAG の2件のみ)

### ファイル
- `extension/status.html` (200行・inline CSS)
- `src/extension/status-entry.js` (約400行・View レイヤ)
- `src/lib/aiShareFastDiagKey.js` (定数・5行)
- `src/lib/aiShareFastDiagKey.test.js` (2 test)
- `scripts/build.mjs` (entry 追加)
- `extension/manifest.json` (WAR に status.html / dist/status.js 追加)
- `src/extension/popup-entry.js` (KEY_AI_SHARE_FAST_DIAG を import に切替)

## 3. 残課題

### 🔴 残課題A: 配信75%止まり(長尺配信の取り逃し・P2で真因確定済)
- 場所: `src/lib/ndgrBackfillCrawl.js:667-684` の `seedCandidates`
- 真因: 固定 lag list `[30,300,900,1800,3600,7200,21600,43200]秒+programStart+60` のみで
  長尺配信(3.7時間)の中盤の穴を再シードできない
- 修正案A(最小): `runNdgrBackfillOnce` で arr 既存の最古 vpos を計算 →
  `crawlNdgrBackward` に渡し seedCandidates 先頭に push(resume storage は触らない・
  forceFullSweep と独立)
- 実装コスト: chunk/IDB 両対応の最古 vpos accessor が必要・**やや複雑**で別PR分離
- 影響: 長尺配信で 75% 止まり→95%+ 完走見込み

### 🔴 残課題B: 多タブで裏配信「記録1/公式186」(O3で真因確定済)
- 場所: `src/extension/content-entry.js:15553` `maybeAutoStartBackfill`,
  `:15755` `crawlNdgrForward` の `document.hidden` 即 return
- 真因: Chrome バックグラウンドタブ throttle + 拡張側 hidden ガード二重で
  裏タブ NDGR/backfill 完全停止
- 修正案: `runIfTabLeader` 流用で「リーダータブ1本だけ hidden でも走る」設計に
- 注意: v0.1.621 の visibility_paused 連発バグと同型のリスクあり・慎重設計必要

### 🟡 残課題C: avatar/uid 別名前空間問題(A3/G3で確認済)
- avatarMap (数値 uid キー・VIEWER_JOIN 由来) と nicknameMap (ハッシュ uid キー・
  NDGR chat 由来)でキー空間が違う
- ニコ生 API 構造の問題でコード回帰ではない
- 設計改修必要・大規模

### 🟡 残課題D: I2 (NDGR chat:2 msg.1 system event 混入)
- 場所: `src/lib/ndgrDecode.js:228-252` `decodeChat`
- 仮説B 最有力: msg.1 LEN payload に chat 以外の system event 混入
- 観測強化 PR で実機データ取得 → 真因確定 → fn 救済 or oneof 分岐追加

### 🟡 残課題E: setCountDisplay 他経路で breakdown 引数追加
- 今回 v0.1.628 で undefined 保持にしたので副作用は止まったが、本来は他5経路にも
  breakdown を渡すと初期paint→他経路 race で「内訳が一瞬出て消える」問題が消える
- 軽微・優先度低

## 4. PR #219 (squash merge 推奨)

- ブランチ `fix/koken-contrib-hidden-tab-stuck` に v0.1.616-631 まで積層
- PR #219 のタイトルが v0.1.616 のままなので更新が必要
- 推奨タイトル: 「北極星レーン大改修+状態ページ追加 v0.1.616-631」
- squash merge で 30+ コミットを 1コミットに集約推奨
- e2e flaky の問題は documented(`event-broadcasters-lane.spec.js:19` は master でも落ちる)

## 5. このセッションで使った AI ツール(参考)

並列調査で多くのエージェントを動員した実例として記録:

### 並列エージェント実績
- **general-purpose**: 真因調査用に多数並列(A2/A3/A5/B2/C1/C2/E1/E2/E3/G1-G4/H1/H2/I1/I2/K1/O1/O2/O3/P1/P2/R1)
- **code-reviewer**: A4(v0.1.620 git diff 回帰)/C4(v0.1.621 同種)で重要レビュー
- **Explore**: M2(HTMLレポート構造把握)/R2(build.mjs 新規entry手順) で広範サーチ
- **codex-impl**: A5(backfill 旧/新 run 競合発見)で追加洞察
- **opencode-local**: A7(過去 memory パターン照合)で過去事例参照
- **cursor-impl**: N1で起動失敗(サンドボックス permission)→司令塔本体で代替

### 並列で動かす利点(学び)
- 1セッションで 15バージョン出荷できたのは並列調査のおかげ
- 真因確定→実装の間に複数視点で検証できるので回帰リスク減
- ただし cursor-agent は Bash サンドボックスで起動不可。Codex CLI は OK

## 6. 実装パターン(再利用ヒント)

### 「内訳」のような UI 追加の最小手順(v0.1.627-628 で確立)
1. `src/lib/[name].js` に純関数(集計+formatter)新規
2. `src/lib/[name].test.js` に unit test
3. `extension/popup.html` に sub 行要素追加(hidden 初期)
4. `src/extension/popup-entry.js` の setXxxDisplay に引数追加(default undefined で
   既存呼出が壊さない)
5. 描画ループの呼び出し元で集計→引数渡し

### 「固定URLページ」追加の最小手順(v0.1.629 で確立)
1. `src/extension/[name]-entry.js` 新規
2. `extension/[name].html` 新規(`<script src="dist/[name].js">`)
3. `scripts/build.mjs` targets 配列に entry 追加
4. `extension/manifest.json` web_accessible_resources に追加
5. データ取得は `chrome.storage.local.get([key1,key2,...])` で一括(複数キー対応)
6. `chrome.storage.local.onChanged` で増分 refresh(prefix フィルタで過剰反応抑止)
7. `chrome.tabs.query` で開いているタブから lv 抽出(過去履歴で汚染しない)

## 7. 次セッション開始時のコマンド

```bash
cd C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com
git status
git log --oneline -10
npm run verify   # 全緑確認
```

## 8. ユーザー向けメモ

### status.html ブックマーク登録手順
1. `chrome://extensions/` で「君斗りんくの追憶のきらめき」を **🔄 更新**
2. アドレスバーに `chrome-extension://edpellgokebgpjboflekdmmlnjgajnfn/status.html` を入力
3. Ctrl+D で「君斗りんく 状態」として保存
4. 以降はブックマーク 1 クリックで開く

### AI に状態を共有するとき
1. ブックマーク → status.html を開く
2. 「クリップボードへコピー」ボタンクリック
3. AI に Ctrl+V

(スクショ撮影不要、ワンクリックで完結)

## 9. 重要 reference 一覧(MEMORY 参照)

- `feedback_root_cause_autonomous.md` (根本解決優先・承認不要自走)
- `feedback_verify_in_real_browser_before_reporting.md` (実機検証してから報告)
- `feedback_extension_bump_flow.md` (こまめに bump)
- `reference_baseline_v0192_zip.md` (v0.1.592 baseline 絶対尊重)
- `reference_osint_strategy_socialxup_chikuran.md` (Phase C 「おすすめ枠インテリジェンス」の
  土台として M3 設計で参照済・別PR で実装予定)
