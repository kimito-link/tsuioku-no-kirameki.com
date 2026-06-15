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

## 第3回会議の確定(2026-06-13・A=IDアンカー必須/B=映像を見せる/C=切り離し)

全員集合(司令塔Fable風 + deepseek-r1:14b + gpt-oss:20b + Codex gpt-5.5)。3者が核心で完全一致。
ユーザー要望=①サムネ/ハンドル/IDアンカー必須の原則を会場でも守る ②配信映像が観客席で隠れる
不満を解消 ③会場を「切り離して別の場所に移動」。

### 決定的な前提(司令塔が実コードで確認)
- 会場のデータ読みは既に **全て chrome.storage.local.get 経由**(aggregateParticipants /
  pollSpeech・venueBar.js:1007/1060)。content script 固有 API に依存しない
  → 別ウィンドウ独立HTMLでも同じ readChunkedComments / userLaneCandidatesFromStorage /
    enrichVenueRowsWithProfileAvatars / pickNewVenueSpeech をそのまま呼べる。
- IDアンカー用の純関数 **comeviewUserPageUrl(userId)**(comeviewActions.js:93)が既存
  =数値IDのみ受理・匿名(a:…)は''。これを汎用libへ移して会場で再利用する。

### 確定A: IDアンカー必須(原則適合)— 最優先
- 座席を「アバター・表示名・IDリンク」の3要素に。数値IDのみ
  `https://www.nicovideo.jp/user/<id>`・`target=_blank rel="noopener noreferrer"`。
- 匿名(a:…)/IDなしはリンクを作らず「匿名NNN」等の安定表示(Codex指摘=観客席の匿名顔も
  原則上ラベルが要る)。
- ⚠️.nlsb-root は閉時 pointer-events:none(venueBar.js:41)→開時だけアンカー操作可能に。
- 将来ドラッグ時は座席全体をハンドルにせずヘッダー限定・a/button からのドラッグ除外。
- 純関数化: venueUserPageUrl(汎用化した comeviewUserPageUrl)+テスト。

### 確定B: 映像を見せるレイアウト(全員一致)
- 中央に**映像セーフエリア(約60%×55%)**を確保しUIを置かない。配信者ステージの不透明カードは
  撤去/小型化。ひな壇は下端 30〜35vh・2〜3段に限定。背景暗幕 0.74〜0.80 を大きく薄く。
- ⚠️**人数増で縮小すると顔/名前/IDが読めず原則違反→縮小でなく同時表示人数を減らす**(全員一致)。
  150人は論理保持・同時表示24〜40人・直近発言者を安定周期で入替(純関数で安定選抜=ちらつき防止)。
- 匿名観客120顔の常時並べをやめ「表示サンプル+総人数」へ。吹き出しは中央映像を覆わずひな壇付近に。

### 確定C: 切り離し = 別ウィンドウ独立 venue.html(全員一致で本命)
- comeview.html / status.html の独立ページ実績と同型。storage 経由で購読・OBSはWindow Captureで配置可。
- 同一ページ内ドラッグ移動は「コンパクト表示」の補助に留める(本命でない)。
- 構成: ①content→SWへ `{type:'NLS_OPEN_VENUE', liveId}` ②SWが
  `venue.html?lv=<lv>` を chrome.windows.create({type:'popup'}) ③venue.html が既存
  venueSeats/venueSpeech/venueAvatar を利用 ④初期=チャンク+profile cache ⑤新着=tail を
  storage.onChanged 購読+30秒で全体整合。
- ⚠️**最大の罠(Codex発見)**:
  1. content script から chrome.windows は直接呼べない→**SW経由必須**。
  2. **現行SWは popup.html 以外の自拡張ページを「孤児」として閉じる(background.js:2491)**
     →venue.html を識別して閉じない様に直さないと会場窓が即死する。
  3. IDB更新は storage.onChanged を発火しない→tail/summary を通知源にし定期整合も残す。
  4. nls_last_watch_url は複数watchタブで競合→入口から必ず ?lv= を渡す。新しい高頻度の巨大な
     nls_venue_state は不要。
- OBS: chrome-extension:// は通常の OBS Browser Source では直接読めない(Window Capture推奨)。

### PR分割(司令塔裁定=Codex/gpt-oss案・A→B→C基盤→C本体)
deepseekはC優先だがCが最も大物(SW改修+新HTML+build)。先にA(原則適合)とB(今すぐ効く
不満解消)で確実前進→安定した renderer/data source を C基盤で共通化→C本体、が壊れにくい。
- **PR-A**: 座席にIDアンカー(venueUserPageUrl汎用化+テスト)・匿名ラベル。原則適合。
- **PR-B**: 映像セーフエリア+同時表示人数制御(安定選抜の純関数+テスト)・暗幕薄く。
- **PR-C基盤**: 会場 renderer/data source を共通モジュール化+SWのpopup識別改善(孤児閉じ回避)。
- **PR-C本体**: venue.html 新規・build/提出スクリプト追加・storage購読・SW経由別窓起動。
- **任意**: 窓位置保存・OBS表示モード・同一ページ内コンパクトパネル。

## 第4回会議の確定(2026-06-13・吹き出しが隠れる/小さい=星野ロミ流 可読性最優先)

全員集合(司令塔Fable風 + deepseek-r1:14b + gpt-oss:20b + Codex gpt-5.5)。3者が核心で完全一致。
ユーザー実機不満=①吹き出し(セリフ)がアバターの下に潜る/上段アイコンと重なる/見えなくなる
②セリフが小さい(12px)。星野ロミ流「読みやすさ最優先・セリフこそ主役・隠れるくらいなら出し方
を変える」を軸に裁定。

### 真因(調査済み)
吹き出しは席ノード(node.seat)に append され、席コンテナ .nlsb-seats / .nlsb-seating が両方
overflow:hidden。①前列(最下段)の席の吹き出しは席エリア上枠からはみ出し overflow:hidden で
クリップ消失 ②後列の吹き出しは上段アバターと重なる。font-size:12px・BUBBLE_TEXT_MAX=20。

### 確定A: 吹き出し専用の最上位レイヤー(全員一致=(あ))
- .nlsb-seats の【外】にオーバーレイ最上位レイヤー(position:absolute; inset:0; overflow:visible;
  pointer-events:none; z-index 最上位)を置く。吹き出しは席ノードでなくこのレイヤーへ描く。
- 各席の getBoundingClientRect() で座標を取り、レイヤー基準へ変換して頭上に配置(席座標追従)。
- **席側の overflow:hidden は維持**(B課題の横スクロール根絶を壊さない)。(い)visible化は横スク
  再発・(う)テロップ単独は「誰が言ったか」弱いため却下。
- アバターとの対応はコネクタ線/同色枠で示す(任意・後続でも可)。

### 確定B: サイズ(3者の中央値で確定)
- フォント 18px(clamp(16px,1.4vw,20px))=12pxから大幅拡大。行高1.4。
- 最大2行・幅 min(30ch,40vw)・字数 20→最大36文字程度で末尾省略(全文は別途履歴に残す思想)。
- 同時表示 最大4個・連投は既存吹き出しを更新(新規増やさない)。
- 衝突回避=吹き出し同士が重なったら上方向へオフセット(自由配置でなくスロット/オフセット)。

### 確定C: UI = 頭上吹き出し拡大を主役(司令塔裁定)
- 星野ロミ流に従い「頭上吹き出しを大きく+絶対に隠れない」を最優先。テロップ帯併用(混雑時退避)
  は Codex/gpt-oss も推すが今回は保険=後続PR。まず頭上拡大で可読性を確保する。

### 確定D: 実装の罠(会議集約)
- 座標系をオーバーレイ基準へ変換(transform/scroll/zoom考慮)。rAF + ResizeObserver で追従だが
  毎フレーム全席測定しない(発言者と表示中の吹き出しだけ測る)。
- 配信切替/SPA遷移/全画面解除でレイヤー・タイマー・Observer・DOMを確実破棄。
- 同一コメント重複表示防止。reduced-motion は移動演出オフ・フェードのみ。
- textContent で挿入(HTML解釈させない)。固定数の要素を再利用(連投でDOM増やさない)。

### PR分割(司令塔裁定=ユーザー不満を最短で消す)
- **PR1(今回)**: 吹き出しを最上位レイヤー化+席座標追従+18px化+衝突オフセット+同時4個を1本で。
  これで「隠れる・小さい」が両方直る。純関数(衝突オフセット計算/座標変換)+テスト。
- PR2(後続): 混雑時の実況テロップ帯併用・コネクタ線。
