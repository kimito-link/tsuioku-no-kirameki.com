# 引き継ぎ: 会場のリアルタイム吹き出し/読み上げを再度直す(2026-06-16)

> 新チャットへの引き継ぎ。前セッションはコンテキスト一杯で終了。git は master=v0.1.769(720d9612)・origin同期・working tree クリーン。

## 0. 最優先タスク(ユーザー指示・原文)
「再度リアルタイムでコメント・吹き出しを出すのを再度やりたい。**前回は読み上げコメビュがほぼリアルタイムでとれてますが、それすらもとれてない**。読み上げコメビュで動いているものを使おう、ってスタンスでした。」

= **会場(venue)の吹き出し/読み上げが、コメビュ(comeview)並みのリアルタイムで出ない**。前回の方針=「コメビュで既にリアルタイムに動いている経路を会場でも使う」を再度進める。**ただし今回は『それすら(=コメビュ経路で来るはずのリアルタイム)取れていない』=どこかで切れている**ので、まず実機で「会場に最新コメントの吹き出し/読み上げが出ているか」を確認し、切れている箇所を特定してから直す。

## 1. 既に実装済みの「コメビュ並み速い経路」(壊れていないか確認が起点)
- **`onLiveComments`(v0.1.752 会場リアルタイム化)**: content-entry が live comment funnel(persistCommentRows 直前)で `_venueApi?.onLiveComments?.(liveId, filtered)` を呼ぶ(content-entry.js:10782)。storage 往復(~1.5秒)を介さず in-memory 直結で会場へ。`_venueApi` は mountVenueBarButton() の戻り(content-entry.js:12693・602)。
- **会場側**: venueBar.js が onLiveComments を受け、`liveFeedSpeechRows`(venueSpeech.js)で commentNo 持ち行に絞り、`processSpeechRows`→`showSpeechBubble`+voicePlayer。dedup は speechState.seenKeys(`no:N`)。
- **v0.1.756**: handleStorageChange が tail 変化を再取得せず `changes[tailKey].newValue` を直接 processSpeechRows(コメビュと同じ即時経路)。
- **v0.1.757**: 発言者を吹き出し直前に必ず着席(rosterDriven 時も同期 touch)+席無しでも crowdBubbleAnchor へ吹き出す(showSpeechBubble が席非依存に)。

→ **これらが揃っているのに「それすら取れていない」=実機で何が切れているか要特定**。候補: ①`_venueApi` が null(mountVenueBarButton 未マウント/早期return)②onLiveComments は呼ばれているが filtered が空/commentNo 無しで liveFeedSpeechRows が捨てている ③rosterDriven gate で processSpeechRows に届いていない ④v0.1.769 の storage stall 根治(seedTail を bounded 追記に)で tail/summary の書き込み形が変わり handleStorageChange 経路が拾えていない。**④は要注意**: v0.1.769 で persist 経路を触ったので、会場が storage 経由で拾う部分に影響した可能性。

## 2. 進め方(Non-Negotiable=前セッションの教訓)
1. **まず実機で切り分け**: 会場モードを開き「最新コメントの吹き出し+読み上げが出るか」をユーザー目視。出ないなら fastDiag でなく、会場の診断(venueBar が onLiveComments を受けているか・processSpeechRows に届くか)を data 属性/ログで確認。**推測で直さない**(前セッションは推測で外し続けた)。
2. **コメビュ(comeview)で動いている経路をそのまま使う**がユーザーの明確な方針=新規アーキを作らず、既に動いているものを会場へ。正本=[reference_comeview_instant_render_brief_v0677.md](reference_comeview_instant_render_brief_v0677.md) / [reference_comeview_tts_design_v0679.md](reference_comeview_tts_design_v0679.md)。
3. **会議は無料LLM全員集合**(COUNCIL-HOWTO.md 手順・最強モード `MEETING_LOCAL_MODELS="gemma4:31b,qwen3:14b,gpt-oss:20b,deepseek-r1:14b,qwen2.5-coder:14b"`+Groq)。ただし**LLM結論は司令塔が実コードで裏取り必須**(会議はNDGR/storage構造を知らず妄想URL/API を出す常習)。
4. **反映3手順厳守**([[feedback_frequent_version_bump]]): push→git pull→拡張リロード→watchタブF5。ユーザーは「最終行(最新コメント)が会場に出るか」で常に答え合わせ。
5. **version bump 粒度**: 1変更=patch1つ・manifest/package/changelog 同期(`npm run verify:bump`)。

## 3. ⚠️同セッションで判明した別の未着手課題(会場より後でよい)
- **status.html(状態ページ)が storage_op_timeout エラー連発(未根治)**: refresh() が setInterval 2秒ごとに enumerateActiveLives/loadAllSummaries/loadFastDiagSafe/loadBackfillProgress を【再入ガード無し】で叩く(status-entry.js:115-142)。前の refresh が終わる前に次が走り storage を自己混雑→全部8sタイムアウト→「1回出た後に再読み込みが始まりエラー連ちゃん」。**記録本体は無事**(v0.1.769で根治・content側)。status専用のセルフ混雑。**最小根治案=①再入ガード(_refreshInFlight 走行中はtickスキップ)②timeout時はバックオフ(2秒→指数で延ばす)**。`_refreshInFlight` は未実装(grep 0)。記録に影響しないので会場の後でよい。

## 4. 直近の達成(v0.1.758〜769・全master push済・壊さない)
過去ログ取得の本丸は決着: 2%固着(751飢餓)→23%固着(36s再開)→速度(seek/先読み)→**真因=入口token rotation(v0.1.762)**→%廃止し状態名(763/764)→入口死で自力再接続(765 on-demand)→**forward常時ON(767)=これが高速配信でstorage stall spiralを点火する回帰だった**→**v0.1.769 で根治(forward既定OFFへ撤回 + seedTailのtimeout時に全件書きでなくbounded追記を続けてスパイラルを断つ)**。実機で記録が本家追従・取得完了100%を確認=決着。**⚠️学び=最危険境界の『常時ON』系は段階導入(a→検証→b)を厳守。私の v0.1.767 一足飛び常時ONが回帰を生んだ。**
- ⚠️別エージェントが council/voice ブランチで並行作業し v0.1.768(voice先読み深さ3) + v0.1.769(storage) を作った。git working tree が衝突し一時混乱(reset --hard で並行WIPを消す事故あり)。**教訓=同一リポを2セッションで同時に開かない。content-entry を丸ごと git add する前に staged diff を確認**([[feedback_parallel_git_staging_hygiene]] があれば参照)。
- 会場 co-presence 強化(入場演出D・奥行きE・静寂活性化F・満員感WIP)は未着手で残([reference_venue_copresence_meeting_2026-06-15.md](reference_venue_copresence_meeting_2026-06-15.md))。満員感WIP(resolveVenueCrowdCount)は stash か未コミットだったが現 working tree クリーン=要再確認。
