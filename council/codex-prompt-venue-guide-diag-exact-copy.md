# Codex 向け指示: 会場モードの「案内文言(a:匿名ルール)」と「詳しい状況パネル」を①POPと完全一致させる

## 背景・なぜ書いたか
これまで「①みたいに会場も直して」と口頭で伝えると、無視されたり別の場所を直されたりを繰り返してきた。
今回は対象ファイル・関数・行番号まで名指しするので、**この指示にない箇所は変更しない**こと。
「一致した」と報告する前に、必ず実際の差分（コミット）で証拠を示すこと（口頭の「直しました」は禁止）。

## 対象は2箇所（両方まとめて1本の作業でよい）

### 対象1: 表示名マスキング／匿名(a:)ルールの案内文言
①POP（応援レーン最上部）に出ている以下の文言が正本:

`src/lib/storyUserLaneGuideHtml.js` の `buildStoryUserLaneGuideTopHtml()`（19〜26行目）:
```
りんく: 数値ユーザーID＋個人サムネが揃った応援だけ、この列に載せるよ。匿名（a:）はカスタム表示名やサムネが見えていても上には出さず、下の段に流す設計だよ。
```
同ファイルの `buildStoryUserLaneGuideGiftHtml` / `buildStoryUserLaneGuideAdHtml` / `buildStoryUserLaneGuideKontaHtml` / `buildStoryUserLaneGuideTanuHtml` / `buildStoryUserLaneGuideFootHtml` も同じ正本セット。

これらは共有renderer `src/extension/story/renderStoryUserLaneDom.js` の `paintStoryUserLaneDomFilled()`（316行目〜）から呼ばれ、`opts.guides` が `false` でない限り描画される。

会場側の呼び出しは `src/extension/venueBar.js` の4351行目付近:
```js
guides: isLaneMirrorPaintMode ? VENUE_LANE_GUIDES_EXACT_COPY : false,
```
`VENUE_LANE_GUIDES_EXACT_COPY`（316行目、`const VENUE_LANE_GUIDES_EXACT_COPY = true;`）は既に `true` になっている。

**確認してほしいこと**:
1. `isLaneMirrorPaintMode` が実配信で常に `true` になっているか、それとも fallback 経路（`isLaneMirrorPaintMode` が false になるケース）が実際には多く、そちらでは `guides: false` のままガイドが出ていないのではないか。fallback に落ちる条件を `venueBar.js` 内で特定し、コメントで理由を明記すること。
2. fallback 時にガイドを出さない設計判断（コメント「fallback は①の鏡件数を名乗らないため」）は維持したままでよいか、それとも fallback でも①と同じ文言セットを出すべきか——**設計判断が必要なら実装を止めてユーザーに確認を仰ぐこと。無断でどちらかに決め打ちしない。**
3. 実際に会場モードを開いて `.nl-story-userlane-guide__text` のテキストがブラウザDOM上で①POPの文言とバイト一致するか、`document.querySelectorAll` 等で実測し、その実測結果を報告に含めること（憶測で「一致するはず」と書かない）。

### 対象2: 「詳しい状況（開発・切り分け用）」診断パネルの中身
①POPのこのパネル（開閉トグル）の正本は:
- `src/lib/storyAvatarDiagLine.js` の `buildStoryAvatarDiagHtml` / `buildStoryAvatarDiagVerboseHtml`
- 会場側の鏡描画は `src/lib/venueStoryDiagMirrorPanel.js` の `renderVenueStoryDiagMirrorPanel()`（既存実装・v0.1.1126で導入済み）

**確認してほしいこと**:
1. `renderVenueStoryDiagMirrorPanel` が①側と同じ `buildStoryAvatarDiagHtml` / `buildStoryAvatarDiagVerboseHtml` を呼んでいるか（venueStoryDiagMirrorPanel.js:1-4 で import 済みのはず）を実コードで確認する。
2. 実配信で会場のこのパネルを開き、①POP側の同パネルと項目・文言・件数を1行ずつ突き合わせ、**差分があれば具体的に「どの行・どの数値が違うか」を列挙する**。差分ゼロなら「差分ゼロを実測で確認した」と明記する。
3. 差分があった場合のみ、その差分の原因（鏡の鮮度切れ・fallbackモード・別の関数を呼んでいる等）を特定し、①と同じ入力・同じ関数で描画するよう最小差分で直す。

## 厳守事項（プロジェクトの既存ルール）
- ローディング演出（spinner/skeleton）は全面禁止。新規に追加しない。
- host/iframe には触らない（ちかちか再発の既知地雷）。
- 鏡（mirror）に載せるのは数値・構造化データのみ（R-1: 生HTML文字列をblobに足さない）。
- 新しい計器を足す場合は `statusFastDiagLite` への passthrough を忘れないこと（過去に一度落とした地雷）。
- 変更後は `npm run verify:cc` を通し、ログは `.artifacts/verify-cc.log` を読むこと。
- 完了報告には「どのファイルのどの行を変更したか」「実機 or 実測で何を確認したか」を必ず含めること。「①のようになりました」だけの報告は不可。
