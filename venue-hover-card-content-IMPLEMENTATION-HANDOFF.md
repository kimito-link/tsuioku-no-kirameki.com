# 実装ハンドオフ: 会場ホバーカードの表示項目再設計(MVP-1+MVP-2)

> 正本設計: [venue-hover-card-content-DESIGN.md](venue-hover-card-content-DESIGN.md)(council-fable 3段構えの産物)。
> 前提実装: `src/lib/venueHoverCard.js` / `src/extension/venueBar.js`(v0.1.1191で実装済みのホバーカード本体)。
> この1枚だけで着手できる粒度。実装は次チャット/別モデルで行う想定。

## スコープ

v0.1.1191で実装済みの会場ホバーカードに対し、表示項目を以下のとおり調整する:
- **MVP-1**: 診断情報(サムネ状態ラベル)を🩺状態パネル開時のみ表示・ID行の視覚的な格下げ
- **MVP-2**: 「最後にコメントした時刻」を相対時刻でstatLineに追加

**新しいUI・新規storage・新規タイマー・新規API呼び出しは一切追加しない**(DESIGN.md F章の却下案を再実装しない)。

## 背景(1行)

council-fable会議で「診断情報と体験情報の分離」「生カウントvs定性表現」が論点になり、Fableが「生カウント維持・診断は既存🩺パネル連動・ID行はCSS格下げのみ」と裁定した。詳細はDESIGN.md参照。

## 着手手順

1. ブランチ: 新規ブランチ(例 `feat/venue-hover-card-content-v2`)を切る。既存の`feat/venue-avatar-hover-card`ブランチが未マージならその上に積む。
2. TDD: 各変更ともテストを先に書いて赤→実装して緑。
3. 読む順:
   - `src/lib/venueHoverCard.js`(既存: `buildVenueHoverCardModel`・`createVenueHoverCardEl`・`renderVenueHoverCard`)
   - `src/extension/venueBar.js`の`openHoverCardFor`(既存実装で確認: 該当箇所を検索)・`diagPanel`定義箇所・WeakMap登録2箇所(席装飾ループ・renderTopBar)

## 実装ステップ(DESIGN.md C章の詳細に従う)

### MVP-1: 診断分離+ID格下げ

#### Step 1: `buildVenueHoverCardModel`に`diagMode`入力を追加

DESIGN.md C-1のシグネチャ通り、`diagMode?: unknown`を入力に追加。`thumbStatusLabel`は`diagMode === true`のときだけ非空文字列を返し、それ以外は`''`を返す。`thumbKind`/`thumbLoad`はモード非依存で常に返す(dataset刻印用・地雷G-4)。

#### Step 2: `renderVenueHoverCard`にhidden制御を追加

`thumbStatusEl.textContent = text;`の直後に`thumbStatusEl.hidden = !text;`を1行追加。

#### Step 3: `createVenueHoverCardEl`のDOM順序変更

`body.append(nameEl, idEl, statsEl, thumbStatusEl)` → `body.append(nameEl, statsEl, idEl, thumbStatusEl)`に変更。

#### Step 4: CSSに`.nlsb-hover-card__id`のfont-size追加

venueBar.js内の`.nlsb-hover-card__id`ブロックに`font-size: 11px;`を追加。

#### Step 5: `openHoverCardFor`に`diagMode`注入

`buildVenueHoverCardModel`呼び出し箇所に`diagMode: !diagPanel.hidden`を追加(DESIGN.md C-3の1参照)。

#### Step 6: MVP-1のテスト

`venueHoverCard.test.js`に追加:
- `diagMode`未指定/false → `thumbStatusLabel`が空文字
- `diagMode: true` → 現行どおりのラベルが返る
- `thumbKind`/`thumbLoad`は`diagMode`に関わらず常に値を持つ

### MVP-2: lastAt相対時刻

#### Step 7: `formatVenueHoverRelativeTime`を新規追加

DESIGN.md C-2のコード通りに`venueHoverCard.js`へ純関数として追加。境界値(59秒/60秒/59分/1時間/24時間/30日/30日超/負値/0/NaN)を全てテストでカバーする。

#### Step 8: `buildVenueHoverCardModel`のstatLine組み立てに反映

`lastAt`/`nowMs`が両方有効なら`発言 ${count}(${rel})`、どちらか欠損なら現行どおり`発言 ${count}`。**後方互換恒等**(lastAt/nowMs未指定の入力→現行と同一のstatLine)をテストで断言すること(地雷6)。

#### Step 9: venueBar.js側の配線(2箇所+1箇所)

- topbar側WeakMap登録に`lastAt: Number(p.lastAt) || 0`を追加
- seat側WeakMap登録に`lastAt: Number(participant.lastAt) || 0`を追加
- `openHoverCardFor`の`buildVenueHoverCardModel`呼び出しに`nowMs: Date.now()`を追加

#### Step 10: MVP-2のテスト+wiring test

`venueHoverCard.test.js`に境界値テストを追加。`venueHoverCard.wiring.test.js`に「WeakMap登録に`lastAt`が乗っている」ことの断言を追加(モデルに計器を足しても配線しなければ永久に出ない、という既知の地雷対策・地雷7)。統合テストは`formatVenueHoverRelativeTime`を実importして使うこと(手書きコピー禁止)。

### Step 11: 検証・出荷

1. `npm run verify:cc`を実行、全通過を確認。
2. **reality-checkerに検証を委任**(自己採点しない)。特に確認してもらう点:
   - `diagMode`が`openHoverCardFor`内で都度評価されているか(閉じ込めていないか・地雷3)
   - `thumbKind`/`thumbLoad`のdataset刻印が`diagMode`に関わらず常に出ているか(地雷4)
   - 純関数(`buildVenueHoverCardModel`・`formatVenueHoverRelativeTime`)が`Date.now()`を内部で呼んでいないか(地雷1)
   - 後方互換恒等(lastAt/nowMs/diagMode未指定の入力で現行と同一出力になるか)
   - `title`退避/復元機構(`closeHoverCard`)に変更が及んでいないか(地雷8)
   - 変異テスト: `formatVenueHoverRelativeTime`の30日超ガードを一時的に外す→テストが赤くなることを確認→復元
3. commit(バージョンbump 1つ)。reality-checker実行中はcommitしない。
4. push後、ユーザーに反映3手順を案内: `git pull` → 拡張リロード → watchタブF5。
5. 実配信で、①通常時にサムネ診断行が出ないこと、②🩺状態パネルを開いた状態でホバーすると診断行が出ること、③発言数の隣に相対時刻(「3分前」等)が表示されること、④ID行が名前・活動より控えめな見た目になっていることを確認してもらう。

## 完了判定(機械的に確認できる基準)

- [ ] `npm run verify:cc`が全通過
- [ ] `venueHoverCard.test.js`に`diagMode`のゲート・`formatVenueHoverRelativeTime`の境界値・後方互換恒等の全テストがある
- [ ] `venueHoverCard.wiring.test.js`に`lastAt`配線の断言がある
- [ ] `openHoverCardFor`内で`diagMode`/`nowMs`が都度評価されている(グローバル変数に固定していない)
- [ ] `data-thumb-kind`/`data-thumb-load`が`diagMode`に関わらず常に刻まれている
- [ ] reality-checkerでPASS判定を得ている

## 地雷(DESIGN.md G章から特に重要なものを再掲)

- 純関数に`Date.now()`を直接呼ばない。`nowMs`は必ず呼び出し側(`openHoverCardFor`)から注入。
- 30日超の`lastAt`は空文字を返す(クロック異常の前科対策、fail-closed)。
- `diagMode`は`openHoverCardFor`内で`!diagPanel.hidden`を都度読む。事前に固定しない。
- dataset刻印(`data-thumb-kind`/`data-thumb-load`)は`diagMode`でゲートしない。
- `closeHoverCard`(title退避/復元の単一集約関数)には触れない。

## 次のセッションで最初にやること

1. このハンドオフとDESIGN.mdを読む。
2. ブランチを切ってMVP-1のStep 1から着手(TDD)。
3. MVP-1が完了・検証済みになってからMVP-2に進む(DESIGN.md E章の段階順を守る)。
