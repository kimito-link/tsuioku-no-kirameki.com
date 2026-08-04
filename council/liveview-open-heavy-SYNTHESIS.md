# 会議 SYNTHESIS: 応援ライブビューを開いた瞬間が重い・tab固まる の根治

## 確定した真因(司令塔が2エージェントで実コード棚卸し)
応援ライブビュー(extension/live-view.html → iframe で本物 popup を passive 起動)を開くと、popup-entry の
refresh が **readHeavyFromStore()(popup-entry.js:13830付近)で 32,080件・246KB のコメント全件を
chrome.storage.local(単一LevelDB・ディスク)から読む**。これが:
- 開いた瞬間の重さ(storage I/O 待ち・リトライ込み数秒。paint 146ms は DOM だけで I/O 待ちは別)。
- tab全体が固まる(単一LevelDB 直列化=同プロファイルの他タブ status 等の操作まで待たされる)。
★INLINE_PASSIVE は「書かない/注入しない/fetch しない」は守るが、**heavy comments read は避けていない**。

## 実コードで確認した依存(批判役の条件)
heavy read 結果 nextArr → arr → applyStoredCommentEntries → paintWatchPopupUi()(popup-entry.js:14358-14394)。
paintWatchPopupUi は renderCommentTicker(displayEntries) と renderStoryUserLane を呼ぶ。
= **passive のコメントティッカー/応援レーンは現状 heavy read を源にしている**(applyLaneMirrorForPassive=鏡経路は
別途あるが、ティッカーは heavy 由来)。だから heavy read を単純に切ると passive のティッカーが空になる懸念。

## 裁定: passive は「鏡から描く」に寄せ、heavy read を開いた瞬間に走らせない
v0.1.951/956/960 の設計(passive は鏡から描く)を貫徹する。応援ライブビューは「見るだけ」=鏡(laneMirror/
commentTimelineMirror/northStarMirror/statCardsMirror)で全部描ける。heavy read は watch タブの本物 popup が
担い、応援ライブビューは鏡を読むだけにする=開いた瞬間の重い全件 read が消える。

### 第1段(最小・低リスク): passive で heavy read をスキップ + ティッカーは鏡から
- refresh の heavy read 呼び出しに「INLINE_PASSIVE ならスキップ」を入れる(read を【減らす】=地雷の
  「read path 改変で増やす/キャッシュで包む」とは逆。popup の paint には触らない)。
- passive のコメントティッカーは commentTimelineMirror(v0.1.960 で鏡にある)から描く applyCommentTimelineMirrorForPassive
  を足す(applyLaneMirrorForPassive と同型・storage read のみ・本物 buildCommentTickerLatestHtml 再利用)。
- ★ただし「heavy entries に依存する他の passive 描画」が無いことを実装直前に再確認(応援レーンは
  applyLaneMirrorForPassive で鏡経路に既に分離済=v0.1.951。北極星も鏡。数字カードも鏡)。

## 却下・地雷(2本目エージェント確定)
- ✗ popup の refresh/paint の read path をキャッシュで包む(ttlReadCache)= 2回 revert(全カードちらつき)。
- ✗ 複数 consumer の並列 storage.get = head-of-line blocking で「—」固着。
- ✗ 毎paint全DOM sanitize(丸ごとDOM鏡)= 却下済み。
- ✗ Offscreen を write path に = SW idle で記録落ち(killswitch 維持)。
- ✓ 生きている: setupPreviewVisibilityPause(裏タブ停止・表には効かない)/computeLivePersistIntervalMs(保存間引き)。

## なぜ安全か
- read を【減らす】だけ(増やさない・キャッシュで包まない)=地雷の逆。
- passive のレーン/数字/北極星は既に鏡経路(v0.1.951)。ティッカーだけ鏡経路に揃える=設計の一貫化。
- watch タブの本物 popup は不変(heavy read はそちらが担う=記録・描画は影響なし)。

## 次の一手
第1段: ①passive で heavy read スキップ ②applyCommentTimelineMirrorForPassive で鏡からティッカー描画。
実装直前に「passive で heavy entries に依存する描画が他に無いか」を grep で再確認してから着手。
実機で「開いた瞬間が軽い・tab固まらない・ティッカーは鏡から流れる」を確認(ユーザー実機)。
