/**
 * 拡張の更新履歴データと semver 比較ヘルパ。
 *
 * 設計（0.1.12 D: 更新履歴 popup 表示）:
 *   ・version 文字列・日付・概要・項目配列を JSON-like なデータ構造で保持。
 *   ・popup-entry.js が `<details id="changelogPanel">` の中身として
 *     描画する。<details> は既定折り畳みなので、開かない限り存在感ゼロ
 *     （UIUX 阻害ゼロ）。
 *   ・各項目は HTML を含まずプレーンテキスト（テキストノードで出す）。
 *     CWS 審査で問題になる外部リソース取得や script 系も入れない。
 *
 * 注：このファイルは「ユーザに見せる更新履歴」の正本。AGENTS.md §5 と
 *     重複する内容もあるが、AGENTS.md は開発者向けの詳細、ここはユーザ向けの
 *     要約という棲み分け。
 */

/**
 * @typedef {{
 *   version: string,
 *   date: string,
 *   summary: string,
 *   items: readonly string[]
 * }} ChangelogEntry
 */

/** @type {readonly ChangelogEntry[]} */
export const EXTENSION_CHANGELOG = Object.freeze([
  Object.freeze({
    version: '0.1.243',
    date: '2026-05-11',
    summary: '貢献度ランキング iframe warmup 320x240 試行',
    items: Object.freeze([
      'レーン 1 貢献度ランキング / レーン 2 ギフト履歴を取得するために裏で開いている `audition.nicovideo.jp` / `koken.nicovideo.jp` の hidden iframe の初期サイズを 320x240 に変更しました。透明 (opacity 0) のままなので画面表示は何も変わりません。15 秒後に従来通り 1px に縮退します',
      '背景: v0.1.218 以来この hidden iframe を 1px サイズで配置していましたが、実機 v0.1.237 で「heartbeat は届くがランキング 0 件」の状態が続いていました。niconico の Vue がコンテナサイズ依存で lazy render する可能性が高く、最初の数秒だけ実サイズで配置することで Vue mount を促す試行です',
      '対比として nicoad は同じ 1px でも mount に成功（広告ランキングは取れている）。何故 audition/koken だけダメか の切り分けに使う観測値 `iframeWarmupSummary` を AI 共有診断 JSON の `giftSubAppRelayDiag` 配下に新設しました。次回診断バンドルで `auditionMount.mountSuccess: true` になれば本案が効いたと判定できます',
      '副作用: 画面左上 320x240 領域に透明 iframe が 15 秒間存在しますが、`opacity: 0` / `pointer-events: none` / 最小 z-index で視覚・操作影響ゼロ',
      'opt-in は v0.1.228 の「ギフトランキング取得を開始」ボタン押下後の挙動のみ。OFF default の挙動は変わりません',
      'これでもダメなら次版 v0.1.244 でレーン 1+2 を experimental 降格 + 「公式ページ依存 (取得困難)」表記改善に切り替えます (stop condition)。会議室 (codex + gemini) 経由で計画磨き済'
    ])
  }),
  Object.freeze({
    version: '0.1.242',
    date: '2026-05-11',
    summary: '北極星 レーン 4 番組累計ポイント表示',
    items: Object.freeze([
      'popup の「公式値レーン」セクションの **レーン 4 番組累計ポイント** に値表示を追加しました。watch ページ自体の programStats（プレイヤー上部のティッカー）から取れる `giftPoints` の数値、または NDGR stats 由来の `officialGiftPointsNdgr` を使い、niconico 風の「X,XXX pt」形式（`span.point-value` + `small.point-unit` の構造）の HTML を組み立てて popup に流します',
      '優先度は **DOM programStats > NDGR stats > (未取得) placeholder**。前者は watch ページ自体に常時表示されているプレイヤー上部ティッカーから取れるので、配信開始時から値が出ます',
      '`src/lib/northStarFallbackHtml.js` に `buildNorthStarProgramPointsFallbackHtml(value)` を追加（v0.1.241 で導入したパターン踏襲）。vitest 8 件追加（正の整数 / 0 / 負数 / null / NaN / Infinity / 小数 / カンマ区切り / 大きい数 を網羅）',
      'popup-entry.js に `refreshNorthStarProgramPointsLane()` を追加、bundle 更新の rerender pipeline に統合（v0.1.240 / v0.1.241 のレーンの隣）',
      'AI 共有診断 JSON の `北極星レーン.4_番組累計ポイント` に `ndgrValue` フィールド追加、state 判定も「DOM 数値 OR NDGR 値」のどちらかで ok 判定に拡張',
      'これでレーン 3 / 4 / 5 / +α の 4 レーンに値表示が揃いました。残りはレーン 1 貢献度ランキングと レーン 2 ギフト履歴（gift sidebar cross-origin iframe scrape 修復が必要）'
    ])
  }),
  Object.freeze({
    version: '0.1.241',
    date: '2026-05-11',
    summary: '北極星 レーン 3+5 NDGR fallback 表示',
    items: Object.freeze([
      'v0.1.240 で実装した北極星レーン 3 (イベント累計スコア) / レーン 5 (イベント現在順位) の鏡レンダリングに、**NDGR stats 由来の値からの fallback 表示**を追加しました。audition fetch が空（DOM が取れない）でも NDGR から `officialEventGiftScoreNdgr` / `officialNicoEventRankNdgr` が取れていれば、popup レーンに「現在 N 位」「X,XXX」形式で公式値を表示します',
      '優先度は **鏡 mirrorHtml > NDGR fallback > (未取得) placeholder**。鏡が取れる時は v0.1.240 通り outerHTML をそのまま映し、取れない時だけ NDGR 値で fallback HTML を組み立てます。両方取れない時は「(未取得)」placeholder で枠だけ維持（v0.1.236 仕様）',
      '`src/lib/northStarFallbackHtml.js` を新設し、`buildNorthStarRankFallbackHtml` / `buildNorthStarScoreFallbackHtml` の 2 純関数を実装。niconico の class 名（`rank-field` / `rank-num` / `score`）をそのまま使い、`sanitizeMirrorHtml` がそのまま通せるシンプル構造（`span` / `strong` のみ、style/href/on* 等は使わない）。15 件の vitest で正の整数 / 0 / 負数 / null / NaN / Infinity / 小数 / 不正型 を網羅検証',
      'AI 共有診断 JSON の `北極星レーン` に `ndgrValue` フィールドを追加（レーン 3 / 5 のみ）、state 判定も「数値 OR mirror html OR NDGR 値」のどれかが取れていれば ok に倒します。実機で「DOM 取れない / NDGR 取れている」状態を popup と診断 JSON の両方で正しく表現できるようになります',
      '実機で観測された問題への直接対応: lv350503428（v0.1.237 実機）で `officialNicoEventRankNdgr: 50` が取れていたのに popup レーン 5 が `missing` 表示だった盲点を解消'
    ])
  }),
  Object.freeze({
    version: '0.1.240',
    date: '2026-05-11',
    summary: '北極星 レーン 3+5 (累計+順位) 鏡レンダリング',
    items: Object.freeze([
      'popup の「公式値レーン」セクションの **レーン 3 イベント累計スコア** と **レーン 5 イベント現在順位** に、niconico の outerHTML をそのまま映す「鏡のように貼り付け」レンダリングを追加しました。イベント参加配信では、popup の枠内に audition embed の `span.score` / `span.rank-field`（スコアアイコン SVG / 順位の太字 / X,XXX 形式）が niconico ページの見た目のまま再現されます',
      '`scrapeEventInfoMirrorParts(root)` を新規追加（`src/lib/officialEventBannerDom.js`）。「○○さんが参加しています！」グリーンバナーの `a.wrapper` 配下、`p.status` 内の `span.score` と `span.rank-field` の outerHTML をそれぞれ抜き出す純関数です。誤検出回避のため「さんが参加しています」テキストでバナー識別、`.score-icon` / `.score-value` の混同は CSS セレクタで除外しています',
      '`fetchOfficialEventBannerFromAuditionEmbed` の戻り値（banner data）に v0.1.237 と同じ手法（`Object.defineProperty` で非列挙の `mirrorParts`）で `scoreHtml` / `rankHtml` を添付。content-entry.js 側で別 field（`bundle.eventCumulativeScoreMirrorHtml` / `bundle.eventCurrentRankMirrorHtml`）に写して storage 経由で popup に届けます',
      'バンドル型 `OfficialEventDomBundle` に `eventCumulativeScoreMirrorHtml: string|null` / `eventCurrentRankMirrorHtml: string|null` を追加、`mergeOfficialEventDomBundle` も新フィールドのマージ（next 優先 / prev fallback）に対応。既存挙動は破壊しません',
      'popup-entry.js に `refreshNorthStarEventCumulativeScoreLane()` / `refreshNorthStarEventCurrentRankLane()` を追加。bundle 更新の rerender pipeline（`refreshNorthStarAdRankingLane` の隣）で両レーンを描画します。値が無い時は v0.1.236 で常設した「(未取得)」placeholder と `data-lane-state` の missing 状態を維持します',
      'AI 共有診断 JSON の `北極星レーン` も拡張。各レーンに `mirrorHtmlBytes` を追加し、鏡レンダリングが効いているか（bytes 数）を観測できます。state 判定も「数値 OR mirror html」のどちらかが取れていれば ok に倒します',
      '取得経路は **audition.nicovideo.jp 直接 fetch**（cross-origin iframe inject を使わない）。v0.1.218 で機能不全だった gift sidebar iframe inject の解決を待たずに、credentials: include 付きで取れる方法をフル活用しています。イベント不参加時はバナー DOM 自体が render されないので mirrorHtml も null、placeholder が維持されます'
    ])
  }),
  Object.freeze({
    version: '0.1.239',
    date: '2026-05-10',
    summary: 'NDGR dedupe を MAIN world 受信に統合',
    items: Object.freeze([
      'v0.1.238 で導入した NDGR Message ID dedupe lib を、MAIN world の page-intercept 受信パイプラインに統合しました。`processLengthDelimitedNdgrFrame()` 内、`scheduleNdgrChatRowsPost()` の直前で chat 行に dedupe を適用し、初出のみを content script へ post します。NDGR が同じコメントを複数経路で再送した場合に postMessage / structured clone のオーバーヘッドを早期に削減できます',
      'synthetic messageId は `co:${commentNo}:${userId}:${content}` 形式（commentNo + userId + 本文 が一致 = NDGR 再送と見做す）。content-entry 既存の `commentNo + text` merge と機能的に等価以下の dedupe（より厳格に userId も見る）なので、誤って正当なメッセージを drop する false positive リスクは増えていません',
      '配信切替（lvXXX 変化）検知は `extractLiveIdFromHref()` で起動時に 1 回だけ判定。MAIN world は 1 watch ページにつき 1 回しか初期化されないため、tab 切替・SPA 遷移時は新 tab / 新 frame で別 dedupe instance が生まれます',
      'AI 共有診断 JSON の `commentObservability.ndgrMessageIdDedupe` ブロックに dedupe snapshot を露出（`accepted` / `droppedDuplicate` / `evictedIds` / `currentBuckets` / `bucketsCreated` / `bucketsCleared` / `resets` / `lastResetLiveId`）。実機で「再送が何件起きているか」「FIFO eviction が発火しているか」が観測可能になります',
      'ユーザ画面の表示挙動には変更なし。drop された行は既存の content-side `commentNo + text` merge でも drop される行と同一なので、最終的に persist されるコメント / 表示は v0.1.238 までと完全に一致します（dedupe pipeline の前段化のみ）',
      '設計詳細は memory `analysis_distributed_dedupe.md`（4 軸独立調査の 7 原則）/ `plan_v0239_message_id_dedupe.md`（実装計画）参照'
    ])
  }),
  Object.freeze({
    version: '0.1.238',
    date: '2026-05-10',
    summary: 'NDGR Message ID dedupe lib を新設',
    items: Object.freeze([
      'NDGR 受信メッセージの重複排除を担う純関数 lib `src/lib/ndgrMessageDedupe.js` を新設しました。配信切替時 reset、live ごと FIFO eviction（既定 4096 件 cap）、観測値の plain object snapshot を提供します',
      '設計は 4 つの独立調査が完全一致した結論ベース：(1) Codex による NdgrClientSharp / NDGRClient / mujurin1 / nagome のソース深読み、(2) Apache Kafka / Redis Streams / MQTT QoS 2 / AWS Kinesis / gRPC の distributed semantics、(3) Bilibili 弾幕プロトコル + Slack / Discord / Telegram / X の scale 桁違い設計、(4) YouTube Live / Twitch / TikTok Live の cross-platform 横断（部分）。3 軸独立で同じ 7 原則に到達したため設計に確信あり',
      '主キーは messageId、補助は liveId + segmentUri に役割分離。canonical key は `liveId + ":" + messageId` に正規化（NdgrClientSharp の segmentUri-only は backward fetch / relay overlap に弱いため、live レベルにキー空間を広げています）',
      '本版では lib 単体の追加に留まり、既存 NDGR 受信パイプラインへの統合 / 挙動変更は行っていません。次バージョンで wire レベル meta.id 抽出と統合 + 観測値の `commentObservability.ndgrMessageIdDedupe` ブロック追加を予定しています。挙動変更ゼロ',
      '12 件の vitest（同一 / 別 liveId、FIFO eviction、配信切替 reset、structured clone 安全性、case-insensitive、空キー pass-through 等）で API を網羅検証しています。詳細は `analysis_distributed_dedupe.md` / `plan_v0239_message_id_dedupe.md` 参照'
    ])
  }),
  Object.freeze({
    version: '0.1.237',
    date: '2026-05-09',
    summary: '北極星 +α 広告ランキング鏡レンダリング',
    items: Object.freeze([
      'popup の「公式値レーン」セクションのうち、+α 広告ランキング枠に niconico の outerHTML をそのまま映す「鏡のように貼り付け」レンダリングを追加しました。広告ランキングが取れている配信では、popup の枠内に niconico ページの DOM（順位アイコンの SVG / 名前 / "X,XXX 貢" の表示）がそのまま再現されます',
      '自前の最小サニタイザ `mirrorSanitize.js` を新設しました（DOMPurify 等の依存追加なし、依存ゼロ方針維持）。許可タグ・許可属性のみ通すホワイトリスト方式で、SVG namespace を保持しつつ id を nonce 付きにリネーム（複数の鏡を popup に並べた時の id 衝突を防止）、`url(#...)` / `xlink:href="#..."` の参照も同期更新します。`script` / `iframe` / `style` / `href` / `data-v-*` / `[hidden]` 属性付き要素 / `javascript:` プロトコル URL などを削除し、popup の CSP やクリック挙動と衝突しないよう守ります',
      '`scrapeAdRankingMirrorHtml(root)` を新規追加（`src/lib/officialEventBannerDom.js`）。watch ページ secondary content section の `ul.wrapper` の outerHTML を文字列として返す純関数です。CSS Modules ハッシュ化された class へのフォールバックも含みます',
      '`fetchNicoadContributionRankingFromPublishPage` の戻り値を拡張し、Array に非列挙の `mirrorHtml` を `Object.defineProperty` で添付するようにしました。既存の `Array.isArray` 判定や `.map()` などは影響を受けません。content-entry.js 側でこれを取り出して `bundle.adRankingMirrorHtml` 別フィールドに写し、storage 経由で popup に届けます',
      'バンドル型 `OfficialEventDomBundle` に `adRankingMirrorHtml: string|null` を追加、`mergeOfficialEventDomBundle` も新フィールドのマージに対応。既存挙動は破壊しません',
      'popup-entry.js に `renderNorthStarLane(laneId, mirrorHtml)` と `refreshNorthStarAdRankingLane()` を追加。bundle 更新の rerender pipeline（`refreshGiftRankStrip` の隣）で広告ランキングレーンを描画します。値が無い時は v0.1.236 で常設した `(未取得)` placeholder と `data-lane-state="missing"` を維持します',
      '実装は会議室プロンプト（Codex 実装案 / Codex 批判 / Gemini 抜け漏れの 3 AI レビュー）で計画を磨いてから着手しました。Gemini の追加視点（`[hidden]` 削除 / CSP 衝突の予防 / Shadow DOM 監視 / popup 内クリック挙動）も組み込んでいます'
    ])
  }),
  Object.freeze({
    version: '0.1.236',
    date: '2026-05-09',
    summary: '北極星 6 レーン枠を popup と診断シートに常設',
    items: Object.freeze([
      'popup の「公式値レーン」セクションを新設し、(1) 貢献度ランキング (2) この番組へのギフト履歴 (3) イベント累計スコア (4) 番組累計ポイント (5) イベント現在順位 (+α) 広告ランキング の 6 つを取得可否に関わらず常設しました。値が取れていない項目は「(未取得)」placeholder として枠だけ残ります（kimito さん明示、2026-05-09）',
      'AI 共有診断 JSON にも `北極星レーン` キーを追加しました。各レーンは `state`（"ok" / "missing"）と件数 / 値 / 取得回数（累計）を持つ統一構造で、popup を見なくても診断 JSON だけで「何が抜けてるか」が分かります',
      '挙動変更ゼロ。データ取得経路（cross-origin iframe scrape の修復）はこの版では手をつけず、後続版で「鏡のように貼り付け」（niconico DOM の outerHTML をそのまま popup に流し込む）方式で順次値を埋める段取りです'
    ])
  }),
  Object.freeze({
    version: '0.1.235',
    date: '2026-05-08',
    summary: 'NDGR ギフト partial decode の真因サンプル収集',
    items: Object.freeze([
      'NDGR ギフト event を受信しているのに「アイテム名 / 送信者 ID / 順位」のいずれかが取れない部分欠落のケースについて、診断 JSON の `ndgrUnknownSamples` に欠落カテゴリ別（`msg:24:noitem` / `msg:24:nouid` / `msg:24:norank`）の hex サンプルと、実機 wire の生キー名一覧（`propsKeyNames`）を最大 3 件ずつ残すようにしました。次バージョン以降で `pickNxGiftString` の候補リストを実機キー名に合わせる手がかりになります',
      '挙動変更ゼロ。ユーザー画面の表示は v0.1.234 と同一です。AI 共有診断のサイズが微増しますが、3 サンプル × 4 カテゴリ × 16 キー名上限なので実用上は数百バイト程度の増加です',
      '実機観測（lv350482067、ニー子配信）で `gifts: 10` のうち `giftsWithItem: 5 / giftsWithUid: 4 / giftsWithRank: 0` という偏りが確認されており、v0.1.233 で仕込んだ `msg:24:empty` 経路では捕まえられない「partial 欠落」を診断に出すための仕込みです'
    ])
  }),
  Object.freeze({
    version: '0.1.234',
    date: '2026-05-08',
    summary: 'postMessage 認証強化 + ギフト保存件数 cap',
    items: Object.freeze([
      'コメント・ギフト・統計の postMessage 経路に最低限の改ざん耐性として認証トークンを導入しました。同じ視聴ページに居る別の拡張やユーザースクリプトが偽の `NLS_INTERCEPT_*` を送って `nls_comments_（liveId）` / `nls_gift_users_（liveId）` を汚染する事故的衝突を抑止します（完全防御ではなく、generic な spoof を弾く層）',
      'コメント・ギフトの受信内容に shape 検証を追加しました。異常な `commentNo`（非数字 / 11 桁以上）、過大な文字列（4096 字超）、配列の上限（1000 件超）、不正な `userId` 形式、負の point などは drop します。NDGR から実際に届く正規の値はそのまま通過します',
      'cross-origin iframe 由来の `NLS_GIFT_HISTORY_FROM_IFRAME` / `NLS_GIFT_SUBAPP_RELAY_HEARTBEAT` の trust 検証を強化しました。`frameUrl` 必須化と、`origin` と `frameUrl.origin` の一致を必須化し、trusted host 内のなりすまし（別 nicovideo.jp 配下 iframe が他 iframe を名乗る）を阻止します',
      'ギフト送信者の保存件数に上限（1 配信あたり 2000 件）を追加しました。これを超えた場合は古い `capturedAt` の entry から drop します（FIFO）。ストレージ肥大化 / DoS の緩和です。通常配信ではこの上限に達することはありません'
    ])
  }),
  Object.freeze({
    version: '0.1.233',
    date: '2026-05-08',
    summary: 'NDGR ギフト decode の偽陽性削減 + 真因サンプル収集',
    items: Object.freeze([
      'ギフト件数（NDGRギフトevent数）に、コメント本文「草」などが誤ってギフトとして数えられる事象を修正しました。具体的には、ギフトの item_id が「英数字 + アンダースコア / ハイフンの slug 形式（stamp_xxx / ball_basketball など）で 3〜80 字」を満たすときだけギフト計上するように厳格化しています。日本語・絵文字を含むコメント本文がギフトに混入することはなくなります',
      'ギフト送信者の数値型 user_id（Vue 経由で number_value として送られるパス）も拾えるよう、decode の safety net を追加しました（raw varint / fixed64 直送りパス）。送信者観測の精度が上がります',
      '「ギフト event は届いたが decode 結果が空」という状況の wire 構造を AI 共有診断 JSON の `ndgrUnknownSamples["msg:24:empty"]` に hex で残すようにしました。これは次バージョン以降で「全部 0 件」を切り分けるための調査用観測値です。挙動変更ゼロ、ユーザー画面には影響しません'
    ])
  }),
  Object.freeze({
    version: '0.1.232',
    date: '2026-05-08',
    summary: 'ボタン トグル化 + ギフトサイドバー close 強化',
    items: Object.freeze([
      'popup「ギフトランキング取得を開始」ボタンを ON / OFF トグルに変更しました。一度押した後にボタンが消えてしまい元に戻せなくなる問題を解消し、いつでも停止できます。停止すると次の F5 から自動オープンが走らなくなります',
      'ギフトサイドバーの自動オープンが「お困りの方はこちら」が出る配信者で閉じきれず、サイドバーが開いたまま残る事象を修正しました。close ボタンクリック → Escape キー → ギフトボタン トグル → close ボタン再クリックの 4 段で確実に閉じるよう強化し、待ち時間も 400ms→600ms（rescue link 検出時は 1000ms→1200ms）に延長しています',
      '挙動: 取得値や観測値は変えていません。ユーザー体験のみ「ボタンを押し直せる / サイドバーが開きっぱなしにならない」方向の改善です'
    ])
  }),
  Object.freeze({
    version: '0.1.231',
    date: '2026-05-08',
    summary: '「お困り」抑制 + relay 受信を単体テスト化',
    items: Object.freeze([
      'ギフトランキング取得を開始したときに、配信者によっては「お困りの方はこちら」のリンクが一瞬画面に見えてしまう副作用を抑制しました。表示用のステルス CSS にこのリンクを含め、検出した場合は内部処理を早期終了して閉じるようにし、リンクがまだ残っているときはステルス CSS を 800ms 余分に維持してから外すようにしました',
      '内部処理: ギフト iframe relay の受信ロジック（v0.1.230 で実装した frame URL 別の振り分け）を `src/lib/iframeOfficialDomFromRelay.js` に純関数として切り出し、単体テスト 18 件を追加しました。これで「広告 iframe の値が貢献度ランキングに混入する」回帰を、実機テスト無しで CI 上で自動検出できます',
      '挙動変更ゼロ（観測 / 取得値）。ユーザー体験のみ「お困りの方はこちら」が見えなくなる方向の改善です'
    ])
  }),
  Object.freeze({
    version: '0.1.230',
    date: '2026-05-08',
    summary: '広告ランキングが貢献度ランキング欄に混入する事象を修正',
    items: Object.freeze([
      'v0.1.226 〜 v0.1.229 でギフトランキング取得経路を opt-in 化したあと、ボタンを押すと popup の「公式の貢献度ランキング順」に広告ランキングの数値（23692貢など）が混入する事象がありました。原因は、広告ランキング iframe（nicoad.nicovideo.jp）の DOM scrape が貢献度ランキング用の selector にもヒットしてしまい、親 frame で「貢献度ランキング」として保存されていたことです',
      '本バージョンでは、relay 受信側で送信元の iframe（audition / koken / gift / nicoad）を URL から判別し、貢献度ランキング・イベント参加バナーは audition / koken からのみ採用、広告 iframe（nicoad）の値は drop するように変更しました。ギフト履歴は koken のみ、イベントバナーは audition のみが信頼源です',
      'あわせて、初回の自動オープンが「お困りの方はこちら」表示で終わった配信では、30 秒後の自動リトライを行わないようにしました（同じ rescue 表示を再度トリガするだけになるため）。実機でユーザーが目にする副作用が更に減ります'
    ])
  }),
  Object.freeze({
    version: '0.1.229',
    date: '2026-05-08',
    summary: 'ランキングタブ検索の誤 navigate を修正',
    items: Object.freeze([
      'v0.1.228 で追加した「ギフトランキング取得を開始」ボタンを押した直後に、視聴中の配信ページから別の配信者のページへ画面が切り替わってしまう不具合を修正しました。原因は、内部のサイドバー操作（ランキングタブを探してクリック）が、ページ内のおすすめ生放送カードや関連リンクの中まで広く検索してしまい、その中に「ランキング」「貢献」というテキストを含むリンクがあると、それを誤ってクリックしていたことです（v0.1.174 から潜在していたバグ。v0.1.228 でユーザーが意図的に押すボタンに紐づいたため発覚しました）',
      '本バージョンでは、ランキングタブの検索範囲をギフトサイドバーの内部だけに限定しました。ギフトサイドバーが開けなかった配信では、ランキングタブの検索自体を行わず（誤クリックの一切の余地を断つ）、その他の挙動には影響しないようにしています',
      'コメント記録・応援帯・ユーザー別件数など、ギフト経路以外には影響ありません。v0.1.228 の opt-in 動作はそのまま継続します'
    ])
  }),
  Object.freeze({
    version: '0.1.228',
    date: '2026-05-08',
    summary: 'ギフトランキング取得を opt-in 化',
    items: Object.freeze([
      'v0.1.226 / v0.1.227 の実機観測で、配信者ごとに公式サイドバー iframe（貢献度ランキング・ギフト履歴を出す部分）の Vue が rich-view-status placeholder のまま render に到達しないケースが多いことが分かりました。ギフトランキング取得の試行（自動でサイドバーを一瞬開く処理）の副作用で「お困りの方はこちら」表示が出てしまい、UX を損ねていました',
      '初期状態では取得経路（auto-open / hidden iframe inject）を停止し、popup の応援帯直下に「ギフトランキング取得を開始（β）」ボタンを表示するようにしました。ボタンを押すと chrome.storage の `nls_gift_ranking_lane_enabled` が true になり、content 側でギフトランキング・累計・履歴の取得を 1 秒以内に開始します（F5 不要、SPA 遷移後も維持）',
      'コメント記録・応援ランキング・ユーザー別の応援件数など、ギフト以外の経路はこれまで通り常時動きます。本変更は「ギフトランキングレーンの取得試行のみ」を opt-in 化するものです'
    ])
  }),
  Object.freeze({
    version: '0.1.227',
    date: '2026-05-08',
    summary: 'iframe relay scrape の heartbeat 観測',
    items: Object.freeze([
      'v0.1.226 で「iframe relay は技術的に動いている（nicoad から受信あり）が、貢献度ランキング・ギフト履歴を持つ audition / koken iframe からは何も来ない」状態が実機で確定しました。原因が「child content script 自体が動いてない」のか「動いているが scrape 結果が 0 件で送信を諦めている」のかを切り分けるための観測値（heartbeat）を追加しました',
      'iframe 内の relay は scan 毎 tick で `NLS_GIFT_SUBAPP_RELAY_HEARTBEAT` を親に送信するようにしました。scrape 結果が 0 件でも送るので、親側で「frame URL × 累積回数 × 直近 scrape 件数」を観測できます。AI 共有診断 JSON の `content.giftDiagnostics.giftSubAppRelayDiag.heartbeatsByFrameUrl` と popup「詳しい状況」の「iframe relay 経路」行で読めます',
      '観測専用の追加で、拡張の挙動は一切変更しません。次バージョン以降で、heartbeat の値に基づき scrape ロジックの修復（DOM 空のリトライ・selector 補強）または child script 起動の補強を進めます'
    ])
  }),
  Object.freeze({
    version: '0.1.226',
    date: '2026-05-08',
    summary: 'ギフトサイドバー iframe relay 経路の生存観測を追加',
    items: Object.freeze([
      '公式の貢献度ランキング・イベント累計・ギフト履歴を取得するための「cross-origin iframe → window.top.postMessage で親 frame に DOM scrape 結果を中継する」経路（v0.1.216 〜 v0.1.218 で導入）が、実機で実際に動いているのかを確認できる観測値を追加しました。受信件数の累積、frame URL 別の受信件数、最終受信時刻、cross-origin throw 回数、same-origin access 回数の 5 種類です',
      '上記は AI 共有診断 JSON の `content.giftDiagnostics.giftSubAppRelayDiag` ブロックと、popup「詳しい状況」の「iframe relay 経路」行に追記されます。受信 0 件のときは「未受信（cross-origin で N 回弾かれ、…）」が出るため、relay 不全の原因が「hidden iframe inject 未動作」か「scrape 結果の postMessage 失敗」かを切り分けやすくなります',
      '観測専用の追加で、拡張の挙動は一切変更しません。次バージョン以降で、この観測値に基づいて relay 不全の根本改善（hidden iframe inject の動作補強・scrape ロジック修復）を進めます'
    ])
  }),
  Object.freeze({
    version: '0.1.225',
    date: '2026-05-08',
    summary: 'コメント uid 解決経路の切り分け観測を追加',
    items: Object.freeze([
      'v0.1.224 で目立たなくなった「150 件謎タイル」の根本原因（投稿者 ID 取得失敗）について、原因が DOM 側か NDGR 側か page-intercept 側かを F12 不要で AI 共有診断 JSON だけで切り分けられるよう、観測値を追加しました。具体的にはコメ表 row の `data-user-id` 系属性の有無、page-intercept が拾った fetch URL 履歴、コメント取り込み source 別件数、保存コメントの uid 解決率、NDGR から decode した chat に対する保存率の 5 種類です',
      '上記は AI 共有診断 JSON の `content.giftDiagnostics.commentObservability` ブロックに追記されます。観測専用の追加で、拡張の挙動は一切変更しません',
      '次バージョン以降で、この観測値に基づいて DOM scrape / API hook の補強（uid 取得経路の根本改善）を進めます'
    ])
  }),
  Object.freeze({
    version: '0.1.224',
    date: '2026-05-08',
    summary: 'ID未取得コメントの謎タイル混入を修正',
    items: Object.freeze([
      'popup「ユーザー別の応援件数が多い順」セクションに、ID未取得コメント（投稿者 ID が DOM から取れなかったコメント群）が単独タイルで「150 件」のように大量カウント表示される事象を修正しました。配信中に多数発生しうる ID 未取得コメントが 1 つの匿名バケツに集約され、配信者本人より目立つ位置で表示されるのが直感に反するため、ranking 表示からは除外する仕様に変更しました',
      'HTMLレポートやマーケ集計内の「ユーザー別件数」など、別経路の集計には影響しません（ranking 表示のみの調整です）',
      'ID未取得コメント自体の記録は維持しています（保存コメント本体には残ります）。投稿者 ID 取得経路の改善は別バージョンで対応します'
    ])
  }),
  Object.freeze({
    version: '0.1.222',
    date: '2026-05-08',
    summary: 'ギフト送信者観測 0 を decode 側修正で解消',
    items: Object.freeze([
      'v0.1.221 の診断（giftsWithItem は 100% 取れているのに giftsWithUid / giftsWithName / giftsWithPoint / giftsWithRank がすべて 0）から確定した「decode 側の問題」を修正しました。具体的には msg.24 nx:gift:show の parameters decode で、google.protobuf.Value を先に protobuf field として parse するよう順序を整理し、snake_case の key（advertiser_name / advertiser_user_id / item_name / item_id / ad_point / contribution_rank）も拾えるようにしました（既存 camelCase キーとの並列対応）',
      '6 UTF-8 bytes の string_value wrapper が tag + len + payload で全体 8 bytes になり、raw double と誤認される境界バグも併せて修正しました',
      'Gift proto (msg.8) の field mapping は OSS（n-air-app/nicolive-comment-protobuf）と一致しているためそのまま維持しています'
    ])
  }),
  Object.freeze({
    version: '0.1.221',
    date: '2026-05-07',
    summary: 'ギフト送信者観測 0 の原因切り分け診断を追加',
    items: Object.freeze([
      'NDGR ギフトイベントは届いている（gifts カウンタが進む）のに popup の「ギフト送信者観測数」が 0 件のままになる症状について、原因が「proto デコードで送信者情報が取り出せていない」のか「受信側で保存条件を満たさず skip されている」のかを切り分けるための診断値を追加しました',
      'AI 共有診断 JSON の `ndgrWireCounters` に `giftsWithUid` / `giftsWithName` / `giftsWithItem` / `giftsWithPoint` / `giftsWithRank` の 5 件を追加しました。`gifts` 総数に対しこれらの値が小さい場合は decode 側、十分大きいのに popup の送信者数が 0 のままなら受信側の保存ゲートが原因、と判断できます',
      '本バージョンは観測値の追加のみでロジック変更はありません。次バージョン以降の実装方針を、実機の診断値を見てから決めるための準備です'
    ])
  }),
  Object.freeze({
    version: '0.1.220',
    date: '2026-05-07',
    summary: 'AI 診断ボタンが反応しない問題を修正',
    items: Object.freeze([
      'v0.1.219 で「🤖 AI 診断（Gemini Nano）」ボタンを押しても反応しない問題を修正しました。popup の「詳しい状況」セクションが取得状況の更新で定期的に再描画されるたびにボタンの DOM 要素が入れ替わり、ボタン本体に登録した click イベントが無効化されていたのが原因です',
      '親コンテナにイベント委譲（event delegation）でクリックを受ける形に変更しました。これでセクションが再描画されてもボタン押下を毎回検知でき、診断ステップ表示や DL 進捗 % 表示も最後まで消えずに進みます',
      '診断中に表示されるテキストも親要素から都度取得するようになり、AI 応答中に裏で再描画が起きても結果が消えにくくなりました'
    ])
  }),
  Object.freeze({
    version: '0.1.219',
    date: '2026-05-07',
    summary: 'AI 診断ボタン 1 クリックでモデル DL → 診断まで自動実行',
    items: Object.freeze([
      'popup「詳しい状況」セクションの「🤖 AI 診断（Gemini Nano）」ボタンを押したとき、これまではオンデバイス AI モデル未 DL の場合「ダウンロードしてください」というメッセージで止まっていました。本バージョンからボタン押下のみで自動的にモデル DL を開始し、DL 進捗（%）を表示しながら完了後そのまま AI 診断を実行するようにしました（1 クリック完結）',
      '初回は約 2GB のオンデバイスモデルの DL が走ります（外部に送信されることはありません、Chrome 内蔵の AI モデルです）。2 回目以降は DL 不要なので押すと即座に診断結果が出ます。Wi-Fi 環境を推奨します',
      'DL の途中で popup を閉じても Chrome 側の DL は継続するので、後で再度開いたときに進捗が引き継がれます。WebGPU 非対応環境や Chrome 138 未満では従来通り「利用不可」メッセージで終了します（こちらは設定変更が必要なため自動化できません）'
    ])
  }),
  Object.freeze({
    version: '0.1.218',
    date: '2026-05-07',
    summary: '公式 iframe を裏で読み込んで全 gift 自動取得',
    items: Object.freeze([
      'これまでギフト履歴や貢献度ランキングを取得するには、配信ページの「ギフト」モーダルや履歴タブを 1 度開く必要がありました。本バージョンから拡張が裏でこれらの画面を読み込み、配信を見るだけで自動的に取得するようにしました',
      '裏読み込みは画面に見えない位置で実行され、配信視聴を一切妨げません。読み込みは配信 1 件につき 1 回、60 秒で自動的に片付けてメモリを開放します',
      'これまで取得できなかった「過去のギフト履歴」「番組参加情報」「貢献度ランキング」が、配信開始から見ていない場合でも popup に表示されるようになります。仕組み上、ニコ生公式の SPA 構造を尊重した形で実現しています'
    ])
  }),
  Object.freeze({
    version: '0.1.217',
    date: '2026-05-07',
    summary: '公式の貢献度ランキングも popup に反映',
    items: Object.freeze([
      'ニコ生公式の「貢献度ランキング」（イベント参加配信のサイドバーに表示される、貢献度の高い順のユーザー一覧）も popup「ユーザー別の応援件数」帯に反映するようにしました。これまで親ページからは別ドメインの iframe 内 DOM にアクセスできず popup に届いていませんでした',
      'v0.1.216 で確立した iframe 越しの取得経路を拡張し、貢献度ランキングと、イベント参加バナー（順位とポイント）も同時に親ページへ送るようにしました。ギフトサイドバーやイベント参加バナーを開いていれば、そのまま反映されます',
      '公式の貢献度ランキングが取れた配信ではそちらが最優先で表示され、取れない配信では従来通り合計 pt 順や投げ回数順のフォールバックで表示します'
    ])
  }),
  Object.freeze({
    version: '0.1.216',
    date: '2026-05-07',
    summary: '公式サイドバー履歴を popup ランキングに反映',
    items: Object.freeze([
      'ニコ生公式の「ギフト」サイドバー（番組へのギフト履歴）から、だれが何 pt 投げたかを集計して popup「ユーザー別の応援件数」帯に合計 pt 順で表示するようにしました。これまで公式サイドバーは別ドメインの iframe にあり拡張から内容を取得できなかったため、popup 側に情報が届かず空のままでした',
      '解決方法: 公式サイドバー iframe に注入された content script が定期的に履歴 DOM を解析し、親 frame（watch ページ）に postMessage で履歴を送る経路を新設しました。親 frame 側で受け取った履歴を、ユーザー名ごとに throwCount + 合計 pt の形に集計してローカル保存しています',
      '同名のユーザーは 1 行に集約します（公式サイドバーには数値 ID が出ないため、表示名で集計する仕様です）。公式ランキングタブが取れる配信ではそちら優先、取れない場合のフォールバックとして本機能が効きます'
    ])
  }),
  Object.freeze({
    version: '0.1.215',
    date: '2026-05-07',
    summary: '匿名ギフトも「ユーザー別の応援件数」に表示',
    items: Object.freeze([
      '匿名で投げられたギフトも、popup の「ユーザー別の応援件数」（公式ランキング・履歴が取れない時のフォールバック表示）に表示するようにしました。これまで匿名ギフトはユーザー識別情報がないとして storage への保存自体を skip していたため、popup に出ない状態でした',
      '同じ表示名の匿名ギフトは 1 人の送信者としてまとめて数えます。表示名で集計する仕様のため、表示名が同じだと内部的に同じ送信者として扱います',
      '内部ラベル（ニコ運営が割り当てる識別子）のみの匿名ギフトは表示価値がないため従来通り表示対象外とします'
    ])
  }),
  Object.freeze({
    version: '0.1.214',
    date: '2026-05-07',
    summary: '匿名ギフトも「ギフト送信者観測数」に集計',
    items: Object.freeze([
      '匿名で投げられたギフトも、表示名があれば「ギフト送信者観測数」に数えるようにしました。これまでは匿名ギフトを完全に対象外としていたため、匿名ギフトだけ来た配信では観測数が 0 のまま表示されていました',
      '同じ表示名の匿名ギフトは 1 人の送信者としてまとめて数えます。同じ表示名で複数の方が居る可能性はありますが、表示の見え方を優先する仕様です',
      'popup「ユーザー別の応援件数」表示への匿名ギフト反映は、次バージョン以降で対応予定です'
    ])
  }),
  Object.freeze({
    version: '0.1.213',
    date: '2026-05-07',
    summary: 'AI 診断ボタンの挙動を逐次表示に',
    items: Object.freeze([
      'AI 診断ボタンを押しても表示が変わらないという報告があったため、各処理ステップを逐次表示に変更しました。クリック検知 → Built-in AI 検出 → prompt 構築 → AI 実行 までの 4 ステップで進捗が見えます',
      'Built-in AI が利用できない環境では、その state（unavailable / downloadable / downloading）と理由（reason）を表示し、Chrome 138+ + WebGPU + chrome://flags / chrome://components 有効化の手順を案内します',
      'コンソール（DevTools の console）にも各ステップのログを出力するようになりました。デバッグ時に実際にどこで止まっているかが追跡可能です'
    ])
  }),
  Object.freeze({
    version: '0.1.212',
    date: '2026-05-07',
    summary: 'popup に AI 診断ボタン（Gemini Nano）',
    items: Object.freeze([
      'popup の「ユーザー別の応援件数が多い順」セクションに「AI 診断（Gemini Nano）」ボタンを追加しました。クリックすると、Chrome の Built-in AI（Gemini Nano）が拡張のエラーログ・ネットワーク異常・診断警告を 3 行（主因 / 対処 / 備考）でまとめて表示します。完全オンデバイス実行で外部送信なし、ユーザーコストもゼロです',
      'Built-in AI が利用できない環境（Chrome 137 以前 / WebGPU 非対応 / モデル未ダウンロード）では、その理由を分かりやすく表示します。Chrome 138+ で WebGPU 対応の PC なら、初回クリックでモデルが自動的に有効化される想定です',
      '入力データは AI 共有診断 fastCache から自動取得します。コンソールエラー / ニコニ広告 fetch エラー / multi-tab race 警告 / 自動オープン失敗 / ギフト event 観測数などを集約して prompt にまとめ、AI に主因推定を依頼する流れです'
    ])
  }),
  Object.freeze({
    version: '0.1.211',
    date: '2026-05-07',
    summary: 'ギフト誤計上を解消 + AI 診断基盤',
    items: Object.freeze([
      'v0.1.210 で導入したギフトイベント取得経路（msg.1 fallback）が、ニコニコ側のシステムイベント（nx:gift:show 等）も誤ってギフトとして計上していたため、prefix が「nx:」「system:」「event:」のアイテム ID を除外するようになりました。これで「ギフト 100 件取得」という誤った観測値が、実際の件数に近づきます',
      'msg.24 で配信される「nx:gift:show」イベント（ギフト表示通知）を専用デコーダで解析するようになりました。送り主名（advertiserName）とポイント（adPoint）を取り出し、本物のギフト経路として popup に反映する基盤になります',
      'AI 診断ボタン用の純関数 popupAiDiagOrchestrator を追加（未公開、popup UI への組み込みは次バージョン以降）。Built-in AI（Gemini Nano）の利用可否判定、エラーログから AI プロンプト構築、AI 実行、結果整形までを 1 関数にまとめました'
    ])
  }),
  Object.freeze({
    version: '0.1.210',
    date: '2026-05-07',
    summary: 'ギフトイベントの取得経路を msg.1 fallback に拡張',
    items: Object.freeze([
      'NDGR ギフトイベントが従来の決め打ち経路（msg.8）に来ず、コメントと同じ msg.1 で来ていた可能性が v0.1.209 の観測強化で判明したので、コメントとして解析できなかった msg.1 を「ギフトイベント候補」として再解析するようになりました。アイテム名（stamp_xxx 等の固定形式の文字列）が取れた場合のみギフトとして記録するため、誤検出は強く抑えられています',
      'msg.2 / msg.3 / その他の未知 field でもアイテム名が含まれていればギフトとして記録するようになりました。これによりニコニコ側プロトコルの差し替えに対して柔軟に追従できる構造に',
      '本版でギフト取得率が改善した場合、ギフト送信者のニックネーム解決も同時に復活する見込みです（同じ event payload に advertiserName が含まれているため）'
    ])
  }),
  Object.freeze({
    version: '0.1.209',
    date: '2026-05-07',
    summary: '未知 NDGR field の中身を診断に出す（緊急）',
    items: Object.freeze([
      'NDGR ギフトイベントが想定 field（v0.1.204 で proto 原本準拠に直した経路）に来ず、別 field（実機観測で msg.3 と top.11）に化けている可能性が浮上したため、未知 field の中身を最大 3 件サンプル保存して AI 共有診断 JSON に出すようにしました。次回の診断バンドルで真のギフト経路を特定する手がかりになります',
      '具体的には ndgrUnknownSamples フィールドが診断に追加されます。各サンプルには byteSize / 先頭 96 byte の hex プレビュー / 中の field 番号ヒストグラム / 文字列フィールドの先頭 3 件が含まれ、ギフトの送り主・アイテム名・ポイントが見えるはずです',
      '本版自体ではギフト取得率は変わりません（次版以降でデコード経路を真の field に合わせる予定）。ユーザー名が「u スラッシュ ID」のような fallback 表示になる事象も同根です（NDGR ギフト経由でニックネーム解決する設計が機能していなかったため）'
    ])
  }),
  Object.freeze({
    version: '0.1.208',
    date: '2026-05-07',
    summary: 'popup の応援アイコン取得率を改善',
    items: Object.freeze([
      'popup の応援グリッド／コメント一覧／応援ストーリーで、配信者ページから直接取れなかったユーザーのアイコン（avatar）を、ユーザー ID から自動生成して表示するようになりました。これまで「サムネあり匿名」で空のままだった視聴者のアイコンが、ニコニコ公式の確定パターン（secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/...）から復元されます',
      '内部的には rememberedAvatarUrlForUserId 関数の最終 fallback を「空文字を返す」から「ユーザー ID から生成 URL を返す」に変更しました。strong cache や STORY_SOURCE 由来の URL がある場合はこれまで通りそちらを優先します（v0.1.206 prep の純関数 pickAvatarUrlForUid を活用）'
    ])
  }),
  Object.freeze({
    version: '0.1.207',
    date: '2026-05-07',
    summary: 'ギフトイベントを時系列で保存（ranking 表示の基盤）',
    items: Object.freeze([
      'NDGR ギフトイベントを個別の時系列ログとして保存するようになりました。v0.1.204 で proto 準拠の解析が直り、v0.1.205 で必要な新フィールドが揃ったので、ようやく実用化できる段階に到達。これにより各ギフトの送り主・アイテム名・ポイント・貢献ランキング順位が記録され、次バージョン以降で popup の応援ランキング・ギフト履歴表示に活用されます',
      '配信ごとに別キーで最新 500 件まで FIFO で保持しています。既存の応援者リスト（同一ユーザーを件数で集約する形式）はそのまま残し、両系統を並走させています',
      'Built-in AI（Gemini Nano）連携の基盤ライブラリと CI 失敗を未然に防ぐ pre-push チェックを v0.1.205 で先行投入済、popup の応援アイコン解決ライブラリと個別ギフトの時系列保存ライブラリを v0.1.206 で先行投入済。本版でようやく拡張本体への組み込みが始まります'
    ])
  }),
  Object.freeze({
    version: '0.1.204',
    date: '2026-05-07',
    summary: 'NDGR ギフトイベントの取得経路を proto 原本準拠に修正',
    items: Object.freeze([
      'NDGR Protobuf streaming のギフトイベント decoder を、proto 原本（n-air-app/nicolive-comment-protobuf の atoms.proto）準拠に書き直しました。過去の経験的な field 番号（fn=1 を userId、fn=2 を name と仮定）が proto 仕様と齟齬していたため、v0.1.203 までギフトイベントカウンタが 0 のまま動かなかった真因を解消しました。item_id / point / item_name / contribution_rank / message も decode 対象に追加',
      'anonymous gift（advertiser_user_id 欠落のイベント）も _ndgr.gifts カウンタに含めるようにしました。表示・履歴側への活用（ranking 構築 / avatar 補完 / 履歴一覧）は v0.1.205 以降で段階的に追加予定です',
      '24h を超えた過去配信の event-dom 残骸（v0.1.203 で eventDomLvCount=49 まで膨れていた multi-tab race 警告の主因）を、popup 起動時の snapshot 構築直前に storage から自動削除するようにしました（v0.1.203 で先行実装していた純関数 pruneStaleEventDomLvs の本体統合）'
    ])
  }),
  Object.freeze({
    version: '0.1.203',
    date: '2026-05-06',
    summary: 'viewer ID と avatar 経路を抜本改善',
    items: Object.freeze([
      'viewer ID（ログイン中ユーザー識別子）を埋め込みデータ経路（script タグの data-props 内 JSON）から取得する fallback を追加しました（streamlink / yt-dlp が使う安定経路、SSR で必ず埋まる）。これまで header の DOM スコアリングだけに頼って空になっていた状態を解消',
      'ニックネームと avatar URL も埋め込みデータから取れる場合は優先採用し、avatar URL が取れない場合は UID から確定パターン（secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/[UID÷10000]/[UID].jpg）で生成して補完します。「サムネあり匿名」事象の構造的解消',
      'ギフトサイドバー履歴の取得失敗理由（cross_origin_iframe_only / no_iframe_found / iframe_present_but_no_history）を診断 JSON と popup「詳しい状況」に明示。「scrape 失敗 = 異常」ではなく「クロスオリジン iframe は仕様、NDGR 経路で代替予定」と説明される構造に',
      '過去の watch lv 残骸（multi-tab race 警告の真因）を 24h TTL で cleanup する純関数を追加。content-entry.js への組み込みは v0.1.204 以降で段階導入'
    ])
  }),
  Object.freeze({
    version: '0.1.202',
    date: '2026-05-06',
    summary: '詳しい状況に取得状況サマリを表示',
    items: Object.freeze([
      'popup「詳しい状況（開発・切り分け用・折りたたみ）」セクションに、AI 共有診断 JSON と同じ情報源から生成した取得状況サマリ（ギフト観測 / ギフトサイドバー履歴 / 応援ランキング自動オープン / 貢献度ランキング / multi-tab race 警告 / avatar 取得率 / viewer ログイン状態 / network 接続）を表で表示するようになりました。AI に診断を貼らなくても popup を見るだけで状況がわかります',
      '応援ランキング自動オープンが「banner 出ず」で止まる原因（v0.1.201 で診断 JSON に追加した lastFailureReason）が popup の表上でも 1 トークン + hint テキストで見えます',
      '複数 watch タブによる DOM 残骸（過去 lv 大量 / nicoad 不一致）の警告（v0.1.201 staleDomBundleSuspected）が popup の表上でも ⚠️ で見えます'
    ])
  }),
  Object.freeze({
    version: '0.1.201',
    date: '2026-05-06',
    summary: '診断 JSON 統合強化（説明不要レベルへ）',
    items: Object.freeze([
      '不具合報告時に AI 共有診断 JSON を貼るだけで原因が特定できるよう、6 ブロック（giftSubAppDiag / domStructureProbe / consoleErrorProbe / networkErrorProbe / lastFailureReason / staleDomBundleSuspected）を 1 つの診断にまとめました',
      'ギフトサイドバー履歴の集計（送り主・上位アイテム・iframe 数など）が popup 表示と診断 JSON で完全に一致するようになりました',
      'ranking 自動オープンが「banner 出ず」で停止する原因（sidebar が空 / button 未検出 等）を 1 トークンで表示します（rankingDiag.autoOpen.lastFailureReason）',
      '複数 watch タブ起因の DOM 残骸（過去 lv が大量に混入 / 現在の lv が見つからない等）を staleDomBundleSuspected 警告フラグで明示します',
      'nicoad 取得・NDGR 接続・Service Worker 状態を 1 ブロック networkErrorProbe にまとめ、network 層の異常を一括観測できます',
      'JS の捕捉エラー（広告ブロッカー由来は無視リストで除外）を ring buffer で集約し、直近 50 件まで診断に含めます'
    ])
  }),
  Object.freeze({
    version: '0.1.200',
    date: '2026-05-06',
    summary: 'おすすめ生放送のコメント汚染を修正',
    items: Object.freeze([
      'watch ページ右側「おすすめ生放送」セクションが拡張のコメント記録に混入し、配信タイトル（「LIVE」「N分経過」等）や他配信者の配信ID（lvXXXXXXX）がコメントとして保存されていた真因を修正しました（複数件コメントしているのに 1 件しか反映されない問題の真因）',
      'CSS Modules ハッシュ命名（___program-card-list___HASH 等）に追随する部分一致 selector でおすすめ列の DOM を識別し、comment scraper の経路から物理的に除外（isInsideRecommendedLiveSection ガード）',
      '過去に汚染した記録を popup 起動時に 1 回だけ自動除去する migration を同梱（flag nls_backfill_remove_recommended_live_pollution_v1）',
      '診断 JSON に recommendedLiveSectionDiag ブロックを追加し、おすすめ列の存在 / カード件数 / 汚染源候補数を可視化（再発検知）'
    ])
  }),
  Object.freeze({
    version: '0.1.198',
    date: '2026-05-06',
    summary: 'ギフトサイドバー履歴を popup に取込',
    items: Object.freeze([
      'ニコ生ギフトサイドバーの「履歴」タブに表示される 60+ 件の個別ギフトと、種類別集計（33 種類）を popup へ取り込めるようになりました',
      'ギフトサブアプリは iframe 内に描画されるため、これまで popup には 1 件しか反映されていなかった真因を解消（同一 origin の全フレームをスキャン）',
      'popup 下部の「ギフトサイドバー履歴」セクションを開くと、送り主・アイテム・pt・時刻が一覧で見えます'
    ])
  }),
  Object.freeze({
    version: '0.1.196',
    date: '2026-05-06',
    summary: '過去のギフト誤記録を起動時に自動除去',
    items: Object.freeze([
      'v0.1.172 〜 v0.1.194 までの間に「○○さんがギフト「XXX（Npt）」を贈りました」というニコ生ギフトシステム文言が通常コメントとして保存されていた汚染を、popup 起動時に 1 回だけ自動除去します（v0.1.195 の根本 fix の後始末）',
      'migration は flag `nls_backfill_remove_gift_system_msgs_v1` で 1 回だけ実行、失敗してもユーザー操作を妨げません（次回 boot で再試行）',
      '影響：「ユーザー別応援件数」「サムネ付き応援グリッド」などからコメントしていない人が消え、表示が真に「コメント数」に整合します'
    ])
  }),
  Object.freeze({
    version: '0.1.195',
    date: '2026-05-06',
    summary: '複数タブでランキング消失を修正、表示名解決を強化',
    items: Object.freeze([
      '複数の watch タブで同じ配信を開いていたとき、片方の観測値で応援ランキングが消えることがある問題を修正（content-entry.js の保存処理を 3-way merge に変更）',
      '応援ランクストリップで数値 uid + ニックネーム空のとき「（未取得）」が出る問題を修正し、「u/数字」形式で表示するようにしました（ペチパーライス問題）',
      'NDGR の内部ラベル「YYYYMMDD_unei_niconico_NN」が nickname として誤採用される問題を修正（めがくろさんの「202408unei_niconico_27」誤表示）',
      'NDGR ギフトシステムメッセージを通常コメントとして記録しないようにしました（コメントしていないユーザーが「ユーザー別応援件数」に混入する問題を真因 fix）',
      '応援ランクストリップの「匿名後送り」trigger をデフォルト OFF に変更し、件数降順を尊重するようにしました（明示有効化はオプションとして残します）',
      'AI 共有診断（NLS_AI_SHARE_PAGE_DIAGNOSTICS）の取得を frameId=0 固定から watch 一致フレーム優先に変更（codex P0-2）',
      'LP（tsuioku-no-kirameki/index.html）に「統合状況スナップショット」紹介セクションを追加（6 コンポーネント、TDD 実装、誇張防止の文言）'
    ])
  }),
  Object.freeze({
    version: '0.1.192',
    date: '2026-05-06',
    summary: 'AI連携サーバ（ローカル）を追加',
    items: Object.freeze([
      'AI から拡張のデータを参照できるローカル MCP サーバ（Node 製）を tools/mcp-nicolive/ に追加しました。外部送信はせず、ダウンロードフォルダの JSON だけを読みます',
      '使い方は tools/mcp-nicolive/README.md を参照してください'
    ])
  }),
  Object.freeze({
    version: '0.1.191',
    date: '2026-05-06',
    summary: 'AI連携用JSONを手動でDLできるボタンを追加',
    items: Object.freeze([
      'popup の「記録サマリの推移」セクションに「MCP用JSONを保存」ボタンを追加しました。AI 連携の手動エクスポートとして使えます',
      '保存先は Downloads フォルダ内の nicolivelog-mcp フォルダです。同じ配信なら上書き保存されます'
    ])
  }),
  Object.freeze({
    version: '0.1.190',
    date: '2026-05-06',
    summary: 'プレイヤーオーバーレイのギフト演出を即パース',
    items: Object.freeze([
      'プレイヤー画面に流れる「○○さんがギフト〜を贈りました」の演出から、送信者名を即座に取り込むようになりました（コメント欄が画面外でも捕捉できるルートです）',
      'ギフト関連の DOM 構造を診断 JSON に詳細出力するようにしました（giftSidebarVerboseProbe）。ニコ生側のクラス名が変わっても、どの命名で描画されているかが次回診断で判別できます'
    ])
  }),
  Object.freeze({
    version: '0.1.189',
    date: '2026-05-06',
    summary: 'AI連携用データを5秒ごとに保存しはじめます',
    items: Object.freeze([
      'AI 連携の足場として、ギフト・広告・ランキングの観測値を 5 秒ごとに正準形（Canonical Snapshot）にまとめて、拡張のローカルストレージに保存しはじめました。表示や記録の動作には影響しません',
      'まずは記録のみ。手動エクスポート機能と Node MCP server (PoC) は次バージョン以降で順次実装します'
    ])
  }),
  Object.freeze({
    version: '0.1.188',
    date: '2026-05-06',
    summary: 'MCP連携データの検証と統合libを追加',
    items: Object.freeze([
      'AI 連携データの構造チェック関数（validateLiveMcpSnapshot）を追加し、不正な値があれば理由付きで弾けるようにしました',
      '複数の観測データを 1 つに統合する関数（mergeLiveMcpSnapshot）を追加しました。古い世代で新しい値を上書きしない、別配信のデータは混ぜない、入力順に依存しない、を担保しています',
      'まずは関数のみで実装は次バージョン以降。表示や記録の動作には影響しません'
    ])
  }),
  Object.freeze({
    version: '0.1.187',
    date: '2026-05-06',
    summary: 'MCP連携の正準データを組み立てるlibを追加',
    items: Object.freeze([
      'AI 連携のために、拡張の観測値（NDGR / DOM 由来）を 1 つの正準データに組み立てる純粋関数を追加しました（src/lib/mcpBridge/buildLiveMcpSnapshot.js）。',
      'まずは関数のみで実装は次バージョン以降。表示や記録の動作には影響しません'
    ])
  }),
  Object.freeze({
    version: '0.1.186',
    date: '2026-05-06',
    summary: 'MCP連携の正準データ型を新設（schema lib）',
    items: Object.freeze([
      'AI 連携の足場として、ギフト・広告・ランキングの値を「値・取得元・経過時間・未取得理由・信頼度」の組で表す Canonical Snapshot 型を追加しました（src/lib/mcpBridge/schema.js）。',
      'まずは型定義のみで実装は次バージョン以降。表示や記録の動作には影響しません'
    ])
  }),
  Object.freeze({
    version: '0.1.185',
    date: '2026-05-06',
    summary: 'ギフト欄の出現をハッシュclass対応で即検知',
    items: Object.freeze([
      'ニコ生側のクラス名が `___contribution-ranking-list___xxx` のような CSS Modules 形式になっていても、ギフト履歴やランキング枠の出現を即座に検知して取り込むようになりました（部分一致 selector を併設）',
      'コメント欄に「○○さんがギフト〜を贈りました」が流れた瞬間も自動取り込みの対象になり、これまで virtualization で消えていたギフト送信者の取り逃しが減ります'
    ])
  }),
  Object.freeze({
    version: '0.1.184',
    date: '2026-05-06',
    summary: '診断JSONに値とソースと未取得理由を一緒に出す',
    items: Object.freeze([
      '診断 JSON に officialValuesV2 ブロックを追加し、ギフト点数・広告pt・イベント順位・タイトルなどを「値・取得元（source）・取得経過時間（ageMs）・未取得理由（reason）」の組で出すようにしました',
      '未取得理由は no_field（取得元に値がない）/ stale（60秒以上古い）/ null（最新）のいずれかで判別できます。次バージョン以降の正規化レイヤー設計の入口になります'
    ])
  }),
  Object.freeze({
    version: '0.1.183',
    date: '2026-05-06',
    summary: '「（未取得）」表示をu/IDフォールバックに置換',
    items: Object.freeze([
      'ユーザーレーンの ストーリー表示で「（未取得）」になっていた箇所を、ID から「u/1127518」のような表示に置き換えました（0.1.182 で追加した formatNicknameWithUidFallback を popup の story 表示にも適用）',
      '匿名形式の uid（a:xxx）はこれまで通りの表示（既存挙動を壊さない）'
    ])
  }),
  Object.freeze({
    version: '0.1.182',
    date: '2026-05-06',
    summary: 'ユーザーレーン表示でuidフォールバックを適用',
    items: Object.freeze([
      'ユーザー一覧（応援レーン）で、ニックネームが解決できないユーザーが「u/4814023」のような ID 表示で出るようになりました（これまでは「匿名」表示でアイコンだけ見えていた事象を解消）',
      'pickGiftRankDisplayNicknameWithUidFallback 関数を追加し、ユーザー候補の集約処理で順次切り替えました。ギフトクイック・ランクストリップなど他の表示は次バージョン以降で順次対応します'
    ])
  }),
  Object.freeze({
    version: '0.1.181',
    date: '2026-05-06',
    summary: 'サムネあり匿名にuidフォールバック表示を導入',
    items: Object.freeze([
      'コメント送信者のニックネームが空でも、ID（数値）が分かれば「u/4814023」のような ID 表示にフォールバックする関数を追加しました（formatNicknameWithUidFallback）',
      '0.1.180 の診断で「avAndNick=0、avNoNick=3」が確定し、avatar URL は ID から自動合成される一方でニックネームが空のケースが多いと判明したため対処。表示は v0.1.182 以降で順次切り替えます'
    ])
  }),
  Object.freeze({
    version: '0.1.180',
    date: '2026-05-06',
    summary: 'サムネあり匿名の真因観測ブロックを正しい設計で再構築',
    items: Object.freeze([
      'avatarNicknameMatchDiag を追加し、interceptedAvatars と interceptedNicknames の集合関係（avAndNick / avNoNick / nickNoAv）と avNoNick のサンプル 5 件を診断 JSON に出すようにしました（0.1.179 の avatarUidDiag は interceptedUsers 経路の観測で実態と合っていなかった）',
      'pinCommentProbe で hit があった selector の DOM サンプル（tag / class / text / innerHTML 抜粋）を 3 件まで dump するようにしました（ピン留めコメントの DOM 構造を特定するため）'
    ])
  }),
  Object.freeze({
    version: '0.1.179',
    date: '2026-05-06',
    summary: 'サムネありで匿名扱いになる原因を診断に観測',
    items: Object.freeze([
      'コメント記録のうち「アバター画像は取れているのに userId が空（匿名扱い）」のケース数とサンプルを診断 JSON に出すようにしました（avatarUidDiag）',
      'ピン留めコメント関連の class（pin / operator / anchor-comment / fixed-comment / data-pinned / data-pin）の DOM 出現数を診断 JSON に出すようにしました（pinCommentProbe）',
      '次回診断を取れば、サムネあり匿名扱いの真因（intercept の uid 解決経路 / ピン留め DOM 構造）が確定します'
    ])
  }),
  Object.freeze({
    version: '0.1.178',
    date: '2026-05-06',
    summary: '別配信のデータが混入しないようlive整合ガードを強化',
    items: Object.freeze([
      'NLS_EXPORT_INTERCEPT_CACHE と NLS_AI_SHARE_PAGE_DIAGNOSTICS の応答に liveId と frameHref を含めるようにしました',
      'popup 側で受け取った応答の liveId が現在の watch URL と一致しない場合は反映を拒否するようにしました（複数 watch タブ間の混線を防止）',
      '反映拒否時は AI 共有診断の取り込みコードに live_mismatch を出すようにしました（原因切り分けがしやすくなります）'
    ])
  }),
  Object.freeze({
    version: '0.1.177',
    date: '2026-05-06',
    summary: 'ギフト送信者に順位プレフィックスが混入する事象を修正',
    items: Object.freeze([
      'コメント欄のギフト文字列が「【ギフト貢献4位】エマさんがギフト〜」のように順位プレフィックス付きで来るケースで、送信者名に「【ギフト貢献4位】」が混入していた事象を直しました',
      '順位は別フィールド（rank）として切り出し、診断 JSON の topSenders に latestRank として表示するようになりました'
    ])
  }),
  Object.freeze({
    version: '0.1.176',
    date: '2026-05-06',
    summary: 'NDGR経由のギフトもパース＋DOMスキャン観測強化',
    items: Object.freeze([
      'NDGR チャットの経路でもギフト文字列をパースするようになり、ギフトサイドバーが開けない番組や DOM virtualization で表示外のギフトでも、NDGR から流れてくる文字列だけで送信者を取得できます',
      '0.1.175 でコメント DOM 経由のギフト取得が 0 件だった原因を特定するための観測（scanProbe）を診断 JSON に追加しました（iframe数・table-row数・data-comment-type 内訳・サンプル class 名・サンプル文字列）'
    ])
  }),
  Object.freeze({
    version: '0.1.175',
    date: '2026-05-06',
    summary: 'コメント文字列からギフト送信者・アイテム・ptを抽出',
    items: Object.freeze([
      'コメント欄に流れる「○○さんがギフト「XXX（Npt）」を贈りました」のテキストから、送信者名・アイテム名・ポイントを自動で抽出するようになりました',
      'これによりギフトサイドバーが開かない番組でも、コメント DOM 経由でギフト送信者の集計が取れます',
      '診断 JSON に giftCommentDiag ブロック（送信者別合計・アイテム別件数・top10）と「ギフトサマリ」の「コメントDOM由来ギフト観測数」「pt合計」を追加しました'
    ])
  }),
  Object.freeze({
    version: '0.1.174',
    date: '2026-05-06',
    summary: 'ランキングタブ自動オープンの強化と日本語サマリ追加',
    items: Object.freeze([
      '貢献度ランキングのタブ自動切替を強化しました（部分一致と selector 拡張で「ランキング」「Ranking」「貢献」を含むタブを広く検出）',
      'ランキングタブ click 時にステルス CSS の pointer-events を一時解除し、Vue 側で click event が遮断される問題に対処しました',
      '自動オープンが空回りした時に、ギフトサイドバー内のクリック可能要素のテキスト・class 名を診断 JSON に dump するようにしました（次回診断で原因特定を確実にする観測）',
      '診断 JSON に「ギフトサマリ」「ランキングサマリ」の日本語キーを追加し、状況がパッと見て分かるようにしました'
    ])
  }),
  Object.freeze({
    version: '0.1.173',
    date: '2026-05-06',
    summary: '診断シートにランキング・タブ・ギフト送信者の観測情報を集約',
    items: Object.freeze([
      'AI 診断 JSON に rankingDiag / multiTabDiag / giftSenderDiag / nicknameDiag を追加し、ランキング表示が出ない原因を 1 か所で読めるようにしました',
      'NDGR 経由のギフト送信者（user_id）を lifetime で観測し、ニックネーム解決状況とあわせて診断に表示します',
      'ランキング各種（貢献度・ギフト履歴・イベントバナー・広告）の取得回数と最終取得時刻を診断に出します',
      '他配信タブの保存状況（イベント DOM / ニコニ広告）も診断に表示し、複数タブ干渉の切り分けに使えるようにしました'
    ])
  }),
  Object.freeze({
    version: '0.1.172',
    date: '2026-05-06',
    summary: '非コメユーザーの混入を集計から除外',
    items: Object.freeze([
      'コメントを 1 度もしていないユーザーがギフト送信などで「ユーザー別の応援件数」に混入していた事象を直しました（lv350459157 でポンコツびぃちゃんさんが非コメで混入する事例で確認）',
      'HTML レポートのユーザー別件数も同様にコメントを投げた人だけに絞られるようにしました'
    ])
  }),
  Object.freeze({
    version: '0.1.171',
    date: '2026-05-05',
    summary: 'ニコニ広告ページを開いた時に取り込み',
    items: Object.freeze([
      'ニコニ広告ページ（その番組をニコニ広告するボタンの先のページ）を別タブで開くと、貢献度ランキングが自動で記録に取り込まれるようになりました',
      'これまでは取得できなかった広告ポイント順のランキングが、ニコニ広告ページを 1 度開けばそのまま反映されます'
    ])
  }),
  Object.freeze({
    version: '0.1.170',
    date: '2026-05-05',
    summary: '広告貢献度の取得状態を診断に出す',
    items: Object.freeze([
      'ニコニ広告ページからの取得が成功しているか失敗しているかを診断情報で確認できるようにしました（fetch ステータスを popup の診断JSONに露出）'
    ])
  }),
  Object.freeze({
    version: '0.1.169',
    date: '2026-05-05',
    summary: '広告貢献度ランキングを別経路で取得',
    items: Object.freeze([
      'ニコニ広告ページから「広告ポイントの貢献度ランキング」を直接取得するようにしました（モチベーション源として、配信中でも一覧で見えるように）',
      '取得したランキングは記録の保存に使われ、診断情報からも確認できるようになりました（popup 上での見せ方は次のバージョンで仕上げます）'
    ])
  }),
  Object.freeze({
    version: '0.1.168',
    date: '2026-05-05',
    summary: '貢献度ランキングを popup で読めるように',
    items: Object.freeze([
      'ニコニコの「貢献度ランキング」が popup に表示されない不具合を直しました（取得対象の DOM 構造が実物と違っていたのが原因）',
      'ランキングは popup の上部に「1位 むんたさん 15,200貢」のように並びます。応援者の名前と貢献ポイントがそのまま見えます',
      '広告ポイントランキングは次のバージョンで追加します（モチベーション源として）'
    ])
  }),
  Object.freeze({
    version: '0.1.167',
    date: '2026-05-05',
    summary: 'ツールバー押しても何も出ない事故を修正',
    items: Object.freeze([
      'インラインパネルが画面の上下に隠れて見えない状態のまま「見えている」と誤判定して、ツールバーを押しても popup 窓も出ない事故を直しました（画面に見える形で出ない時は普通の popup 窓を開くようフォールバック）'
    ])
  }),
  Object.freeze({
    version: '0.1.166',
    date: '2026-05-05',
    summary: 'イベント不参加時の順位表示を撤去',
    items: Object.freeze([
      'イベントに参加していない配信なのに「ニコ生現在 50 位」のような順位が popup に表示される誤情報を直しました（公式バナーが取れた時だけ表示するように変更）',
      '「履歴」「ランキング」タブの DOM が公式と一致しているかを確認するための診断情報を追加しました（次の修正に必要なデータを集めるため）'
    ])
  }),
  Object.freeze({
    version: '0.1.165',
    date: '2026-05-05',
    summary: '「読み込み中」が消えない事故を防ぐ',
    items: Object.freeze([
      'popup を開いた直後の「読み込み中…」の絵が、なんらかの不具合で消えなくなっても、最大 15 秒後に必ず自動で消えるよう二重の安全網を入れました',
      '拡張の更新が部分的にしか反映されなかった場合でも、永遠に読み込み画面に固まらず popup の中身を表示するようにしました'
    ])
  }),
  Object.freeze({
    version: '0.1.164',
    date: '2026-05-05',
    summary: '貢献度ランキングを履歴からも掬う',
    items: Object.freeze([
      'ニコ生公式の「貢献度ランキング」タブの DOM をそのまま読み、応援者の名前と貢献ポイントを popup に表示するようにしました',
      'ランキングタブを開いていなくても、「履歴」タブの個別ギフトをユーザー単位で合算して同様に表示するフォールバックを追加しました',
      '順位が公式値で取れた時のラベルを「イベント現在 N 位」、NDGR 経由の汎用順位を「ニコ生現在 N 位」と分けて表記し、間違いを誤情報として出さないようにしました'
    ])
  }),
  Object.freeze({
    version: '0.1.163',
    date: '2026-05-05',
    summary: 'おさらいを漫画コマ風に',
    items: Object.freeze([
      'HTML レポートとマーケ分析の冒頭の「今回の放送のおさらい」を、コマ割り・吹き出し・強調数字・擬音語のついた漫画コマ風レイアウトに作り変えました',
      '画面幅に合わせて顔とフォントが拡縮するレスポンシブ設計（clamp + container query）にし、スマホでもPCでも読みやすくしました',
      '上位応援者は3人会話、捕捉率の良し悪しでこん太の表情と背景色が変わるなど、シーンごとに見た目が動くようにしました'
    ])
  }),
  Object.freeze({
    version: '0.1.162',
    date: '2026-05-05',
    summary: '公式DOMから掬った正本値を表示',
    items: Object.freeze([
      'niconico プレイヤー上のリアルタイム5値（来場・コメ・経過・広告pt・ギフトpt）を data-value から直接読み、NDGR 由来の値より優先するようにしました',
      '「○○さんが参加しています！現在 N 位 X」という公式の参加バナーを popup にネイティブで描き、ユーザー操作なしでイベント順位とスコアが見えるようにしました',
      '貢献度ランキングが取得できる場合は、NDGRギフト集計より公式ランキングを優先して表示するようにしました',
      'HTML レポート / マーケ分析の冒頭に「今回の放送のおさらい」というりんく・こん太・たぬ姉の三人解説を入れ、最終数値と上位応援者を読み上げる形にしました'
    ])
  }),
  Object.freeze({
    version: '0.1.161',
    date: '2026-05-05',
    summary: 'コメント表示ズレと診断混線を抑制',
    items: Object.freeze([
      'watch snapshot の liveId が現在の watch URL と合わない結果は採用しないようにし、別放送データが混ざる経路を塞ぎました',
      'refresh 世代が切り替わった後に古い fetch 結果が snapshot キャッシュを書き戻す経路を止め、放送切替直後の表示ズレを減らしました',
      'AI共有の高速診断キャッシュは現在の watch URL と同じ放送のときだけ使うようにし、診断JSONの liveId 混線を防ぎました'
    ])
  }),
  Object.freeze({
    version: '0.1.160',
    date: '2026-05-05',
    summary: '作戦会議UIと三人ガイドを強化',
    items: Object.freeze([
      'マーケ分析HTMLの「次回やること」を、りんく・こん太・たぬ姉の作戦会議として見出しと導線を整理し、吹き出し案内を増やして読みやすくしました',
      'HTMLレポートの次枠メモも三人の解説つきに刷新し、スマホ/PCのどちらでも読みやすい配置に調整しました',
      '「この内容は配信データに応じて毎回変わる」説明を、マーケ分析とHTMLレポートの両方に明記しました'
    ])
  }),
  Object.freeze({
    version: '0.1.158',
    date: '2026-05-04',
    summary: 'のどぐろ経由の公式ギフト指標を反映',
    items: Object.freeze([
      '拡張の版を 0.1.158 にしました。別環境の 0.1.157 より新しい番号で、読み込んだフォルダが正しいか判別しやすくなります',
      'のどぐろ（NDGR）由来の広告pt・番組・イベントのギフト累計・順位・イベント名の popup 表示と、マーケHTMLギフト節の注釈はこの版に含まれます'
    ])
  }),
  Object.freeze({
    version: '0.1.122',
    date: '2026-05-04',
    summary: '公式ギフト指標（NDGR）をpopup表示',
    items: Object.freeze([
      'のどぐろ（NDGR）の statistics を来場者数が無くても拾い、広告pt・番組・イベントのギフト累計・順位・イベント名を watch popup に表示します',
      'マーケ分析HTMLのギフト節に、番組・イベント累計がニコ生公式のギフト指標である旨の短い注釈を追加しました'
    ])
  }),
  Object.freeze({
    version: '0.1.121',
    date: '2026-05-04',
    summary: '同一放送だけ配信者メタを引き継ぎ',
    items: Object.freeze([
      'watch スナップショットの partial-merge で、前枠の配信者名などが別の live に残り続けることがないよう、prev と next の liveId が両方そろい同一のときだけ配信者同一性を引き継ぐようにしました',
      'liveId が片方だけ欠けるときは引き継ぎません（誤結合より一瞬の欠損を優先）'
    ])
  }),
  Object.freeze({
    version: '0.1.120',
    date: '2026-05-04',
    summary: 'マーケ分析とHTMLレポートに次回向けメモ',
    items: Object.freeze([
      'マーケ分析HTMLの先頭に「次回やること」や応援しやすい時間のメモを追加しました。ギフト記録があるときは前後の流れも表示します',
      'HTMLレポートに短い「次回メモ」ブロックを追加しました（保存して後から見返す用途向け）'
    ])
  }),
  Object.freeze({
    version: '0.1.119',
    date: '2026-05-04',
    summary: 'インライン below の挿入点を視聴行ラッパーへ（フル幅の根）',
    items: Object.freeze([
      '動画列の内側だけにホストがあると、祖先の overflow でタブ幅まで広がらないことがありました。動画と公式コメントパネルの両方を含み、幅が視聴行相当の祖先を探してその直後にホストを置くようにしました',
      'プレイヤー行の幅（player_row）の上限計算も、その挿入ブロック基準に合わせます。0.1.118 の margin 補正は引き続き残します'
    ])
  }),
  Object.freeze({
    version: '0.1.118',
    date: '2026-05-04',
    summary: 'タブ幅広げでコメ列下まで届くよう位置を補正',
    items: Object.freeze([
      '動画列の子要素に挿しているだけだと、幅をタブに合わせても右側のコメ列下に余白が残ることがありました。左マージンをビューポート寄りに寄せ、幅を「タブ右端まで」の実測に合わせて再計算します',
      '0.1.117 の max-width 明示と組み合わせて、ワイド時の見た目を揃えます'
    ])
  }),
  Object.freeze({
    version: '0.1.117',
    date: '2026-05-04',
    summary: 'タブ幅広げが親の幅で潰れるのを修正',
    items: Object.freeze([
      'プレイヤー行の下でパネル幅をタブに合わせて広げても、host の max-width が 100% のまま親列の幅にキャップされ、見た目が変わらないことがありました。広げた幅と同じ max-width を指定するようにしました',
      'body 直下フォールバック時も width と max-width を揃え、同様のキャップを避けます'
    ])
  }),
  Object.freeze({
    version: '0.1.116',
    date: '2026-05-04',
    summary: '初回はタブ幅いっぱいにパネルを広げる',
    items: Object.freeze([
      '「下／横付きのときの幅の広げ方」の未設定の既定を「初めての1回だけ」にしました。初めて watch を手前のタブで開いたとき、動画列より広いタブ幅に合わせてパネルを広げます（以降は従来の幅に戻ります）',
      '常に／1回だけ広げるときの目標幅から720pxの上限を外し、タブ幅に近いサイズ（超ワイドは1920pxまで）にしました。body 直下フォールバックの720px上限は従来どおりです'
    ])
  }),
  Object.freeze({
    version: '0.1.115',
    date: '2026-05-04',
    summary: 'インライン幅のタブ合わせを選べる',
    items: Object.freeze([
      '詳細設定に「下／横付きのときの幅の広げ方」を追加しました。従来どおり／タブ幅に近い上限まで常に／初めての1回だけ、から選べます',
      'watch のページ内パネルが設定に応じて幅を広げます。画面下固定・浮遊では無効です。「1回だけ」はタブが手前でパネルが描画されたタイミングで消費されます'
    ])
  }),
  Object.freeze({
    version: '0.1.114',
    date: '2026-05-04',
    summary: '視聴ページの省電力と表示の安定化',
    items: Object.freeze([
      'ページフレームの更新を整理し、スクロールは1フレームに1回、ウィンドウサイズ変更は短い間隔でまとめて処理するようにしました',
      'タブが裏側のときは、動画横パネルの探索や来場者などの統計取得を間引き、CPUの負担を抑えます',
      'インラインパネルの描き直しが重なったあと、画面に固定した表示が付かず位置がずれることがある不具合を修正しました',
      '横付きで幅が足りず自動的に下へ寄せられる場合でも、ブラウザ右側に十分な余白があるときは横並びのまま幅だけ従来どおり決めるようにしました'
    ])
  }),
  Object.freeze({
    version: '0.1.113',
    date: '2026-05-03',
    summary: '記録途切れ防止と新規の配置おすすめ',
    items: Object.freeze([
      'インラインの位置を何度も切り替えたあと、公式コメント欄の差し替えで MutationObserver が古い DOM を見続け、記録が止まることがありました。レイアウト更新のたびに監視ルートを取り直すようにしました',
      '新規インストール時のみ、初めて視聴ページの content が動くときにタブ幅から「横付き／下／画面下」のおすすめを一度だけ自動で書き込みます（既存の保存済み設定は変えません）'
    ])
  }),
  Object.freeze({
    version: '0.1.112',
    date: '2026-05-03',
    summary: '横付き判定をタブ実幅ベースに修正',
    items: Object.freeze([
      'インライン横付きの可否と幅計算で visualViewport 幅だけを使っていたため、ページ拡大などで実タブより狭く見積もり、ワイド表示でも常に「プレイヤー行の下」になることがありました',
      'レイアウト幅（window.innerWidth）を基準にし、狭いときの下への逃がしは従来どおりです。縦横比だけで横付きを止める処理は撤去し、列との隙間が足りないときの自動フォールバックに任せます',
      '設定画面の注意文を、視聴タブの幅で決まる旨に更新しました'
    ])
  }),
  Object.freeze({
    version: '0.1.111',
    date: '2026-05-03',
    summary: '縦長画面では横付きを下へ自動寄せ',
    items: Object.freeze([
      '横付き設定でもウィンドウが縦長のときは実効だけ「プレイヤー行の下」に寄せ、動画や入力と重なりにくくしました',
      'ページの見え方が変わったときは Visual Viewport の変化でもレイアウトが追従します（ズームなど）'
    ])
  }),
  Object.freeze({
    version: '0.1.110',
    date: '2026-05-06',
    summary: '横付きパネル幅をコメ列との実ギャップで算出',
    items: Object.freeze([
      '横付き（beside）でパネルの横幅を「ブラウザ右端までの余白」だけから決めていたため、実際には公式コメント列が動画の右にあるレイアウトで幅が取りすぎになり、flex が折り返して動画や入力欄と重なることがありました',
      '動画カラムと、その右の要素の間に挟める実際のピクセル幅から決めるようにしました。間が狭く最小幅を満たせないときは自動で「プレイヤー行の下」へ寄せます',
      '親フレックスが折り返し（flex-wrap）のときは横付きを避け、同様に下へ寄せます',
      'Chrome の拡張機能一覧とポップアップのバージョン表示が 0.1.110 になります'
    ])
  }),
  Object.freeze({
    version: '0.1.109',
    date: '2026-05-04',
    summary: 'below時のインラインパネルを視聴行付近に寄せる',
    items: Object.freeze([
      '「プレイヤー行の下」など DOM に埋め込む配置では、アンカー候補の選び方によってパネルが関連放送や概要エリアよりずっと下に付き、ページを長くスクロールしないと見えなくなることがありました',
      '合格した候補のうち、いちばん面積の小さいブロック（視聴行に密なラッパー）を優先して選ぶようにし、パネルが視聴エリアのすぐ近くに付くようにしました',
      '画面下固定・フローティングモードは従来どおりです。末尾に固定されたように見えるときは詳細設定の「パネル位置」をご確認ください',
      'Chrome の拡張機能一覧とポップアップのバージョン表示が 0.1.109 になります'
    ])
  }),
  Object.freeze({
    version: '0.1.108',
    date: '2026-05-03',
    summary: 'インラインパネル配置を画面サイズ別に安定化',
    items: Object.freeze([
      '視聴ページを縮めたり縦長レイアウトにすると、プレイヤー行のラッパーが縦に長くなり、アンカー候補の評価から外れてパネルが「動画と公式コメントのあいだ」やページ末尾寄りに付くことがありました。狭く動画が横幅いっぱいに近いときだけ閾値を補正し、適切なブロックの直後に付くようにしました',
      '画面下固定（dock_bottom）や floating での見える範囲の計算に、利用できるとき Visual Viewport API を優先して使うようにしました（ズームやモバイルでのアドレスバー変化などで innerHeight と実表示がずれる場合の dock 高さのブレを抑えます）',
      'Chrome の拡張機能一覧とポップアップのバージョン表示が 0.1.108 になります'
    ])
  }),
  Object.freeze({
    version: '0.1.107',
    date: '2026-05-03',
    summary: '自動テストのインラインパネル配置検証を現仕様に整合',
    items: Object.freeze([
      'GitHub Actions のブラウザ自動テストで、beside（横付き）時に動画とパネルの間へ空白テキストを挟む検証が、環境によって期待値とずれて失敗することがありました',
      '設計どおり「空白が挟まっても毎フレーム DOM を差し替え続けない」ことと、安定後も動画の直前要素としてパネルが論理的に繋がっていることを確認する内容にテストを更新しました（本体の表示ロジックの変更ではありません）',
      'Chrome の拡張機能一覧とポップアップのバージョン表示が 0.1.107 になります'
    ])
  }),
  Object.freeze({
    version: '0.1.106',
    date: '2026-05-03',
    summary: '視聴ページパネルでランキング枠が一瞬出る現象を軽減',
    items: Object.freeze([
      'watch ページに埋め込んだパネル（インライン）で、読み込み直後に「ランキングへ」のオレンジ枠だけが先に見え、そのあと通常の表示に切り替わることがあったので抑えました',
      'ランキング導線は HTML では既定で非表示にし、ツールバーのポップアップなど「実質どこにもニコ生 watch が繋がっていない」ときだけ表示します。視聴タブとして watch が取れたときは出しません',
      'Chrome の拡張機能一覧とポップアップのバージョン表示が 0.1.106 になります'
    ])
  }),
  Object.freeze({
    version: '0.1.105',
    date: '2026-05-03',
    summary: '自動テストのポップアップ検証を安定化',
    items: Object.freeze([
      'GitHub Actions のブラウザ自動テスト（E2E）で、モックの視聴ページとは別タブでポップアップだけを開いたあと、アクティブタブが拡張側と判定され「配信なし」と同じ見た目の CSS がコメント欄を隠してしまい、見えない扱いになることがありました',
      'テスト側で「視聴タブを一度前面にしたうえでポップアップを再読み込みする」共通手順を追加し、視聴中と同じ前提で検証できるようにしました。通常の視聴・ポップアップの動作そのものは変えていません',
      'Chrome の拡張機能一覧とポップアップのバージョン表示が 0.1.105 になります'
    ])
  }),
  Object.freeze({
    version: '0.1.104',
    date: '2026-05-03',
    summary: 'deep gap recovery をさらに強化',
    items: Object.freeze([
      'ライブ中に公式コメント累計と記録件数の差が開いたときの追い quiet deep を、やや敏感にしました（クールダウン・ギャップ閾値）。また NDGR が続いても deep が空きすぎないよう、強制 deep の間隔を短めました',
      '約 2 分ごとの定期 quiet deep は、これまで recovery が不要なときは基本 1 パスでしたが、2 回に 1 回は 2-pass で仮想リスト全域を寄せ直すようにしました（CPU との折り合い）',
      'deep の仮想リスト走査で、スクロール間の待ち時間をわずかに短くしました。公式件数との比率がまだ離れる場合もありますが、取りこぼしを減らす方向の調整です'
    ])
  }),
  Object.freeze({
    version: '0.1.103',
    date: '2026-05-03',
    summary: 'deep harvest 最適化（下端・ギャップ追い）',
    items: Object.freeze([
      '公式コメント欄の仮想リスト走査で、スクロール下端を先にマージしてから上→下へスイープするオプションを deep / 深掘りエクスポートに有効化しました。途中参加でも新しめの帯を早く拾いやすくなります',
      'ライブ中に公式のコメント累計とローカル記録件数の差が大きいときの追加 quiet deep について、クールダウンとギャップ閾値をわずかに緩め、追い取りが少し早く反応するようにしました（終了後の bulk 取得との併用は従来どおり）',
      'Chrome の拡張機能一覧と popup のバージョン表示が 0.1.103 になるよう更新しています。「更新」後に watch ページを再読み込みすると確実です'
    ])
  }),
  Object.freeze({
    version: '0.1.102',
    date: '2026-05-01',
    summary: '0.1.101 が popup 起動を阻害した件を緊急 revert',
    items: Object.freeze([
      '0.1.101 で投入した「userLaneHttpForTilePick の universal rule guard 強化」が、何らかの経路で popup 起動を阻害してしまう不具合を引き起こしました。実機検証で popup が出てこない症状が確認できたので緊急に revert します',
      '機能としての挙動は 0.1.100 と同じに戻ります。grid に broadcaster の顔タイルが残る件は引き続き残課題ですが、popup が動かないほうが優先度高なのでこの判断にしました',
      '原因の特定と安全な再投入は別 commit で。観測層 Phase 1+Phase 2（StatObservation/observationStore）は runtime に触れないので残します'
    ])
  }),
  Object.freeze({
    version: '0.1.100',
    date: '2026-05-01',
    summary: '配信者本人の自コメは story grid から除外',
    items: Object.freeze([
      '配信者が自分の放送で post したコメが story growth grid (タイル系) や集計件数に含まれていた件を修正しました。配信者は応援される側で応援する側ではないため、popup の表示経路（grid / 件数 / lane / ticker）から除外します',
      '修正内容: 純関数 excludeBroadcasterFromCommentEntries を追加し、refresh の displayEntries 構築直後に適用。HTML レポート側では既に同等の inline filter が動いていたので、popup display 経路を統一しました',
      '配信者本人カードは watchMetaCache.snapshot.broadcaster* から別経路で描画されるため、配信者の表示情報自体は失われません。配信者は dedicated card のみに集約されます'
    ])
  }),
  Object.freeze({
    version: '0.1.99',
    date: '2026-05-01',
    summary: 'コメント単位 rendering でも avatar 取り違えを検出',
    items: Object.freeze([
      'rank strip の左端タイル (155 タイル系) に「ID 未取得（DOM に投稿者情報なし）」のコメと一緒に配信者の顔アイコンが乗る現象を修正しました。0.1.98 までは集約 room 単位の sanitize でしか filter していなかったため、コメント単位 rendering を経由するこの経路には届いていませんでした',
      '修正内容: 0.1.83 普遍ルール (isAvatarUrlForUserId) を厳格化。entry uid が空 / niconico 匿名 (a:xxx) の entry に niconico user icon が紐付いていたら必ず reject する。avatar 取り違えガードがコメ・room 両方の表示経路に効くようになります',
      '影響範囲: storyGrowthAvatarSrcCandidate, intercept hydration, profile cache の avatar 採用判定。test stub のような数値でも a:xxx でもない uid は従来どおり判定不可で通すので互換性は維持'
    ])
  }),
  Object.freeze({
    version: '0.1.98',
    date: '2026-05-01',
    summary: '他人の avatar 取り違えも broader に検出',
    items: Object.freeze([
      '0.1.97 までは「現配信者の icon」だけを strip 対象にしていましたが、複数 lv を行き来した時に snapshot の broadcaster uid が前の lv のままになるケースがあり、別 lv の broadcaster や他の viewer の icon が取り違えで残ったままだった件を修正',
      '修正: filter を「現配信者 1 人」に依存させず、avatar URL から niconico uid を抽出して entry uid と一致するかを純粋にチェックするロジックに変更。匿名 (a:xxx) / UNKNOWN entry に niconico user icon が乗っていたら問答無用で strip し、数値 uid entry の URL uid が entry uid と異なれば取り違えとして strip',
      'これで「他の人の icon が別の人にずれて出る」現象も同じ仕組みで補正されます。匿名は identicon に、UNKNOWN は何も表示しない fallback に倒れます'
    ])
  }),
  Object.freeze({
    version: '0.1.97',
    date: '2026-05-01',
    summary: '配信者 icon の取り違えをサイズ違いでも検出',
    items: Object.freeze([
      'rank strip の 1 番目（uid 不明の room）に配信者の顔アイコンが乗ってしまう症状を修正しました。原因は broadcaster icon が `/s/`・`/uri150x150/`・`/m/` などサイズ違いで storage に焼き込まれていた場合、URL 文字列一致で contamination 判定していたために stripped されていなかったことです',
      '修正内容: avatar URL から niconico uid を抽出し broadcasterUid と一致するかで判定するように強化（サイズ違い・query 違いを問わず検出）。URL 文字列一致は uid を含まない非標準 URL の fallback として残しています',
      'これで「ID 未取得（DOM に投稿者情報なし）」のコメントが配信者アイコンを抱き込んで rank strip 1 番目に出る現象が消えます'
    ])
  }),
  Object.freeze({
    version: '0.1.96',
    date: '2026-05-01',
    summary: '診断バンドルに snapshot 情報を追加',
    items: Object.freeze([
      '配信者がりんく lane に出続ける件の原因切り分けのため、AI 共有用診断バンドルに watchMetaCache.snapshot の broadcasterUserId / broadcasterName / viewerUserId を含めるようにしました（個人特定可能情報は既に他経路で扱っているもののみ）',
      'これで「snapshot の broadcasterUserId が空でフィルタが no-op になっている」のか「broadcasterUid は取れているが別経路で混入している」のかが診断バンドル 1 つで判別できるようになります'
    ])
  }),
  Object.freeze({
    version: '0.1.95',
    date: '2026-05-01',
    summary: '配信者が rank strip と専用カードに二重表示される件を修正',
    items: Object.freeze([
      '配信者が自分の放送でコメントを多めにすると、応援ランクストリップの 1〜10 にも入って「専用カード（末尾）」と二重表示されていた件を修正しました。配信者は応援される側で応援する側ではないため、rank strip 集計から明示的に除外します',
      'HTML レポート側で同じ意味の inline filter が既にあったので、新ヘルパー excludeBroadcasterFromRankedRooms に統一（DRY）。将来「集計除外ルール」が変わった時に 1 箇所で済む',
      'avatarResolver.js (0.1.84 で実装、0.1.90 で revert 後 dead code) のヘッダに「現状未配線」明記。再配線時は docs/plan-avatar-resolver-refactor.md の 5 phase に沿う旨を残置'
    ])
  }),
  Object.freeze({
    version: '0.1.94',
    date: '2026-05-01',
    summary: 'INLINE モードで「接続中…」固定の race を根治',
    items: Object.freeze([
      'INLINE モード（拡張をニコ生 watch ページに埋め込んだ状態）で 推定同接 / 来場者数が「（接続中…）」のまま固定される race condition を根治しました。0.1.91-0.1.93 の 3 連続修正でも残っていた症状の真因です',
      '真因: popup-entry.js#refresh() が世代番号で守られている設計だが、watch snapshot の merge も世代の bail-out の後ろにあったため、INLINE polling=10 秒 × slow fetch=最大 11 秒の組み合わせで 1 回目の取得結果が常に破棄されていました',
      '修正内容: snapshot は世代を超える永続キャッシュとして isFreshRefresh() の bail-out より先に merge するよう、純関数 popupWatchSnapshotPersist.js を新設して責務を分離。paint や derived UI 更新は引き続き世代で守る',
      '副作用修正: INLINE モードの visibilitychange 時にも snapshot=null クリアが残っていた漏れを撤去（タブ切替で戻った瞬間に「接続中…」が再点灯する症状の防止）'
    ])
  }),
  Object.freeze({
    version: '0.1.93',
    date: '2026-05-01',
    summary: 'lv 切替時は stale を捨てる修正',
    items: Object.freeze([
      '0.1.92 の stale-while-revalidate で、別配信に切り替わった時も古い snapshot を表示し続けるバグを修正。同じ lv の polling 再 fetch では stale を維持し、別 lv に切り替わった時のみ snapshot をクリアします',
      '効果: 多タブ運用で配信を切り替えても、別放送の数値が表示され続けることがなくなります。同じ放送内の polling では引き続き flicker しません',
      '判定: snapshot.liveId === 現在の lv で「同じ放送」と判定'
    ])
  }),
  Object.freeze({
    version: '0.1.92',
    date: '2026-05-01',
    summary: '数字ちらちら + 接続中固定の根治',
    items: Object.freeze([
      '推定同接 / 来場者数が「（接続中…）」のまま、または ちらちら点滅する症状を根治しました。原因は polling 時に snapshot を null クリアして loading 状態を再表示する設計でした',
      '修正内容: stale-while-revalidate パターンに変更。古い snapshot を fetch 中も保持し続けて表示する。新しい fetch が成功したら ATOMIC に置き換える。fetch 失敗時も古い表示が残る（「接続中…」点滅なし）',
      '具体的には popup-entry.js の polling と refresh で watchMetaCache.snapshot = null を撤去し、古いデータを loading 中も表示用に維持。loading ラベルは初回 fetch のみで表示し、stale snapshot がある場合はスキップ'
    ])
  }),
  Object.freeze({
    version: '0.1.91',
    date: '2026-05-01',
    summary: 'fetch hang を防ぐ + ちくらん URL 修正',
    items: Object.freeze([
      '推定同時接続/来場者数が「（接続中…）」のまま停滞する症状の対策。requestWatchPageSnapshotFromOpenTab の await が例外を投げると後続の watchMetaCache.fetchInflight = false が実行されず、永久に「（接続中…）」が表示される設計上の脆さを修正',
      '修正内容: popup-entry.js の snapshot fetch を try/catch/finally で囲み、例外時も必ず fetchInflight=false に戻す。snapshot は null、fetchError にメッセージを格納して fetch_failed 経路に倒す',
      'これで snapshot 取得失敗時も「（取得不可）」表示に進めるようになり、永久 loading 状態は発生しなくなります'
    ])
  }),
  Object.freeze({
    version: '0.1.90',
    date: '2026-05-01',
    summary: 'avatar refactor の影響切り分け revert',
    items: Object.freeze([
      '0.1.89 後にユーザーから「推定同時接続・来場者数が（接続中…）のまま、記録カウントも安定して出ない」報告があり、0.1.85 の avatar refactor (storyGrowthAvatarSrcCandidate を avatarResolver 化) を念のため revert しました',
      'avatar 取り違え修正（0.1.83 の普遍ルール）は維持。0.1.84 の avatarResolver 基盤コンポーネントも残置（他コードからは未使用）。CSS 系の修正（0.1.86/0.1.89 スクロールバー、0.1.88 パネル位置）も維持',
      '回帰の真因はまだ不明。0.1.90 で症状が変わるか、無関係（環境要因）か切り分けるための退避バージョン'
    ])
  }),
  Object.freeze({
    version: '0.1.89',
    date: '2026-05-01',
    summary: 'スクロールバー 2 重修正（host 側 overflow 撤去）',
    items: Object.freeze([
      '0.1.86 で popup window mode は対処しましたが、複数タブ同時視聴時に inline panel mode（dock_bottom / floating）でも 2 重 scrollbar が出ていました',
      '原因: src/extension/content-entry.js の renderInlinePanelDockBottomHost / renderInlinePanelFloatingHost で host (iframe wrapper) に overflow:auto を設定していたため、iframe 内部の .nl-main scrollbar と二重になっていました',
      '修正内容: 両関数の host.style.overflow を auto → hidden に変更。host は iframe より 16px 大きいだけで内側に余裕があり、外側 scrollbar は不要です。iframe 内部の正規 scrollbar は維持されます',
      'これで複数タブ視聴時も inline panel に scrollbar 1 本だけになります'
    ])
  }),
  Object.freeze({
    version: '0.1.88',
    date: '2026-05-01',
    summary: 'パネルが page 末尾に出るバグの修正',
    items: Object.freeze([
      'ニコ生 SEKIRO 系の縦積みレイアウトで、配信パネルがページの最下部（タグ・関連作品・アドバナーの下）に挿入されてしまう不具合を修正しました',
      '修正内容: src/lib/inlineHostAnchorScoring.js の maxHeightRatioToVideo を 3.5 → 2.0 に絞りました。3.5 だと「video + タグ + 配信者情報 + 関連作品 + アドバナー」までを含む巨大なラッパーまで eligible 判定されてしまい、その直後にパネルが挿入されていました',
      '2.0 では「video + 公式コメント列 + UI 1〜2 段」程度までしか eligible にならず、player の真下に正しく配置されます'
    ])
  }),
  Object.freeze({
    version: '0.1.87',
    date: '2026-05-01',
    summary: 'グリッドが新コメ無しで動くのを修正',
    items: Object.freeze([
      'コメント追加が無いのにアイコングリッドの最後尾が pulse（光る演出）するのを修正しました。avatar URL がキャッシュ補完などで後から埋まる度に「新コメ追加」と同じ演出が走っていました',
      '修正内容: popup-entry.js の syncStoryGrowth 内で、signature の変化（avatar URL 補完等）による再同期では pulseLast: false に変更。新規コメ追加（renderedCount < targetCount）の経路のみ pulseLast: true で光らせる',
      '既存の「新コメが来たら最後尾が一瞬光る」演出は変わりません'
    ])
  }),
  Object.freeze({
    version: '0.1.86',
    date: '2026-05-01',
    summary: 'スクロールバー 2 重の修正',
    items: Object.freeze([
      'popup window が縦に小さい時、html height (580px 等) が viewport を超えると、popup window 自体に scrollbar が出て、内側の .nl-main の scrollbar と二重になっていました',
      '修正内容: extension/popup.html の html:not(.nl-inline) と body の height/max-height を min(--nl-pop-height, 580px, 100vh) でクランプ。viewport を超えないので popup window 側に scrollbar が出なくなり、内部 .nl-main の 1 本のみになります',
      '大画面ではそもそも 2 重にならなかった（viewport が大きいので window scrollbar 不要）ため、本修正は小〜中画面で効果あり'
    ])
  }),
  Object.freeze({
    version: '0.1.85',
    date: '2026-05-01',
    summary: 'avatar 候補解決を resolver 経由に書換',
    items: Object.freeze([
      'popup-entry.js の storyGrowthAvatarSrcCandidate（アイコン列の avatar URL 決定）を、avatarResolver 経由に書き換えました。45 行の手書きガードロジックが 25 行のシンプルな observation 配列構築に置き換えられ、保守性が向上しています',
      '入力ソース 2 種（entry.avatarUrl, profile cache）を AvatarObservation に正規化して resolver に渡す形式に統一。ガード（uid mismatch / broadcaster impersonation / viewer impersonation）はすべて resolver 内で処理されます',
      '挙動は 0.1.84 と同等（既存 7 層ガードと resolver の判定結果が一致）。次の Phase E で旧コード削除予定'
    ])
  }),
  Object.freeze({
    version: '0.1.84',
    date: '2026-05-01',
    summary: 'avatar 解決の単一 component 化（基盤）',
    items: Object.freeze([
      'avatar 解決ロジックを単一の純粋関数 src/domain/user/avatarResolver.js に集約する基盤を実装しました（surechigai-lite の単一 store パターンを参考）。22 ケースの TDD 完備（合計 2153 件 PASS）',
      'shared レイヤに src/shared/avatar/avatarUrlGuard.js を新設し、URL helper（isSameAvatarUrl / extractNiconicoUserIdFromIconUrl / isAvatarUrlForUserId）を集約。レイヤ依存ルール（domain → shared）を遵守',
      'lib/avatarUrlCompare.js と lib/avatarBroadcasterGuard.js は shared への re-export shim に縮小（後方互換）。shouldAssociateAvatarWithUser は @deprecated とし、Phase E で削除予定',
      '今回 phase B 単体ではユーザー体験は変化しません。Phase C/D で書き込み・表示経路を段階的に resolver 経由に統合していきます'
    ])
  }),
  Object.freeze({
    version: '0.1.83',
    date: '2026-05-01',
    summary: '普遍ルール「URL の uid とエントリの uid 一致」で根治',
    items: Object.freeze([
      '0.1.76〜0.1.82 で broadcaster 情報に依存した個別ガードを 7 層積み上げてきましたが、永続キャッシュに焼き込まれた過去の汚染（過去 broadcast の broadcaster icon が viewer uid に紐付いている等）はガードがすり抜けて表示されていました',
      '修正内容: broadcaster 情報に依存しない普遍ルール「avatar URL に埋め込まれた uid とエントリの uid が一致しなければ取り違え」を実装（src/lib/avatarBroadcasterGuard.js#isAvatarUrlForUserId）。これを userCommentProfileCache.js の upsert / apply、interceptAvatarHydration.js、popup-entry.js の表示時 guard すべてに適用',
      '効果: 過去の汚染データ（どんな broadcaster の icon でも、どんな経路でも）も自動掃除。8 ケース TDD 追加（合計 32）',
      'これは Hoshino-Romi 流 clean design への第一歩。次フェーズで avatarResolver 単一 component に集約予定（docs/plan-avatar-resolver-refactor.md 参照）'
    ])
  }),
  Object.freeze({
    version: '0.1.82',
    date: '2026-05-01',
    summary: '永続キャッシュへの汚染書き込みを完全停止',
    items: Object.freeze([
      '0.1.76〜0.1.81 で計 6 層の表示時ガードを追加してきましたが、根本的に「永続キャッシュ（30 日保存される KEY_USER_COMMENT_PROFILE_CACHE）への書き込み時にガードが無く、書き込まれた汚染データが次セッションで in-memory cache に戻ってくる永続ループ」が原因で直っていませんでした',
      '修正内容: src/lib/userCommentProfileCache.js の upsertUserCommentProfileFromEntry / upsertUserCommentProfileFromIntercept に broadcasterContext 引数を追加。書き込み前に shouldAssociateAvatarWithUser でガード適用。content-entry.js の 3 箇所の呼び出し全てに broadcasterUid + broadcasterIconUrl を渡す',
      'さらに src/lib/interceptAvatarHydration.js の hydrateInterceptAvatarMapFromProfile（profile cache → intercept map への補完経路）にも同じガードを追加。これで 永続キャッシュに残った過去の汚染データも hydrate されなくなり、永続ループが断たれます',
      '正本設計書: docs/plan-avatar-resolver-refactor.md（avatar pipeline 統合 component の段階的 refactor 計画）'
    ])
  }),
  Object.freeze({
    version: '0.1.81',
    date: '2026-05-01',
    summary: 'プロファイルキャッシュ経由の汚染にも対応',
    items: Object.freeze([
      '0.1.80 で URL サイズ違いに対応しましたが、storyGrowthAvatarSrcCandidate という別経路で永続キャッシュ（KEY_USER_COMMENT_PROFILE_CACHE）から汚染データを読み出してフォールバックに使う処理が残っていたため、アイコン列のサムネが直っていませんでした',
      '修正内容: storyGrowthAvatarSrcCandidate 内の avatarUrl と rememberedAvatarUrlForUserId（プロファイルキャッシュ経由）両方に shouldAssociateAvatarWithUser ガードを適用。0.1.80 の URL 抽出ロジックがここでも機能するため、永続キャッシュに焼き込まれた broadcaster icon も表示時に除去されます'
    ])
  }),
  Object.freeze({
    version: '0.1.80',
    date: '2026-05-01',
    summary: 'avatar 取り違え修正の真因（URL サイズ違い）に対応',
    items: Object.freeze([
      '0.1.76〜0.1.79 で計 4 層のガードを入れましたが、すべて URL 完全一致（isSameAvatarUrl）で broadcaster icon を判定していたため、snapshot は 150x150 を返し、コメ harvester は s/ 小サイズを拾うサイズ違いで一致せず、4 層全部が空振りしていました（実際の汚染 URL: usericon/s/14367/143675916.jpg、snapshot: usericon/uri150x150/...）',
      '修正内容: avatarBroadcasterGuard.js に extractNiconicoUserIdFromIconUrl を追加し、URL 末尾の uid を抽出して broadcasterUid と直接照合するロジックを優先。サイズバリアント（s/m/l/uri150x150）に依存しない判定ができるようになりました',
      'これで 0.1.76〜0.1.79 の 4 層ガードが初めて正しく機能し、ギフト演出由来の取り違えが完全に解消されます。新規 12 ケースの TDD 追加（合計 36）'
    ])
  }),
  Object.freeze({
    version: '0.1.79',
    date: '2026-05-01',
    summary: 'アイコン列の汚染 avatar も表示時に補正',
    items: Object.freeze([
      '0.1.78 で aggregateCommentsByUser 経由（HTML レポート・上位ランク）はガードしましたが、応援ユーザーレーンのアイコン列は別経路（userLaneCandidatesFromStorage）を使っており、broadcaster icon の取り違えがそのまま表示され続けていました',
      '修正内容: src/lib/userLaneCandidatesFromStorage.js に broadcasterUid + broadcasterIconUrl の optional 引数を追加。viewer のコメ記録に焼き込まれた broadcaster icon と一致する URL を集約前に除外。popup-entry.js の syncStorySourceEntries から snapshot 経由でガード情報を渡す。6 ケース TDD 追加（合計 27）',
      'これで「アイコン列・グリッド・診断」セクションでも自分のサムネが正しい個人アイコンに戻ります'
    ])
  }),
  Object.freeze({
    version: '0.1.78',
    date: '2026-05-01',
    summary: 'コメ記録の汚染 avatar を表示時に補正',
    items: Object.freeze([
      '0.1.76 / 0.1.77 で intercept キャッシュと表示信号にガードを追加しましたが、過去のバージョンで chrome.storage に既に焼き込まれた nls_comments_* の avatarUrl は補正されませんでした。aggregateCommentsByUser が「最新コメ時刻の avatar」を採用する仕様のため、汚染レコードが残っている限り broadcaster icon が出続けていました',
      '修正内容: src/lib/sanitizeRoomAvatarsForBroadcaster.js を新設（純粋関数 + 13 ケース TDD）。aggregateCommentsByUser の出力に対し、broadcaster icon と一致する viewer の avatarUrl を空に倒す後処理を popup 表示と HTML レポート 2 箇所に適用',
      'これで chrome.storage 上の汚染データを削除しなくても、表示時に正しい canonical アイコンに戻ります（過去レコードに対する完全な後方互換補正）'
    ])
  }),
  Object.freeze({
    version: '0.1.77',
    date: '2026-05-01',
    summary: 'avatar 取り違え修正の表示時ガード追加',
    items: Object.freeze([
      '0.1.76 で intercept キャッシュへの broadcaster icon 紐付けを止めましたが、コメ記録に既に焼き込まれた avatarUrl までは戻せませんでした。0.1.77 で表示時にも同じガードを掛けることで、過去の汚染データも自動で正しい canonical アイコンに置き換わるようにしました',
      '修正内容: src/lib/userEntryAvatarResolve.js（resolveUserEntryAvatarSignals）の入力 3 ソース（rowAv / interceptEntryAv / interceptMapAv）すべてに対し、broadcaster icon と一致する URL は viewer 本人でない限り無効化（canonical fallback に倒す）。16 ケース TDD（既存 9 + 新規 7）',
      'これで「キャッシュクリアしないと直らない」状態が解消され、拡張更新後の最初のコメ受信から正しい表示に戻ります'
    ])
  }),
  Object.freeze({
    version: '0.1.76',
    date: '2026-05-01',
    summary: 'ギフト演出 DOM での avatar 取り違え修正',
    items: Object.freeze([
      'ニコ生でアイテム（ギフト）を投げた直後に、応援者リスト（アイコン列）に表示される自分のサムネイルが配信者のアイコンに化けてしまう不具合を修正しました',
      'ギフト演出 DOM では送信者の情報行に配信者アイコンも並んで描画される構造になっており、本拡張の avatar 観測が誤って「viewer の uid に broadcaster icon を紐付け」してしまうのが原因でした',
      '修正内容: avatar を uid に紐付ける直前に「その avatar が現在の broadcaster icon と一致するなら、その uid が broadcaster 本人でない限り紐付けを skip する」純粋関数ガード（src/lib/avatarBroadcasterGuard.js, 12 ケース TDD）を追加。content-entry.js の 4 箇所すべてに適用',
      '既に化けてしまっているキャッシュは、popup の「キャッシュクリア」ボタンで一度クリアすると、次回コメ受信時から正しく表示されます'
    ])
  }),
  Object.freeze({
    version: '0.1.67',
    date: '2026-05-01',
    summary: '関係ないタブで開く時のパネルを Chrome 統合に',
    items: Object.freeze([
      'watch じゃないタブで拡張アイコンを押した時、これまでは独立した popup window が Chrome から離れて表示されることがありました。これを Chrome 標準のサイドパネル（画面右側に統合）に変更しました。Chrome のウィンドウから離れて表示される問題が根本解決し、配信視聴中の inline panel と同じような一体感のある UX になります',
      '従来の popup window は、サイドパネルが使えない環境では fallback として残ります。設定で「常に popup window を開く」を選んでいた人は従来通りの挙動です'
    ])
  }),
  Object.freeze({
    version: '0.1.66',
    date: '2026-05-01',
    summary: '横付きパネルの幅・高さをどの画面サイズでも最適化',
    items: Object.freeze([
      '「横付き」モードで広い画面（1920px 級）でパネルが画面右にはみ出して「来場者数」が見切れる問題を修正。利用可能な右側余白を厳密に測り、足りなければ自動で「プレイヤー行の下」に切り替えるようになりました',
      '「横付き」モードで超広画面（2000px 級）でパネルが縦に間延びして下半分が空白になる問題を修正。動画+公式コメ列の高さに揃えて、空白なくぴったり収まるようになりました',
      'ウィンドウのリサイズ・全画面切替・モニタ移動時に、横付きパネルもリアルタイムで追従するようになりました（debounce 150ms）'
    ])
  }),
  Object.freeze({
    version: '0.1.65',
    date: '2026-05-01',
    summary: '画面下パネルの高さをどの画面サイズでも最適化',
    items: Object.freeze([
      '「画面下いっぱい」モードのパネル高さが viewport の 50% で固定だったため、大画面では下半分占有・小画面では動画圧迫の両極端になっていた問題を根本修正。動画+公式コメ列が画面で実際に占めている縦範囲を測定し、その残りスペースに自動でパネルを収めるよう変更。720p ノートから 4K 縦置きまで、どの画面サイズでも自動最適化されます',
      'ウィンドウサイズ変更（リサイズ・全画面切替・モニタ移動など）にもリアルタイム追従するようになりました（debounce 150ms）'
    ])
  }),
  Object.freeze({
    version: '0.1.64',
    date: '2026-05-01',
    summary: 'パネル位置の根治＋popup 表示まわりの不具合修正',
    items: Object.freeze([
      'watch ページのパネルが「ページ最下部（amazon・関連配信の後ろ）」に出る現象の根本原因（祖先候補の選定が緩く、視聴行+コメ欄+バナー一式の巨大ラッパーまで拾っていた）を修正。判定を純粋関数に切り出し、video の rect とのジオメトリ整合（幅比 0.95–1.6・top オフセット 120px・aspect 上限 2.6・面積上限 viewport 60%）まで含めて厳格化しました（0.1.63 の応急 migration と組み合わせて二重で改善）',
      'ツールバーから popup を開いた時、popup window の中に冗長な「君斗りんくの追憶のきらめき」ロゴ帯が出ていて Chrome 自身のタイトルバーと「枠が 2 つ」に見えていた問題を修正。standalone window では内部ヘッダーを非表示にしました',
      '5 モニタなどの多モニタ環境で、popup window が Chrome window の隣のモニタに飛んでしまう問題を修正。popup を Chrome window の右内側に配置するよう変更し、必ず Chrome のいるモニタに popup が出るようになりました（Chrome の content 右側と少し被るのは許容）',
      '画面幅が約1200px未満で「横付き」を選んでも自動で「プレイヤー行の下」と同じ動作になる仕様について、見落とされやすかったヒント文を警告調（黄色背景 + 太字）に強調しました'
    ])
  }),
  Object.freeze({
    version: '0.1.63',
    date: '2026-05-01',
    summary: '配信時のパネル位置を player の近くに戻す',
    items: Object.freeze([
      'watch ページのパネルが「ページ最下部（amazon・関連配信の後ろ）」に出るようになっていた問題を修正。「プレイヤー行の下」設定の人を「画面下いっぱい（既定）」に一度だけ自動移行し、player と panel が常に viewport 上でセットで見える状態に戻します（意図して「下」を選んでいた場合は設定画面から再度切り替え可能）'
    ])
  }),
  Object.freeze({
    version: '0.1.62',
    date: '2026-05-01',
    summary: 'popup を Chrome 右端に密着',
    items: Object.freeze([
      'popup と Chrome ウィンドウの間に隙間があった問題を修正。Chrome の右端ぴったりに popup の左端を合わせ、上端も揃えて隣接配置（隙間ゼロ）'
    ])
  }),
  Object.freeze({
    version: '0.1.61',
    date: '2026-05-01',
    summary: 'popup を Chrome の右側に隣接配置',
    items: Object.freeze([
      'popup が Chrome ウィンドウの中央に被さって「ボックスの中にあるかんじ」になる問題を修正。Chrome ウィンドウの右側に隣接する位置に popup を配置するよう変更（Chrome の content に重ならない）'
    ])
  }),
  Object.freeze({
    version: '0.1.60',
    date: '2026-05-01',
    summary: '複数モニタ時に popup を同じ画面に出す',
    items: Object.freeze([
      'モニタが複数あるとき popup が別モニタに開く問題を修正。直前に使っていた Chrome ウィンドウの中央に popup を配置するよう変更（同じモニタに出る）'
    ])
  }),
  Object.freeze({
    version: '0.1.59',
    date: '2026-05-01',
    summary: 'popup を毎回作り直して横長を確実に解消',
    items: Object.freeze([
      'popup window が横長で開いて空白だらけになる問題を確実に修正。0.1.58 では update でサイズ変更を試みたが Chrome が無視するケースがあったため、既存 popup を一度閉じて 420×780 で新規作成する形に変更（state:normal も明示）'
    ])
  }),
  Object.freeze({
    version: '0.1.58',
    date: '2026-05-01',
    summary: 'popup window サイズを毎回 420×780 にリセット',
    items: Object.freeze([
      'popup window が横に間延びして右側が空白だらけになる「レイアウトガタガタ」現象を修正。Chrome が以前のサイズを記憶していた問題で、popup を開くたびに 420×780 に強制リセットするよう変更'
    ])
  }),
  Object.freeze({
    version: '0.1.57',
    date: '2026-05-01',
    summary: '何もない時は前放送データを出さない',
    items: Object.freeze([
      'watch ページ以外で popup を開いた時に、storage 由来の前放送データ（記録 N 件・(取得不可) など）が表示されてレイアウトがガタガタになる問題を修正。アクティブな watch タブが無いときは「（ニコ生 watch を開いてください）」placeholder + ランキング導線のみのスッキリ表示に統一'
    ])
  }),
  Object.freeze({
    version: '0.1.56',
    date: '2026-05-01',
    summary: 'ランキング導線を最上部に固定表示',
    items: Object.freeze([
      'popup でランキング導線が出ない問題を確定的に修正。section 配置を version badge の直下（最上部）に移動し、display:block !important + 目立つオレンジ色枠線で必ず見える形にしました（INLINE_MODE のときだけ display:none）'
    ])
  }),
  Object.freeze({
    version: '0.1.55',
    date: '2026-05-01',
    summary: 'ランキング導線を確実に表示',
    items: Object.freeze([
      'popup を開いてもランキング導線が出ない問題を確実に修正。HTML の hidden 属性デフォルトを撤去し、popup window では最初から表示状態に変更（watch ページ内のパネル iframe では JS で hidden を付ける）'
    ])
  }),
  Object.freeze({
    version: '0.1.54',
    date: '2026-04-30',
    summary: 'ランキング導線を常時表示に',
    items: Object.freeze([
      'ツールバーから popup を開いた時にランキング導線が出ない問題を修正。複数 window 環境で source 検出が想定どおり動かないケースがあったため、popup window では常に導線を表示する形に変更（watch ページ内のパネル iframe では非表示）'
    ])
  }),
  Object.freeze({
    version: '0.1.53',
    date: '2026-04-30',
    summary: 'ランキング導線の表示条件を厳密化',
    items: Object.freeze([
      'watch 以外のページで popup を開いてもランキング導線が出ず、前に見た放送のデータが表示される問題を修正。アクティブタブが watch ページじゃない時は必ずランキング導線を出すように変更（storage fallback の影響を受けないよう判定強化）'
    ])
  }),
  Object.freeze({
    version: '0.1.52',
    date: '2026-04-30',
    summary: '何もない時はニコ生ランキング導線',
    items: Object.freeze([
      'watch ページ以外で popup を開いた時に、ニコ生トップ・生放送ランキング・ちくらん・直近開始の放送 へのリンクを表示。気になる放送をすぐ探せるようにしました'
    ])
  }),
  Object.freeze({
    version: '0.1.51',
    date: '2026-04-30',
    summary: 'popup の dark を完全に撤去',
    items: Object.freeze([
      'popup を開いたときに dark テーマで真っ黒になる問題を完全修正。0.1.50 で OS の dark 設定検出に切り替えたが、Chrome のテーマや Windows のシステム配色で誤って dark と判定されるケースが残ったので、light 配色（クリーム色背景）固定に変更'
    ])
  }),
  Object.freeze({
    version: '0.1.50',
    date: '2026-04-30',
    summary: 'popup の黒テーマ強制を撤去（部分）',
    items: Object.freeze([
      'ツールバーから popup を開いた時に常に真っ黒だった件の対策（OS の dark 設定検出に切替、後の 0.1.51 でさらに完全 light 化）'
    ])
  }),
  Object.freeze({
    version: '0.1.49',
    date: '2026-04-30',
    summary: 'マーケ分析に動的アドバイスを追加',
    items: Object.freeze([
      'マーケ分析の各セクションに「データに応じて変わるキャラ別アドバイス」を追加。KPI / 同接 / 笑い / 新規 vs 常連 / 沈黙 / 感情 / リーチ / 成長 / 初コメ / 生存曲線 / キーボード型 / コメ伝染 / 直近比較 / 波形 / 言わなかった人気語 / 話芸ピーク の 16 セクション × 100+ ルールで具体的な助言を出します（既存の固定アドバイスはそのまま、その後ろに追加表示）'
    ])
  }),
  Object.freeze({
    version: '0.1.48',
    date: '2026-04-30',
    summary: '大規模配信のマーケ分析を安定化',
    items: Object.freeze([
      '人気配信者の 8 万コメ超放送でマーケ分析がスタックオーバーフローで無症状失敗していた問題を修正（Math.min/max の spread を for ループ化）'
    ])
  }),
  Object.freeze({
    version: '0.1.47',
    date: '2026-04-30',
    summary: '同接カーブと連打事故防止',
    items: Object.freeze([
      '同接推移カーブが「公式があれば公式・なければ推定」の二者択一で稀に取れる公式値があると推定値 90% を捨ててグラフがほぼ空になっていた問題を修正。各サンプル単位で公式優先 → 無ければ推定にフォールバックする hybrid に変更',
      'HTML レポートボタン / スクショボタンの連打で重複ダウンロードが起きていた問題を修正（処理中はボタンを disable）'
    ])
  }),
  Object.freeze({
    version: '0.1.46',
    date: '2026-04-30',
    summary: 'マーケ分析の精度向上',
    items: Object.freeze([
      'マーケ分析の KPI 集計から配信者本人のコメント（合いの手等）を除外（CPM・ユニーク・タイムラインが歪んでいた問題）',
      'コメ被り検出（伝染・被り瞬間）が複数人の同時バーストを 1 件として扱っていた問題を修正（同秒・同テキスト・別ユーザーを別行扱いに）'
    ])
  }),
  Object.freeze({
    version: '0.1.45',
    date: '2026-04-30',
    summary: '裏側のクリーンアップとプライバシー',
    items: Object.freeze([
      '拡張リロード後に長時間放置すると裏でタイマーが回り続けて CPU を消費していた問題を修正（pageFrameLoopTimer も停止対象に追加）',
      'AI 診断（共有テキスト）に保存する watch URL から query / fragment を削除（万一個人情報を含む token が乗っていた場合の漏洩を抑止）'
    ])
  }),
  Object.freeze({
    version: '0.1.44',
    date: '2026-04-30',
    summary: '裏側のメモリ効率と整合性',
    items: Object.freeze([
      'サムネイル保存時に過去の全サムネを毎回メモリ展開していた処理を cursor + count() ベースに変更。長時間視聴のメモリスパイクを抑止',
      '自動バックアップの状態管理で content と background SW の同時書き込みによる重複バックアップを抑止（write 直前に fresh re-read で merge）'
    ])
  }),
  Object.freeze({
    version: '0.1.43',
    date: '2026-04-30',
    summary: 'パネルが開かない事象の修正',
    items: Object.freeze([
      'kon-ta クリックしてもパネルが開かない事象を修正。focus 判定を強化し、host が DOM 上でも display:none / visibility:hidden の場合は popup window へフォールバックするよう変更（純粋関数 + テスト 7 ケース追加）',
      '内部: content script の onMessage listener を idempotent に変更（SPA 再注入時の二重応答 → port closed エラー対策）'
    ])
  }),
  Object.freeze({
    version: '0.1.42',
    date: '2026-04-30',
    summary: 'パネル準備の競合解消',
    items: Object.freeze([
      '複数 watch タブ並行時に kon-ta クリック→パネル表示までが遅くなる問題を修正。chrome.storage.local の lease を使って同時にパネル準備（prewarm）を走らせるタブを 1 つに絞り、CPU 取り合いを抑止（純粋関数 + 10 ケース TDD）'
    ])
  }),
  Object.freeze({
    version: '0.1.41',
    date: '2026-04-30',
    summary: '深層監査の結果を反映',
    items: Object.freeze([
      '配信者タイルが「出たと思ったら消える」事象を修正（30 秒ごとの再取得で broadcaster 系が空のとき旧値を保つ partial-merge を導入、純粋関数 + 11 ケース TDD）',
      '複数タブで kon-ta パネルの記録件数 / ランクストリップが混信する事象を修正（standalone popup window から「直前の通常 window のアクティブタブ」を拾うよう判定追加、純粋関数 + 8 ケース TDD）',
      'コメ取り込み率が 17% 程度に低下していた事象を修正（NDGR が active な間 deep harvest を全 skip していたが、5 分以上 deep が走っていなければ強制実行する recovery を runDeepHarvest 内部にも結線）'
    ])
  }),
  Object.freeze({
    version: '0.1.40',
    date: '2026-04-30',
    summary: '公式チャンネル放送の配信者タイル復活',
    items: Object.freeze([
      '公式チャンネル放送（運営・業者）で配信者タイルが出ていなかった事象を修正。embedded-data の supplier.name は提供会社名（例「株式会社ドワンゴ」）でチャンネル名ではないため、socialGroup.name / socialGroup.socialGroupPageUrl を優先するように変更。アイコンも socialGroup.thumbnailImageUrl 等を読むように追加（純粋関数 + 19 ケース TDD）'
    ])
  }),
  Object.freeze({
    version: '0.1.39',
    date: '2026-04-30',
    summary: '配信者リンク誤検出の再発防止',
    items: Object.freeze([
      '配信者タイルが関連配信枠の別人を指してしまう事象（0.1.38 の追加対策）。DOM 候補から ?ref=watch_user_information マーカ付き anchor を最優先にして二重防御。同種の検出ロジックを使う別関数（detectBroadcasterUserIdFromDom）も同じ防御に統一',
      'アバター URL 比較ヘルパ（avatarCompareKey / isSameAvatarUrl）を src/lib/avatarUrlCompare.js に切り出し（純粋関数 + 14 ケース TDD）。query/hash 違いを「同じアバター」として扱うロジックの単体検証を強化'
    ])
  }),
  Object.freeze({
    version: '0.1.38',
    date: '2026-04-30',
    summary: '配信者タイルのリンク先を修正',
    items: Object.freeze([
      '配信者タイルからクリックした時に別人のページに飛ぶ事象を修正（embedded-data の supplier.programProviderId を最優先に）。本配信者がレーンに混入する原因にもなっていた箇所',
      'コメ送信エラー時の再読み込み案内ロジックを src/lib/commentSendTroubleshootHint.js に切り出し（純粋関数 + 7 ケース TDD）'
    ])
  }),
  Object.freeze({
    version: '0.1.37',
    date: '2026-04-30',
    summary: '内部の重複定義を整理',
    items: Object.freeze([
      'ストーリータイルの「ゆっくり風キャラ画像か判定」を src/lib/storyTileTvStyle.js に切り出し',
      'isContextInvalidatedMessageText の重複定義を撤去（既存の isContextInvalidatedError に一本化）'
    ])
  }),
  Object.freeze({
    version: '0.1.36',
    date: '2026-04-30',
    summary: '内部コンポーネント分割の続き',
    items: Object.freeze([
      'popup-entry.js から watch タブの並び替え関数（prioritizeWatchTabCandidates）を src/lib/watchTabPrioritize.js に切り出し',
      '純粋関数 + TDD 9 ケースで単体検証可能に。今後の挙動修正でリスクを下げる準備'
    ])
  }),
  Object.freeze({
    version: '0.1.35',
    date: '2026-04-30',
    summary: '仕様注記の追加と内部分割の小さな一歩',
    items: Object.freeze([
      'マーケ分析の離反/出席/サムネ一覧に「表示名はコメ記録時点のもの（仕様）」の注記を追加。配信者がハンドルを変えた場合の挙動を明記',
      '内部リファクタ: popup-entry.js から formatDateTime を src/lib/formatDateTime.js に切り出し（コンポーネント分割の第一歩）'
    ])
  }),
  Object.freeze({
    version: '0.1.34',
    date: '2026-04-30',
    summary: '離反/出席にニックネームを表示',
    items: Object.freeze([
      '離反コメンター TOP / 常連出席カレンダーで、過去配信から拾えたニックネームをユーザー欄に表示',
      'ID だけでは誰か思い出せない問題を改善（数値 ID もハンドル名つきで表示）'
    ])
  }),
  Object.freeze({
    version: '0.1.33',
    date: '2026-04-30',
    summary: 'パネル準備時間を短縮（2秒→0.8秒）',
    items: Object.freeze([
      'パネルiframe の事前ロード（prewarm）の起動タイミングを 2 秒後 → 0.8 秒後に短縮。kon-ta 即押し時の体感反応を改善'
    ])
  }),
  Object.freeze({
    version: '0.1.32',
    date: '2026-04-30',
    summary: '複数タブ時の panel 反応性を改善',
    items: Object.freeze([
      'バックグラウンドのタブでは panel iframe の事前ロード（prewarm）をスキップ。複数の watch タブを同時に開いた時、CPU/帯域の取り合いで kon-ta 押下時の体感反応が悪化していた問題を抑止',
      'タブが可視化された時に prewarm が自動再スケジュールされる仕組みを追加'
    ])
  }),
  Object.freeze({
    version: '0.1.31',
    date: '2026-04-30',
    summary: '連続DL時のメモリ使用量を削減',
    items: Object.freeze([
      'HTMLレポート/マーケ分析/セッション要約のダウンロード時、blob URL の片付けを 60 秒待機 → 15 秒待機 + 同時 3 個までの queue 管理に変更',
      '連続でダウンロードしたときに blob データがメモリに長く残る問題を抑止'
    ])
  }),
  Object.freeze({
    version: '0.1.30',
    date: '2026-04-30',
    summary: 'マーケDLの読み込み負荷を削減',
    items: Object.freeze([
      'マーケ分析DL時、過去配信の読み込み方法を「全ストレージ走査」から「最近10配信を IDB index で特定して該当キーだけ取得」に変更',
      '配信記録が多いユーザでマーケ分析DLが重かった問題を改善'
    ])
  }),
  Object.freeze({
    version: '0.1.29',
    date: '2026-04-30',
    summary: '拡張更新時の片付けを強化',
    items: Object.freeze([
      '拡張リロード後に旧 MutationObserver が DOM 変化のたびに走り続ける問題を抑止（context invalidate 時に disconnect）',
      'サムネ自動撮影タイマー（thumbTimerId）も拡張リロード時に停止',
      'まれに content script が二度起動した時の旧 observer 残留を防ぐ start() 冒頭の defensive disconnect を追加'
    ])
  }),
  Object.freeze({
    version: '0.1.28',
    date: '2026-04-30',
    summary: '深層監査の高優先度 race / leak を修正',
    items: Object.freeze([
      'page-intercept の setInterval（fiber スキャン・stats poll）の id を保持し、SPA 遷移で非 watch ページに変わった時に clearInterval する仕組みを追加（CPU・帯域消費の蓄積を防止）',
      'popup の refresh 経路でストレージ書き込み直前の世代チェックを追加（古い refresh が新しい refresh の取得結果を上書きするコメ汚染リスクを抑止）'
    ])
  }),
  Object.freeze({
    version: '0.1.27',
    date: '2026-04-30',
    summary: 'マーケ分析の表示改善＋パネル安定化',
    items: Object.freeze([
      '離反コメンター TOP・常連出席カレンダーにサムネイル列とユーザー ID 列を追加',
      'マーケ分析の各 PRO セクション直後に「りんく・こん太・たぬ姉」のキャラ解説を追加（このデータで何がわかるか）',
      'インラインパネルが複数表示される race を抑止（singleton と DOM の対応関係を追従）',
      'iframe ロード中にパネルが消えたり再生成されたりするフリッカーを抑止'
    ])
  }),
  Object.freeze({
    version: '0.1.26',
    date: '2026-04-30',
    summary: '表現修正・目次の自動絞り込み・マーケDLボタン追加',
    items: Object.freeze([
      '「アヘ顔密度」セクションを「笑い密度」（盛り上がり指標）に改名',
      'HTML 保存ボタンの横に「📊 マーケ」クイックボタンを追加（マーケ分析HTMLをそこからすぐ保存）',
      'マーケ分析HTMLとHTMLレポートの目次（TOC）を自動絞り込み（データ無しで描画されないセクションのリンクを目次から除外）',
      '目次のアンカーリンクをクリックしたとき何も起こらなかった不具合を解消'
    ])
  }),
  Object.freeze({
    version: '0.1.25',
    date: '2026-04-30',
    summary: 'マーケ分析に文化分析 7 種追加',
    items: Object.freeze([
      'マーケ分析に「コメ伝染」と「コメ被り瞬間」を追加（短時間に同じ語が複数ユーザーから出るパターン、ラテラル L1/L5）',
      'マーケ分析に「初コメ→2コメ目 latency」分布を追加（乗ってきた派 vs 様子見派、ラテラル L6）',
      'マーケ分析に「配信者の話芸ピーク」を追加（沈黙→即反応の検出、ラテラル L10）',
      'マーケ分析に「感情曲線」を追加（ポジ/ネガ/驚き/困惑の語彙辞書を時系列、ラテラル L11）',
      'マーケ分析に「自分が言わなかった人気語 TOP」を追加（次回試したい弾の自動抽出、ラテラル L14）',
      'マーケ分析に「リーチ係数」を追加（同接 ÷ 5分内ユニーク = 1コメンターあたり何人が観てるか、ラテラル L15）',
      '0.1.21〜0.1.25 で計 28 件の分析機能を投入完了'
    ])
  }),
  Object.freeze({
    version: '0.1.24',
    date: '2026-04-30',
    summary: 'マーケ分析に横断比較系 5 種追加',
    items: Object.freeze([
      'マーケ分析に「直近 5 配信の比較」（コメ数+ユニーク並列バー）を追加',
      'マーケ分析に「曜日 × 時間帯 ヒートマップ」を追加（横断・全配信のコメ密度）',
      'マーケ分析に「成長メーター」（過去平均との偏差・z-score）を追加',
      'マーケ分析に「冒頭 5 分の予兆」散布図を追加（冒頭 CPM × ピーク CPM の Pearson 相関、ラテラル分析 L13）',
      'マーケ分析に「似てる配信」一覧を追加（CPM カーブを 16 次元に正規化してコサイン類似度、ラテラル分析 L3）'
    ])
  }),
  Object.freeze({
    version: '0.1.23',
    date: '2026-04-30',
    summary: 'マーケ分析にユーザー層動向 5 種追加',
    items: Object.freeze([
      'マーケ分析に「新規 vs 常連」分類を追加（過去配信と突合してヘビー常連も検出）',
      'マーケ分析に「コメンター生存曲線」を追加（最初の区間の base ユーザーが各区間に何 % 残っているか）',
      'マーケ分析に「離反コメンター TOP」を追加（過去ヘビーだったが今回不参加のユーザー、ラテラル分析 L8）',
      'マーケ分析に「常連出席カレンダー」を追加（過去 N 配信 × TOP 20 コメンターの出席マトリクス、ラテラル分析 L9）',
      'マーケ分析に「キーボード型診断」を追加（絵文字派/短文派/ロング派/無口観戦派/バランス派、ラテラル分析 L12）'
    ])
  }),
  Object.freeze({
    version: '0.1.22',
    date: '2026-04-30',
    summary: 'マーケ分析に同接推移など 4 種追加',
    items: Object.freeze([
      'マーケ分析に「同接推移カーブ」を追加（ピーク到達分・終了時保持率・半減点を併記、視聴維持率の代替指標）',
      'マーケ分析に「コメ速度カーブ」（CPM 1分粒度＋5分移動平均）を追加',
      'マーケ分析に「沈黙ゾーン」検出を追加（60秒以上のコメ無し区間 + 沈黙の質を ガン見系/離脱系/ふつう に自動分類）',
      'マーケ分析に「笑い密度」（盛り上がり指標）を追加（w/草/8888/笑/爆笑 等を 30秒粒度で）',
      'HTML レポートとマーケ分析の両方に目次（アンカーリンク）を追加'
    ])
  }),
  Object.freeze({
    version: '0.1.21',
    date: '2026-04-30',
    summary: 'HTML レポートに分析項目を追加',
    items: Object.freeze([
      'HTML レポートに「最初／最後の記録コメント・配信時間・1分あたりのコメント数（CPM）・配信者レベル・本文の平均/中央値/最大字数」を追加',
      'ユーザー別表に「累計字数（平均字数併記）」列を追加',
      '内訳統計（数値ID／184匿名／自コメ／その他の件数と比率）を新セクションで表示',
      '自分のコメントだけ抜粋する専用テーブルを追加',
      '保存コメント一覧の上に「CSV をダウンロード」ボタンを追加（UTF-8 BOM 付き、Excel/Google Sheets 対応）'
    ])
  }),
  Object.freeze({
    version: '0.1.20',
    date: '2026-04-30',
    summary: '公式チャンネル放送でも配信者タイル表示',
    items: Object.freeze([
      '運営・業者・公式チャンネル放送で「配信者」タイルとフォロー導線が出ない不具合を修正',
      'ニコニコ競馬等のチャンネル放送（ch.nicovideo.jp）の配信者ページにもボタンから飛べるように',
      'ボタン文言は「フォロー」（個人）／「チャンネルを見る」（公式）で出し分け'
    ])
  }),
  Object.freeze({
    version: '0.1.19',
    date: '2026-04-30',
    summary: '来場者数カードの「取得不可」を状態別に',
    items: Object.freeze([
      '来場者数 / 推定同時接続カードが「（取得不可）」のままになる場合があった表示を改善',
      '取得中は「（接続中…）」、放送側が来場者数を非公開にしている場合は「（数字非公開）」と区別表示',
      '「（取得不可）」は通信そのものが取れない最終フォールバック時のみに変更'
    ])
  }),
  Object.freeze({
    version: '0.1.18',
    date: '2026-04-30',
    summary: 'こん太ボタン押下時の体感速度を改善',
    items: Object.freeze([
      'こん太（ツールバー）押下時にパネルが「ぱっと」出るよう、watch ページ表示から約 2 秒後に裏で popup.html を読み込んで待機',
      '画面外（display:none + offscreen）で iframe をブートしておくので押下時のロード待ちが解消'
    ])
  }),
  Object.freeze({
    version: '0.1.17',
    date: '2026-04-30',
    summary: '配信者本人を応援者リストから除外',
    items: Object.freeze([
      'HTML レポート / マーケ分析 / サムネ付きユーザー一覧から、配信者本人のコメントを除外（応援する側ではないため）',
      '全コメント一覧テーブル・ユーザー別集計テーブル・トップコメンター・サムネ付きグリッドの各箇所で適用',
      '配信者本人のタイルは従来どおり「配信者情報」枠で別出し（変更なし）'
    ])
  }),
  Object.freeze({
    version: '0.1.16',
    date: '2026-04-30',
    summary: 'パネル同時出現の真因修正',
    items: Object.freeze([
      'kon-ta 押下時にインラインパネルとポップアップ窓が同時に出る不具合の真因を特定して修正（iframe broadcast race の解消）',
      'background から content script への送信を「画面トップフレームのみ」に絞り込み、niconico ページ内の各種 iframe が応答 port を先取りするのを防止',
      '結果として、kon-ta 押下時の表示遅延も解消'
    ])
  }),
  Object.freeze({
    version: '0.1.15',
    date: '2026-04-30',
    summary: 'サムネ一覧の分類とパネル動作改善',
    items: Object.freeze([
      'サムネ付きユーザー一覧を「数値 ID」と「匿名」のカテゴリに分けて並べました（HTML レポート / マーケ分析）',
      'kon-ta（ツールバー）押下時にインラインパネルとポップアップ窓が同時に出る不具合を修正',
      '×でパネルを閉じた後にもう一度 kon-ta を押すと、パネルがすぐ出ずポップアップ窓だけ開いていた不具合を修正'
    ])
  }),
  Object.freeze({
    version: '0.1.14',
    date: '2026-04-30',
    summary: 'ゲスト判定とサムネ一覧の視認性改善',
    items: Object.freeze([
      'ハンドル名が「ゲスト」（ニコ既定の placeholder）の場合は ID のみで表示し、独自ハンドルとは区別',
      '全コメント一覧の各行にニックネーム表示が出ていなかったバグを修正',
      'サムネ付きユーザー一覧の文字色を WCAG AA に合わせて読みやすく改善（ダーク背景上の白文字に統一）'
    ])
  }),
  Object.freeze({
    version: '0.1.13',
    date: '2026-04-30',
    summary: 'HTML レポートのサムネ強化と CSP 修正',
    items: Object.freeze([
      'HTML レポート / マーケ分析の各ユーザーに「最低サムネ」を必ず表示（個人サムネが無くてもニコ既定アイコン or identicon を充当）',
      '「サムネ付きユーザー一覧」セクションを HTML レポート / マーケ分析の両方に追加（カードグリッド形式）',
      '全コメント一覧の各行のユーザー欄にも 20px のインラインサムネを表示',
      'chrome://extensions のエラータブに毎回出ていた CSP 違反（onerror 属性）を解消'
    ])
  }),
  Object.freeze({
    version: '0.1.12',
    date: '2026-04-30',
    summary: '盛り上げワード ワンクリック挿入',
    items: Object.freeze([
      '✨ボタンから 8888 / wwww / 拍手 / 顔文字 等を 1 タップで挿入できるパレットを追加',
      '最近使ったワードが先頭に並ぶ学習動作（5 件まで保存）',
      '既存の入力欄レイアウトは動かさず、ポップオーバー方式で表示',
      '更新履歴をこの popup から確認できるようにしました'
    ])
  }),
  Object.freeze({
    version: '0.1.11',
    date: '2026-04-30',
    summary: '視認性・前面化バグ修正',
    items: Object.freeze([
      '配色プリセット切替時に文字色が読みにくくなる不具合を根治',
      'コメント入力欄の placeholder がダーク背景で読めない問題を修正',
      'ツールバー押下時にパネルが小さく出るタイミング競合を修正',
      '画面下固定（dock_bottom）配置にも × 閉じるボタンを追加'
    ])
  }),
  Object.freeze({
    version: '0.1.10',
    date: '2026-04-29',
    summary: 'セキュリティ・プライバシー・a11y 整備',
    items: Object.freeze([
      'プライバシーポリシーを実装と整合（OpenRouter は「未実装・将来予定」）',
      '保存 HTML を開いたときの XSS 経路を防御',
      'avatarUrl の容量上限（2KB）を導入してストレージ枯渇を防止',
      'ダーク配色で補助テキストの読みやすさ（WCAG AA）を確保',
      '視聴ページの × 閉じるボタン、補助テキストの a11y 改善',
      '「煌めき」→「きらめき」に表記統一（意匠ルビは保持）'
    ])
  }),
  Object.freeze({
    version: '0.1.9',
    date: '2026-04-28',
    summary: '184 匿名コメントとパフォーマンス',
    items: Object.freeze([
      '送信中の自コメ表示で 184 viewer ID を露出しないように修正',
      '長時間配信でメモリが無制限に増殖するのを上限カットで防止',
      '視聴ページ離脱後の余分な fetch を停止（CPU・帯域・プライバシー）',
      'マイク確認中にバックグラウンドでハングする不具合を修正',
      '拡張接続切れバナーに「再読み込み」ボタンを追加'
    ])
  }),
  Object.freeze({
    version: '0.1.8',
    date: '2026-04-27',
    summary: '自コメ表示の安定化',
    items: Object.freeze([
      'りんくレーンに自コメが表示されない症状を根治（textRaw 永続化など）'
    ])
  }),
  Object.freeze({
    version: '0.1.7',
    date: '2026-04-23',
    summary: '初公開バージョン',
    items: Object.freeze([
      'CWS 初リリース',
      'ニコ生応援コメントの記録と 3 レーン可視化（りんく / こん太 / たぬ姉）',
      'HTML レポート / スクショ / マーケ分析チャート の書き出し',
      'プライバシー優先（外部送信なし・広告なし・計測なし・完全ローカル保存）'
    ])
  })
]);

/**
 * 先頭（最新）の changelog エントリを返す。
 * @returns {ChangelogEntry}
 */
export function getLatestChangelogEntry() {
  return EXTENSION_CHANGELOG[0];
}

/**
 * `MAJOR.MINOR.PATCH` の semver を数値として比較する。
 *   compareSemver('0.1.10', '0.1.9') > 0  // 文字列比較だと逆になるので注意
 * @param {string} a
 * @param {string} b
 * @returns {number} a > b で正、a < b で負、同値で 0
 */
export function compareSemver(a, b) {
  const pa = String(a || '0.0.0').split('.').map((n) => Number(n) || 0);
  const pb = String(b || '0.0.0').split('.').map((n) => Number(n) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}
