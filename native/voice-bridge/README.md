# ローカル音声補助アプリ（検証候補）

Windowsの.NET Framework 4.xで動く、任意のChrome Native Messagingホスト。拡張ZIPとは別に配布する。現在は未公開・未署名の検証候補であり、本番導入は行っていない。

## 境界

- プロトコルv1。4バイトlittle-endian長＋UTF-8 JSON。入力64KiB、音声2MiB、処理24件、受理32件が上限。
- 送信先は同じPCのVOICEVOXだけ。本番50021、`VOICE_BRIDGE_TEST`定義の試験バイナリ50161。任意URL・任意コマンド・ポート待受・自動アップデートは持たない。
- 話者、pitch/speed、16/24kHzを依頼ごとに保持。mono PCM16 WAVのRIFF/fmt/data境界と長さ・Hzを検証する。
- 取消でHTTP内のCPU処理が消えたと扱わない。確定完了と完了不明を分け、後者では75秒間新しいエンジン投入を抑制する。待機中の仕事とquery後の次段も対象。
- 補助アプリはコメント・音声をディスクへ保存せず外部へ送信しない。拡張の既存共有機能は利用者の別の同意設定に従う。
- 拡張の明示同意と任意権限が両方必要。未導入はHTTPへ戻るが、旧処理が残る間や送信後の通信断ではHTTPへ二重投入しない。

## ビルドと検証

PowerShellでリポジトリのルートから実行する。

```powershell
& native/voice-bridge/build.ps1 -TestBuild -OutputDirectory build/voice-bridge/setup-candidate
& native/voice-bridge/verify-setup.ps1
node native/voice-bridge/verify-host.mjs build/voice-bridge/setup-candidate/VoiceBridge-test.exe
```

実VOICEVOXは試験で呼ばない。`verify-extension.mjs`は専用の試験ホスト登録（`com.kimitolink.voice_bridge_test`）と新規Chromiumプロファイルだけを使う。通常Chromeや本番ホスト名を流用しない。同時に同じ50161ポートを使う測定を走らせない。

`build.ps1`はホストとそれを埋め込んだsetupを生成し、ソース・出力のSHA-256をJSONへ記録する。実行中のexeを上書きせず、別のOutputDirectoryを指定して候補を作る。本番候補は`-TestBuild`なしで生成できるが、検証とユーザーの結果確認前には実行・配布しない。

## 導入・解除と復帰

利用者単位のLocalAppDataへ配置し、HKCUだけへ登録する。管理者権限は不要。他のホスト登録や所有を確認できない既存ファイルは上書きしない。ハッシュ付き版フォルダと所有ファイル台帳で更新・解除対象を決める。ファイルを一時ファイルへ書き、ハッシュ検証後に確定する。登録は最後に行い、通常の失敗時は直前のmanifestへ戻す。

Windowsの「設定」→「アプリ」から解除する。動作中のhost/setupがロックされて残る場合は所有マーカーと台帳を保持し、再導入や後日の解除に備える。強制終了・電源断・ファイルシステム障害を含むすべての状態からの自動復旧を保証しない。VOICEVOXやChrome自体は終了しない。

長期保守は、言語に依存しない版付きプロトコル、小さい依存範囲、有界資源、異常経路の試験で支える。100年の互換性、実音声の自然さ、CVR/LTV/CPAの向上はこの試験から保証しない。
