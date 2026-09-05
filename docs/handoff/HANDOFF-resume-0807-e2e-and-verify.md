# 引き継ぎ: 2026-08-07 の作業（v0.1.1284〜1288）と、次にやること

> このファイル1枚で再開できるように書いてある。**まず §0 と §5 を読む**。

---

## 0. 現在地（30秒で把握する）

```
ブランチ : feat/venue-exact-parity-dom-fingerprint
HEAD     : 23c6ec0c  v0.1.1288
PR       : #245  https://github.com/kimito-link/tsuioku-no-kirameki.com/pull/245
作業ツリー: クリーン（push 済み）
CI       : test-and-build = pass / e2e = fail(9件→1件直したので次回8件のはず)
```

**未マージ。** master へは入れていない。

---

## 1. 今日直した5件（すべて出荷物で動作確認済み）

| 版 | 内容 | 真因（1行） |
|---|---|---|
| v1284 | 会場一致を実DOM起点に | 比較の両辺が同じ鏡起点で**恒真**だった（①が0件描画でも✅） |
| v1285 | サイドパネル黒画面（3度目） | v1283 は入れ物だけ不透明にし、**中身の `transparent !important` が残っていた** |
| v1286 | 広告段のサムネ | 広告段だけが**正本の解決器を通らない**唯一のレーンだった |
| v1287 | 発言パネルが常に0件 | 会場だけが**テール(`nls_ctail_<lv>`)を読んでいなかった** |
| v1288 | 空状態で外側スクロールバー | `height:auto !important` が**ビューポート上限を無効化**していた |

★v1286/v1287 は「4回直したと宣言して4回とも動いていなかった」機能。
  共通の失敗パターン=**文字列スキャンの wiring テストで緑を確認して出荷**していた。

---

## 2. ★次にやること（優先順）

### (A) 実機確認【ユーザー操作が必要・私にはできない】
反映3手順: `git pull` → **拡張リロード** → **watchタブ F5**

確認してほしいこと:
1. **広告段**に「君斗りんく@クリエイター応援」のアイコンが出るか
   （「ゲスト」「名無し」はキャラ顔のままが**正常**）
2. **会場モードでアイコンをクリック**→ 発言一覧と「全 N 件」が出るか
3. 状態速報の `scene … 指紋①=会場 ✅` が**更新される**か
   （前回は 3.5日前の値が居座っていた＝会場が書いていなかった）
4. サイドパネルが黒くならないか

★もし広告段がまだ白丸なら「ニコニコ側が userId を返していない」ケース。
  その切り分け計器の設計は Fable が作成済み（§6 参照）。

### (B) e2e の残り8件【私が続けられる】
1件ずつ真因を特定して**別コミット**にする（混ぜると切り分け不能になる）。

| テスト | 症状 |
|---|---|
| popup-window-empty-history-real | 下空白 -168（中身がウィンドウ下へはみ出す） |
| popup-layout:465 | elementFromPoint が summary を返さない |
| timeline-fill-standalone-window | `open:false`（別ウィンドウの既定オープンにならない） |
| popup-comment-compose ×2 | コメント送信の確認が返らない |
| support-activity-timeline | 描画内容の不一致 |
| multitab-storage-contention | inlineパネルの描画完了マーカーが立たない |
| snapshot-fetch-hang-resilient | 記録件数が表示されない |

**157件は通っている**（全滅ではない）。8件はいずれも
「v1288 の修正を外しても落ちる」＝**今日の変更とは無関係**と実測済み。

---

## 3. ★e2e を調べるときの実測手順（今日確立・再利用する）

```bash
# 1件だけ走らせる（全部走らせると12分かかる）
npx playwright test tests/e2e/popup-double-scroll.spec.js --reporter=line
```

**「私の変更が原因か」を最初に切り分ける**（今日これで無関係と確定できた）:
```bash
cp extension/popup.html /tmp/mine.html
git show bc3faf6d:extension/popup.html > extension/popup.html   # 最後に緑だった版
npx playwright test <該当spec> --reporter=line                   # 同じ失敗が出るか
cp /tmp/mine.html extension/popup.html                           # 必ず戻す
```
★`bc3faf6d`(08-03) が **master で最後に CI 緑だったコミット**。

**探査テストの作り方**（helper が spec ローカルなので再利用する）:
```bash
node -e "const fs=require('fs');const s=fs.readFileSync('tests/e2e/popup-double-scroll.spec.js','utf8');
fs.writeFileSync('tests/e2e/_tmp.spec.js', s.slice(0, s.indexOf(\"test('standalone popup: body\")));"
# → その後 cat >> で test(...) を足す。console.log('PROBE '+JSON.stringify(...)) で値を出す
# → 終わったら rm -f tests/e2e/_tmp.spec.js（消し忘れ注意）
```

**勝っているCSSルールを特定する**（v1288 の真因特定に効いた）:
ページ内で `document.styleSheets` を走査し、`html.matches(rule.selectorText)` かつ
`height`/`max-height` を持つルールを全列挙する。computed と CSS 変数の値が
食い違っていたら、`!important` の上書きを疑う。

---

## 4. ★出荷物(dist)で動作確認する手順（今日確立・強力）

配信を待たずに実機相当で確かめられる。詳細はメモリ
`verify_on_shipped_bundle_2026-08-07.md`。要点:

1. `chrome-devtools` MCP で `install_extension({path:'.../extension'})`
   → `reload_extension(id)`（**版が上がったか `list_extensions` で必ず確認**）
2. `dist/*.js` から関数を波括弧の対応で切り出して実行
   ★バンドラが `TIERS`→`TIERS2` のように**改名する**。定数もバンドル側の実値を使う
   ★依存は「`X is not defined` を見て足す」ループで自動解決できる
3. 拡張ページの `evaluate_script` から `chrome.storage.local.set` で**実データを置く**
4. **修正前の挙動も同じデータで再現**して、両方向で示す
5. 後片付け（`remove`）+ `git status` 確認

★service worker は idle で落ちる。timeout したら**拡張ページ側**から storage を読む。
★dist は日本語を `\uXXXX` にする。**デコードしてから**探す（一度これで誤診した）。

---

## 5. ★踏むと危ない地雷（今日実際に踏んだもの）

1. **承認済み計画でも実装直前に前提を裏取りする**
   `FORCE_DISABLE_COMMENT_IDB_PATH = true`(content-entry.js:10773) という killswitch
   1行で、承認を得た計画（background に読み出し口を新設）が**まるごと不要**になった。
   条件分岐を根拠にするなら**その条件が true になりうるか**を遡って確かめる。
   → メモリ `verify_premise_before_implementing_2026-08-07.md`

2. **新規テストファイルを足したら tree-map を同じコミットに**
   pre-commit ガード(c9ab9937)が止めてくれる。止められたら:
   ```bash
   npm run tree-map && git add docs/repo-tree-map.* docs/code-tree.* docs/feature-sitemap.*
   ```

3. **push 直後は必ず dist の buildId が1つずれる**（pre-push フックが再ビルドするため）。
   `buildId 以外に差が無いか`を機械確認してから `git checkout -- extension/dist app/dist`。

4. **「N起点が一致する」テストは共有の1関数を呼ぶ限り恒真**
   実装から独立した**黄金値**を1本添える。→ `shared_helper_hides_canonical_bugs_2026-08-07.md`

5. **変異を入れたらまず適用を証明**（置換件数を出す）。緑を見たら
   「テストが健全」ではなく**まずテストの穴を疑う**。

---

## 6. 未着手だが設計済みのもの

- **広告APIのuid有無を1枚で確定させる計器**（Fable設計・実装なし）
  → 実機で広告段がまだ白丸だった場合に使う。`idCensus` を
    `'+α_広告ランキング'` に足す案（statusFastDiagLite は **145行がサブツリー丸ごと
    通すので passthrough 追加は不要**と裏取り済み）
- 会場の**表示名が渡らない**件（タイトルが `14087594 の発言` と数字のまま）
  → `_hoverCardDataByEl` に displayName を入れていない経路がある。
    席経路(venueBar.js:5211)とトップバー(4824)は入れているので、
    `resolveSeatlessHoverData`(2540-2575) 経由が空を返している疑い。**別コミットで**

---

## 7. 既知の未解決（今日触っていない）

- 診断ページ 9.8秒（記録件数と相関・真因未確定）
- 「watchページが見つかりません」未着手
- 記録101%の二重計上
- サイドパネル切替の設定UI
