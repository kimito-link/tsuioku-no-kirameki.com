# 実装ハンドオフ: 会場「応援者ランキング」チラつき根治(バンド量子化ヒステリシス)

> 正本: 地図[venue-ranking-churn-MAP.md](venue-ranking-churn-MAP.md) / 仕様[venue-ranking-churn-SPEC.md](venue-ranking-churn-SPEC.md)(wayfinder→to-spec方式の産物)。
> この1枚だけで着手できる粒度。実装は次チャット/別モデルで行う想定。

## スコープ(これ以上広げない)

`stabilizeVenueSupporterOrder`という新純関数1つを`venueSeats.js`に追加し、`buildVenueSeating`の内部だけでそれを使い、`venueBar.js`側は状態(`supporterOrderKeys`)の持ち回し配線のみ行う。**`rankVenueContributors`/`selectVenueVipRegularKeys`/`selectVenueTopRankKeys`の公開シグネチャは一切変更しない**。`renderTopBar`のDOM構造・sig-skipロジックにも触れない。

## 背景(1行)

会場モードの応援者ランキング(1〜3位バッジ)が配信序盤の少コメント帯でコメント1件ごとに別人へ入れ替わる。真因はスコア計算(log1p正規化)が低カウント域で急峻なため。詳細はSPEC.md §1-2参照。

## 着手手順

1. ブランチ: 新規ブランチ(例 `fix/venue-supporter-rank-hysteresis`)を切る。
2. TDD: SPEC.md §5のテストケース一覧を先に赤で書き、実装して緑にする。
3. 読む順:
   - `src/lib/venueSeats.js`の`rankVenueContributors`(321行目)・`buildVenueSeating`(673行目)・`assignVenueSeats`(492行目、prevSeatByKeyパターンの先例)
   - `src/extension/venueBar.js`の`renderSeats`(4138行目)・`renderTopBar`(4113行目)・配信切替リセット(4713-4716行目付近)

## 実装ステップ(SPEC.md §4の詳細に従う)

### Step 1: `src/lib/venueSeats.js` に新純関数+定数を追加

- `VENUE_SUPPORTER_RANK_BAND = 8`
- `VENUE_SUPPORTER_ORDER_KEEP = 24`
- `stabilizeVenueSupporterOrder(ranked, prevOrderKeys, opts)` — SPEC.md §4.1のシグネチャ・ソートキー(band降順→prevIndex昇順→score降順→count降順→key昇順)通りに実装。

### Step 2: `buildVenueSeating`を変更

- SPEC.md §4.2のコード片通り、`rankVenueContributors`の呼び出しを1回に統合し`stabilizeVenueSupporterOrder`を通す。
- `rankByKey`(席バッジ)と`topSupporters`(トップバー)を同じ`stabilized.order`から導出する。
- 戻り値に`supporterRank: { orderKeys, droppedKeys, overtakeCount }`を追加。
- `selectVenueTopRankKeys`は削除しない(公開APIとして既存テストが依存)。

### Step 3: `venueBar.js`に配線(4箇所)

SPEC.md §4.3の通り:
1. `let supporterOrderKeys = [];`と計器2つをline 3213付近に追加
2. `renderSeats`の`buildVenueSeating`呼び出しに`prevSupporterOrderKeys: supporterOrderKeys`を追加
3. `seating.seatByKey`書き戻し直後に`supporterOrderKeys`書き戻し+計器加算+dataset反映
4. 配信切替リセット(line 4713-4716付近)に`supporterOrderKeys = []`等を追加

### Step 4: テスト

SPEC.md §5のテストケース一覧をすべて`src/lib/venueSeats.test.js`に追加。2tickシミュレーションテストは本番`buildVenueSeating`を実importすること(手書きコピー禁止)。

### Step 5: 検証・出荷

1. `npm run verify:cc`(test+lint+typecheck+build等)を実行、全通過を確認。
2. **reality-checkerに検証を委任**(自己採点しない)。特に確認してもらう点:
   - `stabilizeVenueSupporterOrder`のソートキーが本当に推移的か(非推移comparatorに戻っていないか)
   - `prevOrderKeys`が空のときに素の`rankVenueContributors`順と完全一致するか(後方互換の要、SPEC.md §2 Q1の恒等性)
   - `renderTopBar`/`_lastVenueRankByNode`が変更されていないか(スコープ外の変更混入がないか)
   - 変異テスト: ソートキーから`prevIndex`段を一時削除→ヒステリシス系テストが赤くなることを確認→復元(v0.1.1189で実施した変異検証と同型)
   - 配信切替時のリセット漏れがないか(4箇所の配線が揃っているか)
3. commit(バージョンbump 1つ)。reality-checker実行中はcommitしない。
4. push後、ユーザーに反映3手順を案内: `git pull` → 拡張リロード → watchタブF5。
5. 実配信で「たぬ姉」列(または該当する応援者トップバー)の1位バッジが、序盤の僅差コメント帯で毎コメント入れ替わらなくなっているか目視確認してもらう。`topBar.dataset.rankDrops`/`rankOvertakes`があれば併せて確認(実装時にDOM census系の既存計器から見えるかも確認)。

## 完了判定(機械的に確認できる基準)

- [ ] `npm run verify:cc`が全通過
- [ ] `venueSeats.test.js`に`stabilizeVenueSupporterOrder`の全ケース(SPEC.md §5の10ケース)がある
- [ ] `buildVenueSeating`統合テストが本番コードを実importしている(コピペロジックでない)
- [ ] `prevOrderKeys`未指定時に既存の`topSupporters`/`venueRank`テストが緑のまま(後方互換の実証)
- [ ] reality-checkerでPASS判定を得ている
- [ ] `rankVenueContributors`/`selectVenueVipRegularKeys`/`selectVenueTopRankKeys`のシグネチャが変更されていない(grep等で確認可能)

## 地雷(SPEC.md §7から特に重要なものを再掲)

- 非推移comparator(「差がM点で逆転」のペアワイズ比較)は禁止。バンド量子化+5段辞書式キーのみ。
- `prevOrderKeys`空⇔素のscore降順、の恒等性を崩さない(BANDをscoreの非単調変換にしない)。
- `supporterOrderKeys`は`seatByKey`と同じ2箇所(初期化・配信切替)でリセットする。リセット漏れは前配信の現職を持ち越す事故になる。
- `pruneRoster`(venueLiveRoster.js)が参加者を丸ごと削除する経路が実在する(司令塔裏取り済み)。これは`droppedKeys`計器でカバーされる想定の挙動であり、追加対策は不要。

## 次のセッションで最初にやること

1. このハンドオフとSPEC.md/MAP.mdを読む。
2. ブランチを切ってStep 1から着手(TDD)。
3. 疑問があればSPEC.mdの「未解決の質問」に立ち返る(実装前にユーザー判断が必要なものは1つもない設計になっているため、基本はデフォルト方針で進めてよい)。
