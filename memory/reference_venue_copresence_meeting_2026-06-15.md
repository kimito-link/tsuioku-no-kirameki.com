# 会場モード co-presence 強化 会議+世界事例リサーチ 結論(2026-06-15)

司令塔=Opus 4.8(Fable 5 はグレーアウトで利用不可→ルール通りフォールバック)。
会議メンバー=クラウド無料4系統+ローカル ollama。世界事例=Claude サブエージェント(WebSearch・出典付き)。
現状コードのマップは Explore 済み(venueBar.js / venueSpeech.js / venueHeat.js / venueSeats.js / crowdRasterizer.js)。

## 会議メンバー(実際に答えた・素材は .artifacts-venue-answers*.json)
- groq/gpt-oss-120b(reasoning_effort:low)・groq/llama-3.3-70b・nvidia/qwen3.5-122b(thinking:false)・gemini-2.5-flash・local/qwen3.5:9b
- 罠: gemini は 503/高需要で落ちることがある。nvidia qwen3.5 は 60秒級で遅い時がある。local gpt-oss:20b は番外で abort。

## 現状の co-presence 演出(実装済み・出発点)
発言で席ふわっと(v0.1.742)/吹き出し4秒最大6個/読み上げ(声と吹き出し同期)/常連VIP金色オーラ脈動(上位8)/
実サムネ前列優遇1.12倍/盛り上がりで下端照明 青紫→オレンジ(venueHeat)/大人数で観客シルエット群がペンライト(静止)/ひな壇立体。
弱点 A=同時発言で吹き出し埋まり会話が孤立 / B=観客シルエット静止 / C=連続発言に溜まり感なし / D=入場感なし / E=照明が下端だけ / F=静かだと画面が止まり死ぬ。

## 結論=会議と世界事例が一致した「確実に効く」2本柱(優先順)

### ★本命1: 生きている会場(idle呼吸 + 盛り上がりで観客が同期して動く) — 弱点 B・E・F
- **査読研究で実証**: VR concert の CIT 研究=チャット量/感情→観客アバターを同期させて腕振り/手拍子させると「一緒にいる感(co-presence)」が**統計的有意に向上(p<.05)**・没入も(p<.01)。([arxiv 2503.13121](https://arxiv.org/html/2503.13121))
- crowd physiological synchrony=現地観戦は心拍同期が高く絆が強い・鍵は「共有された興奮(shared arousal)」。([PMC8755740](https://pmc.ncbi.nlm.nih.gov/articles/PMC8755740/))・movement synchrony が絆を作る([Frontiers fpsyg.2016.00782](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2016.00782/full))
- idle 設計: 呼吸しない立ち像は「生きてない凍った彫像に見える」・毎分15-20回の微呼吸/頭の向き/体重移動で最小投資で大きなリアリティ。([MoCap Idle Guide](https://mocaponline.com/blogs/mocap-news/idle-animation-game-dev-guide))
- 会議でも qwen3.5:9b と qwen3.5-122b が「静寂の呼吸/余韻の可視化」を**本命**に挙げた(弱点F=コメント無い時に死ぬ、が一番もったいない)。
- **実装の核(軽量)**: 観客シルエット群(crowdRasterizer)を①静寂時=ゆっくり呼吸でそよぐ(低周波 sin) ②盛り上がり時(venueHeat の heatLevel を流用)=ペンライトが**同期して**揺れ幅↑・点滅。席アバターも極小の上下呼吸。CSS変数+既存 canvas 再描画で可。配信映像は触らない(下端だけ)。prefers-reduced-motion で停止。
- **なぜ効く**: 「コメントが無い=誰もいない」を「皆が息を潜めて一緒に見てる」に変える(安心感・孤独の解消)。盛り上がりの同期は shared arousal の疑似再現。

### ★本命2: 会話の連鎖(連続発言・同時発言を「会話」として見せる) — 弱点 A・C
- **会議の最大多数決**: gpt-oss-120b・llama-3.3-70b・gemini の3体が揃って**第1位「本命」**に挙げた(qwen3.5-122b も第2位)。「発言チェーン・バブル」「会話の軌跡とグループ化」。
- 世界事例の裏付け: ニコニコ danmaku の「擬似同期(pseudo-synchronous)=非同期コメントを同じ瞬間に出すと"一緒に見てる"と感じる」([Springer danmaku](https://link.springer.com/chapter/10.1007/978-3-319-20907-4_14))。social translucence の visibility([Erickson&Kellogg TOCHI2000](https://tomeri.org/TOCHI2000_SocialTranslucence.pdf))。
- **実装の核(軽量)**: 同一 userId が3秒以内に連続発言したら、吹き出しを上書きせず**少しずらして連結/積み重ね**(会話の糸)。連続するほど席が継続的に輝く(溜まりゲージ/光リング)。最大6個の制約内で「誰の連続発言か」を視認可能に。純関数で「連続判定」、CSS で連結表現。
- **なぜ効く**: 孤立した短編が「会話が成立している会場」に見える=社会的証明。常連が継続的に盛り上げてる感。

## 次点(効くが後回し)
- 入場アニメ(弱点D・slideIn・新規userId初出で・CSS のみで軽い)=全員が言及。SHOWROOM の「ギフトで前列に近づく」空間メタファーの追憶版とも繋げられる([btrax](https://blog.btrax.com/showroom-japanese-live-streaming-app/))。
- 熱気の奥行き(弱点E・下端だけの色温度をひな壇背景の奥にも薄く伸ばす)。
- Twitch Hype Train 型「みんなで1つのゲージ」=散発コメントを共有マイルストーンに束ねる([help.twitch.tv hype-train](https://help.twitch.tv/s/article/hype-train-guide?language=en_US))。追憶向けには「盛り上がりメーター」を控えめに。

## HCI 原理(設計の妥当性チェック=既存設計は正しい)
- ambient/peripheral display=「最小の視覚侵襲で他者の気配を周辺視に出す」→追憶の「映像中央素通し・下端だけ変化」は研究的に正しい。([Springer peripheral](https://link.springer.com/chapter/10.1007/978-1-84882-477-5_19))
- 感情伝染=ライブチャットでは喜び/ポジティブが最も伝染(怒りの3倍)→演出は「喜び」を増幅する向きに。([arxiv 2408.05700](https://arxiv.org/pdf/2408.05700))

## ✅ 実装完了(2026-06-15・v0.1.743・master push 済 86e7df64)
両本命とも実機検証してから push。司令塔=Opus 4.8。
- **本命1=生きている会場(ac51e42a)**: 新規 src/lib/venueCrowdMotion.js(resolveCrowdMotionProfile/
  resolveCrowdSpriteMotion・テスト10)+crowdRasterizer.drawCrowdOnCanvas に anim 引数(後方互換)
  +venueBar に rAF アニメループ(約18fps間引き・reduced-motion/閉/観客0で停止)。観客が静かな時
  呼吸でそよぎ盛り上がり(venueHeat の heatLevel)で同期して揺れる。実機=canvas ピクセルが
  フレーム毎に変化(changedBetween=true・120ms間隔でも allDistinct)=従来静止→揺れている。
- **本命2=会話の連鎖(86e7df64)**: 新規 src/lib/venueSpeechStreak.js(updateSpeechStreak/
  pruneSpeechStreaks/streakGlowStage/streakBubbleLifetimeMs・テスト11)。同じ人が6秒内に連続発言
  すると席が暖色コーラルで段階的に強く脈動(data-streak=1..4・CSS)。金色オーラ(支えてる人)と別軸
  =いま盛り上げてる人。renderSeats は speechStreaks(正本)から段階復元(再描画で消えない)・pollSpeech
  で prune・配信切替で clear。実機=連続発言席に data-streak 付与を20秒79サンプルで観測・コーラル
  box-shadow と nlsb-seat-streak アニメ発火を computed style で確認。
- ⚠️実機検証は chrome-devtools MCP・extension install→reload→auto-patrol(nls_autopatrol_enabled_v1)
  false で固定→ranking 1位 lv350704295(W杯NHK実況・2500人超)で。**アニメは静止スクショで写らない
  →canvas ピクセル差分/DOM 属性/computed style で実証する(これが確実)**。
- changelog summary は **35字以内**(changelog.test.js が弾く・36字で1回踏んだ)。
- 残=次点(入場アニメD/熱気の奥行きE/Twitch Hype Train型ゲージ)・CWS提出(v0.1.743 を Publish API・
  説明文変更ありなのでユーザー手動貼替)。会議基盤=scripts/meeting.mjs。

## ✅ 追加実装(2026-06-15・実機の"見て納得"ループで発覚→根治)
- **サムネ持ちを一目で特別に(v0.1.744・6e5b8777・star push済)**: ユーザーが実機動画を見て「サムネあり
  が特別になってない」。星野ロミ会議(無料LLM7体一致)=1.12倍は脳に"比較"を要求しノイズ化(摩擦)。
  scale 1.12→**1.45**(28→約40px・"断絶"を作り本能で「大きい=重要」)+金縁強化(2pxリング+12pxグロー)
  +brightness 1.08→1.12・z-index 5。脈動なし(止まった大きさ=存在・上品さ保持)。実機=VIP58px/通常35px。
  ⚠️**サムネ持ち人数は再描画ごとに激変(1〜46/70・enrich非同期+席churn)**=多数派の時は大きいの多め。
  ユーザー判断=A(このまま・少数時に確実に効くのを優先)。CSS のみ・venueSeats テスト72緑。
- **本番LPに動画ギャラリー(8dab268e・push済・本番200確認)**: ユーザー「LPに動画たくさん・実際に撮影」。
  chrome-devtools 実機(lv350704295・v0.1.744ビルド・観客2500人超)を16連番スクショ→ffmpeg
  (crop+lanczos+minterpolate blend+前後ping-pong)で滑らかループmp4 2本(overview 900x374/vip 900x330・
  各~400KB)。tsuioku-no-kirameki/index.html #venue に .venue-gallery(2カラム・レスポンシブ)追加+
  board に新機能説明。LP E2E 38緑(横スクロール無し検査含む)。本番 curl=動画200・HTML に新content 反映確認。
  ⚠️**アニメは静止スクショで弱い(呼吸/グローは設計上subtle)→大きい金縁サムネ+満員感で"会場が生きてる"を見せるのが効く**。

## 進め方(Non-Negotiable=メモリの教訓)
1. 1つずつ実機で目視確認してから入れる。**verify緑≠動く**。chrome-devtools か Claude-in-Chrome で実配信(ランキング上位)を開いて「実際に見える」まで確認。
2. 純関数はテスト必須。CSS/canvas 変更は実DOM(tierNodes/crowd canvas)と整合確認。
3. auto-patrol(nls_autopatrol_enabled_v1)が配信をローテーション→実機検証前に false で固定。
4. prefers-reduced-motion 厳守・配信映像非干渉・設定不要(摩擦ゼロ)。

## 第2回 会議+ディープリサーチ(2026-06-16・co-presence をさらに高める次の一手)
司令塔=Opus 4.8。会議=scripts/meeting.mjs(無料LLM全員集合・12体投げ6体応答: groq gpt-oss-120b/llama-3.3-70b・gemini-2.5-flash(部分)・openrouter gpt-oss-120b・local deepseek-r1:14b/hermes3:8b。reasoning系ローカル qwen3.5/qwen3/gemma4/qwen2.5/gpt-oss:20b と nvidia は cold-load/abort で欠席=既知の罠)。世界事例=Explore サブエージェント(WebSearch・出典付き)。素材=.artifacts-venue-copresence-2.json。

### 🥇全会一致の第1位 = 入場演出(新規visitorの到着キュー)— 弱点D
- **会議6/6 + ディープリサーチ が独立して第1位**(gpt-oss-120b/llama/openrouter/deepseek/hermes が #1・gemini も「期待の粒子」で言及・research も #1 Entrance Flash Pulse)。
- 根拠: **社会的証明(Social Proof・Cialdini 2007)**=「他者が続々と入ってくる」可視化が参加意欲を高める/到着の新規性が注意を引く([PMC7017247](https://pmc.ncbi.nlm.nih.gov/articles/PMC7017247/))。Discord/Zoom の join 通知が co-presence を上げる実証。
- 実装の核(最軽量・CSSのみ): 新規 userId の初出時、その席に短い入場フラッシュ(opacity 0→1→定常・~300ms)+周囲席に staggered な波紋(animation-delay)。canvas 不要。`prefers-reduced-motion` は opacity のみ/静止アイコンにフォールバック。**席に既にある venueSeats の DOM にクラス付与で出せる=軽い**。純関数は「新規 userId 判定(初出か)」だけ。
- なぜ最初にやるか: 全員一致で効果1位・実装が最軽量・既存の席DOMに足すだけでリスク最小=「1つずつ実機確認」の最初の1手に最適。

### 🥈次点(会議多数+research が支持・順に検討)
- **奥行き(弱点E)**: 群衆/照明を下端だけでなく3-4層の scale+opacity でひな壇奥へ。motion parallax は基本的奥行き手がかり・「後列が後ろにある」満員錯覚。CSS scale/opacity staggering(WebGL不要)。llama#2/openrouter#2/deepseek#2/hermes#2 + research#4。
- **静寂の活性化(弱点F)**: 既存の呼吸に微small-sway を位相ずらしで重ねる(14秒呼吸+3-5秒sway・席ごとに位相オフセット)。「死んだ画面」を「生きた聴衆」に。research#2(AnimSchool/MoCap idle)。gpt-oss#3/openrouter#3/deepseek#3/hermes#3。
- **満員感(来場者)**: §3の resolveVenueCrowdCount(累計ユニーク来場者で群衆を描く)= WIP として未コミット(handoff_2026-06-16 §3)。会議の「奥行き」と組むと満員錯覚が強化。

### ⚠️裏取りで却下/保留(ローカル完結・摩擦ゼロ方針に反する)
- WebAudio リバーブ/低周波サウンド(openrouter#1③/#3③・gpt-oss#1)= 音は会場既定の読み上げと干渉・摩擦増。視覚のみに留める。
- 画面四隅スキャンライン/全画面オーロラ(openrouter#2・gpt-oss#2)= 中央素通し原則の境界が危うい+派手すぎ(追憶は ambient/subtle が正・peripheral display 原理)。控えめな縁演出に留めるなら可。

### 次にやる(本丸=backfill 2%回帰は v0.1.758 で根治済・push済)
1. **入場演出(弱点D)を最初に実装**(全会一致1位・最軽量)。新規userId初出判定の純関数+TDD→席DOMにCSS入場フラッシュ→実機(ランキング上位の実配信・auto-patrol false)で「新規が来た時に光る」を目視→1つだけ入れる。
2. 以降 奥行き(E)→静寂活性化(F)→満員感(来場者・WIP)を1つずつ実機確認して入れる。**verify緑≠動く厳守**。
