# 引き継ぎ: ギフト投げ演出 + 音声ゼロ回帰修正 (2026-06-16)

> 前チャットがコンテキスト一杯で終了。新チャットはこれを読んで続きから。

## 0. 今すぐ把握すべき git 状態
- ブランチ **`feat/gift-throw`**(master 未マージ・**push もしていない**=ローカルのみ)。master より4コミット先行。
- master = origin/master = `df1adc0f`(v0.1.777・会場額縁フレーム)。**origin に出ているのは v0.1.777 まで**。
- ブランチの4コミット(v0.1.778〜781):
  - `0fd4edb4` v0.1.778 ギフト/広告を投げ主サムネ→中央映像へ投げる演出 本体
  - `7d8b8967` v0.1.779 NDGR構造化gift event(nls_gift_events_<lv>)からも発火
  - `c2a494c6` v0.1.780 DOMスキャンで拾ったギフトコメントを nls_gift_events へ流し発火
  - `ea036ff5` v0.1.781 **音声ゼロ回帰の修正**(鮮度ゲート緩和+全stale時も最新1件は読む)
- 実機はローカル dev-mode 読込なので、このブランチに居れば extension/dist がそのまま試せる(push 不要)。
- working tree クリーン。verify:cc 全緑。

## 1. 実機で確認済みのこと(ユーザー証言)
- **v0.1.781 音声修正=OK**: 「VOICEVOXの音声が途切れなく読めている・タイミングばっちり」。ゼロ音声は直った。
- **v0.1.780 ギフト投げ=発火した**: 「一瞬アイテム飛んだように見えた」。ただし【ちゃんと見えていない】可能性=軌道/見た目/持続時間の調整余地あり(後述§4)。

## 2. 音声ゼロ回帰の真因と修正(v0.1.781・確定)
- **真因**: v0.1.773 で鮮度ゲートを 2500→1800ms / backlog しきい値 queue>=3→>=2・1200→800ms に厳しくした。だが1件の読み上げ(合成+再生)は1〜3秒かかる。しきい値が再生1本ぶんを下回ると、2件目以降が再生順が来る前に必ず stale 化→`_drainQueue` の allStale 分岐で全捨て→**ゼロ音声**(吹き出しは音声非依存なので出る)。
- **修正**: ①voiceAgeGate.js の値を実績値に戻す(VOICE_STALE_MS_NORMAL=2500 / VOICE_STALE_MS_BACKLOG=1200 / VOICE_STALE_BACKLOG_QUEUE=3)。②voicePlayer.js `_drainQueue` の allStale 分岐を「全捨て」→「最新(末尾)1件は残して読む」に(無音より新着優先)。
- **教訓**: 鮮度しきい値は【再生1本の所要(1〜3秒)を下回らせてはいけない】。下回ると再生待ち中に全部 stale 化しゼロ音声になる。v0.1.773 の「定常ラグを詰める」狙いは重い副作用(無音)を生んだので撤回済み。

## 3. ギフト投げ演出のアーキ(実装済み・3経路で点火)
正本=[reference_gift_throw_meeting_2026-06-16.md](reference_gift_throw_meeting_2026-06-16.md)。
- 純関数 `src/lib/giftThrowProjectile.js`(resolveGiftProjectile=🎁+item/📣+pt・resolveGiftThrowPath=--dx/--dy/--mid* 放物線・canLaunchGiftThrow=同時上限8)。
- venueBar.js: 起点=席アイコン getBoundingClientRect(無ければ crowdBubbleAnchor)・着弾=safeArea中心・bubbleLayer(z7)に DOMプール(10)・CSS @keyframes nlsb-gift-fly(GPU)・mix-blend:screen・reduced-motion フェードのみ。
- **点火3経路**(どれか来れば飛ぶ):
  1. `maybeThrowGiftFromSpeech`: onLiveComments の speech.text を parseGiftCommentText/parseNicoadCommentText で検出。
  2. `handleNewGiftEvents`: storage `nls_gift_events_<lv>` onChanged で NDGR構造化gift。席キーは `u:${uid}` 形。seen 集合で二重投げ防止。
  3. (v0.1.780) content-entry の `recordGiftCommentObservation` が DOMスキャンで拾ったギフトを `nls_gift_events_<lv>` へ appendGiftEvents=②経由で会場が拾う。

## 4. ⚠️ ギフト個別取得の根本課題(未解決・調査方針あり)
- **fastDiag で確定**: 実機3配信とも giftPoints(合計)は取れるが **個別ギフトevent が取れない**。`ndgrWireCounters.gifts=0`(NDGR構造化gift が来ない既知ケース・ndgrDecode.js:435 に記録)・DOMスキャン giftRowCount=0(配信による・稀に1件)・gift iframe は cross_origin_iframe_only でブロック。
- つまり「誰が何を投げたか」の個別データがどの経路でも安定取得できていない。投げ演出は個別データ前提なので、配信によっては飛ばない。
- **ユーザーの調査ヒント**: 「配信者は『わんコメ(OneComme)』系を使っているので、わんコメのプログラムを見ればギフト取得方法が分かるかも」。
  - OneComme は `C:\Users\info\AppData\Local\Programs\OneComme\OneComme.exe`(Electronアプリ)。
  - **exe 直読みは不可**(ビルド済バイナリ)。`resources/app.asar` を展開(npx asar extract)すれば中の JS が読め、ニコ生ギフトをどのエンドポイント/メッセージから取っているか分かる可能性。
  - これを**会議ハーネス(COUNCIL-HOWTO.md)の素材**にして「個別ギフト取得」を詰める予定だった(会議は中断)。会議お題ファイルは `.artifacts/council-gift-capture.txt` に作成済み。

## 5. 次にやること(ユーザーの希望順は未確定・要確認)
1. **わんコメ調査**: app.asar 展開→ニコ生ギフト取得方法を読む→会議で「個別ギフト取得」を詰める(§4)。
2. **ギフト投げの見た目調整**: 「一瞬」をもっとはっきり見えるように(持続時間/サイズ/軌道)。
3. **master へ反映**: 特に **v0.1.781 音声修正は回帰修正なので先に master へ出す**のが妥当(ギフトはまだ調整中なので分割出しも可)。ブランチを ff-merge→push する判断はユーザーに確認。

## 6. 運用ルール(厳守)
- 反映3手順([[feedback_frequent_version_bump]]): push→git pull→拡張リロード→F5。ユーザーは fastDiag(状態速報)で答え合わせ。
- version bump 粒度: 1変更=patch1つ・package/manifest/changelog(src/lib/changelog.js の EXTENSION_CHANGELOG)同期。summary は35字以内。
- 検証は `npm run verify:cc`(ハング回避)。popup-entry.js は max-lines ラチェット 21217・content-entry.js は eslint 上限内に収める。
- LLM会議の結論は司令塔が実コードで裏取り必須(NDGR/storage 構造を会議は知らず妄想する)。
- 実機検証は Claude-in-Chrome か ユーザー手動。fastDiag が真因特定の最強の手がかり。
