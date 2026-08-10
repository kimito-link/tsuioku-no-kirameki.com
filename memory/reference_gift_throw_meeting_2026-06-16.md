# 会議正本: ギフト/広告を該当サムネから配信画面へ投げる演出(会場モード) (2026-06-16)

> COUNCIL-HOWTO.md 手順で会議ハーネス(scripts/meeting.mjs)を回し、司令塔(Claude)が実コードで裏取りして1案に収束させた正本。
> お題: 「アイテムや広告を投げたとき、該当ユーザーのサムネイルから配信画面へ投げるアクションを正確に再現(会場モード)」。

## 会議メンバーと結果(2026-06-16)
- 応答7体: groq/gpt-oss-120b・groq/llama-3.3-70b・nvidia/qwen3.5-122b・gemini-2.5-flash・openrouter/gpt-oss-120b・local/deepseek-r1:14b(批判)・local/qwen2.5-coder:14b(実装)。
- 不参加: qwen3:14b/gpt-oss:20b(VRAM evict abort)・gemma4:31b(未投入)。
- 出力JSON: `.artifacts/council-gift-throw.json`。

## 会議の合意点(7体ほぼ一致)
1. **軌道は CSS アニメ(GPU)で**: JS は起点/着弾座標を CSS 変数(--dx/--dy)で渡すだけ。`@keyframes` が translate + 中間Yオフセットで放物線。毎フレーム JS 計算は禁止。
2. **DOMプール + 同時数上限(8〜12)**: 固定数の要素を使い回し、`animationend` で返却。超過はキュー/最古破棄。**直近の O(N²) 送信18s事故の精神=会場を重くしない**。
3. **起点=席アイコン `getBoundingClientRect()`、フォールバック=`crowdBubbleAnchor`**(既存の positionBubble と同方式)。
4. **見た目=アイテム名テキスト+絵文字**(🎁ギフト/💰広告)。公式アイコンURLが無いため(下記裏取り)。
5. **着弾=中央で縮小+フェード**。`mix-blend-mode: screen` で映像を隠しすぎない・任意で着弾フラッシュ。
6. **reduced-motion=animation:none→フェードのみ**。

## 司令塔の裏取りで確定した事実(会議の前提を訂正)
- **ギフトに公式アイコンURLは無い**(確定): gift は `recordGiftCommentObservation` で `{sender, item, point}` を【ギフトコメント本文のパース】から得る(パターン `○○さんがギフト「XXX（Npt）」を贈りました`・giftBahamutCelebration.js が既にこの形をパース)。StoredGiftUser は `{userId,nickname,capturedAt,throwCount}` で誰が投げたかのみ。**→ 投げ物の見た目はアイテム名テキスト+絵文字が正解(会議の多数派と一致)**。
- **会議が assume した `row.kind === 'gift'` は comment 経路に存在しない**(裏取り): content-entry に `kind:'gift'` リテラル無し。会場の `onLiveComments` はコメント行を受け、ギフトはシステムコメントとして流れる。**→ 投げ演出の点火は『comment 行のうちギフト本文パターンにマッチする行』を検出して行う(kind フィールド頼みにしない)。`giftBahamutCelebration.js` のパース(sender/item/point)を会場でも流用できる**。
- **着弾ターゲットは `#videoArea` でなく `safeArea` 要素**(openrouter のハルシネ却下): 会場の中央映像エリアは venueBar の `safeArea`(grid-area safe・透過)。`safeArea.getBoundingClientRect()` を着弾中心に使う。
- **起点座標**: `seatByKey.get(speakerKey)` → `seatNodes[i].icon.getBoundingClientRect()`(positionBubble と同じ)。bubbleLayer 基準のローカル座標に変換して投げ物も bubbleLayer(z5・overflow外)に乗せる=席に潜らず中央へ飛ぶ。
- **voicePlayer は既に `kind:'gift'` アイテムを別途処理**(読み上げ「ギフト、〇〇を贈りました」)。これは voice 用の内部 item で、comment 行とは別。投げ演出は comment 行検出側で行う。
- **deepseek-r1 の「同時上限50・DOMから削除」は不採用**: 50は多すぎ・毎回 remove は生成コスト。多数派の 8〜12 + プール再利用が正しい(性能最優先)。

## 司令塔の収束案(1案・実コードに乗る)

### 0. 点火(ギフト検出)
- 会場 `processSpeechRows`(または onLiveComments)で各行の本文を giftBahamutCelebration の既存パーサ相当(`○○さんがギフト「item（Npt）」を贈りました`)で判定。マッチしたら `{ speakerKey/userId, item, point }` を投げ演出へ。広告(nicoad)も同様のパターンがあれば検出(無ければ第2段)。
- 既に吹き出し/読み上げと同経路なので新規購読は不要(comment funnel に相乗り)。

### 1. 投げ物の見た目(純関数 resolveGiftProjectile)
- ギフト: `🎁 {item}`(name 長い時 ellipsis)。広告: `💰 {pt}pt` または `📣`。
- 任意で 3キャラ thumb を背景装飾に使える(新規アセット不要)。テキストは text-shadow で映像上でも読める。

### 2. 軌道(CSS アニメ・GPU)
- JS: 起点 `seatRect`(無ければ crowdBubbleAnchor)と着弾 `safeArea` 中心を bubbleLayer ローカル座標で算出 → `el.style.left/top`=起点、`--dx/--dy`=差分を CSS 変数で注入。
- `@keyframes giftThrow`: 0% translate(0,0) scale(1) / 55% translate(calc(--dx*.6), calc(--dy*.6 - 80px)) scale(1.15) rotate(中間) / 100% translate(--dx,--dy) scale(.5) opacity:0。`cubic-bezier` で重力感。
- `will-change: transform, opacity`。

### 3. 性能(プール+上限+キュー)
- 固定プール(例8〜12)を bubbleLayer に用意。launch 時に空き要素を取り、内容/座標/CSS変数を書き換え class 付与でアニメ開始。`animationend` で class/inline をクリアし返却。
- 同時 active 上限(例8)。超過は短いFIFOキュー(例30)へ。溢れは捨てる(log で間引きを明示)。
- 全 inline CSS 変数+classList 切替のみ=毎フレーム JS ゼロ。

### 4. 席が無い投げ主
- `crowdBubbleAnchor(speakerKey)` の決定座標を起点に(観客領域)。完全に座標不能時は画面下端中央。匿名は data 属性で薄色など軽い区別(任意)。

### 5. 着弾
- 中央で scale 縮小+opacity0。任意で celebrationPika 相当の一瞬フラッシュ(既存CSS流用)。`mix-blend-mode: screen` で映像を隠さない。映像の手前で消える。

### 6. reduced-motion
- `@media (prefers-reduced-motion: reduce)` で giftThrow を無効化し opacity フェードのみ。JS でも matchMedia 監視。

## 会議のハルシネ/不採用(裏取りで除外)
- `row.kind === 'gift'` 前提(全員)→ comment 経路に無い。ギフト本文パースで点火。
- `gift.iconUrl` 前提(groq/openrouter)→ 公式アイコンURLは取れない。テキスト+絵文字。
- `document.querySelector('#videoArea')`(openrouter)→ そんな要素は無い。`safeArea`。
- 同時50/毎回remove(deepseek-r1)→ 性能リスク。プール+上限8〜12。
- 絵文字マッピング辞書を大量に持つ(nvidia)→ CWSサイズ増。item テキストをそのまま出す+汎用絵文字で足りる。

## 実装済み(v0.1.778・0fd4edb4・**ブランチ feat/gift-throw に隔離・master 未マージ**)
- ユーザー指示「ブランチ切ったほうがいい /gift/ とかで」→ `feat/gift-throw` に commit(master へ push せず)。実機はローカル dev-mode 読込なので、このブランチに居れば extension/dist がそのまま読まれて検証できる。
- 新 `src/lib/giftThrowProjectile.js`(+11テスト): resolveGiftProjectile(🎁+item / 📣+pt)・resolveGiftThrowPath(--dx/--dy/--mid* で放物線)・canLaunchGiftThrow(同時上限8)・GIFT_THROW_* 定数。
- 点火は parseGiftCommentText/parseNicoadCommentText を venueBar の processSpeechRows で呼び speech.text から検出(kind フィールド非依存)。
- venueBar: 起点=giftThrowOriginForSpeaker(seatByKey→icon.getBoundingClientRect・無ければ crowdBubbleAnchor)・着弾=giftThrowTarget(safeArea 中心)。bubbleLayer(z7)に DOMプール(10)。launchGiftThrow が CSS変数注入+is-flying で @keyframes nlsb-gift-fly(GPU・放物線)。canLaunchGiftThrow 超過は捨てる・animationend で recycle+保険 setTimeout。mix-blend:screen。reduced-motion は nlsb-gift-fade。
- 検証=verify:cc 全緑・dist content.js/venue.js 同梱確認。
- **マージ前にユーザー実機検証待ち**(ギフト/広告が飛ぶか・連続でも重くないか・映像/コメント欄を隠さないか)。OK なら master へ ff-merge+push。

## 反映3手順([[feedback_frequent_version_bump]])
push→git pull→拡張リロード→watchタブF5。ユーザーは「ギフト/広告が飛ぶと投げ主の席から中央映像へ同じアイテムが飛ぶ・速い配信でも重くない」で答え合わせ。

## 関連
- 性能最優先の出典: [[(v0.1.774 アイコン列 O(N²) 根治)]]・bubbleLayer/positionBubble/crowdBubbleAnchor(venueBar)
- ギフトパース: giftBahamutCelebration.js(sender/item/point)・recordGiftCommentObservation(content-entry)
- 既存演出資産(popup・流用候補): celebrationFlyText / celebrationPika / delugeDropImageSrc(3キャラ)
