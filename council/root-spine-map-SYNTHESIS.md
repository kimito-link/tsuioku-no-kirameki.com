# 統合: 根幹データフローを「WEBで視覚的に分かる」html 図にする（1案）

> カラ会議(`root-spine-map.md`・3体 deepseek-r1:14b 批判 / qwen3.5-122b 発散 / llama-3.3-70b 総合)
> → 司令塔(Claude Code)が実コードで裏取りして1案に統合。2026-06-20。
> 確定前提(ユーザー): **出力は WEB で視覚的に分かる html 必須**。md/Mermaid 単体は不可。

## 会議の結論（3体・ほぼ一致）

| 役 | 主張 |
|---|---|
| 発散(qwen3.5) | storage キー(血管)を背骨に、**インライン SVG 生成**(座標計算なし・矩形+直線)、`<title>`/`<text>` に意味を埋めて **AI 可読**、断線(broadcaster型)を赤。「venueBar に線が繋がっていない」が一瞬で視認できる。 |
| 総合(llama) | データの一生を1本のフロー図 / 人間が背骨の節を**辞書定義**+実在検証だけ機械化 / 既存 verify と**役割分担**。 |
| 批判(deepseek-r1) | ①storageキー露出のプライバシー懸念 ②手書きhtmlは保守性難 ③削ぎすぎ注意 ④**図だけでミスは防げない** ⑤MVPのハードルを下げ簡易版から。 |

## 司令塔の裏取り（会議の訂正）

- 批判①は**不採用**: 図に載るのは storage の**キー名（`KEY_RECORDING` 等の定数）**だけ。ユーザーの
  個人データ(コメント中身)は載らない。既存 `docs/feature-map/storage-bus.md` が既に全66キー名を
  md で公開済み → 新規リスクはゼロ。
- 批判③④⑤は**採用**: お題の前提と一致(根幹だけに削ぐ・lint と役割分担・MVP は簡易から)。
- 発散の「インライン SVG + `<title>` で AI 可読 + 断線を赤」は**採用**。実コードと噛み合う(下記)。
- **最大の裏取り成果**: 材料はもう存在する。`scripts/feature-map.mjs` は既に
  ① `FEATURES`(entry→機能名=背骨の表示ノード) ② storage キーの **producer/consumer 解析**
  ③ `STORAGE_DISCONNECT_BASELINE`(断線の既知/新規判定) ④ esbuild metafile の import 到達グラフ
  を全部持つ。**新スクリプトをゼロから作るのは過剰**。feature-map.mjs に「html 出力」を1本足すのが
  星野ロミ式(既存データを活かす・重複生成しない)。

## 採用する1案

### 何を作るか
**`docs/spine-map.html`**(+ AI 可読の正本 `docs/spine-map.md`)を `scripts/feature-map.mjs` から
自動生成する。ブラウザで開くと、データの一生が**1本の縦の背骨**として図で見える:

```
[取得]  NDGR/DOM ─→ content-entry.js（記録エンジン）
                         │  KEY_RECORDING / fn:tailStorageKey / IDB
                         ▼
[記録]  offscreen-entry.js（IDB書き手） + chunk/tail
                         │  KEY_COMMENT_IDB_ENABLED ほか（storageキー＝血管）
                         ▼
[集計]  src/domain・src/data・src/lib（レーン/会場/ランキング集計）
                         │  watchSnapshot / profile 等
                         ▼
[表示]  popup-entry.js（応援レーン） / venueBar.js（会場） / status-entry.js（状態）
```
- **節(ノード)** = 取得/記録/集計/表示の代表ファイル(=FEATURES の entry + 集計の domain/data/lib 層)。
- **線(矢印)** = ノード間を渡る **storage キー名**(producer→consumer)。これが「血管」。
- **断線を赤** = producer はいるが consumer がいない(またはその逆)キー = broadcaster バグ型。
  既存 `STORAGE_DISCONNECT_BASELINE` の判定をそのまま色に使う(新規断線=濃い赤・既知=薄い橙)。

### どう視覚化するか（Q2: 依存ゼロ）
**(b) インライン SVG をスクリプトで生成**(会議発散の採用案)。
- 縦に節を並べ、節の間に `<path>`/`<line>` で矢印、矢印の脇に `<text>` で storage キー名。
- 既存 `repo-tree-map.html` と同じダークテーマCSS(`--bg`/`--panel`/`--ok`/`--warn`)を流用=見た目統一。
- **AI 可読**: 各ノード/線に `<title>` とテキスト正本 `spine-map.md` を併設(SVG が読めない AI も md で追える)。
- mermaid.js/CDN は使わない(方針・既存 html も依存ゼロ)。

### どう生成するか（Q3: 半手書き＝腐らない）
**ハイブリッド**(会議総合+発散の合流):
- **人間が決める正本** = 「背骨の節(取得/記録/集計/表示の代表ファイル)」を `feature-map.mjs` に
  小さな `SPINE` 辞書で定義(repo-tree-map の FEATURES 流儀)。枝葉(個々の純関数)は載せない。
- **機械が埋める** = 節間の storage キー(producer/consumer)と断線色は既存解析から自動。
- **`--check` で腐り検知** = 節のファイルが消えたら exit 1(feature-map:check に相乗り)。

### Q4: 既存 verify との役割分担（図 vs lint）
- **lint(既存 feature-map:check)** = 「新規断線が出たら**ビルドを止める**」=機械的ゲート。
- **図(今回 spine-map.html)** = 「人間/AI が**全体の流れを把握して設計判断**する」=理解の補助。
- broadcaster バグ: lint は「キーに片側しかいない」を**検知して止める**、図は「venueBar に線が
  繋がっていない」を**見て気づく**。両輪。図は lint が拾えない「経路はあるが意味的に細い/遠回り」も
  人間の目に晒す。

## 実装ステップ（MVP→拡張）

**MVP(第1コミット・これだけで価値が出る)**:
1. `feature-map.mjs` に `SPINE` 辞書(取得/記録/集計/表示の4段+代表ファイル)を追加。
2. `emitSpineHtml()` を追加 = 縦4段の節 + 節間の storage キー(既存 keyMap 再利用) + 断線色の
   インライン SVG を `docs/spine-map.html` に出力。AI 用に `docs/spine-map.md` も emit。
3. `docs/MAP.md` の「1. コードの地図」に1行追加(spine-map.html へのリンク)。
4. `--check` 対象に spine-map.html/md を追加(腐り検知)→ verify:cc 全緑。
5. 1変更=patch1つで bump(manifest/package/changelog)。docs 中心なので拡張リロードは不要
   (ユーザーはブラウザで `docs/spine-map.html` を開くだけ)。

**拡張(後続・任意)**:
- 矢印の太さをデータ頻度で可変(発散案・オプション)。
- ノードクリックで repo-tree-map / feature-map の該当へジャンプ。
- 集計層(domain/data/lib)の主要ノードを増やす(削ぎすぎ調整・批判③対応)。

## 検証観点(完成時)
「`docs/spine-map.html` をブラウザで開くと、取得→記録→集計→表示の背骨が1本の図で10秒で追える・
storage キーが矢印に乗る・断線が赤で目立つ・枝葉に埋もれない・既存マップと重複しない・
節ファイルが消えたら verify で落ちる」。

---

## 追補: 世界の実例ディープリサーチ(2026-06-20・105エージェント・引用付き検証)

ユーザー指示「とにかくこれを見ればすべてのミスが分かりサイト改善がはかれるものを世界中の事例から
ディープリサーチして」を受けて WEB リサーチ(`/tmp` ではなくワークフロー結果)。**社内会議と同じ結論に収束**。

### 検証済みの結論(18主張を3票方式で確認・7主張棄却)

1. **「線が繋がっていない」ミスを実際に捕まえるのは図ではなく "リーチャビリティ解析 + 機械ゲート"**。
   dependency-cruiser / Knip が「どの entry からも到達しない=孤立/デッドコード/未消費 export」を検出し、
   `error` 重大度で **CI を exit 非0 で止める**。**図(理解)だけでは不十分=機械ゲートと対で初めて効く**
   (出典: dependency-cruiser rules-reference / knip.dev / ArchUnitTS)。→ broadcaster バグ型はゲートで殺す。
2. **「1枚で分かる」のプロの型 = サマリは dashboard・詳細は別の diff 可能ファイル**(CodeScene の3KPI=
   Hotspot Code Health/Average/Worst・SonarQube 品質ゲートバッジ・Backstage scorecard)。
3. **最終推奨 = (c) 両方**。静的コード地図(拡張を動かさず GitHub/AI で読める)と実行時 status.html は
   **本質的に別物**。(a)全部 status 折込=性質違いで無理筋・(b)別ファイルonly=at-a-glance を失う。
   → status に**背骨サマリ(スコアカード)**+独立 **spine-map.html**(no CDN/inline SVG/diff可/AI可読)。
4. **「改善できる」根拠 = 低健全性/ホットスポットに欠陥が約15倍集中**(査読論文 Code Red・arXiv:2203.04374・
   alert files 3.70 defects vs healthy 0.25)。**悪い所を上に出す画面**があれば 44k 行を全部見ずに直せる。
5. **アーキ図は text/code で持て**=diff 可能・PR レビュー可能・**AI 可読**(Structurizr as-code・
   「AI は GUI を操作できないがテキストは読める」)。inline SVG + `<text>`/`<title>` + md 正本でこれを満たす。

### 実装に効く訂正(棄却・要注意)

- dependency-cruiser の `reachable` / `orphan` **属性名は検証で棄却(0-3 / 1-2)** → 採用するなら
  実装時に**現行ドキュメントで正確なルール名を再確認**してから(うろ覚えで書かない)。
- Structurizr の「自動ドリフト検知」も**棄却(0-3)** → 腐り防止は**明示的な CI `--check` を自前**で
  (=このプロジェクトに既にある feature-map:check / tree-map:check と同流儀=追加学習不要)。
- 15倍は相関(因果でない)・ベンダー筆者・不均衡標本 → **方向性は堅いが倍率は概算**として扱う。
- 単独開発者なので CodeScene の team/DORA 枠は薄い。ホットスポット代替は **git log の変更頻度 ×
  ファイル行数の簡易ヒューリスティック**でローカル計算可(有料ツール不要)=拡張の余地。

### 確定する最終アーキテクチャ(会議 + リサーチ統合)

**3層・generate-and-gate パターン**:
- **層A 機械ゲート(ミスを止める)**: 既存 `feature-map:check`(storage 断線)+ 追加で「背骨の節
  ファイルが消えたら落ちる」`--check`。リサーチ①=ゲートが本体。**これが「ミスが分かる」の中核**。
- **層B 静的コード地図 `docs/spine-map.html`(理解・改善)**: 取得→記録→集計→表示の背骨を inline SVG。
  storage キー=血管・断線=赤。AI 用 `spine-map.md` 併設。`feature-map.mjs` から自動生成。リサーチ③⑤。
- **層C status.html サマリ(at-a-glance)**: 既存マインドマップに「🦴 コードの背骨/健全性」枝を1本追加
  (`MindNode` 形式なので描画は既存 `buildMindNodeEl` 流用=ほぼ追加コード無し)。
  断線件数・最悪ホットスポット・spine-map.html へのリンクだけ軽く。リサーチ②。

→ **「これ1つ見ればミスが分かり改善できる」= status の背骨サマリ枝(入口)→ spine-map.html(詳細地図)
→ verify:cc の機械ゲート(自動でミスを止める)** の三位一体。1コミットでは層B(spine-map生成)を MVP とし、
層C(status枝)・層A強化は後続コミットに分けて段階導入(星野ロミ式・1変更=patch1つ)。
