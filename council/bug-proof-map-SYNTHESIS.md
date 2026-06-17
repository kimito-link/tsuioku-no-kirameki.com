# バグを未然に防ぐ "完全なMAP" — 統合設計（SYNTHESIS・1案）

正本。会議(COUNCIL bug-proof-map・design ルーティング)＋**司令塔の実コード裏取り**。日付 2026-06-18。
会議ログ: [bug-proof-map-log.txt](bug-proof-map-log.txt) / 回答: [bug-proof-map-answers.json](bug-proof-map-answers.json)

## 会議の生結果（素材・鵜呑みにしない）
design に分類され3体召集、**2/3 が回答**(nvidia/qwen3.5-122b は abort 脱落):
- **critic(deepseek-r1:14b)**: 欠けているのは **(c)リンク健全性＋文言整合性**。最小特化ツールを作れ。
  → 方向は的確。だが具体案のコードが `got`+`cheerio`(外部依存)＝**本お題の制約「追加の重い依存ゼロ」に違反**。
- **fast(llama-3.3-70b)**: 欠けているのは **(a)(b)依存可視化＋影響範囲分析**。自動生成＋腐り検知で繋げ。
  → 方向は妥当。だが「ツールを選ぶ」止まりで**具体性ゼロ**。

両者の収束点 = 欠けている地図は「**影響範囲(変えたら何が壊れるか)**」と「**Web健全性(リンク/文言)**」の2系統。

## 司令塔の裏取り＝会議の前提を2点訂正（重要・HOWTO§大事な前提のとおり）
1. ⚠️ **「依存可視化・storage 断線」は既にある**。`docs/feature-map/storage-bus.md` が
   chrome.storage キーごとの producer/consumer と**断線の疑い(書く人だけ/読む人だけ)を既に検出**
   (`scripts/feature-map.mjs`)。llama の「依存可視化を新規に」は**対象が既存**＝作り直しは却下。
   → コード側の影響範囲は feature-map(entry単位 import グラフ＋storage 断線)で概ね served。
2. ⚠️ **Web健全性は本当に何も無い**。`scan-dead-lib`/`delete-dead-lib` は**JS未使用モジュール**用で、
   HTML/MD のリンク切れ・文言/版ズレは**ノーチェック**。実証=index.html の内部記事リンク11本を Node で
   実ディスク照合したら今は0欠落だが、**それを守る仕組みが無い**(将来 typo/rename で静かに壊れる)。
   今日 publish した技術記事2本もこの無防備ゾーンにある。

## 結論（1案）= 欠けている1枚は「Web健全性MAP」。最小・依存ゼロで作る
**最ROIの欠けている1枚 = 公開ページ(LP/記事/docs)の「リンク健全性＋整合性」を自動検証する地図**。
理由: ①真の空白(コード側は feature-map で served・Web側はゼロ) ②公開事故は対外的で痛い(リンク切れ=信用毀損)
③**依存ゼロで実装可能**(自分のHTML/MDを正規表現で解析し、内部リンク先の実在をディスク照合・版/文言の一致確認)。
④既存 `repo-tree-map.mjs` / `tree-map:check` と**同じ流儀**で verify:cc に挿せる(腐り検知が無料で付く)。

過剰実装(外部クローラ・全リンクHTTP HEAD・巨大グラフDB)は却下＝critic の got/cheerio 案も externalリンクの
ネットワーク検証は CWS/オフライン/プライバシーに反するので**内部リンクのディスク照合に限定**する。

## 設計（site-map.mjs・repo-tree-map の姉妹）
新スクリプト `scripts/site-health.mjs`(仮)。git 追跡の公開HTML/MD/docs を解析し、以下を**静的・依存ゼロ**で検証:

### 検証する不変条件（最小・事故の大きい順）
1. **内部リンク健全性** — `href="xxx.html"` / `[..](xxx.md)` の**相対内部リンク先が実在するか**(ディスク照合)。
   記事一覧→各記事、docs 間相互リンク、`../privacy.html` 等。**欠落=即失敗**(今日の記事公開で実際に使う面)。
2. **版の整合性** — `manifest.json` / `package.json` / `changelog.js` 先頭の version 一致
   (既存 `verify:bump` が担当 → site-health は**重複させず**、公開ページ側に版文字列があれば一致確認だけ足す)。
3. **生成物の鮮度** — `repo-tree-map.md/html`・`feature-map/*` が最新か(既存 `tree-map:check` に委譲・再掲のみ)。
4. **記事メタの最小整合** — 各記事HTMLに `canonical`/`og:url` が自分のファイル名と一致(コピペ記事で URL 取り違え防止)。

### 出力（人もAIも1枚で見る）
- `docs/site-health.md`(テキスト正本・AI/GitHub) — 検証結果を ✅/⚠️/🔴 で一覧(repo-tree-map と同じ語彙)。
- status.html の「全体マインドマップ」に **「サイト健全性」枝**を1本足す(拡張の状態と並べて1画面)。
- **腐り検知**: `npm run site-health --check` を `verify:cc` のステップに追加。リンク欠落/版ズレ/メタ不一致で **exit 1**。

### 5論点への回答
1. 欠けている1枚 = **Web健全性MAP**(内部リンク健全性＋メタ整合)。コード影響範囲は feature-map で既出。
2. 自動生成・腐り検知 = `site-health.mjs` が git 追跡ファイルを静的解析→`docs/site-health.md` 生成＋`--check`で
   差分/欠落を exit 1。`verify:cc` に1ステップ追加(tree-map:check の隣)。
3. (c)最小チェック = **内部リンクのディスク照合＋canonical/og:url 一致＋版整合**(外部HTTPは叩かない=依存/プライバシー/速度)。
4. AI参照導線 = AGENTS.md §10「迷ったら repo-tree-map」に**「公開ページを触る前に site-health を見る/走らせる」**を追記。
   さらに repo-tree-map の FEATURES に「サイト健全性検証」を1行登録(機能逆引きから辿れる)。
5. アンチパターン(やらない) = ①外部リンクの全HTTP検証(遅い・落ちる・プライバシー) ②巨大グラフDB/可視化FW
   ③storage 依存図の再発明(feature-map と重複) ④手書きで腐る地図 ⑤全部入りの1巨大スクリプト。

## 段階導入（退化最小・既存資産を繋ぐ）
- **第1コミット**: `scripts/site-health.mjs` 新設＝**内部リンク健全性のみ**(公開HTML/docs の相対 .html/.md リンク先実在を
  ディスク照合)＋ `docs/site-health.md` 生成＋ `--check`。純ロジックは lib に切り出し characterization test。
  まだ verify:cc には挿さず手動 `npm run site-health` で挙動確認(挙動不変)。
- **第2コミット**: `verify:cc` に `site-health:check` を追加(腐り検知 ON)＋ canonical/og:url 一致検証を足す。✅完了。
- **第3コミット**: AGENTS.md §10 に「公開ページを触ったら site-health を走らせる」導線＋ FEATURES 登録。✅完了。
  ⚠️**訂正**: 当初案の「status.html マインドマップに『サイト健全性』枝」は**やめた**。status マインドマップは
  *拡張のランタイム状態*(storage 由来)を映すもので、site-health は*ビルド時の dev チェック*(docs/site-health.md・
  verify ゲート)。runtime ページに「npm を走らせて」という静的ノードを混ぜると live 結果が出せず誤解を招く＝
  SYNTHESIS の「過剰実装しない/責務を混ぜない」に反する。site-health の結果は docs/site-health.md＋verify が正本。

## 退化ガード（厳守）
- 外部送信ゼロ・追加依存ゼロ(Node 標準 fs/正規表現のみ・got/cheerio 等は使わない)。
- 既存 verify:bump / tree-map:check と**責務を重複させない**(版整合は verify:bump、生成鮮度は tree-map:check に委譲)。
- feature-map の storage 断線検出を**作り直さない**(Web健全性は別レイヤー)。
- 各コミットで verify:cc 全緑。
