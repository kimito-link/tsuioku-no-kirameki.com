# 機能マップ: ローカル音声補助の導入案内（`voice-native-guide`）

> `npm run feature-map` で再生成。手で編集しない。
> 起点 entry: `src/extension/voice-native-guide-entry.js`

## storage の出入り

- 書くキー: (なし)
- 読むキー: (なし)

## 構成ファイル（import 到達・最大40件表示）

```mermaid
graph LR
  n_voice_native_guide["ローカル音声補助の導入案内"]
  n_voice_native_guide --> n_src_lib_extDocBusyCensus_js["lib/extDocBusyCensus.js"]:::shared
  n_voice_native_guide --> n_src_lib_extDocBusyCensusBoot_js["lib/extDocBusyCensusBoot.js"]:::shared
  n_voice_native_guide --> n_src_lib_extProcessCensusKey_js["lib/extProcessCensusKey.js"]:::shared
  n_voice_native_guide --> n_src_lib_storageRefreshTriggerKey_js["lib/storageRefreshTriggerKey.js"]:::shared
  classDef shared fill:#eee,stroke:#999,color:#666;
```
