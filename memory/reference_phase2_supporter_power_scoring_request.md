# reference: Phase 2 応援者パワー診断スコアリング設計依頼書(Codex 宛)

> ⚠️ Codex(放送系縄張り)向け設計依頼書です。`memory/reference_osint_strategy_socialxup_chikuran.md` を**必ず先に読む**こと。設計のみ・実装はしない。出力は `docs/codex-supporter-power-scoring-design-v0607.md`。

## 1. 背景

OSINT 戦略([[reference_osint_strategy_socialxup_chikuran]])の Phase 2 として、視聴者(コメンター)に対する**応援者パワー診断**スコアリングを設計してほしい。

ベンチマーク:
- **SocialXup の「アカウントパワー診断」**(A〜E、0〜100 スコア):X+YouTube のフォロワー数・エンゲージメント等から計算
- **アカウント偏差値診断**:全体相対位置で示す

我々の文脈:
- 配信者(運営者)の手元に、視聴者個別の **コメ数・ギフト pt・常連度(N 配信中 X 回コメ)・フォロワー数・フォロー先数・isPremium・user level** が揃っている
- これらを統合して**「応援者パワー」**として A〜E/0〜100 スコアと S/A/B/C Tier に分類したい

## 2. 設計依頼内容

### 2-1. 応援者パワー診断スコア(0〜100)

入力(コメンター 1 人につき):
```typescript
type SupporterInput = {
  commentCount: number;      // 当該配信のコメ数
  giftTotalPoints: number;   // 当該配信のギフト pt 合計
  loyaltyCount: number;      // 直近 N 配信中の出現回数(常連度)
  followerCount?: number;    // niconico フォロワー数(OSINT 公開)
  followeeCount?: number;    // niconico フォロー先数
  isPremium?: boolean;       // プレミアム会員
  userLevel?: number;        // ユーザレベル
};
```

出力:
```typescript
type SupporterPower = {
  score: number;             // 0〜100
  rank: 'S'|'A'|'B'|'C'|'D'|'E'; // Tier
  components: {              // 内訳(可視化用)
    engagement: number;      // コメ + ギフトのスコア(0〜100)
    loyalty: number;         // 常連度(0〜100)
    influence: number;       // フォロワー数・レベル(0〜100)
  };
  percentile: number;        // 当該配信内での偏差値(0〜100)
};
```

設計してほしいこと:
- (a) **3 つのコンポーネント(engagement / loyalty / influence)の重み**:配信者にとって「ありがたい応援者」を A 上位に出す重み付けは?
- (b) **欠損値の扱い**:followerCount が undefined のコメンター(認証/取得失敗)はどうスコアリングする?(0 扱い vs 内訳から除外)
- (c) **正規化**:コメ数 100 件と 1000 件の差を線形にする?対数にする?(極端値が支配しないよう)
- (d) **偏差値**:全配信横断 vs 当該配信内のみ?どちらが配信者にとって意味があるか
- (e) **Tier 境界**:S=上位 1%、A=上位 5%…等の閾値設計

### 2-2. 応援者 Tier(S/A/B/C)

- スコアからの導出ロジック
- Tier 色設計案(SocialXup 風)
- 配信中のリアルタイム Tier 表示(変動する場合の安定化)

### 2-3. 常連密度スコア

- 「直近 N 配信中 X 回コメ」のスコア化
- N の最適値(7 配信?30 配信?)
- 新規コメンター(初参加)はどう扱うか

### 2-4. 卒業/復帰カレンダー設計

- 「常連だったコメンターが観測されなくなった」を検出するロジック
- 観測:status='forbidden'/'login_required' になった、または N 配信連続で出現しない
- 復帰検出:再び出現したらカレンダーにマーカー

## 3. 競合参考(調査済み)

| サービス | 独自指標 |
|---|---|
| SocialXup | アカウントパワー(A〜E、0〜100)・アカウント偏差値・凍結カレンダー・ジャンル並び |
| ちくらん | コメ数(=勢い)コミュ人数・視聴者数非依存でお祭り発見 |
| Shobon Kick | 同接 + Tier/Award/Graph 多軸 |

## 4. 既存資産

- `src/lib/commenterFollowAnalytics.js`(965 行・15 export)
- `buildCommenterFollowAnalytics` が既に rows/scatterPoints/segments/thresholds/deltas/followeeProfile/timing/broadcasterFollow を計算
- 既存の `buildCommenterFollowSegments` は 3 セグメント分類(highFollowerRegulars/localEnthusiasts/quietSupporters)

→ **既存セグメントを拡張する形で S/A/B/C/D/E Tier に変える**のが整合的か?

## 5. 出力フォーマット

`docs/codex-supporter-power-scoring-design-v0607.md` に以下章立てで:

```markdown
# Codex 設計レポート: 応援者パワー診断スコアリング(Phase 2)

## エグゼクティブサマリー
- 設計の核心: ...
- 既存資産との接続: ...

## スコアリング式
### 0-100 総合スコア
- 計算式 + 根拠
### 内訳(engagement / loyalty / influence)
- 各コンポーネントの計算
### 欠損値処理
### 正規化方式(線形 vs 対数)

## Tier 分類(S/A/B/C/D/E)
### スコア境界
### 色設計

## 常連密度スコア
### N の選択
### 新規コメンター扱い

## 卒業/復帰カレンダー
### 卒業検出ロジック
### 復帰検出ロジック
### UI 提案(SocialXup の凍結カレンダー風)

## 既存資産との接続
- buildCommenterFollowSegments の拡張案
- buildCommenterFollowAnalytics への追加 export

## テスト方針
- スコアリングの境界テスト
- 欠損値ケース
- 偏差値計算の正確性

## 実装計画(Claude Code が実装する想定)
- ファイル構成案
- リスクポイント
```

## 6. 絶対禁止事項

- **コード修正・新規ファイル作成しない**(設計レポートのみ)
- master ブランチに直接コミットしない
- v0.1.592 baseline zip の挙動を壊す案を出さない
- niconico ToS に反する取得方式(過度なレート・認証回避)を案として出さない

## 7. 完了条件

- `docs/codex-supporter-power-scoring-design-v0607.md` を作成
- 上記章立てを全て埋める
- 「Claude Code への推奨実装順」を末尾に添える
- コミット・push はしない(司令塔が結果を見てから判断)
