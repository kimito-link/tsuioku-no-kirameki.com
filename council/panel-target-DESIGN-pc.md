# (写し) サイドパネルの「表示する配信」を 1 か所で決める設計 — PC 側の会議の産物

原本 C:/Users/info/nicolive-ext-panel-target-DESIGN.md(2026-11-09)。略号: P=popup-entry.js、S=ytNicoShim.js、W=ytWording.js、BG=extension-youtube/src/background-entry.js。

裏取り済み(PC 司令塔): P:16660/16676/16695/15015/15636/5577/21458/15597、S:50/758/783-786/1291/1335-1338/1398/872、noActiveWatchDecision.js:75、BG に tabs.on* リスナ無し、content 6 本が YT_STREAM_META を使う。
未確認: 「記録 0 + YouTube の配信者」の入口(本番未測定)。本物のサイドパネルが list_pages に出るか。
試験の限界: sidepanel.html を裏タブで開いた代用。_panelHidden() のとき 3 秒ポーリングが止まる(P:21458)。

## A. 理想の体験
1. 配信中のタブを前面 → 3 秒以内にその配信の件数・配信者・言葉がそろう。別サービスの値は残らない。
2. 配信していない部屋・チャンネルのトップ → 「配信がありません」(docs/plan-empty-state-no-broadcast.md:34)。
3. 対応外のタブ → 直前の配信を保つ(pickPanelLv の keep)。
4. 同じタブで別の配信へ → 一度空になってから切り替わる。
5. YouTube だけの人・ニコ生版は今と同じ。コメビュの追従も今と同じ。

## B. 構成
content×6 --YT_STREAM_META(既存)--> BG handler(BG:744) -- sender.tab.id を鍵に --> ①対応表 chrome.storage.session 'yt_tab_streams_v1'(新設) --onChanged--> パネルの ②resolvePanelTarget(純関数・新設) → target{kind,key,tabId,platform} → mapTab(S:126)・shimGet の nls_last_watch_url(S:774) が使う → ③P refresh(変更なし) / ④言葉(元の文を保持して引き直す)

## C. 機構
C-1 対応表 src/lib/platform/tabStreamMap.js: {[tabId]:{key,url,live,at}}。upsert/remove/entryForTab(stale=90s=META_EVERY_MS×3)。BG の YT_STREAM_META で sender.tab.id があるときだけ upsert(live = endedAt が無い)。tabs.onRemoved で削除。content は変えない。
C-2 決定 src/lib/platform/panelTargetResolver.js: 入力 {activeTab, map, shown, summaries, now} 出力 kind=active|keep|pending|none|cold-same-service。YouTube は URL から key。他は対応表 live かつチャンネル一致 → active。未確定で同じタブ → keep、他 pending(空画面)。ended / 表に無い → none(空画面)。チャンネル不一致 → pending。対応外 → keep。トップで何も見せていない → 同じサービスの最新1件のみ(他サービスへは落ちない)。pickPanelLv は入力が lv 前提なので流用せず方針だけ踏襲。
C-3 シム接続 extension-youtube/src/ytPanelTarget.js: session を読み onChanged で更新。key は pseudoLvForVideoId を通す(忘れると記録 0)。mapTab は他サービスは tab.id で resolver を引く。サイドパネル文脈の nls_last_watch_url は lastWatchUrlFromSummaries をやめ、target の疑似 URL、pending/none はキーを落とす。コメビュ文脈は現状維持。サイドパネル文脈では合成通知を target 変化時だけ。探り読み遮断: collectDataBackedWatchLvs(P:16660) の get で comments キーの lv が2つ以上なら答えず lastAskedLv も触らない。版2で単一値リセット(lastAskedLv, platformOfficial, platformBoardPeriod, kokenIsTopFans, topFanRestRows, zeroPtGifts, allThrowHistory, laneKindLabelByUid)。screenPlatformBase のフォールバックを target に。
C-4 言葉(版2): Text ノードに __nlOrig/__nlOut、title/aria に data-yt-orig-*。rewordAllFromOriginals で引き直す。
C-5 計器 yt_diag_panel_target_v1: kind, platform, counts{…}, tabsQuery{calls,slowOver1100ms,emptyActive}, build{p50,p95,maxRows}, probeSkipped, mapEntries, mapStale, windowMismatch, lastSymptom。

## D. 真因の見立て(コードから・本番未測定)
1. 前面タブが疑似 URL に写らない → P は探り読み(P:15015→16660、上限 min(2800,900+350N)ms)。shimGet は全タブの lv で IndexedDB 全件を組み立てる(S:786)→時間切れ→liveIdsWithData=[]→storage→shim が全サービス最新(YouTube)に差し替え→サイドパネルは空にしない(noActiveWatchDecision.js:75)。
2. 全件読みの上限 15 秒(P:15636)。間に合えば 50,823、落ちれば記録 0。同じ経路の時間差の可能性。
3. 探り読みが全タブの comments キーを読むので lastAskedLv が Kick になり見出しが Kick になる。
4. 配信していない部屋は newestKeyForChannel が空 → 1 と同じ経路(試験で再現)。
仮説: H-b キー欠落 / H-a tabs.query 1200ms 超(P:14918) / H-c 多ウィンドウ lastFocused 別窓。

## F. 捨てた案
P に tabs.onActivated / 単一値の Map 化 / content→パネル直接 / BG に resolver(SW 起動待ち) / pickPanelLv 流用 / newestKeyForChannel を配信中に限るだけ(SW が ended を落とすと永久 live) / コメビュ同時対応。

## G. 地雷
pseudoLv 未登録→記録0 / META は sender 無しでも来る / session は再起動で空 / 探り読み判定の誤り / SPA 遷移で URL 古い→チャンネル一致必須 / 代用パネルの限界 / 同じ版で2つ直さない / venue が nls_stat_cards_mirror_v1 を読むか未確認 / yt_active_video_id は単一値で使わない。

## H. 版
版1 MVP: C-1,C-2,C-3,C-5。版2: C-4+単一値リセット。版3: 鏡の照合・コメビュはパネル決定優先。版4: content 共通化と tw/kick/ww に shouldSkipDiagWrite。
