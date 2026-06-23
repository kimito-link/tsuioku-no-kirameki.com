# popup の各部を status.html に「そっくりそのまま」映す鏡 — ロールアウト計画(2026-06-23)

ユーザー要望: 「応援レーンの鏡(v0.1.911 完成・実機確認済)に続いて、popup の他の部分も全部そっくりそのまま状態速報(status.html)に映す」。難易度順に【まとまり単位】で進める(一度に全部は取り違える)。各段で実機確認。

## 確立済みのパターン(応援レーンの鏡 v0.1.911・これを踏襲)
- popup が描いた結果を最小データで storage に書く(producer) → status が【12秒間引きの extras 側】で読み、本物の描画関数で映す(consumer)。
- 既存実装の足場(必ず読んで同型に揃える):
  - src/lib/laneMirrorKey.js / laneMirror.js(buildLaneMirrorSnapshot/restoreLaneMirrorBuckets/test)
  - popup-entry.js: publishLaneMirror(renderStoryUserLane 末尾・3秒min-gap・best-effort・描画は触らない)
  - status-entry.js: loadLaneMirrorSafe(extras 12秒側)・renderLaneMirror(safeSection・signature ガード)
  - status.html: #laneMirrorLane セクション + 移植した .nl-story-userlane-* CSS + CSS変数4つ(--nl-surface/--nl-text-sub/--nl-muted/--nl-user-accent を light/dark 両方)

## 絶対制約(全 PR 共通・違反厳禁)
- 会場(venueBar.js/content-entry.js/venue.js)に【一切触らない】。popup の表示も【1mm 変えない】(popup-entry.js は publish を足すだけ・既存描画は読むだけ)。触るのは status.html/status-entry.js/新規lib だけ。
- status を重くしない: 読みは extras 12秒間引き側。描画は signature ガードで変化時のみ。
- ★裸要素化を防ぐ(v0.1.900 の轍): popup 限定 CSS を status に移植するとき、参照する CSS 変数まで移植(応援レーンで --nl-* を4つ足した)。
- 本物の描画/純関数を再利用(似せて自作=禁止)。共有 lib があればそれを両方 import。

## popup の主要17セクション(Explore 済み・難易度別)
【移植可=純DOM】1利用規約ゲート/3記録カード3枚(#liveStatComments/#watchConcurrentEst/#watchViewerDom)/4公式統計チップ(paintOfficialNicoStatsStrip)/5イベントバナー/6室温ゲージ(#roomHeatSummary)/7りんくのセリフ(renderCharacterScene)/8タイムライン/9アバター診断/10視聴メタ(renderWatchMetaCard)
【要工夫=chrome依存】11北極星レーン(貢献度/ギフト履歴/広告/イベント順位)/12ユーザーグリッド(renderUserRooms)/13記録推移/14ギフト広告簡易/15ギフト履歴/16開発診断/17音声入力
※2応援アイコン列=済(KEY_LANE_MIRROR)

## ★次にやる PR = 数字カード群(記録カード3枚+公式統計チップ)
ユーザー確定「まず簡単な部分から」。Plan 詳細(実コード行番号つき)は下記。

### データ源(実コード確定)
- 4つの値は renderWatchMetaCard(popup-entry.js:7352-7536)で同時確定。
- #liveStatComments=setCountDisplay(2358-2365)が書く recordedNum。#watchConcurrentEst=audienceVm.concurrent.estText(7468)。#watchViewerDom=audienceVm.visitor.text(7455)。audienceVm=buildWatchMetaCardAudienceViewModel(7438)。
- 公式チップ5種=paintOfficialNicoStatsStrip(7096・末尾7530で呼ぶ)→ ★既に純関数 lib src/lib/officialNicoStatsStripDigest.js#buildOfficialNicoStatsStripDigest に抽出済み(入力=liveId/officialViewerCount/viewerCountFromDom/officialCommentCount/streamAgeMin/officialAdPointsNdgr/officialGiftPointsNdgr の数値だけ・stableKey も提供=signature に使える)。両方 import で再利用=似せて自作回避。

### 実装(3段・各段で実機確認)
段1(lib+テスト・表示変化なし): 新規 src/lib/statCardsMirrorKey.js(KEY_STAT_CARDS_MIRROR='nls_stat_cards_mirror_v1')+statCardsMirror.js(buildStatCardsMirrorSnapshot=records/concurrent/visitor/official を {text,isPlaceholder} で間引き・★official は内部で buildOfficialNicoStatsStripDigest を呼んで確定格納=status は再計算せず格納済み chip を applyChip するだけ=齟齬ゼロ。buildStatCardsMirrorSignature)+test(laneMirror.test.js 同型)。
段2(popup publish のみ・表示1mm不変): popup-entry.js に import 2行(529-530隣)+publishStatCardsMirror(publishLaneMirror 5391-5406 の隣にコピペ改名・3秒min-gap・best-effort)+renderWatchMetaCard 末尾(7530-7535・paintOfficialNicoStatsStrip 直後)で publish 呼び出し1行。記録テキストは $('liveStatComments')?.textContent を読む(DOM 値=popup と必ず一致)。描画は触らない。実機: popup 開き chrome.storage.local.get('nls_stat_cards_mirror_v1') で値確認・popup 見た目不変。
段3(status 描画+CSS): status.html に #laneMirrorLane(711)の隣へ <section id="statCardsMirror" hidden> + popup.html:10175-10382 の #liveStatCards 3カード+公式チップ row を id 込みで移植(キャラ重ね/ローディングは省略可)。★CSS 移植=popup.html の .nl-live-stat-cards(2246)/.nl-official-nico-stats__*(2252-2291)/.nl-live-stat-card+--comments/--concurrent/--visitors(2293-2330)/.nl-live-stat-icon/-label/-value/-unit/-sub(2716-2797)/.nl-concurrent-*(2423-2440)。★不足 CSS 変数は --nl-bg-soft 1つだけ(他はフォールバック済)=status の :root light/dark に1行追加。status-entry.js: import buildStatCardsMirrorSignature+buildOfficialNicoStatsStripDigest。extras に statCardsMirror 追加(loadLaneMirrorSafe 304 の隣 loadStatCardsMirrorSafe・_extrasCache 305・分割代入 309・renderAll 311/673)。renderStatCardsMirror(renderLaneMirror 962-1047 同型・safeSection 865 の隣・signature ガード _lastStatCardsMirrorSig・無 snap は section.hidden)。実機: popup で放送開いた状態で status.html を開き 3カード+公式チップが popup そっくり・他セクション(応援レーン鏡含む)無事・重くないこと。

### リスク
- 記録テキストは DOM($('liveStatComments').textContent)から読む=その瞬間の表示値=popup と必ず一致(齟齬最小)。
- 公式 digest は lib 内で確定格納(status は再計算しない)=似せて自作回避+齟齬ゼロ。
- --nl-bg-soft 未移植だとカード背景グラデ末端が崩れる(応援レーンの轍)=段3で必ず追加。

## その後の PR 候補(難易度順・数字カードの次)
室温ゲージ→りんくのセリフ→視聴メタ→公式イベントバナー(全て純DOM・同パターン)。その後 北極星レーン/ユーザーグリッド(chrome依存=要工夫・データを storage に書く経路追加)。

[[feedback_self_verifying_loop]] [[feedback_meeting_room_for_complex_tasks]] [[reference_status_aggregates_popup_diag]]
