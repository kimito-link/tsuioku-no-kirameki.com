# 統合議事録 — 「星野ロミだったらどうやってサイトを軽量化するか？」（対象: tsuioku-no-kirameki / nicolivelog）

- 会議ハーネス: COUNCIL-HOWTO.md 準拠（役割注入版 `scripts/meeting-roles.mjs`）
- 参加: 11体中 6体成功（FAILED: nvidia/qwen3.5・local deepseek-r1[批判]・gemma4[統括]・gpt-oss・hermes3。ローカル並列ロードでOllama接続詰まり）。批判役・統括役が欠席→**統合役Claudeが実コードで裏取りして批判を代行**。
- 裏取り: 実ファイルサイズ実測＋ `extension/manifest.json` / `scripts/build.mjs` / `tsuioku-no-kirameki/index.html` を直接確認。
- 統合役: Claude（司令塔）

---

## 会議の収束マップ（成功6体）

| 提案 | 出した役割 | 主張 |
|---|---|---|
| **拡張キャラ画像22MBをWebP化（＋遅延ロード）** | 別系統×2(groq/openrouter)・発散(qwen3)・実装(coder)・汎用(gemini)・爆速(llama) **＝全員** | 全体の88%・実測最大の塊。最優先 |
| **LP音声5.2MBを圧縮(ogg/aac/webm)** | llama・qwen3・coder・gemini | LPの55%。次点 |
| **og-image 1.1MB WebP化 / icon圧縮** | llama・qwen3 | 小〜中 |
| **popup.js 1.7MB のcode split（changelog遅延）** | groq(逆張り) | 数百KB・構造改善 |
| **index.html 665KのCSS/JS外部化・minify** | qwen3・coder | 中 |

会議は珍しく**ほぼ全会一致**（画像WebP→音声→og-image）。方向性は正しい。**だが実装の細部に誤りと見落としがあり、統合役が3点補正した。**

---

## 統合役による裏取り（会議出力の事実検証＝欠席した批判役の代行）

実コード・実測で検証した結果、会議の前提に**3つの誤り/見落とし**があった。

### 補正1: 最大の単一ファイル7.9MBは「圧縮」ではなく「削除」が正解
- 会議は `kimito-rinku-app-icon-2048.png`(7.9MB) を「WebP化/圧縮で約2MB削減」とした（llama・qwen3）。
- **実測**: このファイルはコード・manifest・HTMLのどこからも参照ゼロ（`grep -rn kimito-rinku-app-icon-2048` → 0件）。manifestの `icons`/`action.default_icon` は別物（`konta-yukkuri-icon-16/32/48/128.png`）を使用。
- → **死蔵アセット。変換不要、消すだけで 7.9MB 丸ごと削減。** 会議の誰も「未使用かどうか」を確認していなかった（実コードを見ていない弱点）。

### 補正2: war の matches を `<all_urls>` にしてはいけない
- 実装役(coder)案は `"web_accessible_resources":[{"resources":[...],"matches":["<all_urls>"]}]`。
- **実測**: 現状の matches は `["https://*.nicovideo.jp/*","http://127.0.0.1:3456/*","http://localhost:3456/*"]`（必要最小限）。`<all_urls>` は全サイトに拡張リソースを露出する過剰公開で、セキュリティ後退＋審査リスク。
- → **matches は現状維持。WebP化で変えるのは resources 配列の `*.png`→`*.webp` の1行だけ。**

### 補正3: LP音声5.2MBは「初期表示」には効いていない（優先度を下げる）
- 会議多数派は音声圧縮を高優先に置いた。
- **実測**: `index.html:5875` で `<audio id="lp-bgm" loop preload="none" ... src="sound/yozora-small-yell.mp3">`。**既に `preload="none"`** ＝LP初回ロードでは音声をDLしない。
- → 星野ロミ思想の核「**初期表示の摩擦除去**」という観点では、音声は初期表示に無関係。**優先度は画像より下**。ただし「再生ボタン押下→鳴り出すまでの待ち」短縮には効くので、中優先で実施。

### 補正4（地味だが重要）: build.mjs は画像/音声を一切処理していない
- **実測**: `scripts/build.mjs` に images/png/webp/sound/copy の記述ゼロ。画像はソースを直接配布。
- → 「ビルドに含めない/ビルドで自動変換」系の案（gpt-oss #4・coder のbuild改修）は**不要**。**実体ファイルを置換・削除するだけで反映**される＝作業はむしろ単純。WebP化を恒久自動化したい場合のみ、別途 `scripts/optimize-images.mjs`（任意実行）を足す。

---

# 最終1案（統合）— 効果順の軽量化スプリント

## 結論
**「実測で重い順に、まず“消せるもの”を消し、次に“変換できるもの”を変換する」。** 具体的には①未使用の7.9MBアイコンを削除 →②キャラ画像22MBをWebP化(war 1行も更新) →③og-image/LP画像をWebP化 →④音声を圧縮（preload=noneは維持） の順。拡張 約25MB→約4MB、LP 約9.4MB→約3MB が1スプリントで狙える。

## 根拠（星野ロミ四本柱との対応）
- **① 摩擦除去**: 拡張インストール/popup初回表示で最重量の画像22MB＋死蔵7.9MBを削れば、「最初の価値到達までの距離」が劇的に縮む。LPは音声がpreload=noneなので、初期表示の主因は画像（og/本文画像3.2MB）→ここを優先。
- **② 計測志向**: 推測でなく**実バイト実測**で順位付けした（7.9MB死蔵 → 22MB画像 → 5.2MB音声[ただし遅延済] → 1.7MB popup.js）。「一番痛い1つ＝死蔵7.9MB」を最初に潰す。
- **③ 現実主義**: cwebp/ffmpeg のフリーCLIだけ。build.mjsは画像非関与なので**ファイル置換/削除で完結**。ビルドツール乗り換えなし・月0円。
- **④ 離脱原因の除去**: 巨大PNGの読み込み待ち白画面を消す。遅延ロード（キャラ選択時に初めて読む）でpopup初期描画を軽く。

## 反論・リスク（と対策）
- **R1: 7.9MB削除で実は隠れ参照があった場合に壊れる。** ← 削除前に `git grep -i kimito-rinku-app-icon-2048`（コード/manifest/htmlで0件は確認済）＋拡張リロードでアイコン表示・popup目視。万一参照あればWebP化にフォールバック。**消す前にgit管理下なので復元可。**
- **R2: WebP画質劣化（キャラの線）。** ← `cwebp -q 82`（透過は `-q 85 -alpha_q 100`）で目視比較。toumeilink.png(534K)等の透過PNGはアルファ保持を確認。ダメなら `-q` を上げる。
- **R3: WebP化したのに war の resources が `*.png` のままで画像が出ない。** ← manifest の war[0].resources の `images/yukkuri-charactore-english/*/*.png` と `images/toumeilink.png` を `.webp` に更新（matchesは触らない＝補正2）。
- **R4: 音声をwebm/aacにすると一部環境で鳴らない。** ← LPは1ファイル差し替えで十分。`<audio>` を `<source>` 2系統（`.m4a`(aac) フォールバック `.mp3`）にすれば互換維持。bitrate 96k で 5.2MB→約1.5MB。preload=none は維持（初期表示に影響させない）。

## 具体案（最初の1スプリント＝効果順・削減見込み付き）

| # | 施策 | 削減見込み | 対象 / コマンド |
|---|---|---|---|
| **1** | **未使用アイコン削除**（最優先・ノーリスク） | **約7.9MB** | `git rm extension/images/logo/kimito-rinku-app-icon-2048.png`（参照0件確認済） |
| **2** | **キャラ画像WebP化**（27枚PNG→WebP） | **約18〜20MB**（22MB→約2〜4MB） | `cwebp -q 82 -m 6` を `extension/images/yukkuri-charactore-english/**/*.png` と `extension/images/toumeilink.png` に。元PNGを.webpへ置換 |
| **3** | **manifest war を .webp に**（2とセット必須） | 0（破壊防止） | `extension/manifest.json` の war[0].resources の `*.png`→`*.webp`、`toumeilink.png`→`toumeilink.webp`。**matchesは変更しない** |
| **4** | **キャラ画像の遅延ロード**（popup初期描画を軽く） | 0（体感速度） | `popup.js`：キャラ表示は初期HTMLに焼かず、表示タイミングで `img.src = chrome.runtime.getURL('images/.../x.webp')` |
| **5** | **LP画像WebP化**（og-image 1.1MB他） | **約2MB**（3.2MB→約1MB） | `cwebp -q 82` を `tsuioku-no-kirameki/images/*.png`。`index.html` の og:image と `<img>` の src/srcset 更新 |
| **6** | **LP音声圧縮**（preload=noneは維持） | **約3.7MB**（5.2MB→約1.5MB） | `ffmpeg -i yozora-small-yell.mp3 -c:a aac -b:a 96k yozora-small-yell.m4a`。`<audio>`に`<source>`2系統(.m4a→.mp3) |
| **7** | **popup.js のchangelog遅延**（任意・構造改善） | 約100〜150KB | `popup-entry.js` の `changelog-archive.js`(396K) 静的import を、更新履歴タブを開いた時の `await import()` に。build.mjsで該当entryのsplitting可否を確認してから |
| **8** | **計測**（星野式・最後に数字で確認） | — | Chrome DevTools/Lighthouse で拡張zipサイズと popup描画時間、LPのTransferred/LCPをbefore/after記録 |

**合計削減見込み: 拡張 約25MB→約4MB / LP 約9.4MB→約3MB。** #1〜#3が効果の大半（約26MB）で半日、#4〜#8が残り。

### 補足: 画像変換はユーザーがローカル実行
cwebp/ffmpeg はユーザー環境で実行（CLAUDE.md「画像/音はユーザーDL/生成前提」に整合）。私（Claude）は manifest/HTML/popup.js のパス更新と削除（#1,#3,#4,#5の参照書換）を担当、変換コマンド実行はユーザー操作。恒久自動化したい場合のみ任意実行の `scripts/optimize-images.mjs` を別途用意。

---

## 一言まとめ
**「星野ロミだったら」まず実測で一番重い塊を見て、変換より先に“使ってない7.9MBを消す”。** 次に22MBのキャラ画像をWebP化（manifest war の1行更新を忘れずに、matchesは広げない）、LP画像→音声の順。build.mjsは画像非関与なのでファイル置換だけで反映。凝った仕組みでなく「実測で効く順に、最短の手で」——これが思想の健全な核を軽量化に当てた答え。
