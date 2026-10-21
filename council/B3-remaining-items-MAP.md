# B3「診断の嘘の是正」残り(項目1・2・4)の修正方針 MAP

> 状態ラベル: **設計・裏取り完了 / 実装未着手(クラウドで実コード裏取り済み・ライブ検証はローカル待ち)**
> 最終更新: 2026-10-21 / 作成: クラウドセッション(実Chrome・census 不可の環境)
> 関連: 項目3は **v0.1.1720(commit `f2c8acf7`・ブランチ `claude/inspiring-cannon-ul6ae9`)で出荷済み**
> (`src/lib/resolveOfficialPoints.js` に pt の DOM↔NDGR 優先順位を集約し status の逆順を是正)。
> 方式: §12.10 wayfinder(実コードを読んで地図→仕様→実装)。この MAP は「地図」。

この3項目はいずれも「**計器(診断)が事実と違う数字/判定を出す**」=B3 の核。
★**共通の注意**: どれも**ライブ配信(コメント/ギフト/広告が流れている状態)での census:watch・
実機確認が最終検証に必須**。クラウド(この環境)はコードは直せても挙動を測れないため、
「嘘を直したつもりで別の嘘を入れた」を検出できない。だから実装後に必ずローカルで裏取りする。
各項目「1版1変更・TDD・verify:cc」。

---

## 用語(初出の略語)
- **NDGR**: ニコ生の統計/イベント配信チャネル(stats 由来・遅延/欠落しうる)。
- **DOM値**: watch ページ自体の表示から取る値(常時取れる)。
- **coalesced(置換/バースト統合)**: 短時間に多数の音を鳴らさないよう、1本に統合する正常動作。
  「鳴らさなかった」が**取りこぼしではない**。
- **fail-soft / 未観測**: 「値が無い(undefined)」を「0」や「false」と混同しない設計(§3.6)。

---

## 項目1: ギフト音の非対称(広告の coalesced を引かない)

### 症状(計器の嘘)
状態速報の「ギフト/広告演出・効果音」行と致命カードで、**広告(ad)だけ**、coalesced(置換)や
guarded 等で意図的に鳴らさなかった音が「⚠N件鳴っていない」と**誤って取りこぼし扱い**になる。
ギフト(gift)側は coalesced/explained を差し引くので正しく「✅」や「(+置換N)」と出る。

### 実コードの所在(裏取り済み)
- 判定式: `src/lib/giftEffectDiag.js:168` `diffCounts(...)`
  - `soundMissing = max(0, thrown - soundPlayed - soundCoalesced - soundExplained)`(171行)
- **非対称の本体(2箇所)**:
  1. 行群生成: `giftEffectDiag.js:256`
     `diffCounts(adDetected, adThrown, adSoundPlayed, 0, 0, adThrowCapGuarded)`
     → 第4(soundCoalesced)・第5(soundExplained)が **0 ハードコード**。
     - gift は `:212` で `giftSoundCoalesced` と `soundExplained`(guarded+noPath+error+off)を渡す。
  2. 致命カード: `giftEffectDiag.js` の `giftEffectDiagToActionCards` 内 `check('ad', …, 0, 0, …)`
     (ファイル末尾 `check('ad', ...)` 呼び出し)。同じく soundCoalesced/explained が 0。
- ★**さらに深い配線の問題(実装前に必ず確認)**: 広告検知時の音予約は、専用カウンタではなく
  **共用の `scheduleGiftSound()`**(`src/extension/venueBar.js:3833`)を通り、その coalesced 等は
  **gift 側カウンタ(`giftSoundCoalesced` 等)に加算**される(venueBar.js:4897/5014/5070 で
  `=== 'coalesced'` を見て `giftSoundCoalesced += 1`)。一方 `adSoundPlayed` は別カウンタ(venueBar.js:4915)。
  つまり広告には **coalesced/guarded 専用カウンタが存在しない**(giftEffectDiag の初期値は
  `adSoundPlayed`/`adThrown`/`adThrowCapGuarded` のみ)。

### 修正方針(2案・ローカルで要判断)
- **案A(最小・推奨の第一候補)**: 広告の音を gift 経路に相乗りさせている現状を前提に、
  広告行/カードの soundMissing 計算から **広告ぶんの coalesced/guarded を差し引けるようにする**。
  ただし今は「広告ぶんだけの coalesced」を分離できない(gift と合算)。→ まず **広告専用の
  カウンタ `adSoundCoalesced`(と必要なら adSoundGuarded/NoPath/Error)を venueBar の広告音予約
  サイトで加算**し、giftEffectDiag の 256 行・`check('ad', ...)` にそれを渡す。
- **案B(簡易)**: 広告の soundMissing 判定を**出さない/保留にする**(広告は gift 経路相乗りで
  内訳が取れないため「音の取りこぼし」を広告について断定しない)。嘘を消す最短だが情報は減る。
- ★案Aが §3.6/§12.7 の「嘘をつかない・内訳を明記」に沿う。案Bは暫定。**どちらもライブで
  広告(ニコニ広告)が実際に流れる配信での census/実機確認が必須**(広告イベントは頻度が低いので
  観測機会を待つ必要がある)。

### テスト
`giftEffectDiag.test.js`(既存)に「広告で coalesced>0 のとき soundMissing を立てない」ケースを追加。
TDD で赤→緑。venueBar 側のカウンタ加算は wiring テストで固定。

---

## 項目2: 鮮度ゲートが無い診断(silentFailure・buriedInstrument 系)

### 症状(計器の嘘)
`silentFailureCells.js` の各セル(`gift-sound-fail` / `voice-start-fail` / `custom-sound-db` /
`comment-revert` 等)は**累積カウンタから bad/warn/ok を判定するが、その数字が「今の配信」の
ものか「前の配信の居残り」かを見ていない**。stale なスナップショットだと、終わった配信の
エラーを現在の問題として赤く出す/逆に古い ok を今の状態として緑に出す恐れ。
★`silentFailureCells.js:183` 付近に既に「会場一致が鏡 stale(656s)で固定・別配信の値が
残っている疑い」という**未解決コメント**があり、stale 由来の嘘は実在が疑われている。

### 実コードの所在(裏取り済み)
- `src/lib/silentFailureCells.js`(213行) `buildSilentFailureCells(data)` 内の各 `out.push(cell(...))`。
  判定は `err`/`noPath`/`failTotal`/`attempts` 等のカウンタのみで、capturedAt/ageMs を見ていない。
- 対照(鮮度ゲートがある例): `src/lib/buriedInstrumentCells.js:120-130` の `boot-shade` は
  `shadeAgeMs` を見て present/解除を判定している。**ゲートの型は同ファイルに手本がある**。

### ★実装中に判明した設計の訂正(2026-10-21・実コード裏取り)
当初の「capturedAt に時間窓を当てる鮮度ゲート」は **gift-sound-fail には不適**と判明した:
- 前例 `buildVoiceHealthCells`(healthCells.js:207)は voiceDiag が comeview の**ハートビートで
  高頻度 publish される**から 90s 窓が効く。
- しかし **`giftEffectDiag` は定期ハートビートが無く、ギフト/広告イベント時にしか publish しない**
  (venueBar.js の publishGiftEffectDiag は全てイベントハンドラ経由)。capturedAt に時間窓を当てると
  「最近ギフトが無いだけ(=配信中の大半)」を「古い」と誤判定し、**今の配信の本物のエラーを隠す
  新しい嘘**になる。
- 本当の問題は「`giftEffectDiag` が**単一グローバルキー**(`nls_gift_effect_diag_v1`)で配信ごとに
  リセットされず、別/終了済み配信のエラーが居残る」こと。時間窓では消せず、**配信スコープ化が本筋**。

### 採った根本設計(100年クリーン)= liveId スコープ化
計測に「どの配信か」の目印(liveId)を持たせ、読み手は「今開いている配信の計測か」で照合する。
単配信でも多配信でも破綻しない(時間窓・一斉クリアは多配信で破綻する対症療法)。
- **実装済み(v0.1.1721・gift-sound-fail に適用)**:
  - `giftEffectDiag.js`: `buildGiftEffectDiagSnapshot(…, liveId)` が snapshot に `liveId` を刻む +
    純関数 `isGiftEffectDiagForOpenLive(snap, openLiveIds)`(未タグの旧データは判定保留 true=回帰なし)。
  - `venueBar.js`: `writeGiftEffectDiagSnapshot` が `liveIdFromPathname()` を渡す。
  - `silentFailureCells.js`: gift-sound-fail を「開いている配信(`data.livesData[].lv`)の記録でなければ
    `na`『別の配信の記録です』」にゲート。
  - ユニット +9(タグ・helper 境界・ゲート)。`verify:cc` 緑。
- **実装済み(v0.1.1722・giftEffectDiag の全読み手へ展開)**:
  - `buildGiftEffectDiagLines`・`giftEffectDiagToActionCards`(giftEffectDiag.js)・
    `buildGiftEffectHealthCells`(healthCells.js)に `openLiveIds` 引数を追加し、同じ helper で
    opt-in ゲート(渡されたときだけ照合・未タグ旧データは通す=回帰なし)。呼び出し元5箇所
    (status-entry ×2・aiShareFullText ×2・healthCells ×1)で `livesData[].lv` を渡す。
    健全度セルは掟5に従い消さず `na`「別の配信の記録です」を出す。ユニット +9。
- **残り(follow-up)**:
  1. 同じ単一グローバルキー病を持つ他 diag(`voiceDiag`=`nls_voice_diag_v1`・
     `commentPostDiag`=`nls_comment_post_diag_v1`)の対応セル(voice-start-fail・comment-revert)も
     liveId スコープ化。
  2. 真の多配信正本化(キー自体を per-live にする)は大きい変更=別途設計。
- ★**最終検証はライブ実機必須**: 配信A→配信B 切替で、Aのギフト音エラーがBで『別の配信の記録』に
  なること、Bで本物のエラーが従来どおり出ることを census/実機で確認(クラウドでは未検証)。

---

## 項目4: 未観測を0件にする numOr(recordedCount, 0)(最も慎重に)

### 症状(計器の嘘)
`recordedCount`(記録件数)が **undefined(まだ観測していない)でも 0 に潰れる**ため、
「**まだ分からない**」と「**観測した結果 0 件**」が混ざる。これは §3.6 の禁忌そのもの。
★**同型の実損が既にあった**: v0.1.1474、配信を開いた直後に公式件数だけ判明し記録がまだ 0 の一瞬を
「取得率 0%」として trend に積み、「取得率が下がり続けています(100%→0%)」と誤表示した
(`status-entry.js:1625-1634` のコメントに記録)。catchingUp 判定は `catchingUpVerdict.js` で
部分対処したが、**元の `recordedCount` の 0 潰しは残っている**。

### 実コードの所在(裏取り済み)
- `src/extension/status-entry.js:3506` `const recordedCount = numOr(s?.recordedCount, 0);`(summarizeOneLive)
  - 下流(同関数内): `:3548` `officialRatePct`(`recordedCount > 0 && …`)、`:3566` 返却値 `recordedCount`。
- **別経路の同じ潰し**: `status-entry.js:1617` `const rec = Number(s?.recordedCount) || 0;`
  → `:1619` `recorded += rec`(全配信の合計 KPI)、`:1640` `ratePct = official>0 ? recorded/official`。
  ここも undefined→0。KPI 合計と trend の材料に直結する。

### なぜ「別版で慎重に」か(波及)
- 合計 `recorded`(1619)で null を「スキップ」にするか「0 として足す」かで **取得率(ratePct)の
  分子が変わる**。表示の記録件数(§12.8 の正本 `displayRecordedCount.js`)とも整合を取る必要がある。
- `recordedCount > 0` の各所(3548・isCatchingUp 入力)で、null を false 側に落とすと「未観測」が
  「0 件」と同じ扱いに戻る。**未観測は判定を保留(null)にして、trend/率に積まない**のが正しい。

### 修正方針(段階・1版1変更)
1. **第1版**: `summarizeOneLive`(3506)で `recordedCount` を **`numOrNull` にして未観測は null**。
   返却先の表示(§12.8 `selectDisplayRecordedCount`)が null を「未取得(—)」として扱えるか確認し、
   `officialRatePct`(3548)は `recordedCount == null` なら率を出さない(今も `>0` ガードがあるので
   実質そのまま)。**表示だけ**の最小変更で、合計 KPI には触らない。
2. **第2版**: 合計経路(1617-1640)で、各 live の rec が未観測の間はその live を**率の母数から外す**
   (catchingUpVerdict と同じ「まだ始まっていない」を混ぜない思想)。trend に積む前にゲート。
3. 各版とも**回帰テストで「未観測は率/trend に積まない・観測0は積む」を固定**してから進む。
   「増えて減る/0 潰れ」を固定する既存方針(§12.8)に合わせる。
- ★**ライブ必須**: 配信を開いた直後(公式だけ判明・記録0の一瞬)を**実機で再現**し、
  「取得率が下がり続け」の誤発火が消えること、通常時に表示件数が変わらないことを census/実機で確認。

---

## フェーズ/依存
- 3項目は互いに独立。着手順の推奨: **項目2(鮮度ゲート・純関数で固めやすい)→ 項目1(広告カウンタ追加)
  → 項目4(KPI 波及が最大なので最後・段階導入)**。
- いずれも最終ゲートは「ライブ配信での census:watch(窓3分以上)+実機の目視」。
  クラウド単独では**実装と単体テストまで**。実機 OK が出てからマージ(§12.9 実機待ちの運用)。

## 参照
- 原則: AGENTS.md §3.6(外部API/未観測)・§12.7(診断の因果裏取り)・§12.8(記録件数の表示正本)。
- 既存の手本: `buriedInstrumentCells.js:120`(鮮度ゲート)・`catchingUpVerdict.js`(未観測を混ぜない)・
  `resolveOfficialPoints.js`(項目3で確立した優先順位の単一定義)。
