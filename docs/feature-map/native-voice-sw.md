# 機能マップ: 任意のローカル音声補助 SW（`native-voice-sw`）

> `npm run feature-map` で再生成。手で編集しない。
> 起点 entry: `src/extension/native-voice-sw-entry.js`

## storage の出入り

- 書くキー: (なし)
- 読むキー: `KEY_VOICE_NATIVE_ENABLED`

## 構成ファイル（import 到達・最大40件表示）

```mermaid
graph LR
  n_native_voice_sw["任意のローカル音声補助 SW"]
  n_native_voice_sw --> n_src_lib_voiceKeys_js["lib/voiceKeys.js"]:::shared
  n_native_voice_sw --> n_src_lib_voiceNativeBroker_js["lib/voiceNativeBroker.js"]
  n_native_voice_sw --> n_src_lib_voiceNativeProtocol_js["lib/voiceNativeProtocol.js"]
  classDef shared fill:#eee,stroke:#999,color:#666;
```
