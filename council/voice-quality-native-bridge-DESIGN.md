# 追加構成案: 指定声の合成をローカル補助アプリへ委ねる

状態: ユーザーが「補助アプリを含めて実装・検証する」と承認済み。任意権限・専用プロファイルでの試験登録を含む。push・本番導入・CWS提出は結果確認後。

## 必要性と測定の扱い
現行ブラウザHTTP経路は最大6本で制御する。今回の偽エンジンは1件最短6秒、平均11.5秒なので、6枠で10分659件という目標は不可能。読上げ件数をPC音声込みへすり替えたり、delayや入力を変えて合格にはしない。ChromeのHTTP/1.1接続プールは現行ソースで標準6本。実PCのCPU競合がある場合は別の結果になるため、独立遅延の測定と分ける。

## 構成
Chrome公式のNative Messagingで、必要時だけローカル補助アプリを起動する。常駐HTTPポートを開かず、標準入出力の長さ付きJSONで依頼・応答する。Node実装ではなくGo標準ライブラリ中心の単体バイナリを第一候補とし、ChromeとVOICEVOXの公開APIにだけ依存する。ブラウザ内の上限6をそのままエンジンの能力上限として扱わず、補助側も1→2→4→8→16→24の有界適応を行う。実CPUの完了速度が改善しない時は増やさない。

## ユーザーへの影響
利用は任意・明示同意。追加導入は1回、その後は拡張から自動起動。補助アプリが無い環境でも拡張単体の既存経路を使える。VOICEVOX未導入を自動で購入・インストールしない。クラウド送信・アクセス解析・広告計測は追加しない。

## 変更予定
- native/voice-bridge/: framing/検証/HTTPクライアント/能力適応/単体テスト、バージョン付き公開プロトコル。
- scripts/voice-bridge/: 再生成できるビルド・ユーザー単位の登録/解除・専用プロファイル試験。
- src/lib/voiceNativeClient.js とテスト: 接続、requestId、応答サイズ上限、失敗時の既存経路。
- src/extension/ の背景メッセージ配線、既存voicevoxClientの任意アダプタ。
- extension/manifest.json: optional_permissionsのnativeMessaging、同意UI、導入案内。
- privacy.html・CWSのデータ/権限説明正本3点を必要に応じ同期。公開・提出はここでは行わない。
- 設計図・地図・比較測定器・配布生成物。既存版から次版の正しい版番号を確認して同期する。

## 安全性と寿命
呼出元は公開/開発拡張IDの許可リスト。外部コマンド実行や任意URL取得を許可しない。VOICEVOXのloopback宛と既知のAPIだけ。JSONの形・文字数・WAV形式/サイズ・同時処理/待機件数を検証する。Native Messagingの応答上限内へ分割し、合計バイト数も制限する。プロトコル版を確認し、不一致なら既存経路へ戻す。補助アプリの終了はVOICEVOX自体を停止しない。100年の互換性を保証する文言や、未測定のCVR/LTV/CPA改善は出さない。

## 検証と復帰
専用のNative Host名と新規Chromeプロファイルでのみ登録/解除して試す。実VOICEVOX50021・普段のChromeには触らない。偽エンジンだけで、10分1000件の前回比較・共有CPU・無応答・多話者・重要コメント・権限なし/補助なし/旧版・過大/不正メッセージ・終了後の残存処理を確認する。拡張全体のverify:extensionも実行。失敗時は補助経路を外して、検証済みブラウザ経路へ戻す。実PCへの本番導入、CWS提出、pushはユーザーの結果確認後。

資料: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
接続プール: https://chromium.googlesource.com/chromium/src/+/main/net/socket/client_socket_pool_manager.cc

## 実装環境の更新
追加対象を具体化: native/voice-bridge内のC#ホスト/インストーラ/ビルド・検証スクリプト、voiceNativeProtocol/Client/Brokerと各テスト、popupの任意同意UIとテスト、voice-native-guide-entryと画面、extCensusWiring.test.jsの画面登録、scripts/build.mjs・地図辞書/生成物、extension-verify.json、プライバシー/CWS説明正本を対象とする。案内画面も既存の台帳とlight配色検査に従わせる。独立レビューで同意切替のbusy、完了不明時のhost内待機、WAV形式、診断理由、導入解除後の再導入とファイル台帳を確認し修正する。新しい性能合格は測定が完走するまで主張しない。
C:/tmpへの追加更新は承認審査のクレジット不足で実行不能になったため、書込許可済みのプロジェクト内.artifacts/voice-quality-workへローカル複製し、変更を移した。元の作業フォルダを更新する許可は迂回しない。Goコンパイラは未導入で安全な取得が完了していないため、Windows標準.NET FrameworkのC#コンパイラで依存の少ないホストを実装・検証する。公開プロトコルv1は実装言語に依存しない。テスト専用レジストリ名com.kimitolink.voice_bridge_testを登録済み。検証後に所有パスを確かめて解除する。本番用ホストは未登録。
