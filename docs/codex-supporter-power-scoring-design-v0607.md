# Codex 設計レポート: 応援者パワー診断スコアリング(Phase 2)

## エグゼクティブサマリー

- 設計の核心: 「応援者パワー」は、当該配信で実際に支えている量を最重視し、`engagement 45% / loyalty 35% / influence 20%` で 0-100 点にする。フォロワー数の大きさだけで上位化せず、コメント・ギフト・常連度が強い人を A/S に上げる。
- 既存資産との接続: `buildCommenterFollowSegments` の 3 セグメントは互換維持し、別レイヤーとして `supporterPowerRows` と `supporterPowerTiers` を `buildCommenterFollowAnalytics` に追加するのが安全。既存の `segments` を置き換えると v0.1.592 以降のマーケ HTML 表示・CSV・テストの意味が変わるため避ける。
- 欠損値方針: `followerCount` や `userLevel` が undefined の人を 0 点扱いしない。取得失敗・未ログイン・公開制限は応援行動そのものではないため、欠損した sub-field は再重み付けし、influence 全体が欠損した場合は当該配信の中央値、なければ 50 点の中立値に置く。
- 正規化方針: コメント数・ギフト pt・フォロワー数・フォロー先数は線形ではなく `log1p` + パーセンタイル cap で圧縮する。100 件と 1000 件の差は残すが、極端値だけで総合点が支配されないようにする。
- 偏差値方針: primary は当該配信内 percentile とする。配信者が知りたいのは「今日の枠で誰が目立ったか」なので、全配信横断値は将来の season 指標として別名で追加する。
- Tier 方針: S/A/B/C/D/E は score と percentile の hybrid 判定にする。小規模配信では percentile が荒れるため、20 人未満は score-only fallback を使う。

## スコアリング式

2-1 の設計点への回答:

| 設計点 | 結論 |
|---|---|
| (a) component 重み | `engagement 45% / loyalty 35% / influence 20%`。当該配信で支えた量と常連度を優先し、外部影響力は補助軸にする。 |
| (b) 欠損値 | undefined は 0 扱いしない。sub-field 単位で再重み付けし、influence 全欠損は配信内 median、なければ 50 点にする。 |
| (c) 正規化 | コメント数・ギフト pt・フォロワー数・フォロー先数は `log1p` + p95 cap。線形は使わない。 |
| (d) 偏差値 | primary は当該配信内 percentile。全配信横断は将来の `seasonPercentile` として別軸にする。 |
| (e) Tier 境界 | S=上位 1% 相当かつ score 90 以上、A=上位 5% かつ 80 以上、B=上位 20% かつ 65 以上、C=上位 50% かつ 50 以上。小規模配信は score-only fallback。 |

### 0-100 総合スコア

基本式:

```text
supporterScore = round(
  0.45 * engagement +
  0.35 * loyalty +
  0.20 * influence
)
```

各 component は 0-100 に clamp する。総合スコアも最終的に 0-100 に clamp する。

重みの根拠:

| component | weight | 意味 | 理由 |
|---|---:|---|---|
| engagement | 45% | 当該配信でのコメント量とギフト pt | 「ありがたい応援者」はその日の配信を実際に動かした人。最重要にする。 |
| loyalty | 35% | 直近 N 配信中の出現密度 | 一発の大口より、継続的に場を支える人を高く評価する。 |
| influence | 20% | フォロワー数・フォロー先数・プレミアム・LV | OSINT 的な外部波及力。ただし応援行動そのものではないため補助軸に留める。 |

この比率なら、フォロワーが多いだけでコメントが少ない人は上位に来にくい。一方で、フォロワーが少なくてもコメント密度と常連度が高い「ローカル熱心層」は A/B に入りやすい。

総合スコア計算では小数の丸めは最後だけ行う。途中で丸めると Tier 境界付近の判定が不安定になる。

### 内訳(engagement / loyalty / influence)

#### engagement

入力:

- `commentCount`: 当該配信のコメント数
- `giftTotalPoints`: 当該配信のギフト pt 合計。未実装フェーズでは 0 として扱えるが、ギフト集計がレポートに存在しない場合は gift sub-weight を comment に再配分する。

推奨式:

```text
commentScore = logNorm(commentCount, commentCap)
giftScore    = logNorm(giftTotalPoints, giftCap)

if live has any gift data:
  engagement = 0.70 * commentScore + 0.30 * giftScore
else:
  engagement = commentScore
```

`commentCap` は当該配信の `commentCount` p95、ただしサンプル 20 名未満では p90 を使う。最低値は 1。

`giftCap` は positive gift pt の p95、サンプル 20 名未満では positive max を使う。ギフトは極端に偏るため、線形ではなく必ず `log1p` を通す。

```text
logNorm(value, cap) = clamp(100 * log1p(value) / log1p(max(1, cap)), 0, 100)
```

gift の扱い:

- ギフトが 0 の人は `giftScore = 0`。これは欠損ではなく観測済みの 0。
- ギフト集計自体がその配信レポートに存在しない場合は、全員に 0 を付けず、engagement を comment 100% にする。
- 大口ギフトは評価するが、engagement 内 30% に留めることで、課金だけで常連支援を押し切らない。

#### loyalty

入力:

- `loyaltyCount`: 直近 N 配信中、1 回以上コメントした配信数
- `availableLiveCount`: 履歴が N に満たない場合の実測配信数。`SupporterInput` にはないが、実装時の opts で持つべき値。

推奨式:

```text
effectiveN = min(N, max(1, availableLiveCount))
loyaltyRatio = clamp(loyaltyCount / effectiveN, 0, 1)
loyalty = round(100 * sqrt(loyaltyRatio))
```

平方根を使う理由:

- `1/30` の初参加を 0 にしない。
- `5/30` 程度の準常連を完全には埋もれさせない。
- `20/30` 以上の濃い常連は 80 点台以上に乗る。

目安:

| 直近 30 配信中 | loyalty |
|---:|---:|
| 1 回 | 18 |
| 3 回 | 32 |
| 7 回 | 48 |
| 15 回 | 71 |
| 24 回 | 89 |
| 30 回 | 100 |

#### influence

入力:

- `followerCount`: niconico の公開フォロワー数
- `followeeCount`: niconico の公開フォロー先数
- `isPremium`: プレミアム会員か
- `userLevel`: ユーザーレベル

推奨式:

```text
followerScore = logNorm(followerCount, followerCap)
followeeScore = logNorm(followeeCount, followeeCap)
levelScore    = clamp(100 * userLevel / levelCap, 0, 100)
premiumScore  = isPremium ? 100 : 0

influence = weightedAverageAvailable({
  followerScore: 0.60,
  levelScore:    0.20,
  followeeScore: 0.10,
  premiumScore:  0.10
})
```

`followerCap` は当該配信の followerCount p95、最低 10。`followeeCap` は followeeCount p95、最低 50。`levelCap` は 50 を初期値にし、実データの p95 が 50 を超える場合は p95 を使う。

この配分では、外部影響力は followerCount が中心だが、niconico 内で活動量のあるアカウントも userLevel/followeeCount/premium で少し拾える。`isPremium` は強い属性ではないため 10% に留める。

### 欠損値処理

結論: undefined を 0 扱いしない。欠損は「その人の価値が低い」ではなく「取得できていない」だけなので、0 点化すると未ログイン・401・公開制限の影響が ranking に混ざる。

処理方針:

1. `commentCount` は必須。ない場合は 0。
2. `giftTotalPoints` は、ギフト集計が存在する配信では missing を 0 とみなす。ギフト集計自体が未接続の配信では engagement の gift sub-weight を除外する。
3. `loyaltyCount` は履歴がない場合 `loyaltyCount = 1` としてよい。ただし「当該配信にコメントした人」に限る。履歴不足時は `effectiveN = availableLiveCount` で割る。
4. `followerCount` / `followeeCount` / `userLevel` / `isPremium` は sub-field 単位で欠損を除外し、残った sub-field の重みに再正規化する。
5. influence sub-field がすべて欠損した場合は、当該配信内の influence median を使う。median を計算できない場合は 50 点の中立値を使う。
6. 将来 output type を拡張できるなら、`componentsCoverage` または `confidence` を追加し、profile 由来データの充足率を UI に出す。ただし Phase 2 の `SupporterPower` 型では必須にしない。

status の扱い:

| status | score への扱い | UI への扱い |
|---|---|---|
| `login_required` | 欠損。0 扱いしない。 | 「ログイン時に再取得」系の注記。 |
| `forbidden` | 欠損。0 扱いしない。 | 「公開設定により未取得」。 |
| `error` | 欠損。0 扱いしない。 | 一時失敗として再取得対象。 |
| `ok` かつ値 0 | 実測 0。0 点として使う。 | 通常表示。 |

### 正規化方式(線形 vs 対数)

結論: コメント数・ギフト pt・フォロワー数・フォロー先数は対数正規化を使う。userLevel だけは cap 付き線形でよい。

線形を避ける理由:

- コメント 100 件と 1000 件を 10 倍差にすると、1 人の突出値だけで engagement が決まる。
- ギフト pt は特にロングテールになりやすく、線形だと大口 1 件が常連度を押し潰す。
- followerCount は OSINT 的には重要だが、配信者にとっての「応援者」では補助軸なので過剰に効かせない。

推奨の cap:

| 値 | cap | 備考 |
|---|---|---|
| commentCount | p95、20 名未満は p90 | 配信ごとの勢い差を吸収する。 |
| giftTotalPoints | positive p95、20 名未満は positive max | ギフトなし配信では sub-weight を除外。 |
| followerCount | p95、最低 10 | 小規模配信で 1 人だけ突出しても 100 点に張り付くだけ。 |
| followeeCount | p95、最低 50 | 幅広く見ている人を少し評価する。 |
| userLevel | max(50, level p95) | level は線形で十分。 |

percentile:

- `percentile` は当該配信内の総合 score に対する percent rank とする。
- highest は 100、lowest は 0。score 同点は同順位の平均 percentile にする。
- サンプル 1 名の場合は 100 にする。サンプル 2-4 名では UI に「参考値」を付ける。

全配信横断ではなく当該配信内を primary にする理由:

- 配信者がレポートを見るタイミングでは「この枠の支援者上位」が最も行動に直結する。
- 配信時間・企画・来場者層が違うと横断比較は歪む。
- 横断指標は `seasonPercentile` や `globalPercentile` として後から追加すればよい。

## Tier 分類(S/A/B/C/D/E)

### スコア境界

Tier は score と percentile の hybrid で決める。score だけだと配信規模の違いを吸収しにくく、percentile だけだと小規模配信で全員が過大評価される。

通常判定、サンプル 20 名以上:

| Tier | 条件 | 意味 |
|---|---|---|
| S | `score >= 90` かつ `percentile >= 99` | その配信の最上位支援者。人数は原則 1% 以下。 |
| A | `score >= 80` かつ `percentile >= 95` | 配信を強く動かした上位支援者。 |
| B | `score >= 65` かつ `percentile >= 80` | 明確に目立った支援者。 |
| C | `score >= 50` かつ `percentile >= 50` | 平均以上の安定参加者。 |
| D | `score >= 35` | 軽い参加または外部情報が弱い参加者。 |
| E | 上記以外 | 観測量が少ない参加者。 |

小規模 fallback、サンプル 20 名未満:

| Tier | 条件 |
|---|---|
| S | `score >= 92` |
| A | `score >= 80` |
| B | `score >= 65` |
| C | `score >= 50` |
| D | `score >= 35` |
| E | 上記以外 |

例外:

- サンプル 5 名未満では S を出さない。最高でも A とする。小規模配信の「上位 1%」は意味が薄いため。
- `engagement < 20` かつ `loyalty < 20` の人は、influence が高くても A 以上にしない。フォロワーが多いだけの「静かな支援」は、既存の `quietSupporters` として見せる。
- `loyalty >= 90` かつ `engagement >= 55` の人は、percentile が少し足りなくても B 以上に floor してよい。常連を過小評価しないため。

2-1(e) の Tier 境界に対する回答:

- S は上位 1% 相当、かつ score 90 以上。
- A は上位 5% 相当、かつ score 80 以上。
- B は上位 20% 相当、かつ score 65 以上。
- C は上位 50% 相当、かつ score 50 以上。
- D/E は absolute score で分ける。

### 色設計

SocialXup 風に「診断感」が出る高彩度の badge と、マーケ HTML の落ち着いたダークテーマに乗る薄い背景をセットにする。

| Tier | badge | background | 用途 |
|---|---|---|---|
| S | `#f59e0b` amber | `rgba(245, 158, 11, 0.14)` | MVP、最上位。 |
| A | `#ef4444` red | `rgba(239, 68, 68, 0.13)` | 強い支援者。 |
| B | `#3b82f6` blue | `rgba(59, 130, 246, 0.13)` | 目立つ支援者。 |
| C | `#22c55e` green | `rgba(34, 197, 94, 0.12)` | 安定参加。 |
| D | `#94a3b8` slate | `rgba(148, 163, 184, 0.10)` | 軽参加。 |
| E | `#52525b` zinc | `rgba(82, 82, 91, 0.10)` | 観測少。 |

リアルタイム Tier 表示の安定化:

1. 配信開始から 5 分未満、または数値 ID コメンター 10 名未満では `provisional` 表示にする。
2. 表示用 score は `displayScore = 0.7 * previousDisplayScore + 0.3 * currentScore` の EMA にする。
3. Tier 昇格は境界を 2 点以上超えたら即時反映してよい。ギフトや集中コメントを即座に反映するため。
4. Tier 降格は境界を 5 点以上下回る状態が 2 回連続、または 3 分以上続いた場合だけ反映する。
5. percentile の再計算で順位が揺れるため、配信中 badge は `S?` のような仮表示ではなく、tooltip に「暫定」と出す。
6. 配信終了後の HTML レポートでは EMA ではなく final raw score で確定 Tier を出す。

## 常連密度スコア

### N の選択

結論: 総合スコア用の標準 N は 30 配信。UI の短期トレンド補助として N=7 も併記できる。

理由:

- N=7 は直近の熱量変化に強いが、週 1 配信者では 2 カ月弱になり、毎日配信者では 1 週間にしかならない。常連評価としては揺れやすい。
- N=30 は日次配信なら約 1 カ月、週 2-3 配信なら 2-3 カ月を見られる。常連・卒業・復帰の判断に必要な厚みがある。
- ストレージ上は 30 配信分の compact presence history で十分。コメント全量ではなく userId ごとの presence count を持てば容量を抑えられる。

推奨データ:

```typescript
type SupporterPresenceHistory = {
  userId: string;
  liveIds: string[];        // 直近 30 配信のうち出現した liveId
  lastSeenAt?: number;
  lastSeenLiveId?: string;
  absenceStreak: number;
  statusHistory?: Array<{
    liveId: string;
    capturedAt: number;
    presence: 'present'|'absent';
    profileStatus?: 'ok'|'forbidden'|'login_required'|'error';
    followingListStatus?: 'ok'|'forbidden'|'login_required'|'error';
  }>;
};
```

ただし Phase 2 の score 実装では、最初から statusHistory 全量を必須にしない。まず `loyaltyCount` と `availableLiveCount` だけで score を出し、卒業/復帰カレンダー実装時に履歴を厚くする。

### 新規コメンター扱い

新規コメンターは「常連ではない」が「価値が低い」ではない。次の扱いにする。

- 当該配信に初めて現れた人は `loyaltyCount = 1`。
- `availableLiveCount < 30` の初期期間は `effectiveN = availableLiveCount` で割る。履歴が 3 配信しかない時に `1/30` で過小評価しない。
- 履歴が 30 配信以上ある場合の初参加は `sqrt(1/30) = 18` 点程度。engagement が高ければ B/A まで届くが、常連度なしで S には届きにくい。
- UI では Tier とは別に `New` badge を付ける。新規を E 扱いで固定しない。
- 初参加かつ高 engagement の人は「新規熱心層」としてセグメント補助ラベルを付けると、配信者がフォローアップしやすい。

## 卒業/復帰カレンダー

### 卒業検出ロジック

「卒業」はアカウント消失やフォロー非公開ではなく、常連だった人が配信に出現しなくなることとして定義する。

前提条件:

```text
regularCandidate =
  appearancesInLast30 >= 12
  or loyaltyScore >= 65
  or (tier was A or higher in at least 2 of last 10 lives)
```

卒業状態:

| state | 条件 | UI |
|---|---|---|
| active | 当該配信に出現 | 通常 |
| watch | regularCandidate かつ `absenceStreak >= 3` | 注意。まだ卒業とは呼ばない。 |
| atRisk | regularCandidate かつ `absenceStreak >= 6` | 卒業候補。 |
| graduated | regularCandidate かつ `absenceStreak >= 10` | 卒業扱い。 |

N=30 の場合、10 配信連続不在を確定ラインにする。毎日配信なら 10 日、週 2 配信なら約 5 週間になり、偶然の欠席と離脱を分けやすい。

status 観測の扱い:

- `login_required` は取得者側の認証状態なので、卒業判定に使わない。calendar には「取得保留」として別マーカーにする。
- `forbidden` はプロフィールやフォロー一覧の公開設定変更であり、コメント出現の有無とは別。単体では卒業にしない。
- `error` は一時失敗として卒業に使わない。
- `forbidden` または `login_required` と `absenceStreak` が同時に進んだ場合は、卒業イベントの reason に `presence_absent + profile_unavailable` のように併記する。

これにより、niconico への過度な再取得や認証回避を提案せず、保存済み snapshot と通常の取得結果だけで OSINT として成立する。

### 復帰検出ロジック

復帰は、過去に `watch` / `atRisk` / `graduated` になった userId が再び当該配信でコメントした時点で検出する。

```text
if previousState in ['watch', 'atRisk', 'graduated'] and presentInCurrentLive:
  emit return event
  absenceStreak = 0
  state = active
```

復帰イベントの強さ:

| previousState | event | 表示 |
|---|---|---|
| watch | `returned_soft` | 軽い復帰。 |
| atRisk | `returned` | 復帰。 |
| graduated | `returned_after_graduation` | 卒業後復帰。強調表示。 |

復帰時に総合 score へ人工 bonus は入れない。score はコメント・ギフト・常連度から自然に上がるべきで、カレンダー上の復帰マーカーと混ぜない方が説明しやすい。

ただし UI では、復帰した配信の row に `復帰` badge を 1 回だけ付ける。配信者にとって行動価値が高いため。

### UI 提案(SocialXup の凍結カレンダー風)

SocialXup の凍結カレンダー風に、日付または配信単位の heatmap と event marker を分ける。

表示単位:

- 日次 view: 1 日に複数配信がある場合は aggregate。
- 配信 view: `liveId` 単位で横スクロール。配信頻度が高い人はこちらが正確。

色:

| event | 色 | 意味 |
|---|---|---|
| active regular | `#22c55e` | 常連が出現。 |
| watch | `#eab308` | 3 配信以上不在。 |
| atRisk | `#f97316` | 6 配信以上不在。 |
| graduated | `#ef4444` | 10 配信以上不在。 |
| returned | `#3b82f6` | 復帰。 |
| status unavailable | `#64748b` | login_required / forbidden / error。 |

UI 構成:

- 上段: 日次 heatmap。各日セルに `卒業候補`, `卒業`, `復帰` 件数をドットで重ねる。
- 中段: event list。nickname / userId / previous tier / absenceStreak / lastSeenLiveId / returnLiveId を表示。
- 下段: filter。Tier、旧 `buildCommenterFollowSegments` の 3 セグメント、`New`, `Returned`, `At risk` で絞り込み。
- tooltip: 「直近 30 配信中 18 回出現、最後の出現 lvxxxx、6 配信連続不在」のように根拠を短く出す。

公開レポート化する場合は、配信者が公開を選んだデータだけに限定する。uid と nickname は niconico 公開情報だが、配信者の手元で観測した参加履歴は利用者ローカル由来なので、将来のクラウド/SaaS では明確なオプトインが必要。

## 既存資産との接続

- buildCommenterFollowSegments の拡張案
- buildCommenterFollowAnalytics への追加 export

`buildCommenterFollowSegments` は現在、フォロワー数とコメント数の 2 軸で次の 3 分類を返している。

- `highFollowerRegulars`: follower 高、comment 高
- `localEnthusiasts`: follower 低、comment 高
- `quietSupporters`: follower 高、comment 低

この分類は「解釈ラベル」であり、S/A/B/C/D/E の「診断 rank」とは役割が違う。したがって、既存 `segments` を Tier に置換しない。

推奨接続:

1. 新規 pure module として `src/lib/supporterPowerScoring.js` を作る。
2. `commenterFollowAnalytics.js` から必要に応じて import し、`buildCommenterFollowAnalytics` の返り値に新しい optional field を追加する。
3. 既存返り値 `rows`, `rowsWithFollowerCount`, `thresholds`, `scatterPoints`, `segments`, `followDeltas`, `followeeProfile`, `followTiming`, `broadcasterFollow`, `commonFollowees`, `followingListInsights` は名前も意味も変えない。

追加 field 案:

```typescript
type CommenterFollowAnalytics = {
  // existing fields unchanged
  supporterPowerRows?: SupporterPowerRow[];
  supporterPowerSummary?: {
    sampleSize: number;
    tierCounts: Record<'S'|'A'|'B'|'C'|'D'|'E', number>;
    medianScore: number;
    topRows: SupporterPowerRow[];
  };
  supporterCalendar?: {
    events: SupporterCalendarEvent[];
    dailyBuckets: SupporterCalendarDayBucket[];
  };
};
```

`SupporterPowerRow` は既存 row を壊さず、別 row として持つ。

```typescript
type SupporterPowerRow = {
  userId: string;
  nickname: string;
  commentCount: number;
  giftTotalPoints: number;
  loyaltyCount: number;
  followerCount?: number;
  followeeCount?: number;
  isPremium?: boolean;
  userLevel?: number;
  power: SupporterPower;
  segmentId?: 'highFollowerRegulars'|'localEnthusiasts'|'quietSupporters'|'other';
  badges: Array<'new'|'returned'|'atRisk'|'profileMissing'|'giftSupporter'>;
};
```

`buildCommenterFollowAnalytics` opts 追加案:

```typescript
type BuildCommenterFollowAnalyticsOptions = {
  // existing opts unchanged
  giftTotalsByUserId?: Record<string, number>;
  loyaltyWindowSize?: number;       // default 30
  availableLiveCount?: number;
  loyaltyCountsByUserId?: Record<string, number>;
  supporterPresenceHistory?: unknown;
  includeSupporterPower?: boolean;  // default false at first, then true after UI ready
};
```

接続順:

- Phase 2-A: `supporterPowerRows` だけを作る。HTML 未接続でも JSON と test で検証できる。
- Phase 2-B: `supporterPowerSummary.tierCounts` と Tier badge を HTML に追加する。
- Phase 2-C: `loyaltyCountsByUserId` の生成を snapshot history から作る。
- Phase 2-D: `supporterCalendar` を追加する。

既存セグメントとの併用:

| 既存 segment | Tier 側の見え方 | UI 表示 |
|---|---|---|
| highFollowerRegulars | engagement と influence が高ければ A/S | Tier badge + 「高フォロワー常連」補助ラベル |
| localEnthusiasts | engagement/loyalty が高ければ A/B | Tier badge + 「ローカル熱心層」補助ラベル |
| quietSupporters | influence は高いが engagement が低ければ B/C/D | Tier badge + 「静かな支援」補助ラベル |
| other | score 次第 | Tier のみ |

この設計なら、既存 report の意味を維持しながら SocialXup 風の診断表示を足せる。

## テスト方針

- スコアリングの境界テスト
  - score 89.9 は S にならず、90 以上かつ percentile 99 以上で S。
  - サンプル 5 名未満では S を出さない。
  - score 80/65/50/35 の境界で A/B/C/D/E が正しく分かれる。
  - `engagement < 20` かつ `loyalty < 20` の high influence row が A 以上にならない。
- 欠損値ケース
  - `followerCount: undefined` は follower 0 と同じにならない。
  - influence 全欠損では median、median 不可では 50 を使う。
  - `followerCount: 0` は実測 0 として followerScore 0。
  - `login_required` / `forbidden` / `error` が score を直接下げない。
  - ギフト集計なしの配信では engagement が comment 100% になる。
  - ギフト集計ありで user の gift が missing/0 の場合は giftScore 0。
- 偏差値計算の正確性
  - highest が 100、lowest が 0。
  - tie score は同じ percentile。
  - 1 名だけなら 100、2-4 名なら値は出るが UI で参考値扱い。
  - score sort が安定し、同点時は commentCount、loyalty、userId など deterministic な tie-break を使う。
- 正規化テスト
  - `logNorm(0, cap) = 0`。
  - `value >= cap` で 100。
  - comment 100 と 1000 の差が線形 10 倍にならない。
  - p95 cap の外れ値で他 row が 0 近辺に潰れない。
- 常連密度テスト
  - N=30、loyaltyCount 1/3/7/15/24/30 の期待値。
  - availableLiveCount が 5 の時は effectiveN=5。
  - 初参加が loyalty 0 にならない。
- 卒業/復帰テスト
  - regularCandidate ではない user は absenceStreak が進んでも graduated にならない。
  - absenceStreak 3/6/10 の state 遷移。
  - `login_required` だけでは卒業にならない。
  - graduated 後に present になったら `returned_after_graduation` event を出す。
- 互換性テスト
  - `buildCommenterFollowAnalytics` の既存 fields が同じ名前・同じ型で残る。
  - `buildCommenterFollowSegments` の出力件数と label が既存 fixture で変わらない。
  - supporter power を opts off にした時、既存 analytics snapshot と一致する。

## 実装計画(Claude Code が実装する想定)

- ファイル構成案

| file | 役割 |
|---|---|
| `src/lib/supporterPowerScoring.js` | score, component, percentile, Tier の pure functions。 |
| `src/lib/supporterPowerScoring.test.js` | 境界、欠損、正規化、Tier の単体テスト。 |
| `src/lib/supporterPresenceHistory.js` | 直近 30 配信の出現 count、absenceStreak、calendar event の pure functions。 |
| `src/lib/supporterPresenceHistory.test.js` | 常連密度、卒業、復帰の単体テスト。 |
| `src/lib/commenterFollowAnalytics.js` | 既存 return を維持し、optional field と opts を接続。 |
| `src/lib/marketingChartsHtml.js` | Phase 3 で Tier badge、score table、calendar heatmap を表示。Phase 2 実装直後は JSON だけでも可。 |

- リスクポイント

| risk | 対策 |
|---|---|
| 既存 `segments` の意味を壊す | Tier は別 field にする。既存 fields は変更しない。 |
| 欠損 profile を低評価してしまう | undefined は再重み付け、中立 median fallback。 |
| ギフト大口が score を支配する | engagement 内 30%、log 正規化、p95 cap。 |
| 小規模配信で S/A が乱発する | サンプル 20 名未満 fallback、5 名未満は S 禁止。 |
| リアルタイム表示が上下に揺れる | EMA、hysteresis、開始 5 分 provisional。 |
| niconico ToS リスク | 新規の過剰 fetch や認証回避をしない。保存済み snapshot と既存 TTL/上限を使う。 |
| v0.1.592 baseline 破壊 | content/popup の挙動変更を避け、pure function と report 追加から始める。 |
| storage 肥大化 | コメント全量ではなく userId ごとの presence summary と直近 30 liveId だけ保存。 |

Claude Code への推奨 8-step 実装順:

1. `supporterPowerScoring.js` を新設し、`logNorm`, `weightedAverageAvailable`, component 計算、総合 score、percentile、Tier 判定を pure function として実装する。
2. `supporterPowerScoring.test.js` を先に厚めに作り、境界、欠損、small sample、対数正規化を固定する。
3. `commenterFollowAnalytics.js` へ opts off のまま接続し、既存 `buildCommenterFollowAnalytics` の返り値が変わらないことを確認する。
4. `includeSupporterPower: true` 時だけ `supporterPowerRows` と `supporterPowerSummary` を返すようにする。
5. snapshot history から `loyaltyCountsByUserId` を作る pure helper を追加し、N=30/effectiveN の常連密度テストを通す。
6. 卒業/復帰用の `supporterPresenceHistory.js` を追加し、absenceStreak と calendar events を pure function で固める。
7. マーケ HTML レポートに Tier badge と score 内訳を追加する。カレンダーは最初は summary/list で出し、heatmap は表示安定後に足す。
8. `npm run typecheck`, 関連 vitest, `npm run build` を通し、v0.1.592 baseline の content/popup 動作に影響する差分がないことを `git diff` で確認する。
