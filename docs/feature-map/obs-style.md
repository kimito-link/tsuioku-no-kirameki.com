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
  n_obs_style --> n_src_lib_kick_kickChatParse_js["lib/kick/kickChatParse.js"]:::shared
  n_obs_style --> n_src_lib_liveviewCurrentLive_js["lib/liveviewCurrentLive.js"]:::shared
  n_obs_style --> n_src_lib_mixch_mxParse_js["lib/mixch/mxParse.js"]:::shared
  n_obs_style --> n_src_lib_obsBrowserSource_js["lib/obsBrowserSource.js"]:::shared
  n_obs_style --> n_src_lib_obsComeviewPage_js["lib/obsComeviewPage.js"]:::shared
  n_obs_style --> n_src_lib_obsOverlayStyle_js["lib/obsOverlayStyle.js"]:::shared
  n_obs_style --> n_src_lib_platform_streamEmotes_js["lib/platform/streamEmotes.js"]:::shared
  n_obs_style --> n_src_lib_platform_streamPlatform_js["lib/platform/streamPlatform.js"]:::shared
  n_obs_style --> n_src_lib_showroom_srParse_js["lib/showroom/srParse.js"]:::shared
  n_obs_style --> n_src_lib_storageKeys_js["lib/storageKeys.js"]:::shared
  n_obs_style --> n_src_lib_storageOpTimeout_js["lib/storageOpTimeout.js"]:::shared
  n_obs_style --> n_src_lib_storageRefreshTriggerKey_js["lib/storageRefreshTriggerKey.js"]:::shared
  n_obs_style --> n_src_lib_tiktok_ttParse_js["lib/tiktok/ttParse.js"]:::shared
  n_obs_style --> n_src_lib_tiktok_ttProto_js["lib/tiktok/ttProto.js"]:::shared
  n_obs_style --> n_src_lib_twitch_twIrcParse_js["lib/twitch/twIrcParse.js"]:::shared
  n_obs_style --> n_src_lib_twitch_twStreamKey_js["lib/twitch/twStreamKey.js"]:::shared
  n_obs_style --> n_src_lib_whowatch_wwParse_js["lib/whowatch/wwParse.js"]:::shared
  n_obs_style --> n_src_lib_youtube_ytPageMeta_js["lib/youtube/ytPageMeta.js"]:::shared
  classDef shared fill:#eee,stroke:#999,color:#666;
```
