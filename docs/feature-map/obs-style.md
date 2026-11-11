# 機能マップ: OBS透過の見た目（`obs-style`）

> `npm run feature-map` で再生成。手で編集しない。
> 起点 entry: `src/extension/obs-style-entry.js`

## storage の出入り

- 書くキー: `KEY_OBS_BROWSER_SOURCE`, `KEY_OBS_OVERLAY_STYLE`, `KEY_STATUS_DEVICE_CRED`
- 読むキー: `KEY_COMEVIEW_WINDOW_GEOMETRY`, `KEY_LAST_WATCH_URL`, `KEY_OBS_BROWSER_SOURCE`, `KEY_OBS_OVERLAY_STYLE`, `KEY_STATUS_DEVICE_CRED`, `KEY_STATUS_UPLOAD_CONFIG`

## 構成ファイル（import 到達・最大40件表示）

```mermaid
graph LR
  n_obs_style["OBS透過の見た目"]
  n_obs_style --> n_src_extension_obsOverlayApply_js["extension/obsOverlayApply.js"]:::shared
  n_obs_style --> n_src_extension_statusDeviceCred_js["extension/statusDeviceCred.js"]:::shared
  n_obs_style --> n_src_lib_comeviewWindowGeometry_js["lib/comeviewWindowGeometry.js"]:::shared
  n_obs_style --> n_src_lib_deviceAuth_js["lib/deviceAuth.js"]:::shared
  n_obs_style --> n_src_lib_devicePublishCredentials_js["lib/devicePublishCredentials.js"]:::shared
  n_obs_style --> n_src_lib_extDocBusyCensus_js["lib/extDocBusyCensus.js"]:::shared
  n_obs_style --> n_src_lib_extDocBusyCensusBoot_js["lib/extDocBusyCensusBoot.js"]:::shared
  n_obs_style --> n_src_lib_extProcessCensusKey_js["lib/extProcessCensusKey.js"]:::shared
  n_obs_style --> n_src_lib_liveviewCurrentLive_js["lib/liveviewCurrentLive.js"]:::shared
  n_obs_style --> n_src_lib_obsBrowserSource_js["lib/obsBrowserSource.js"]:::shared
  n_obs_style --> n_src_lib_obsOverlayStyle_js["lib/obsOverlayStyle.js"]:::shared
  n_obs_style --> n_src_lib_storageKeys_js["lib/storageKeys.js"]:::shared
  n_obs_style --> n_src_lib_storageOpTimeout_js["lib/storageOpTimeout.js"]:::shared
  n_obs_style --> n_src_lib_storageRefreshTriggerKey_js["lib/storageRefreshTriggerKey.js"]:::shared
  classDef shared fill:#eee,stroke:#999,color:#666;
```
