# 「レーンが瞬時にでる最大化」会議+司令塔裏取り(2026-06-16)

最強モード council(COUNCIL-HOWTO.md手順・役割自動付与・結論→根拠→反論→具体案)。応答4/10(クラウドgpt-oss-120b/llama・openrouter・local deepseek-r1。gemini=429・他ローカル cold abort)。**ユーザーの状態速報(fastDiag)が会議の前提を訂正=決定的。**

## 会議の収束(クラウド4/4一致)
stale-while-revalidate(キャッシュ→即表示→裏で最新値に差し替え)+ 初回だけ API min-gap 無視で即1発 + iframe は prewarm でサブ化。**これは「取得が遅い」前提での正解。**

## ⚠️司令塔の裏取り=fastDiag が会議の前提を覆した(最重要)
ユーザー実機 fastDiag(lv350757391):
- `externalFetchProbe`: koken `kokenLastOk:true kokenLastRows:8 kokenSent:1` / nicoad `nicoadLastRows:10 nicoadSent:1`=**API は1発で成功しデータを取れている**。
- `officialHudPageState.officialNicoEventRank:73` / `officialValuesV2.nicoEventRank.ndgr.value:73`=**NDGR からイベント順位73も取れている**。
- なのに `北極星レーン`: 貢献度 count:0(空) / 広告 count:0(空) / E順位 value:null。
→ **「取得が遅い」のではなく『取れているのに表示(count/value)に届いていない』反射の穴**。会議の min-gap/iframe 瞬時化は的外れ(初回 API は既に即1発で成功している=`_kokenContribApiLastAttemptAt=0` で初回はゲート通過を実コードで確認)。

## 真因の切り分け(実コードで確定)
- **fastDiag の `北極星レーン` count は DOM/iframe バンドル(`b=lastOfficialEventDomBundle`)からしか数えていない**(content-entry.js:5875 `contribCount=len(b?.contributionRanking)`)。API rows(kokenApiRows=8件)は state 判定(determineNorthStarLaneState)には渡るが count には入らない→**診断が「空」と誤表示**(v0.1.621 で state は ok 判定経路を足したが count は DOM のまま)。
- **だが実パネルの描画は正しい**: popup-entry.js:9744 `resolveOfficialContributionRankingRows(liveId)` が storage(`nls_koken_api_contrib_<lv>`)の API rows を読み、あれば描画(9747-9766)。**API rows が storage に入れば実レーンは出る**。
- → つまり「レーンが出ない/遅い」の体感の正体は2つに分離: **(1) fastDiag 診断の count 誤り(空表示)=表示だけの穴 / (2) 実レーン描画は API rows が storage に入って refreshAllNorthStarMirrorLanes が走るまでの時間=瞬時化の対象。**

## 司令塔の1案(会議+fastDiag 統合・効果順)
1. **(診断の正直化・小)** fastDiag の `北極星レーン` count を「DOM bundle が空でも API rows(kokenApiRows/nicoadApiRows)があればそれを数える」に。`max(len(b?.x), len(apiRows))`。これで「取れてるのに空」の誤診断が消える(ユーザーが状態速報で正しく見える)。純関数+TDD。
2. **(瞬時化の本筋=会議の stale-while-revalidate)** 実レーンを「前回同 lv のキャッシュを即描画→裏で最新 API に差し替え」。`nls_koken_api_contrib_<lv>` は既に storage にあるので、配信を開いた瞬間に **resolveOfficialContributionRankingRows を即読んで描画**(refreshAllNorthStarMirrorLanes の load 連鎖を待たず先行paint)。同配信再訪は0ms。
3. **(初回 API の前倒し)** API mirror の初回発火を「visibilitychange/interval を待たず liveId 確定の瞬間」に1発(min-gap は初回 0 起点で既に通過=コード確認済なので、呼ぶタイミングだけ最速化)。NDGR 由来(イベント順位73)は既に即時=これは即レーンに出す。
- ⚠️会議のハルシネ却下=`/api/v1/koken/contrib` 等の具体URL/`chrome.webRequest`/`chrome.windows.create` で別窓 iframe=当リポに無い。当リポは SW 経由 fetch + storage 橋渡し + MAIN world 傍受。`X-Force-Refresh` ヘッダでmin-gapバイパス=サーバ仕様不明の妄想=採らない。

## 進め方
- まず **(1)診断の正直化**(最小・安全・ユーザーが状態速報で正しく見える)→ その後 **(2)stale-while-revalidate で実レーン先行paint**(瞬時化の本丸)。各々TDD+実機(状態速報で count が API と一致・レーンが開いた瞬間出る)。
- ⚠️実レーン描画(popup-entry の北極星レーン連鎖)は重い配信で詰まる既往(v0.1.616-621)あり=変更は load 連鎖を壊さないか要確認。
