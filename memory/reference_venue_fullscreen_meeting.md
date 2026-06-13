# reference: 全画面ライブ会場モード(リアルタイム演出)設計正本

> 2026-06-13 Fable風司令塔 + 全員集合会議(gpt-oss:20b / deepseek-r1:14b / Codex gpt-5.5)。
> PR1(画面下端バー会場・v0.1.707)からの大幅拡張。ユーザー要望で「全画面・全員座らせる・
> 吹き出し・リアルタイム投げ銭演出・アバター投げ」へ。

## ユーザー確定事項
- 灰色バーでなく**押すと全画面会場モード**(全画面オーバーレイ・本家DOM非破壊・閉じれば元通り)
- **全員座らせる**(userLaneCandidatesFromStorage で全チャンク集計・サムネ/ゆっくり顔・匿名含む)
- 人数多い時は**座席上限+スクロール**(優先=ギフト>発言多>直近)
- しゃべったら**吹き出し**
- **リアルタイム投げ銭演出**: 追憶はギフトをリアルタイム観測している。いま誰かが投げた瞬間を
  検知し、その人のアバターから中央の配信者へギフトが飛ぶ。金額/順位で豪華さが変わる
- **アバターを投げる**(掴んで放り投げる遊び・優先度低)

## 会議結論(Codex + gpt-oss 完全一致・司令塔裁定)

### 論点1: 描画方式 = ハイブリッド(全員一致)
- 座席・アバター・吹き出し = **DOM**(クリック/ドラッグ/リンクが容易・既存集計をそのまま反映)
- 飛ぶギフト/コイン/軌跡/紙吹雪 = **Canvas 1枚**(DOMを増やさず同時多発を低コスト描画)
- WebGL/物理エンジンは不採用(baselineに過剰)
- **重要(Codex): 全員に論理席を割り当てるが、DOM化は表示中の~150席だけ**(全員座らせる×
  上限は同時表示では両立しない→論理席+表示範囲のみDOM=仮想化)。userId キーで差分更新・全再生成しない。
- 性能: requestAnimationFrame でまとめ描画 / 吹き出し・Canvas演出に同時上限 /
  contain:layout paint / 閉じたら RAF・タイマー・監視を完全停止(cancelAnimationFrame必須)

### 論点2: リアルタイムギフト検知(全員一致)
- `chrome.storage.onChanged` 主経路 + 定期ポーリング復旧用
- 検知元優先: ①`nls_gift_subapp_history_<lv>`(誰が何を) ②`nls_gift_users_<lv>`(投げ主補完)
  ③`nls_event_dom_<lv>`(合計値で取りこぼし診断)
- **初回フラッシュ防止(最重要)**: 会場を開いた直後の履歴を「基準スナップショット」とし、
  初回分は一切再生しない。以後の新旧差分だけをイベントキューへ。再オープンも新基準で。
- 履歴に一意IDが無ければ`時刻・userId・giftId・個数・ポイント`でフィンガープリント。
  ただし同一ギフト連投を潰さないよう出現回数も扱う。
- 席にいない投げ主は画面端に**一時ゲスト席**を出し中央へ飛ばす→演出後に消す(席順を壊さない)
- ⚠️Codex指摘: ギフト履歴の更新が追記/先頭追加/全置換/上限切り捨てのどれかで差分方式が変わる
  → 実データで更新パターンを先に確認してから差分ロジックを決める(PR5で診断専念)
- ⚠️Codex指摘: storage.onChangedは複数キーが別タイミング更新→50-150msまとめて整合
- ⚠️Codex指摘: リスナー二重登録で再オープン時に演出重複→登録/解除を厳密に
- gpt-oss指摘: onChanged洪水にバックプレッシャー(バッチ処理)

### 論点3: アバター投げ = 優先度最低・CSS簡易(全員一致)
- Pointer Events + setPointerCapture でドラッグ→投げる瞬間だけアバターのクローンを演出レイヤーへ
- 速度からCSS/WAAPIの放物線・0.6-1秒で元の席へ戻す・実座席DOMは動かさない
- 物理エンジンは衝突/連鎖が要るまで不要

### 論点4: PR分割(性能を先に潰す・Codex案ベースで確定)
PR1バー版は捨てず、**集計/席割り/状態管理を残し表示コンテナを段階置換**:
- **PR2: 全画面シェル化** — バー版の起動ボタン+状態を再利用し position:fixed inset:0 オーバーレイへ。
  閉じる/Esc/スクロール/中央配信者枠。`nlsb-full` モードクラスで既存venueBar拡張(作り直さない)
- **PR3: 座席性能検証** — userLaneCandidatesFromStorage + buildVenueSeating 接続・150席仮想化・
  差分描画。**300〜1000人疑似データで負荷試験**(性能リスクをここで潰す)
- **PR4: リアルタイムコメント吹き出し** — nls_ctail差分・初回基準・吹き出しプール・同時上限
- **PR5: ギフト検知基盤(演出なし)** — onChanged+フィンガープリント+重複排除。診断ログ+テストで
  正確性確認(更新パターン確定もここ)。**演出はまだ出さない=正確性を先に固める**
- **PR6: Canvasギフト演出** — 座席座標→中央への飛翔・金額/順位で段階・席外ゲスト席・混雑時合成
- **PR7: アバター投げ** — クローン+WAAPI・タッチ・reduced-motion

最大の性能リスク=差分なし全DOM再描画 と 無制限の一時演出。PR3とPR5で先に潰す。

## 共通リスク対策(全員指摘の集約)
- 画像: crossOrigin='anonymous'(Canvas CORS)・onerror で即フォールバック画像・遅延読込
- 退会/匿名/画像失敗でもレイアウト崩さない
- prefers-reduced-motion / Escで閉じる / フォーカス管理
- 配信切替時に旧liveIdの監視・イベントキューを必ず破棄
- 発言も初回コメント全件を吹き出さない基準位置が必要(ギフトと同じ初回フラッシュ防止)

## 既存資産マップ
- 参加者集計: userLaneCandidatesFromStorage(storedComments, liveId, opts) → {userId,nickname,avatarUrl,avatarObserved}
- アバター解決: pickStoryUserLaneCellDisplaySrc / pickStrongestAvatarUrlForUser
- 席割り(PR1済): venueSeats.js buildVenueSeating(入れ替え制・モード判定・テスト22)
- ギフト: nls_gift_users_<lv> / nls_gift_subapp_history_<lv> / nls_event_dom_<lv>
- コメント: nls_cchunk_<lv>_N(本体) / nls_ctail_<lv>(新着)
- 弾幕土台: danmakuLaneScheduler.js / B案canvasアバター(v0.1.704)

## 設計原則(絶対)
- 本家DOM非破壊(fixed・documentElement直下・閉じれば元通り)
- 素JS/MV3/CSS名前空間 nlsb-
- content script(ISOLATED)から chrome.storage.local 読む
- 純関数lib+テスト必須・DOM増やし続けない(仮想化)

## 役割分担
- 設計/裁定/純関数核: 司令塔(本体)
- UIガワ/演出実装: Codex(codex-impl)
- 検証: npm run verify:cc + chrome-devtools-mcp 実機(本家DOM非破壊+負荷)
- 関連: [[reference_venue_mode_meeting]] [[session-2026-06-13-v0707-venue-mode]]

## 仕上げ会議の確定(2026-06-13 第2回・サムネ/匿名/盛り上がり)

全員集合(司令塔Fable風 + deepseek-r1:14b + Codex調査)。gpt-ossはメモリ競合で空応答→3者で確定。
実機4不満(サムネ出ない/匿名顔なし/吹き出しタイミング/盛り上がり無し)を潰す。

### 確定1: サムネ反映(真因確定・Explore済み)
- 真因=会場は userLaneCandidatesFromStorage を呼ぶだけで、パネルが呼ぶ
  **enrich(プロファイルキャッシュ nls_user_comment_profile_v1 で userId→avatarUrl 補強)を呼んでいない**。
- 対策=会場集計後に nls_user_comment_profile_v1 を chrome.storage.local.get で読み、各参加者の
  avatarUrl を補強してから venueRowsFromUserLaneCandidates に渡す。これでパネルと同じサムネが出る。
- 見せ方: サムネ取れた人は<img>、無い人は anonymousIdenticonDataUrl(userId)のゆっくり顔。
  前列(手前ひな壇)にサムネ持ちを優先配置(buildVenueSeating の優先度に avatarObserved を加味)。
- ⚠️avatar取り違えガード(isAvatarUrlForUserId/broadcaster除外)は userLaneCandidatesFromStorage 内で
  既に効く。会場もそのまま通せば誤った配信者アイコン混入を防げる(壊さない)。

### 確定2: 匿名を観客席に顔つきで(ユーザー要望)
- 今「アリーナ=名前付き・匿名=顔なしドット」→ **匿名も anonymousIdenticonDataUrl でゆっくり顔**にする。
- アリーナ(主役=名前付き・大きく前列)と観客席(匿名含む大勢・小さめ・後方)の見せ分けは維持。
- 性能: 観客は全員(1185人)は無理→**顔つき観客の上限を設ける(例 後方に最大80〜120人ゆっくり顔)**+
  超過は「ほか観客 N人」テキスト。顔つき観客は data URL(ゆっくり顔)なので追加ネットワークゼロ。
  in-place更新(プール)で DOM 増やさない。

### 確定3: 吹き出しタイミング
- 仮説=新着発言者を mergeSpeakersIntoVenueRows で席に足すが、renderSeats(席再描画)と
  showSpeechBubble(席を seatByKey で探す)の順序/タイミングがズレ、席がまだ無い瞬間に吹き出して
  宙に浮く or 出ない。実況で ctail が空だと素材が無く出ない問題も併発。
- 対策=①merge→renderSeats→**次フレーム(rAF)で**席DOM確定後に showSpeechBubble ②ctail空時は
  cdb_summary.recent を確実にフォールバック ③発言者の席が見つからないときは出さず次回に持ち越し。

### 確定4: 盛り上がり演出(最重要・deepseek案採用+追憶らしさ)
追憶らしさ=派手すぎず・ゆっくり世界観・軽い(CSS/軽canvas)。優先度順:
- **A(最優先・軽い)**: 発言が来た席のアバターが**ぴょこっと跳ねる/揺れる**(CSS transform・1回0.4s)。
  「誰かがしゃべると会場が反応する」最小の生命感。
- **B**: **盛り上がりメーター**=直近の発言密度(コメント/秒)で会場の明るさ・背景の脈動を変える
  (背景 radial-gradient の opacity を発言密度に連動・脈動アニメ)。沸いてる感。
- **C**: ギフト着弾時(nls_gift新着)に**そのアバター→中央ステージへ光/ハートが飛ぶ**+拍手パーティクル
  (軽canvas 1枚・同時上限)。投げ銭の可視化(会議PR5/6の流用)。
- **D(後)**: 盛り上がりピークで**スポットライト**が一瞬走る・ペンライト風の光点。
- 全部 reduced-motion で抑制・閉じたら停止・同時上限で重くしない。

### PR分割(軽くて壊れにくい順・確定)
- **PR-a**: サムネ反映(enrich配線)+ 匿名を観客席にゆっくり顔(確定1+2)。データの正しさ。純関数で
  avatar補強アダプタ+テスト。最優先(見た目の土台)。
- **PR-b**: 吹き出しタイミング修正(確定3・rAF順序+fallback)。
- **PR-c**: 盛り上がり演出A(発言で跳ねる)+ B(盛り上がりメーター背景)。軽いCSS。
- **PR-d**: ギフト着弾演出C(canvas・nls_gift新着検知)。
- **PR-e**: スポットライトD(任意)。

### 見落としリスク(会議集約)
- enrich でプロファイルキャッシュが巨大だと読みが重い→キーは1本(nls_user_comment_profile_v1)で
  軽い想定だが実機サイズ確認。
- 観客顔つき上限を超える配信(数千人)で DOM/描画が重くならないよう上限厳守。
- 発言跳ねアニメが大量同時発言で gpu 過負荷→同時アニメ数に上限。
- ギフト演出の初回フラッシュ防止(開いた時点の過去ギフトを一斉に飛ばさない=venueSpeech と同じ思想)。
