# お題: 会場モードの「配信者サムネ混入」再発防止のためのファクタリング＆コメントアウトルール

## 背景・今起きているバグ

ニコニコ生放送 Chrome 拡張の会場モード（venueBar.js）で、
**配信者本人のサムネアイコンが「匿名」参加者として会場に入り込む**バグが再発している。

### コードの構造

```
content-entry.js          venueBar.js (会場モードUI)
  ├ broadcasterUidCache    ├ LANE_OPTS = { requireText: true }
  └ broadcasterIconUrlCache    ←── broadcasterUid/Icon を渡していない!
                           └ userLaneCandidatesFromStorage(rows, liveId, LANE_OPTS)
```

### なぜ混入するか（既に判明している事実）

1. `userLaneCandidatesFromStorage(opts)` は `broadcasterUid`＋`broadcasterIconUrl` を両方
   渡すと `broadcasterGuardEnabled=true` になり「viewer uid != broadcasterUid かつ
   broadcaster icon と同じ URL」を弾く強力なガードが有効になる
2. `venueBar.js` の `LANE_OPTS` には `broadcasterUid` / `broadcasterIconUrl` を**渡していない**
3. `content-entry.js` は `broadcasterUidCache` / `broadcasterIconUrlCache` を watch ページ DOM
   観測で更新するが、これらは**content-entry.js のモジュール変数**であり venueBar.js からは
   アクセスできない（別バンドル）
4. 結果: 配信者本人の匿名コメント行に配信者アイコンが紐付き、ガード抜けで会場に出る

### 過去にも同じ問題が出た

MEMORY.md を見ると:
- v0.1.740: `requireText:true` を追加（配信者の本文空行を弾く）← 部分対処
- v0.1.79, v0.1.83: `isAvatarUrlForUserId` 普遍ガード追加 ← popup 経路には効いた
- 会場経路はその都度「LANE_OPTS に 1 個足す」形で対処してきたが、渡す責務が venueBar.js に
  散在しており、broadcaster 情報が venueBar に届く仕組み自体が無い

## 本質的な問題（ファクタリング観点）

`venueBar.js` は「**会場の描画責務**」を持つが、`broadcasterUid` を**知るための経路がない**。
- `content-entry.js` が DOM から broadcaster を特定するが venueBar へ渡す仕組みがない
- `standalone（venue.html）` では content-entry.js すら動かない（別ページ）
- storage に broadcaster 情報が書き出されれば standalone も含めて取れるが、今は書いていない

## 会議への質問

以下の3点について「**結論 → 根拠 → 反論 → 具体案（コードレベル）**」で答えてください。
役割分担: 総合役は設計の全体整合、発散役は既存と異なる切り口、批判役は案の穴、実装役はコード行レベルの変更内容。

### Q1: broadcaster 情報をどこに持たせ、venueBar はどこから取るべきか

候補A: `content-entry.js` が broadcasterUid/IconUrl を **storage に書く**
  → `venueBar.js`（inline/standalone 両方）が storage から読める
  → 書き込み・鮮度管理の責務が増える

候補B: `mountVenueBarButton(options)` の **options に broadcaster を渡す**
  → inline(content-entry.js が呼ぶ)は渡せる
  → standalone(venue-entry.js が呼ぶ)は content-entry.js が動かないので渡せない

候補C: `venueBar.js` 内で **DOM から直接読む**（detectBroadcasterUserIdFromDom 相当）
  → standalone でも動く可能性あり（watch ページと同じ DOM かどうかによる）
  → standalone は venue.html（独立ページ）なので watch ページ DOM は見えない

### Q2: 「再発しないコメントアウト（コードコメント）ルール」をどう書くか

同じ穴に何度も落ちないために、コードに書くべきコメントのルールを提案してください。
- venueBar.js の LANE_OPTS 付近に何を書くべきか
- userLaneCandidatesFromStorage の関数定義に何を書くべきか
- broadcaster 情報の経路（誰が持ちどこに渡すか）をどう文書化するか

人間がコードを見たとき「あ、ここに broadcasterUid を足さないといけない」とわかる書き方と、
AIが読んだとき「この opts には broadcaster guard に必要な引数がある」と伝わる書き方の両方。

### Q3: 再発防止のためにファクタリングするとしたら何を分離・集約すべきか

`venueBar.js` はすでに 2800 行以上。「配信者除外の責務」をどこに置くのが最も安全か。
- 新しい純関数/モジュールを作るべきか、既存の何かを強化すべきか
- 「会場参加者の取得」と「配信者除外」を明確に分離するとしたら境界はどこか
- テスタビリティと将来の保守性の観点で採点してください
