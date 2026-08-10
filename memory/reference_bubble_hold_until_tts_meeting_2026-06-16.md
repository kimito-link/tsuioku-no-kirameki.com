# 会議正本: 「読み上げが終わるまで吹き出しを消さない」をUX損なわず最大化 (2026-06-16)

> COUNCIL-HOWTO.md 手順で会議ハーネス(scripts/meeting.mjs)を回し、司令塔(Claude)が実コードで裏取りして1案に収束させた正本。
> お題原文: 「ほぼ完ぺきなリアルタイム＝よみあげがおわるまで吹き出しは消さない―ユーザー体験損なわないようにを最大化」

## 会議メンバーと結果(2026-06-16)
- 最強モード指定: `MEETING_LOCAL_MODELS="gemma4:31b,qwen3:14b,gpt-oss:20b,deepseek-r1:14b,qwen2.5-coder:14b"` + Groq/NVIDIA/Gemini/OpenRouter。
- **応答**: groq/gpt-oss-120b・groq/llama-3.3-70b・openrouter/gpt-oss-120b・local/deepseek-r1:14b(批判)・local/qwen2.5-coder:14b(実装) = 計5体。
- **不参加**: gemma4:31b(31B冷起動が240s超でabort=既知)・qwen3:14b/gpt-oss:20b(VRAM競合でevict abort)・NVIDIA(abort)・Gemini(429)。
- 会議出力JSON: `.artifacts/council-bubble-hold.json`(クラウド3) / `.artifacts/council-bubble-hold-local.json`(ローカル2)。

## 会議の合意点(5体ほぼ一致)
1. **吹き出しの寿命を音声再生に連動**させる(再生中は消さない・再生終了で消す)。
2. **音声が破棄(鮮度ゲート)されたら吹き出しも即消す**=「来ない読み上げ」を永遠に待たせない。
3. **BUBBLE_MAX(12)超過時は『再生中』を優先的に残し、未再生/古いものから消す**。openrouter/gpt-oss は「再生終了時刻が最も遠いものから消す」スコアを提案。
4. **音声合成待ちの間は従来の流速寿命**で表示(吹き出しの即時性は失わない)。

## 司令塔の裏取りで判明した【会議全員の見落とし】(最重要)
会議は全員 voicePlayer に `onPlayStart(audioId)` / `onPlayEnd` / `onDrop` イベントが**既にある前提**で設計したが、実コードにそれは無い:

- **`voicePlayer.js` には『再生終了』を外へ通知するコールバックが存在しない。** `audio.addEventListener('ended', finish)`(voicePlayer.js:263,277)は内部 Promise を resolve するだけで、item のコールバックは呼ばない。
- 唯一のコールバックは **`item.onPlayStart`** だが、これは名前に反して【item が消費された任意の理由】で発火する“item resolved”信号: 実再生開始(:281)・全stale一括drop(:206)・単一stale(:224)・mergeで吸収(:339)・wav合成失敗(:247)・再生例外(:296)。**「実際に鳴り始めた」も「破棄された」も同じ1コールバックで区別できない。**
- **会場は現状 onPlayStart を吹き出しに配線していない。** v0.1.757 で『吹き出しは音声の成否に依存させない』と意図的に分離済み(VOICEVOX未起動でも吹き出しは出す)。venueBar.js:2336-2345 は `showSpeechBubble(speech)` と `voicePlayer.enqueue([...])` を別々に呼び、enqueue に onPlayStart を渡していない。
- **吹き出し寿命は純粋に時間ベース**(venueBar.js:1669 `resolveBubbleFlowLifetimeMs` 流速 + streak)。音声の長さや再生状態とは無関係。

→ つまり「読み上げ終了まで吹き出しを残す」には、**voicePlayer に『再生開始/終了/破棄を区別して通知する新イベント』を足す**のが必須。会議の案はこの土台を“ある前提”で書かれており、そのままでは実装できない。

## 司令塔の収束案(1案・実コードに乗る)

### 設計原則
- **吹き出しは『いま喋っている発言』に連動して残し、それ以外は従来の流速寿命**。
- **声の有無に吹き出しの存在を依存させない**(v0.1.757の精神は維持)。連動するのは『鳴っている間は消さない』という寿命の**延長**のみ。鳴らない/VOICEVOX無し/破棄なら従来の流速寿命で普通に消える。
- これにより「声はまだ喋っているのに吹き出しが先に消える」をゼロにしつつ、speed配信での滞留は時間ベース寿命とBUBBLE_MAX優先順位で抑える。

### A. voicePlayer に再生ライフサイクルの通知を足す(土台)
item ごとに今の `onPlayStart` に加え、区別できる通知を渡せるようにする(後方互換: 未指定なら現状動作):
- `onAudioStart()` — 実際に `audio.play()` が走った瞬間だけ(voicePlayer.js:281 の位置)。drop/merge/fail では呼ばない。
- `onAudioEnd()` — `finish()`(:263 の audio 'ended'/'error'/stopCurrent)で呼ぶ。**今ここに通知が無いのが穴。**
- `onResolved(reason)` — drop/stale/merge/fail を含む“消費”。bubble 側が「もう鳴らない」と判断するため。
（最小実装なら `onAudioStart`+`onAudioEnd` の2つで足りる。drop系は onAudioStart が来ないまま onResolved だけ来る=「鳴らなかった」と判定可能。）

### B. 吹き出しの状態機械(showSpeechBubble 側)
bubble に `voiceState: 'pending'|'speaking'|'done'|'unvoiced'` を持たせ、寿命を状態で決める:
| 状態 | 寿命の決め方 |
|---|---|
| `pending`(合成待ち/未連動) | 従来の流速寿命(`resolveBubbleFlowLifetimeMs`)。**即時性はここで担保**。 |
| `speaking`(onAudioStart 受信) | **タイマー解除し、消さない。** onAudioEnd を待つ。 |
| `done`(onAudioEnd 受信) | `now + 余韻(MIN_POST_VOICE 例500ms)` で消す。声が切れた直後に瞬間消去だと不自然なので余韻。 |
| `unvoiced`(onResolved だが onAudioStart 来ず=drop/合成失敗/VOICEVOX無し/読み上げOFF) | 従来の流速寿命のまま(=普通に消える)。**永遠に残さない=会議の懸念3を解消**。 |

実装の肝: enqueue する item に bubble 参照を結び、`onAudioStart`→該当 bubble の removeTimer/fadeTimer を clear して `speaking`、`onAudioEnd`→`done` で短い余韻タイマー、onResolved だけ来たら `unvoiced`(何もしない=流速寿命のまま)。VOICEVOX無効/読み上げOFFで enqueue されない場合も `pending` のまま流速寿命=従来どおり。

### C. BUBBLE_MAX(12)超過時の優先順位(venueBar.js:1633 を差し替え)
現状は `activeBubbles[0]`(最古)を無条件削除。これを**削除候補スコア順**に:
1. `unvoiced`/`pending` で古いものから消す(まだ/もう鳴らない吹き出しが先)。
2. `done`(余韻中)を次に消す。
3. **`speaking`(いま鳴っている)は最後まで残す。** どうしても枠が足りない時だけ、`speaking` の中で『発言が最も古い=もうすぐ終わる』ものから消す。
→ 「声が出ているのに吹き出しが消える」を構造的に最小化。

### D. 速い配信での滞留対策(会議の最大リスク=批判担当 deepseek-r1 指摘)
`speaking` を全部残すと、合成が追いつかない高速配信では `speaking` だらけで12枠が埋まり新着が入れない。対策:
- **読み上げキュー側で既に古い音声は捨てている**(voiceAgeGate 1200-2500ms・queue max12 drop)。つまり『speaking になれる数』は元々有界(同時に鳴るのは1本・キュー12本上限)。残りは `pending`/`unvoiced` なので C の優先順位で正しく押し出される。
- それでも詰まるなら、`speaking` の**上限寿命キャップ**(例: 1発言あたり最大 N 秒で強制 done 扱い)を入れ、極端に長い読み上げが枠を占有し続けるのを防ぐ。

## 会議のハルシネ却下(裏取りで除外)
- 全員が前提にした `onPlayStart(audioId)`/`onPlayEnd`/`onDrop` の既存API → **存在しない**(上記)。司令塔が voicePlayer.js を読んで確定。
- openrouter案「再生終了予定時刻 voiceEndTime = now + audio.duration」→ **合成完了まで duration 不明**(VOICEVOXのWAVを再生して初めて分かる)。先に時刻を確定できない。実装は『onAudioEnd を待つ』に倒す(予測でなくイベント駆動)。
- 「(読み上げ省略)をUI表示」(openrouter)→ 会場の世界観(静かな来場者)に合わない・実装過剰。不採用。

## 実装済み(v0.1.771・98b0679a・master push済)
- 新 `src/lib/venueBubbleLifecycle.js`(+test 20件): `nextBubbleVoiceState`(pending/speaking/done/unvoiced 遷移・done/unvoiced は終端で蘇らせない)・`isBubbleExpiredByVoice`・`bubbleEvictionScore`/`selectBubblesToEvict`(上限超過時 unvoiced→pending→done→speaking の順で消す=鳴っている吹き出しを最後まで残す・generic で型保存)・`resolvePendingLifetimeMs`(読み上げON時は合成遅れに備え床 `BUBBLE_PENDING_VOICE_FLOOR_MS=2500`)。`BUBBLE_VOICE_AFTERGLOW_MS=500`・`BUBBLE_VOICE_SPEAKING_CAP_MS=12000`。
- `src/lib/voicePlayer.js`(+test 2件): item に `onAudioStart`(実 `audio.play()` 時のみ・drop/merge/失敗では呼ばない)/`onAudioEnd`(finish=ended/error/stopCurrent 時)を追加。既存 `onPlayStart` は「item 消費の汎用信号」として温存(後方互換)。**会議全員が前提にしていた『再生終了通知』が無かった穴をこれで塞いだ。**
- `src/extension/venueBar.js`: bubble に `voiceState` 等を持たせ、`showSpeechBubble` が bubble を返す。enqueue で `onAudioStart→markBubbleSpeaking`(消えるタイマー解除=鳴っている間は残す・SPEAKING_CAP 保険)・`onAudioEnd→markBubbleDone`(余韻500msで消す)を配線。**`onPlayStart` は吹き出しに配線しない**(実再生時にも発火するので pending→unvoiced 終端化で後続 onAudioStart を取りこぼすため)=鳴らない吹き出しは pending のまま流速寿命で自然に消える。BUBBLE_MAX 超過は `selectBubblesToEvict` に置換(盲目的な最古削除をやめた)。pending の初期寿命は `resolvePendingLifetimeMs` で床を効かせ「声が鳴り始める前に消える」隙間を塞ぐ。
- `src/lib/changelog.js`: 0.1.771 entry 追加。
- 検証: verify:cc 全緑(test 5540+/lint/typecheck/build/verify:bump)。dist content.js/venue.js に同梱確認。
- **却下のとおり**: voiceEndTime=now+audio.duration(予測)でなくイベント駆動(onAudioEnd)。「(読み上げ省略)」UI なし。
- **残る限界(既知)**: 合成が遅れて pending の床(2500ms)も超えてから再生が始まるケースは bubble が先に消えうる。ただしその頃には voiceAgeGate(2500ms通常)が音声自体を stale で捨てるので「声だけ鳴って吹き出し無し」は実質起きない。それでも実機で出るなら床を age-gate と完全連動させる。

## 反映3手順([[feedback_frequent_version_bump]])
push→git pull→拡張リロード→watchタブF5。ユーザーは「最終行(最新コメント)が会場に出るか/声と吹き出しがセットで残るか」で答え合わせ。

## 関連
- 引き継ぎ: [[handoff_2026-06-16_venue_realtime_again]](会場リアルタイム化の経緯・onLiveComments 経路)
- 過去のリアルタイム調律: v0.1.755-757(voiceAgeGate/voiceReadQueue/venueSpeechStreak/showSpeechBubble席非依存化)
