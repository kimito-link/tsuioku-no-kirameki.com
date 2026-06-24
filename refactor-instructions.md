# Refactor Instructions — tsuioku-no-kirameki (追憶のきらめき)

> 実装担当モデル(Codex / Opus / Cursor)向けの作業指示書。
> **目的は「負債を減らすこと」であって「機能を変えること」ではない。** 1行も挙動を変えてはいけない。
> この指示書は司令塔(Claude Code 本体)が証拠調査(Explore 3体 + 実コード裏取り)の上で書いた。
> 着手前に必ず [AGENTS.md](AGENTS.md) §12「実装前ゲート」と [memory/MEMORY.md](memory/MEMORY.md) を読むこと。

---

## 0. Objective(目的)

巨大化した2つの entry ファイルの **責務混在を解消** し、純関数を `src/lib` に抽出してテストで固める。
これにより eslint `max-lines` ラチェットの圧力を下げ、将来の機能追加を可能にする。

- `src/extension/popup-entry.js` — **21,019行 / 374 top-level 関数**(描画 + 集計 + storage + messaging + celebration 演出 が混在。`chrome.*` 173箇所・lib import 157)
- `src/extension/content-entry.js` — **18,045行 / 253 top-level 関数**(NDGR受信 + persist + backfill + DOM観測 が混在。lib import 90)

**ゴールは「entry を薄くし、ロジックを `src/lib` の純関数 + テストへ移す」こと。** 振る舞いは完全に保つ。

### なぜ今これをやるのか
- `src/lib` は既に **472 純関数モジュール + 474 テスト(ほぼ1:1)** で、抽出の型は確立済み。良い前例が大量にある(popup は 157、content は 90 の lib をすでに import 済み=移植先パターンは実証済み)。
- entry 2本だけが取り残されて巨大化し、eslint `max-lines` で「これ以上増やせない」運用になっている(下記 §4)。
- 機能追加(LiveStateStream・応援パワー診断・演出)が控えており、その前に土台を軽くしたい。

---

## 0.5 Project Understanding(証拠に基づく前提・着手前に把握)

- **何をするか**: Chrome 拡張「君斗りんくの追憶のきらめき」(ID `cjbabignmmodaickpeckiojjabnlogdb`)。ニコ生(`*.nicovideo.jp`)の応援コメント/ギフトを `chrome.storage.local` に記録し、放送後に 3 レーン(りんく=配信者視点 / こん太=ファン視点 / たぬ姉=匿名ガイド)+活発度で振り返る。応援ライブビュー・会場モード・読み上げ・純Web版(`app.tsuioku-no-kirameki.com`)を持つ。(出典: AGENTS.md §1-3)
- **主要エントリーポイント**(出典: scripts/build.mjs / wc -l): §4 の esbuild エントリ表。中核は popup-entry(21k)/content-entry(18k)/background.js(3.5k)/venueBar(3.3k)/status-entry(2.5k)。
- **主要モジュールと責務**: `src/lib/`=472 純関数(色/速度/コメント整形/レーン集約/人物タイル/会場席/NDGR decode/レポート)。`src/domain/`=応援/集約/識別子。`src/data/`=コメント取得。`src/shared/`=共有アバター。
- **データの流れ**: watch タブの content がコメント収穫→`chrome.storage.local`(単一 LevelDB)保存→popup が読み出して 3 レーン/数字カード描画。純Web版は status の「WEBサイトURLで見る」送信→`api/status.js`(Vercel+Upstash)→`app/*` が GET 再描画。**read を増やすと混雑で詰まる**のは既知。
- **外部依存**(出典: package.json): 拡張本体はランタイム依存ゼロ。devDeps=esbuild/vitest/playwright/eslint/typescript/happy-dom/fake-indexeddb/husky。外部サービス=Vercel(api/status.js)+Upstash Redis、Cloudflare Pages(LP)。
- **検証コマンド**(出典: package.json / run-verify-cc.mjs): `npm run verify:cc`= test:cc→lint→typecheck→build→tree-map:check→site-health:check→feature-map:check→verify:bump(1つでも失敗で停止)。
- **tsconfig**: allowJs+checkJs+noImplicitAny(strict:false)。JS に JSDoc 型が付き型チェックされる。include=`src/**/*.js`+`extension/background.js`、exclude=dist/test。
- **テスト分布**(重要): `src/lib/` に 474 テスト、`src/extension/`(=モノリス群)に実質 1 テスト。**抽出して lib に移すことがそのままテスト可能化になる**=本リファクタの中心的価値。

---

## 1. Behaviors To Preserve(絶対に保つ振る舞い)

以下はユーザーが実機で何度も根治してきた振る舞い。**1つでも壊すと過去の修正が全て無に帰す。**

1. **過去ログ一気取り(backfill)** — タブを閉じても SW が継続。取りこぼしゼロ。`reached_start` まで遡って全件保存。
   - 関連根治: persist バッファ中断消失 / no_progress 自動リトライ / グローバル enabled 波及 / persistCoalescer.flush await。
2. **コメント件数の単調増加** — 同一 lv 内で件数が後退しない(`resolveMonotonicCommentCount`)。
3. **開いた瞬間に全件表示** — `chrome.storage.session` キャッシュ即時復元(`sessionCommentCache`)。ローディングを見せない(星野メソッド)。
4. **読み上げが配信切替に追従** — comeview が `nls_last_watch_url` 変化に自動追従(v0.1.724)。
5. **会場モード** — 名前リンク・吹き出し最上位レイヤー・サムネ表示・読み上げ。座席選抜の安定性。
6. **公式値レーンは API 直叩きで即表示** — 待機UI・「問い合わせ中」を出さない。無いものは出さない。
7. **来場者数 / 同接の区別** — 来場は累計(`viewerCountFromDom`)、同接は別物。混同しない。
8. **本家DOMを破壊しない** — 会場バー等は fixed オーバーレイで、ニコ生の watch ページを書き換えない。

**検証は §7 のコマンドだけでなく、可能なら実機(Claude-in-Chrome / chrome-devtools-mcp)で上記を確認すること。**

---

## 2. Non-Negotiables(交渉の余地なし)

1. **挙動を変えない。** これはリファクタであって機能改修ではない。抽出した関数は入出力が元と完全一致すること。
2. **抽出した純関数には必ずテストを書く。** `src/lib` の既存 1:1 規律(402関数 : 406テスト)を守る。テストなしの抽出は不可。
3. **eslint `max-lines` の上限値を上げない。** 抽出して減ったら**下げる**のは可。増やすのは禁止([eslint.config.js:64](eslint.config.js))。
4. **storageKeys の文字列値を変更しない。** `src/lib/storageKeys.js` は 98 個のキーを export。**キー文字列を変えると保存済みユーザーデータが消える。** 名前(変数名)も触らない。
5. **version 整合を守る。** `extension/manifest.json` を上げたら `CHANGELOG` も対応させる(`npm run verify:bump`)。でっち上げ厳禁。リファクタのみで機能追加が無いなら version を上げる必要はない。
6. **`background.js` は bundle されない別系統。** 後述 §3 参照。esbuild の entry ではなく素の `script`。安易に import を足さない。
7. **1 PR = 1 抽出単位。** 巨大な一括移動は不可。小さく出して各 PR で §7 を緑にする。

---

## 3. Danger Map(危険境界 — 触るなら Stop And Ask)

下記は「壊れたらユーザーデータ消失 / コメント取りこぼし」が起きる心臓部。**抽出の対象にしてよいのは “純粋な計算部分だけ”。副作用本体・I/O・状態機械は entry に残す。**

| 危険境界 | 場所 | 壊れると | 扱い |
|---|---|---|---|
| **persistCommentRows** | [content-entry.js:10718](src/extension/content-entry.js) / Impl:10876 | コメント取りこぼし・保存破損 | 計算(行整形・dedupe判定)は抽出可。**enqueue/flush/storage書込の本体は残す。** |
| **NDGR 受信ループ** | content-entry.js(backfill本体) | 取得停止・二重取得 | 状態機械は残す。純粋なパース/判定のみ抽出可。 |
| **backfill 制御** | content-entry.js / backfill-sw-entry.js | 一気取り破綻 | 既に `src/lib` に多数の純関数あり(backfillSlotPool等)。それに倣う。 |
| **background.js (SW)** | [extension/background.js](extension/background.js)(3,478行・**bundle対象外**) | windows.create / 孤児popup掃除 / SWライフサイクル破綻 | **原則触らない。** import を足さない(bundleされないため別ファイルの関数を呼べない)。 |
| **凍結/無効化コード(削除禁止)** | `KILL_SWITCH=true`(autopatrol・content-entry.js:14902付近) / `STATUS_POPUP_EMBED_ENABLED=false` / `KEY_BACKFILL_AUTO_DISABLED` 分岐 | 再発防止の喪失 | **デッドコードではなく意図的に無効化された生きた分岐。** 削除・有効化は §3 Stop And Ask。MEMORY に「再発防止として残す」明記。 |
| **storageKeys** | [src/lib/storageKeys.js](src/lib/storageKeys.js)(98 export) | 保存済みデータ消失 | **キー文字列値は不変。** 参照の追加のみ可。 |

### Stop And Ask(必ず止まって司令塔に確認する)
- 上記 Danger Map の **I/O・状態・キー文字列** に手を入れる必要が出たとき。
- 抽出すると挙動が変わりそう(タイミング・順序・例外経路)なとき。
- テストでカバーしきれない副作用が抽出関数に残るとき。
- `max-lines` を超えそうなとき(=抽出方針が間違っている兆候)。
- version bump が必要かどうか判断がつかないとき。

「走りながら考える」は禁止(AGENTS.md §12)。迷ったら plan を先に出す。

---

## 4. Baseline(現状の正確な事実 — 2026-06-25 実コード裏取り更新)

```
manifest version : 0.1.936
ブランチ          : master
src/lib          : 472 純関数モジュール + 474 テスト(ほぼ1:1)
@ts-nocheck      : 15 ファイル
storageKeys      : 98 export(キー文字列値は不変・§2-4)
```

### 着手前に必ず実行して結果を記録する Baseline Commands
```
git status                 # 既存の未コミット変更を把握(混ぜない。例: scripts/meeting.mjs 等が未コミットのことがある)
git rev-parse HEAD         # 開始時の HEAD
npm run verify:cc          # 緑であることを確認。最初から赤い項目はスコープ外として記録し緑化しようとしない
wc -l src/extension/popup-entry.js src/extension/content-entry.js extension/background.js
```
- 既に未コミットの変更があれば**それに触れず**、自分の変更と混ぜない。可能なら作業ブランチを切る。

### esbuild エントリ(ソース = `src/extension/*-entry.js` → `extension/dist/*.js`)
| ソース | 行数 | 成果物 |
|---|---|---|
| popup-entry.js | **21,019** | dist/popup.js |
| content-entry.js | **18,045** | dist/content.js |
| backfill-sw-entry.js | — | dist/backfill-sw.js |
| status-entry.js | — | dist/status.js |
| comeview-entry.js | — | dist/comeview.js |
| venue-entry.js | — | dist/venue.js |
| page-intercept-entry.js | — | dist/page-intercept.js |
| offscreen-entry.js | — | dist/offscreen.js |
| (app/app.js) | — | app/dist/app.js |
| **extension/background.js** | **3,478** | **bundle対象外**(素のSW・`sourceType:'script'`) |

### eslint max-lines ラチェット([eslint.config.js:74-79](eslint.config.js))
```
popup-entry.js   : max 21028  ← 現状ピッタリ。1行も増やせない
content-entry.js : max 17267  ← この上限で固定。増やせない
```
**抽出して行が減ったら、この数値を新しい実数に下げること(コメント「抽出が進んだら数値を下げること」のとおり)。**

### 責務混在の証拠(popup-entry.js 冒頭の関数群)
celebration / gift / milestone 演出が密集している(`playSupportCelebrationDom`, `playGiftBahamutDom`, `maybeCelebrateFromGiftCount`, `maybeCelebrateFromAdPoints` …)。
**これらの「演出を出すか判定する純粋ロジック」は抽出の最有力候補。** 描画の DOM 操作本体は残す。

---

## 5. Debt Map(負債マップ — 抽出の優先順位)

抽出は **安全な順** に。心臓部は最後まで提案に留める。

### Phase A — 純粋判定ロジックの抽出(安全・最優先)
副作用ゼロ・入出力が明確な関数群。テストが書きやすく、リスクが最も低い。
- **popup の celebration 判定**: 「この件数/ランク/ギフトで演出を出すべきか」を返す純関数群
  (`maybeCelebrateFrom*` の **判定部分**。DOM を触る `play*Dom` 本体は残す)。
- **popup の集計/整形**: ランキング・統計カードの view-model 構築(既に `buildWatchMetaCardAudienceViewModel` 等の前例あり)。
- **content のパース/判定**: NDGR ペイロードの純粋なパース、行整形、dedupe 判定。
- **status の URL/結果整形**: 共有 URL 組み立て(`/?v=` `/live-view?v=`)・結果テキスト整形など純粋部分のみ(DOM・`chrome.tabs.create`・`uploadStatusSnapshot` はグルーに残す)。
- **純粋性チェック(必須・抽出前)**: 対象関数本体に `chrome.` / `document` / `window` / モジュールスコープの可変変数参照が**無い**ことを Read で確認。1つでもあれば抽出しない。
- **今実装してよいか**: ✅ **やってよい**(1関数=1抽出単位・抽出と同時にテスト)。

### Phase B — view-model 層の整理(中リスク)
描画関数から「何を表示するか(データ)」と「どう DOM に書くか(副作用)」を分離。
データ側を `src/lib` の純関数へ。entry には DOM 適用だけを残す。
- **今実装してよいか**: ⚠️ **小さくなら可**。データ/副作用の境界が曖昧なら Phase C 扱いで提案に留める。見せ方(会場/レーン/数字カード)に関わる分離は §3 Stop And Ask(MEMORY に「実機未確認で直ったと言うな/似せて自作するな」の戒め多数)。

### Phase C — 心臓部(**実装しない・提案のみ**)
persistCommentRows / NDGR 受信 / backfill 状態機械 / background.js / モノリスの物理ファイル分割。
**これらは指示書では “提案” に留める。** 実際に手を入れる場合は必ず別途会議 + 司令塔承認。
- **今実装してよいか**: ❌ **提案のみ**。

### 凍結/無効化コード(削除候補に見えるもの)
autopatrol `KILL_SWITCH=true` / `STATUS_POPUP_EMBED_ENABLED=false` / `KEY_BACKFILL_AUTO_DISABLED`。
- **今実装してよいか**: ❌ **触らない・提案もしない**(意図的に残された再発防止。§3 Danger Map 参照)。

---

## 6. Implementation Phases(進め方)

1. **1 PR = 1 関数群の抽出。** 例:「celebration 判定 5関数を `src/lib/celebrationDecision.js` へ + テスト」。
2. 各 PR で:
   - `src/lib/<name>.js` に純関数を作る(export)。
   - `src/lib/<name>.test.js` にテストを書く(**元の挙動を固定するテスト = characterization test**)。
   - entry 側を `import` 差し替え(挙動同値を確認)。
   - eslint `max-lines` を減った実数に**下げる**。
3. §7 を緑にする。
4. 可能なら実機で §1 の該当振る舞いを確認。
5. 司令塔に diff を渡す(`git diff`)→ `/code-review` → MEMORY/reference 更新(これは**司令塔本体専用**・実装モデルは触らない)。

**着手は Phase A の最も孤立した関数から。** 1本通して型を確立してから次へ。

---

## 7. Verification(検証 — これが緑でなければ完了ではない)

Windows + Claude ターミナルでハングしない順:
```
npm run verify:cc      # test + lint + typecheck + build + bump を一括(推奨)
```
個別に走らせるなら:
```
npm run test:cc        # vitest run --reporter=dot
npm run lint           # eslint(max-lines ラチェット込み)
npm run typecheck      # tsc --noEmit
npm run build          # esbuild bundle(dist 反映)
npm run verify:bump    # manifest = CHANGELOG 整合
```
- 失敗時は `.artifacts/verify-cc.log` を Read。
- **パイプ付き `npx vitest` / `tail` / `head` / `grep` は PowerShell でハングするので使わない**(AGENTS.md / グローバルルール §3)。

---

## 8. Reporting(報告フォーマット)

各 PR で司令塔に以下を返す:
- 抽出した関数名 / 移動元(entry:行)→ 移動先(`src/lib/<name>.js`)。
- 追加したテスト数と、それが固定している振る舞い。
- `max-lines` を何→何に下げたか。
- §7 の各コマンドの結果(緑/赤)。赤なら全文。
- §1 のどの振る舞いを(実機 or テストで)確認したか。
- Stop And Ask に該当した判断があればその旨。

---

## 9. Out Of Scope(やらないこと)

- **機能追加・挙動変更**(LiveStateStream・応援パワー診断・演出 PR 等は別タスク)。
- **storageKeys のキー文字列 / 変数名の変更。**
- **background.js のリファクタ**(bundle 対象外・SW心臓部)。
- **persist / NDGR / backfill の I/O・状態機械への変更**(提案のみ)。
- **CSS / デザイントークンの変更**(baseline 尊重・別 reference)。
- **`@ts-nocheck` の一括解除**(型エラーが大量に出る。やるなら別 PR で1ファイルずつ・本タスクの対象外)。
- **MEMORY / reference の更新**(司令塔本体専用)。
