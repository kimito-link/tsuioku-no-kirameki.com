# 地図(wayfinder): 会場アイコンのホバープレビューカード

> wayfinder→to-spec方式・手順1(地図)。コードはまだ変更していない。事実には参照先を付け、推測は「推測」と明記する。

## 0. 背景(ユーザー要望の経緯)

ユーザーが会場モード(standalone)の参加者アイコン(数値ユーザーID+表示名「1222wwsdd」のようなタイル)を見て「クリックするとニコニコのユーザーページに飛ぶ」動作を確認した流れで、`recommend.shinobi.jp`(旧忍者レコメンド・画像RSSブログパーツサービス)を挙げ「ホバーするとサムネイルが出るようなものを実装したい」と要望。会話の中で目的は2つに整理された:

1. **ユーザー体験**: ホバーで「その人の基本情報がちゃんと出ているか」が見えるプレビュー
2. **診断・QA用途**: 「サムネイルがちゃんと有り/無しか」を目視確認する道具としても使いたい

## 1. 入口になる画面・現状の挙動

- 画面: 会場モード(standalone)の参加者タイル全般(席・応援者トップバー両方)。
- **現状は既にホバー動作が存在する**: [personTileDom.js:82-85](src/lib/personTileDom.js) で `img.title` / `cell.title` にネイティブHTML `title`属性(ブラウザ標準の地味な吹き出し)を設定済み。中身は `${title} | ${fullUid}`(表示名 + フルUID、UIDが表示名と重複しなければ)。
- つまり今回の要望は「ゼロから作る」のではなく「**既存のネイティブtitleツールチップを、リッチな独自プレビューカードに置き換える/拡張する**」ものと理解するのが正確(推測ではなく[personTileDom.js:82-85](src/lib/personTileDom.js)の実装事実から)。

## 2. 関係する主要ファイルと責務

| ファイル | 責務 |
|---|---|
| `src/lib/personTileDom.js` | 人物タイル1個ぶんのDOM生成(`buildPersonTileEl`)。popup応援レーン・会場席・会場トップバー共通の正本(コメント「1つの正本」明記・[personTileDom.js:7](src/lib/personTileDom.js))。 |
| `src/extension/venueBar.js` | 会場のDOM描画本体。`buildVenuePersonTile`(422行目)が`buildPersonTileEl`を呼ぶ橋渡し。 |
| `src/lib/venueLaneBuckets.js` | `venueSeatEntryToLaneItem`(54行目)が参加者データをタイル用アイテムに変換。プレビューに使えるリッチなデータ(`profileTier`・`thumbScore`・`_venueRank`等)がここで揃うが、`buildVenuePersonTile`はその一部しか`buildPersonTileEl`に渡していない([venueBar.js:430-433](src/extension/venueBar.js)で`displaySrc`/`title`/`meta`/`entry`のみ抽出)。 |
| `src/lib/storyUserLaneRowModel.js` | `buildStoryUserLaneCandidateRow`(72行目)。`profileTier`(プロフィール完成度)・`thumbScore`(サムネ解決スコア)を算出する①正本。 |
| `src/domain/user/identity.js` | `isNumericNicoUserId`。数値ID(5〜14桁)判定=リンク可否・診断表示の両方で使われている既存の唯一の判定基準([personTileDom.js:56-59](src/lib/personTileDom.js))。 |

## 3. データが流れる順番

1. `venueSeatEntryToLaneItem(seatEntry, opts)` [venueLaneBuckets.js:54](src/lib/venueLaneBuckets.js) が participant(userId/name/avatar/count/hasGift等)を受け取り、`buildStoryUserLaneCandidateRow`(①正本)へ委譲して`profileTier`/`thumbScore`/`displaySrc`を算出。
2. 戻り値は`{ entryIndex, profileTier, thumbScore, displaySrc, title, entry, meta, _venueSeatIndex, _venueRank, _venueIsVip, _venueSpeakerKey, _venueAvatarUrl, _venueRawName }`という**リッチなオブジェクト**([venueLaneBuckets.js:130-145](src/lib/venueLaneBuckets.js))。
3. `buildVenuePersonTile(participant, fallbackLabel)` [venueBar.js:422](src/extension/venueBar.js) がこの`item`を受け取るが、`buildPersonTileEl`へは**4フィールドだけ**(`displaySrc`/`title`/`meta`/`entry`)を渡している([venueBar.js:430-433](src/extension/venueBar.js))。`profileTier`/`thumbScore`/`_venueRank`等はここで捨てられる。
4. `buildPersonTileEl(p, io)` [personTileDom.js:53](src/lib/personTileDom.js) が実際のDOM(`<a>`または`<span>` + `<img>` + メタ2行)を組み立て、`title`属性をimg/cellの両方に設定([personTileDom.js:82-85](src/lib/personTileDom.js))。

## 4. 既存の設計判断とその根拠(壊してはいけない境界)

1. **`buildPersonTileEl`は「1バイトも変えない」退化ガード対象**([personTileDom.js:12-15](src/lib/personTileDom.js))。popup応援レーン・会場席・会場トップバーの3箇所で共有される単一の正本であり、`personTileDom.test.js`にcharacterization test(見た目固定テスト)がある。**この関数のDOM構造(タグ・class・属性・子の順序)を直接変えるのは高リスク**。
2. **タイル本体とレイアウトの分離**([personTileDom.js:16-18](src/lib/personTileDom.js)): 「タイル1個の要素」を返すだけで、吹き出し・読み上げ・ギフト演出は呼び出し側が別途被せる設計。ホバープレビューもこの分離思想に沿うなら「タイル本体を触らず、呼び出し側(venueBar.js)がイベントリスナーで別要素を被せる」のが筋がよい可能性が高い(推測ではなく既存設計思想からの類推)。
3. **`isNumericNicoUserId`が唯一の判定基準**([personTileDom.js:56-59](src/lib/personTileDom.js)のコメント「venue席のリンク判定と同一基準にしてドリフト防止」)。プレビューの「本登録/匿名」表示もこの関数を使うべき(新しい判定ロジックを作らない)。
4. **`profileTier`/`thumbScore`は既に存在する診断データ**([storyUserLaneRowModel.js:83,96](src/lib/storyUserLaneRowModel.js))。「サムネイルの有無を目視確認したい」という診断用途は、この2つの値をプレビューに表示するだけで新規ロジック不要な可能性が高い(要Fable検討)。
5. **`_venueRank`(1〜3位バッジ)・`_venueIsVip`**は今回のvenue-ranking-churn案件で扱った応援者ランキング(バンド量子化ヒステリシス)と同じデータ源([[venue-supporter-rank-churn-wayfinder-2026-07-30]])。プレビューにランキング情報を出すなら、そちらの安定化ロジックとdriftしないよう同じ`supporterRank`由来のデータを使うべき。
6. **会場の「全員主役」哲学**([venueLaneBuckets.js:108](src/lib/venueLaneBuckets.js)のコメント「会場は全員着席哲学」): 匿名ユーザーもプレビュー対象から除外しない設計にすべき(サムネなし・リンクなしでも情報表示自体は行う)。

## 5. 変更すると壊れうる箇所

- `buildPersonTileEl`のDOM構造を直接変更すると、popup応援レーン・会場席・会場トップバーの**3箇所同時**に影響し、`personTileDom.test.js`のcharacterization testが赤くなる。
- `img.title`/`cell.title`(ネイティブツールチップ)を完全に削除すると、キーボード操作者・スクリーンリーダー利用者へのアクセシビリティ情報(現状の唯一のフォールバック)が失われる可能性がある(未確認・要検討)。
- 新しいホバーイベントリスナーを追加する場合、`nlsb-stage`(会場全体のstage要素・[venueBar.js:501-548](src/extension/venueBar.js))の`pointer-events`制御や、既存の吹き出し(`showSpeechBubble`)・ギフト投擲演出のz-index/描画順と競合しないか要確認。
- 会場は最大500人規模のタイルを描画する([VENUE_FULLSCREEN_MAX_SEATS](src/lib/venueSeats.js)関連のコメントに「全員500人」との言及あり)。ホバーごとに重い処理(API呼び出し等)を走らせる設計だと、大量タイル環境でのパフォーマンス懸念がある。

### 5.1 未確認の前提(要追加調査・Fableに検討させたい論点)

- **プレビューに表示すべき情報の優先順位**: ユーザーの回答は「ユーザーにとって何がベスト？」という問いへの回答として「基本情報のチェック」「サムネイルあり/なしの目視」の2点を挙げたが、具体的にどの項目(表示名/ID/レベル/フォロワー数/このセッションでの発言数/ギフト履歴/ランキング順位)を出すべきかは未確定。ニコニコのユーザーページAPI(レベル・フォロワー数等)を追加取得する必要があるか、それとも会場が既に持つデータ(count・hasGift・profileTier等)だけで完結させるかは設計判断が必要。
- **表示位置・実装方式**: CSS `:hover` + `::after`疑似要素で十分か、JSでカーソル追従する独立DOM要素(popover)が必要か。会場のstage要素が`position: fixed`かつ`isolation: isolate`([venueBar.js:501-510](src/extension/venueBar.js))であることを踏まえた実装が必要。
- **タッチデバイス対応**: ホバー概念が無いタッチ操作でどう出すか(クリックで表示→もう一度クリックで遷移、等)は未検討。
- **忍者レコメンド(recommend.shinobi.jp)由来の要望のニュアンス**: ユーザーが挙げた参考サービスは「画像カルーセル/ポップアップ画像枠」のブログパーツであり、直接「ホバーでプレビュー」を実演するサービスではなかった(実際に確認したところ、静的な画像タイル配置サービスだった)。「昔あった」という発言から、UIの雰囲気(画像がポップアップで大きく出る体験)を参考にしたい、という程度の緩い参照と推測する(確定ではない)。

## 6. 実装前に決める必要がある質問

1. **プレビューカードに載せる情報の確定**: 表示名・ID・サムネURL(有無)・`profileTier`/`thumbScore`(診断値)・会場内ランキング順位・発言数、のうちどれを標準搭載するか。診断用途(サムネ有無の目視)を重視するなら`profileTier`/`thumbScore`の生値をそのまま出す案もある。
2. **既存のネイティブ`title`属性をどう扱うか**: 完全置き換えか、リッチプレビューに加えて残すか(アクセシビリティ・フォールバックの観点)。
3. **実装場所**: `buildPersonTileEl`(3箇所共有の正本)を拡張するか、それとも会場(`venueBar.js`)側だけに閉じたホバーレイヤーを追加するか(popup応援レーンには波及させたくない可能性を考慮)。
4. **パフォーマンス方針**: 最大500人規模のタイルでホバーごとにDOM生成/APIコールが走ってよいか、それとも軽量な事前計算値(profileTier等)の表示に留めるか。
5. **タッチデバイス(会場standaloneはブラウザ表示なのでスマホ閲覧もありうる)への対応方針**。
