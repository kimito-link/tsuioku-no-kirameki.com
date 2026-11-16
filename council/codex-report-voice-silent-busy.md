# 読み上げONなのに無音: 修正報告（0.1.2123）

## 確認した経路と修正

- a（確認）: 旧 `venueBar.js` の `onLiveComments` は `!open` で入力を破棄し、`setOpen(false)` は polling を止めていた。設定ONでも VoicePlayer に到達しない。旧ゲートを模した対照試験は100件/分×600秒の1,000件が全件入口破棄、開始通知0件だった。この対照は履歴版の実拡張での実音再現ではない。
- 現在の実入力は `createVenueLiveCommentHandler`（`src/lib/venueLiveCommentRoute.js`）を経由し、会場を閉じても `processSpeechRows` へ渡す。閉会場の描画・在席更新は動かさず、`venueBar.js:6806` の音声専用経路へ流す。閉/開/別配信のハンドラ実行テストを追加。
- 閉会場でも配信者の重要度を失わないよう、`venueBar.js:3779` から既存 broadcaster context を読み取り・購読する。音声itemは `venueHeadlessVoiceItem.js` で作る。
- b（試験）: audio_query 2〜7秒 / synthesis 4〜10秒の偽エンジンで、過負荷時に既存の軽い声へ移行することを確認。古すぎ/合成失敗の内訳を記録する。実利用時の原因がbだったと断定はしない。
- c（確認・防御）: AbortSignalを無視する合成Promise、streamのwhenDone、軽い声のend/errorが返らない場合を回帰テスト化。世代の中止で待ちを解放し、期限切れのonStartは新しい無音監視へ作用させない。
- d（試験）: 大事な質問・配信者・初コメントなどが吹き出し側の失敗連続/試行待ちで遮られないよう事前判定を追加。混雑選別の点数、合唱、つくり置きの仕様は変更していない。

`VoicePlayer._armSilenceWatchdog` / `_noteVoiceInputAndRecover`（`voicePlayer.js:380,395`）と純関数 `voiceSilenceRecovery.js` で監視する。20秒に達する前の18秒で詰まった世代を中止し、軽い声へ移行する。復旧は一回限りではない。正常なAudioのtimeupdateによる再生位置の進行（`voicePlayer.js:1724`）は監視へ反映し、19.5秒の正常音声を誤って切らない回帰テストを追加した。

## 計器

`voicePlayer.diag` に無音回数・最長無音・復旧回数/理由・直前区間のdrop内訳を追加。`voiceDiag.js` の型/初期値/許可リスト/状態速報行へ同期。drop内訳は全期間の累積ではなく、前回の発声または復旧以後の差分。閉会場で音声が動く状態も状態速報に日本語で表示する。

## 再現可能な検証と測定限界

```text
node scripts/measure-voice-silent-busy.mjs --dur 600
node scripts/measure-voice-silent-busy.mjs --native-audio --dur 600 --port 50131 --page-port 50132
node scripts/probe-browser-voice-audio.mjs --chrome
npm run verify:cc
node scripts/verify-voice-isolated-extension.mjs
npm run impact-check
```

偽VOICEVOXは模擬試験50121、実再生試験50131、隔離した拡張起動検証50141のみ。各条件は新しいPlaywright contextで実行する。10分測定の `audibleCallbackTotal` はFakeAudioと軽い声stubの開始通知数であり、OSの実音・音質の証明ではない。修正前の対照は入口遮断を模したモデルである。最長無音は観測窓の先頭と末尾を含め、修正条件20秒未満/通常条件全件VOICEVOXをassertする。静穏条件も600秒の観測窓を確保した。

実Audioは別の新規profileで確認した。16,844 bytes / 8,400 PCM samples、source peak 12,000、decoded peak 0.366、playing/endedイベントあり、playエラーなし（`.artifacts/voice-silent-busy/browser-audio-1794639011890.json`）。初回のPlaywright同梱headless Chromiumでは声一覧が0件だったが、別の新規Chrome profileでは4件を取得し、実PC音声の開始/終了を確認した（browser-audio-1794658741082.json、エラーなし）。普段のChrome profileは使用していない。物理スピーカーの音圧やワンコメとの音質/性能の直接比較は行っていない。

## 最終10分試験

| 条件（各600秒） | 入力 | 開始通知 | 最大開始間隔（窓の先頭/末尾含む） | VOICEVOX完了 | 軽い声完了 | 復旧 |
|---|---:|---:|---:|---:|---:|---:|
| 旧閉会場ゲートのモデル | 1000 | 0 | 600.001秒 | 0 | 0 | 0 |
| 遅いエンジン・模擬再生 | 1000 | 955 | 11.634秒 | 1 | 954 | 0 |
| 永久pending合成・模擬再生 | 1000 | 848 | 19.201秒 | 0 | 848 | 5（synth-stall） |
| 静穏10件/分・模擬再生 | 100 | 100 | 6.011秒 | 100 | 0 | 0 |
| 遅いエンジン・実Audio/実PC音声 | 1000 | 203 | 13.973秒 | 1 | 201 | 0 |

模擬再生の確定値: `.artifacts/voice-silent-busy/measure-1794658558683.json`。
実再生の確定値: `.artifacts/voice-silent-busy/measure-1794658863913.json`。実再生モードの他3条件は模擬であり、実音と混同しない。実再生窓の終了時に1件が発話中だったため、開始203件と完了202件に差がある。終了後にOFF/新規context破棄で後始末した。物理出力の録音ではなく、実Audioのplayingと実speechSynthesisのonStartを測った。

理由別drop計器（busy / 件数上限 / stale先頭 / stale掃除 / synthNull / 再生timeout）:
- 旧閉会場モデル: 入り口破棄1000、他0。
- 遅いエンジン・実再生: 654 / 14 / 111 / 3 / 11 / 0。
- 模擬・永久pending: 97 / 23 / 0 / 0 / 5 / 0。
- 静穏: すべて0。3種類の人別VOICEVOX割当を維持。
各計器はそれぞれの観測点の値であり、開始/完了数とは別に記録する。

実再生・模擬両方で、修正条件の開始あり・最大間隔20秒未満と、静穏条件のVOICEVOX維持をassertし終了コード0。aの入口欠落、bの過負荷切替、cの繰り返し復旧、dの選別だけで全件無音にならないことを確認した。元の実配信PCでa〜dのどれが単独原因だったかまで断定はしない。

## 全体検証

終了コード0。1318 test files passed / 1 skipped、15252 tests passed / 6 todo。

```text
[2026-11-14T12:22:24.954Z] STEP test OK
[2026-11-14T12:22:26.869Z] STEP lint OK
[2026-11-14T12:22:33.624Z] STEP typecheck OK
[2026-11-14T12:22:35.054Z] STEP build OK
[2026-11-14T12:22:35.894Z] STEP dist-fresh OK
[2026-11-14T12:22:36.492Z] STEP no-secrets OK
[2026-11-14T12:22:37.091Z] STEP chrome-load-path OK
[2026-11-14T12:22:37.906Z] STEP tracked-imports OK
[2026-11-14T12:22:38.515Z] STEP agent-bootstrap OK
[2026-11-14T12:22:39.119Z] STEP no-personal-contact OK
[2026-11-14T12:22:40.060Z] STEP tree-map OK
[2026-11-14T12:22:40.877Z] STEP site-health OK
[2026-11-14T12:22:42.260Z] STEP feature-map OK
[2026-11-14T12:22:42.818Z] STEP improvement OK
[2026-11-14T12:22:43.365Z] STEP improvement-selftest OK
[2026-11-14T12:22:44.599Z] STEP layer-selftest OK
[2026-11-14T12:22:45.477Z] STEP layer OK
[2026-11-14T12:22:46.462Z] STEP layer-map OK
[2026-11-14T12:22:47.212Z] STEP verify:bump OK
[2026-11-14T12:22:47.751Z] STEP check:agent-bootstrap:selftest OK
[2026-11-14T12:22:48.286Z] STEP check:chrome-load-path:selftest OK
[2026-11-14T12:22:48.914Z] STEP check:dist-fresh:selftest OK
[2026-11-14T12:22:49.557Z] STEP check:no-personal-contact:selftest OK
[2026-11-14T12:22:50.268Z] STEP check:no-secrets:selftest OK
[2026-11-14T12:22:50.996Z] STEP check:tracked-imports:selftest OK
[2026-11-14T12:22:51.591Z] STEP improvement:record:selftest OK
[2026-11-14T12:23:12.437Z] verify:cc OK
```

拡張検証も隔離コピーに対して終了コード0。service worker 1件、画面12件、注入先10件がすべて合格。証拠は .artifacts/extension-verify/report.json と extension-verify-delivery-console.log。多数の他サービスの注入は空ページfixtureでの確認であり、実サイトの抽出精度までは測っていない。

補助診断（門ではなく報）には check-large-tracked-files / check-human-script-no-wait / check-shared-parts-used / check-gate-bypass の指摘が残る。値や設定を消して隠していない。既存actionlint.ymlのcontinue-on-errorは今回変更していない。新規ファイルのヘッダー不足は解消し check-file-header-comment はpass。C:\tmpのjunctionによりverify:cc末尾の自動extension報告は主処理が走らないため、そのOK行は拡張の実測証拠として数えず、上記の隔離した別実行と実report.jsonで判定した。


## 変更範囲・レビュー

- 主実装: `voicePlayer.js`, `voiceSilenceRecovery.js`, `voiceDiag.js`, `venueBar.js`, `venueBubbleVoiceSync.js`, `venueHeadlessVoiceItem.js`, `venueLiveCommentRoute.js`。
- 試験入口: `src/extension/voiceTestHook.js`。開発版限定の実測状態の確認に使用。
- 上記の単体/配線テスト、測定スクリプト2本と隔離拡張検証スクリプト、0.1.2123のmanifest/package/changelog・split-changelog・LP版表示・dist・地図生成物を同期。
- 独立レビューで配信者ID欠落、古い軽量発話通知、正常な長めの音声の誤切断を指摘→修正。再レビューはapprove（実行検証完了が条件）。
- 共有libのimpact-checkは、記録エンジン・コメビュ・状態速報・会場への波及を表示した。
- 設計選択は承認済みPlanどおり「会場を閉じてもONなら音声を読む」。追加の設計承認待ちはない。
- 本物のVOICEVOX50021・普段のChrome・C:\nicolive-ext・MEMORY/AGENTS/CLAUDEは変更していない。masterへのpushやPR作成はしない。
- 一時コピーで隣接検証キットを参照するため `C:\tmp\web-ios-android` に既存キットへのjunctionを作成した。キット自体は編集していない。

## 検証環境の補足

隔離検証スクリプトは拡張のコピーだけの50021を50141へ変更し、内部で npm run verify:extension -- --extension-dir <一時コピー> を実行する。正本のキットとエラー許可リストは変更しない。C:\tmp のjunctionではNodeのCLI判定がrealpathと一致せず主処理が走らないため、子プロセスに --preserve-symlinks-main を指定する。終了コードだけでなく report.json と全画面/注入先の実測結果を確認した。

全体検証で見つかった2件は、venueHeadlessVoiceItemの時刻正規化を既存timeAuthority.toEpochMsに委譲し、層マップを再生成して解消した。改善台帳も自動計測し、前版同値1446KBと期間依存のコミット本文52件について過去最良との差を注記した。
