# 実装ハンドオフ: 会場アイコンのホバープレビューカード

> 正本: 地図[venue-avatar-hover-preview-MAP.md](venue-avatar-hover-preview-MAP.md) / 仕様[venue-avatar-hover-preview-SPEC.md](venue-avatar-hover-preview-SPEC.md)(wayfinder→to-spec方式の産物)。
> この1枚だけで着手できる粒度。実装は次チャット/別モデルで行う想定。

## スコープ(これ以上広げない)

新規lib `src/lib/venueHoverCard.js`(純ロジック+DOMビルダー)を追加し、`venueBar.js`に委譲リスナー+WeakMap配線を足す。**`buildPersonTileEl`/`buildVenuePersonTile`/`venueSeatEntryToLaneItem`/`laneMirror.js`は一切変更しない**。popup応援レーンには波及させない。ニコニコAPIからの追加データ取得・タッチ対応・診断カウンタの状態速報配線はやらない(SPEC.md §6参照)。

## 背景(1行)

会場モードの参加者アイコンは現状ブラウザ標準の`title`ツールチップ(表示名+UID)しか出ない。ホバーで表示名・ID種別・発言数・ギフト・ランキング順位・サムネ状態(実サムネ/identicon/読み込み失敗等)を見せるリッチなプレビューカードを追加する。詳細はSPEC.md §1-2参照。

## 着手手順

1. ブランチ: 新規ブランチ(例 `feat/venue-avatar-hover-card`)を切る。
2. TDD: SPEC.md §5.1のテストケース一覧を先に赤で書き、`venueHoverCard.js`を実装して緑にする。
3. 読む順:
   - `src/lib/personTileDom.js`(`buildPersonTileEl`。DOM構造・title設定の実装、行56-85)
   - `src/extension/venueBar.js`の`buildVenuePersonTile`(422行目)・席装飾ループ(4370-4434行目付近、`node.seat.title = displayName`は4410行目)・`renderTopBar`(4119-4137行目)
   - `src/lib/venueSeats.js`の`collectVenueParticipants`(125行目付近、participantの`count/hasGift/giftCount`フィールド)
   - `src/domain/user/identity.js`の`isNumericNicoUserId`(唯一のID判定基準)

## 実装ステップ(SPEC.md §4の詳細に従う)

### Step 1: `src/lib/venueHoverCard.js`を新規作成

SPEC.md §4.1のシグネチャ通りに4関数を実装:
- `readVenueTileThumbState(cellEl)` — タイル実DOM(`.nl-story-userlane-cell`)からサムネ状態を観測のみで読む
- `buildVenueHoverCardModel(input)` — カード表示モデルを組み立てる純関数
- `createVenueHoverCardEl(doc)` — シングルトンDOM生成
- `renderVenueHoverCard(cardEl, model)` — モデルをDOMへ反映(ノード再生成しない)
- `resolveVenueHoverCardPlacement(a)` — 位置計算(上配置優先→下フリップ→左右クランプ)

依存は`isNumericNicoUserId`(src/domain/user/identity.js)と`nicoUserPageUrl`(src/lib/nicoUserPage.js)のみ。新しいID判定ロジックは作らない。

### Step 2: venueBar.jsにCSS追加

SPEC.md §4.2のDOM構造に対応するCSSを`VENUE_CSS`に追記。**z-indexは実装時に既存のVENUE_CSS内の全z値(1338/1468/1552/1565/765付近)を実際に読んで、各値がどの要素(吹き出しレイヤー・常駐・投げ物演出等)に対応するか確認してから決定する**(SPEC.mdの「仕様に根拠がない断定」2に明記済み・司令塔も具体的対応関係までは特定していない未確定事項)。吹き出しレイヤーより上・投げ物演出より下になるよう選ぶ。

### Step 3: venueBar.jsに配線(SPEC.md §4.3の4箇所+リスナー)

1. モジュールレベルに`_hoverCardDataByEl`(WeakMap)・タイマー変数を追加
2. 席装飾ループ内(`node.seat.title = displayName`の直後)にWeakMap登録を追加
3. `renderTopBar`内の`cell`にも同形でWeakMap登録
4. stage組み立て時にカード要素を1個appendする
5. `seatsHost`と`topBarList`に`pointerover`/`pointerout`の委譲リスナーを追加(タッチは無視)
6. `pointerdown`/`scroll`でカードを閉じる処理を追加

閉じる処理は単一関数`closeHoverCard()`に集約すること(SPEC.md §7-1の地雷)。title復元は「現在値が空のときだけ」にすること(SPEC.md §7-2の地雷、paint競合対策)。

### Step 4: テスト

SPEC.md §5.1(`venueHoverCard.test.js`)と§5.2(`venueHoverCard.wiring.test.js`)を実装。wiring testは既存の`venueLaneParity.wiring.test.js`と同型のソース文字列スキャンパターンを参考にする。

### Step 5: 検証・出荷

1. `npm run verify:cc`を実行、全通過を確認。新規lib追加なので`tree-map`/`feature-map`の再生成が必要になる可能性が高い(`npm run tree-map`)。
2. **reality-checkerに検証を委任**(自己採点しない)。特に確認してもらう点:
   - `buildPersonTileEl`/`buildVenuePersonTile`/`venueSeatEntryToLaneItem`/`laneMirror.js`が本当に変更されていないか(grep等で確認)
   - title退避・復元が全ての閉じる経路(pointerout/pointerdown/scroll)で一貫して呼ばれているか
   - paint競合(カード表示中にrenderSeatsが走ってtitleが再セットされるケース)で復元ロジックが壊れないか
   - 500人規模相当のダミーデータでイベントリスナー数・カードDOM数が人数非依存であることの確認
   - 変異テスト: `readVenueTileThumbState`のload判定(`complete && naturalWidth===0`)を一時的に壊す→対応するテストが赤くなることを確認→復元
3. commit(バージョンbump 1つ)。reality-checker実行中はcommitしない。
4. push後、ユーザーに反映3手順を案内: `git pull` → 拡張リロード → watchタブF5。
5. 実配信で、本登録/匿名/白丸の3種のユーザーにホバーしてカード内容を目視確認してもらう。500人規模配信でのパフォーマンス体感も確認。

## 完了判定(機械的に確認できる基準)

- [ ] `npm run verify:cc`が全通過
- [ ] `venueHoverCard.test.js`にSPEC.md §5.1の全テストケースがある
- [ ] `venueHoverCard.wiring.test.js`が配線漏れを検知できる(削除して赤くなることを確認)
- [ ] `buildPersonTileEl`/`buildVenuePersonTile`/`venueSeatEntryToLaneItem`/`laneMirror.js`のシグネチャ・実装が変更されていない(diffで確認可能)
- [ ] reality-checkerでPASS判定を得ている
- [ ] 状態速報・診断カウンタへの新規配線をしていない(スコープ外・SPEC.md §6)

## 地雷(SPEC.md §7から特に重要なものを再掲)

- title退避・復元は`closeHoverCard()`に集約し、全経路(タイマーキャンセル・title復元・`--open`除去)を必ず通す。
- カード表示中の`renderSeats`によるtitle再セットに注意。復元は「現在値が空のときだけ」。
- `IntersectionObserver`や可視判定をカードに持ち込まない(CSS 3D変形段では`getBoundingClientRect`の直読みで十分)。
- カードは`pointer-events: none`を必ず維持(既存ドラッグ判定・クリック経路に影響を与えない)。
- z-indexは実装時に既存値を確認してから決定する(未確定のまま決め打ちしない)。

## 次のセッションで最初にやること

1. このハンドオフとSPEC.md/MAP.mdを読む。
2. ブランチを切ってStep 1から着手(TDD)。
3. SPEC.mdの「未解決の質問」(データ鮮度・順位表示範囲・UXパラメータ・診断行文言)は、実装前にユーザーに確認するか、SPEC.mdのデフォルト方針(MVPとして許容)のまま進めるかを判断する。基本はデフォルト方針で進めてよい設計になっている。
