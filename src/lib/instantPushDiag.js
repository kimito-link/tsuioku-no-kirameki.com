/**
 * コメント即時プッシュレーン(storage迂回)の「送信N/受信N/表示遅延ms」観測値を
 * 組み立てる純関数群。commentPostDiag.js と同じ思想(content/popup が書き、status が読んで
 * 状態速報に再表示する。記録/演出/音には一切触れない)。
 *
 * 目的(2026-07-06): 大負荷時に storage 経由の表示配達が数秒〜十数秒化する問題への対策として
 * content→iframe 直接 postMessage(即時プッシュ)を新設した。この経路が実際に機能しているか
 * (送っているのに受けていない・受けているのに表示に反映されない等)を状態速報1枚で
 * 確認できるようにする。
 *
 * @typedef {{
 *   sentCount: number,      // content-entry が postMessage で送った回数(バッチ単位)
 *   sentRows: number,       // 送った行の累計件数
 *   receivedCount: number,  // popup-entry が nonce 照合に成功して受け取った回数
 *   receivedRows: number,   // 受け取った行の累計件数
 *   rejectedCount: number,  // nonce 不一致 / 型不正で破棄した回数
 *   paintedRows: number,    // 実際にレーン表示バッファへ合流できた行の累計件数(重複除く)
 *   lastGapMs: number,      // 直近1回の「送信→表示合流(描画完了)」ms(-1=未計測)
 *   avgGapMs: number,       // gapMs(描画完了まで)の EMA 平均ms(-1=未計測)
 *   lastDeliveryGapMs: number, // 直近1回の「送信→ハンドラ受信」ms=配達のみ(-1=未計測)
 *   avgDeliveryGapMs: number,  // deliveryGapMs の EMA 平均ms(-1=未計測)
 *   hiddenDeliveries: number,  // 受信時に document.hidden だったバッチ数(累計)
 *   visibleDeliveries: number, // 受信時に可視だったバッチ数(累計)
 *   avgVisibleDeliveryGapMs: number, // 可視中だけの配達 EMA 平均ms(-1=未計測)
 *   lastEventAt: number,    // 最後にイベントが起きた時刻(epoch ms・0=未観測)
 *   since: number           // ★集計の起点(epoch ms・0=不明)。下記 v0.1.1453 参照
 * }} InstantPushDiagState
 *
 * ★v0.1.1453 `since` を追加した理由(2026-08-19 の誤診):
 *   この計器は**リセット経路が存在しない生涯累計**。2026-08-19、送信/受信/破棄の
 *   3つを比で読んで「受信+破棄=送信の1.51倍=二重注入」という**誤った真因**に到達した。
 *   実際は導入 v0.1.1092(07-06)〜速報 v0.1.1413(08-17)の **6週間・約320版ぶん**が
 *   混ざっており、その間に nonce 機構自体が v0.1.1094 で変わっていた
 *   ＝**違うコードが書いた数を1つの比で語っていた**。
 *   ★`since` が無いと「1時間の値」と「6週間の値」が同じ顔で並ぶ。
 *   ★最初の1回だけ刻み、以後は上書きしない(縮むと分母がまた嘘になる)。
 *   ★過去データ(since 無しの累計)には**嘘の起点を付けない**＝0(不明)のまま。
 *
 * ★v0.1.1416 (2026-08-16 実機の矛盾を解くために追加):
 *   速報に「最大タイマー遅延=753ms ✅健全」と「配達平均47,686ms」が同時に出た。
 *   どちらも嘘ではなく、**測っている時間帯が違う**だけだった:
 *     - タイマー計器は hidden 中を数えない(Chrome の間引きを停止と誤報しないため)
 *     - postMessage は間引かれないので、配達 gap だけが hidden 中も伸び続ける
 *   ＝配達平均を1つの数で出す限り、「裏タブで溜まっただけ(正常)」と
 *     「可視なのに詰まっている(異常)」が混ざって**次の一手が決まらない**。
 *   可視中だけの平均を併記して、この2つを数字で分離する。
 *   ★新しい storage read は足さない(既存 delta に相乗り)=[[instrument-can-kill-the-page-it-measures-2026-08-16]]
 *
 * robust-arch Phase 0 (2026-07-07): lastGapMs/avgGapMs は「送信→**描画完了**」の全経路。
 *   これを「配達(送信→ハンドラ受信)」と「描画(受信→描画完了)」に分けるため
 *   lastDeliveryGapMs/avgDeliveryGapMs(配達のみ)を追加した。
 *
 * ★v0.1.1416 で【撤回】: 「描画分 ≈ avgGapMs - avgDeliveryGapMs」は**誤り**だった。
 *   この2つは母集団が違う EMA なので引いてはいけない:
 *     - avgDeliveryGapMs … 受信ハンドラで【毎バッチ】更新
 *     - avgGapMs         … 描画時に、バッファ内で commentNo を持つ【最後の1行だけ】が
 *                          sample になる(popup-entry.js のループが毎回上書きする)
 *   実機(2026-08-16)で両者が同程度に大きくなり、差が0付近に落ちて
 *   「描画平均0ms＝描画は無罪」と読めてしまった(そう読んで調査が止まった)。
 *   → 引き算は廃止し、両方をそのまま並べる。[[check-what-the-number-counts-2026-08-09]]
 */

/** 初期 即時プッシュ診断 state。 */
export function makeInitialInstantPushDiag() {
  return {
    sentCount: 0,
    sentRows: 0,
    receivedCount: 0,
    receivedRows: 0,
    rejectedCount: 0,
    paintedRows: 0,
    lastGapMs: -1,
    avgGapMs: -1,
    lastDeliveryGapMs: -1,
    avgDeliveryGapMs: -1,
    hiddenDeliveries: 0,
    visibleDeliveries: 0,
    avgVisibleDeliveryGapMs: -1,
    lastEventAt: 0,
    /*
     * ★v0.1.1453: 「いつから数えているか」(epoch ms・0=不明)。
     *   この計器は**リセット経路が無い生涯累計**で、2026-08-19 に
     *   6週間・約320版ぶんの累計を1つの比で語って**誤った真因**
     *   (「二重注入」)に到達した。since が無いと「1時間の値」と
     *   「6週間の値」が同じ顔で並ぶ＝**また同じ誤読が起きる**。
     *   ★最初の1回だけ刻み、以後は絶対に上書きしない(縮むと分母が嘘になる)。
     */
    since: 0
  };
}

/**
 * 直前の state に「今回の差分」を積算した次 state を作る純関数。
 *   sentCount/sentRows/receivedCount/receivedRows/rejectedCount/paintedRows は加算、
 *   lastGapMs は置換、avgGapMs は computeInstantPushGapAverage の呼び出し側が別途計算して
 *   渡す(このファイルは循環 import を避けるため EMA 計算自体は instantCommentPush.js 側)。
 *   lastEventAt は delta.lastEventAt があれば採用、無ければ既存値を保持。
 * @param {Partial<InstantPushDiagState>|null|undefined} prev
 * @param {{ sentCount?: number, sentRows?: number, receivedCount?: number, receivedRows?: number,
 *   rejectedCount?: number, paintedRows?: number, lastGapMs?: number, avgGapMs?: number,
 *   lastDeliveryGapMs?: number, avgDeliveryGapMs?: number, hiddenDeliveries?: number,
 *   visibleDeliveries?: number, avgVisibleDeliveryGapMs?: number, lastEventAt?: number }} delta
 * @returns {InstantPushDiagState}
 */
export function applyInstantPushDiagDelta(prev, delta) {
  const base = buildInstantPushDiagSnapshotInternal(prev);
  const d = delta && typeof delta === 'object' ? delta : {};
  /** @param {unknown} x @returns {number} */
  const addend = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  /**
   * delta にキーがあれば置換・無ければ既存維持(diagFlushThrottle の畳み込み契約)。
   * @param {unknown} x @param {number} keep @returns {number}
   */
  const replaceOrKeep = (x, keep) => (x != null && Number.isFinite(Number(x)) ? Number(x) : keep);
  return {
    sentCount: base.sentCount + addend(d.sentCount),
    sentRows: base.sentRows + addend(d.sentRows),
    receivedCount: base.receivedCount + addend(d.receivedCount),
    receivedRows: base.receivedRows + addend(d.receivedRows),
    rejectedCount: base.rejectedCount + addend(d.rejectedCount),
    paintedRows: base.paintedRows + addend(d.paintedRows),
    lastGapMs: replaceOrKeep(d.lastGapMs, base.lastGapMs),
    avgGapMs: replaceOrKeep(d.avgGapMs, base.avgGapMs),
    lastDeliveryGapMs: replaceOrKeep(d.lastDeliveryGapMs, base.lastDeliveryGapMs),
    avgDeliveryGapMs: replaceOrKeep(d.avgDeliveryGapMs, base.avgDeliveryGapMs),
    // 可視/hidden の件数は累計(加算)、可視平均は EMA なので置換。
    hiddenDeliveries: base.hiddenDeliveries + addend(d.hiddenDeliveries),
    visibleDeliveries: base.visibleDeliveries + addend(d.visibleDeliveries),
    avgVisibleDeliveryGapMs: replaceOrKeep(
      d.avgVisibleDeliveryGapMs,
      base.avgVisibleDeliveryGapMs
    ),
    lastEventAt: replaceOrKeep(d.lastEventAt, base.lastEventAt),
    /*
     * ★since は【最初の1回だけ】刻む(以後は上書きしない)。
     *   - 既に刻まれている        → そのまま保持
     *   - ★既存の累計があるのに since が無い(v0.1.1452 以前の保存値)
     *     → **0(不明)のまま**。ここで今の時刻を刻むと、6週間ぶんの累計に
     *       「たった今から」という嘘の期間が付き、分母がまた嘘になる
     *   - まっさらから始まった   → delta の lastEventAt を起点にする
     *     (時刻が無ければ 0=不明のまま。推測で刻まない)
     */
    since: (() => {
      if (base.since > 0) return base.since;
      const hadHistory =
        base.sentCount > 0 || base.receivedCount > 0 || base.rejectedCount > 0 ||
        base.sentRows > 0 || base.receivedRows > 0 || base.paintedRows > 0;
      if (hadHistory) return 0; // ★いつからか分からない過去データ。騙らない。
      const at = Number(d.lastEventAt);
      return Number.isFinite(at) && at > 0 ? at : 0;
    })()
  };
}

/** @param {Partial<InstantPushDiagState>|null|undefined} diag @returns {InstantPushDiagState} */
function buildInstantPushDiagSnapshotInternal(diag) {
  const base = makeInitialInstantPushDiag();
  const d = /** @type {any} */ (diag && typeof diag === 'object' ? diag : {});
  /** @param {unknown} x @param {number} fallback @returns {number} */
  const num = (x, fallback) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    sentCount: num(d.sentCount, base.sentCount),
    sentRows: num(d.sentRows, base.sentRows),
    receivedCount: num(d.receivedCount, base.receivedCount),
    receivedRows: num(d.receivedRows, base.receivedRows),
    rejectedCount: num(d.rejectedCount, base.rejectedCount),
    paintedRows: num(d.paintedRows, base.paintedRows),
    lastGapMs: num(d.lastGapMs, base.lastGapMs),
    avgGapMs: num(d.avgGapMs, base.avgGapMs),
    lastDeliveryGapMs: num(d.lastDeliveryGapMs, base.lastDeliveryGapMs),
    avgDeliveryGapMs: num(d.avgDeliveryGapMs, base.avgDeliveryGapMs),
    hiddenDeliveries: num(d.hiddenDeliveries, base.hiddenDeliveries),
    visibleDeliveries: num(d.visibleDeliveries, base.visibleDeliveries),
    avgVisibleDeliveryGapMs: num(d.avgVisibleDeliveryGapMs, base.avgVisibleDeliveryGapMs),
    lastEventAt: num(d.lastEventAt, base.lastEventAt),
    // ★v0.1.1453: 集計の起点(0=不明)。過去データには無いので既定は 0。
    since: num(d.since, base.since)
  };
}

/**
 * storage 書き込み用の軽量スナップショット(欠損は初期値で埋める)。既存 storage 値との
 *   read-merge-write を呼び出し側で行う前提の「不足フィールドを補う」正規化。
 * @param {Partial<InstantPushDiagState>|null|undefined} diag
 * @param {number} [nowMs]
 * @returns {InstantPushDiagState & { capturedAt: number }}
 */
export function buildInstantPushDiagSnapshot(diag, nowMs) {
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  return { ...buildInstantPushDiagSnapshotInternal(diag), capturedAt: now };
}

/**
 * 状態速報に出す行群を作る純関数。一度もプッシュイベントが無ければ空配列
 * (ノイズにしない・commentPostDiag.js と同方針)。
 * @param {(InstantPushDiagState & { capturedAt?: number })|null|undefined} snap
 * @param {number} nowMs 現在時刻(最終イベント ago の算出用)
 * @returns {string[]}
 */
export function buildInstantPushDiagLines(snap, nowMs) {
  if (!snap || typeof snap !== 'object') return [];
  const sentRows = Number(snap.sentRows) || 0;
  const receivedRows = Number(snap.receivedRows) || 0;
  if (sentRows === 0 && receivedRows === 0) return []; // 未観測=このセッションでプッシュが無かった
  const sentCount = Number(snap.sentCount) || 0;
  const receivedCount = Number(snap.receivedCount) || 0;
  const rejectedCount = Number(snap.rejectedCount) || 0;
  const paintedRows = Number(snap.paintedRows) || 0;
  const lastGapMs = Number(snap.lastGapMs);
  const avgGapMs = Number(snap.avgGapMs);
  const avgDeliveryGapMs = Number(snap.avgDeliveryGapMs);
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const lastAt = Number(snap.lastEventAt) || 0;
  const agoText = lastAt > 0 && now > 0 ? ` / 最終${Math.max(0, Math.round((now - lastAt) / 1000))}秒前` : '';
  const gapText =
    Number.isFinite(lastGapMs) && lastGapMs >= 0
      ? `表示遅延 直近${lastGapMs}ms${Number.isFinite(avgGapMs) && avgGapMs >= 0 ? `(平均${avgGapMs}ms)` : ''}`
      : '表示遅延 未計測';
  /*
   * ★v0.1.1453: 「いつから数えているか」を必ず併記する。
   *
   *   2026-08-19、この行の3つの数(送信/受信/破棄)を比で読んで
   *   「受信+破棄=送信の1.51倍=二重注入」という**誤った真因**に到達した。
   *   実際は**リセット経路が無い生涯累計**で、6週間・約320版ぶんが混ざっていた
   *   (その間に nonce 機構自体が変わっている＝違うコードが書いた数を足していた)。
   *
   *   ★期間が見えないと、読み手は「いま起きていること」だと思い込む。
   *   since=0(不明・過去データ)のときは**期間を騙らない**。
   */
  const since = Number(snap.since) || 0;
  const spanText = (() => {
    if (!(since > 0) || !(now > since)) return '';
    const days = Math.floor((now - since) / 86_400_000);
    if (days >= 1) return ` / 集計${days}日ぶん`;
    const hours = Math.floor((now - since) / 3_600_000);
    if (hours >= 1) return ` / 集計${hours}時間ぶん`;
    return ' / 集計1時間未満';
  })();
  const lines = [
    `即時プッシュ: 送信${sentCount}件(行${sentRows}) / 受信${receivedCount}件(行${receivedRows}) / 破棄${rejectedCount} / 表示反映${paintedRows}行${agoText}${spanText}`,
    `  → ${gapText}`
  ];
  // robust-arch Phase 0: 配達(送信→受信) と 描画(受信→描画完了) の内訳を1行で見せる。
  //   どちらが支配的かで MVP 後の次の一手が数値で決まる(嘘をつかないため未計測は出さない)。
  if (Number.isFinite(avgDeliveryGapMs) && avgDeliveryGapMs >= 0) {
    /*
     * ★v0.1.1416: 「描画平均」を引き算で出すのをやめた。
     *   avgGapMs と avgDeliveryGapMs は **母集団が違う** EMA:
     *     - avgDeliveryGapMs … 受信ハンドラで【毎バッチ】更新
     *     - avgGapMs         … 描画時に、バッファ内で commentNo を持つ
     *                          【最後の1行だけ】が gapSample になる(popup-entry.js の
     *                          ループが毎回上書きするため)
     *   引いてよい2数ではないのに引いていたので、両者が同程度に大きいと
     *   差が0付近に落ち、実機で「描画平均0ms」=**描画は無罪**と読めてしまった。
     *   ＝無罪の証明になっていない。引き算をやめ、両方をそのまま並べる。
     *   [[check-what-the-number-counts-2026-08-09]]
     */
    const paintPart =
      Number.isFinite(avgGapMs) && avgGapMs >= 0 ? ` / 送信→描画平均${avgGapMs}ms` : '';
    lines.push(`  → 内訳: 配達平均${avgDeliveryGapMs}ms${paintPart}`);

    /*
     * ★配達が遅いとき、それが「裏タブで溜まっただけ(正常)」なのか
     *   「可視なのに詰まっている(異常)」なのかを分ける。ここが次の一手の分岐点。
     */
    const hiddenN = Number(snap.hiddenDeliveries) || 0;
    const visibleN = Number(snap.visibleDeliveries) || 0;
    const avgVisible = Number(snap.avgVisibleDeliveryGapMs);
    if (hiddenN > 0 || visibleN > 0) {
      const visiblePart =
        Number.isFinite(avgVisible) && avgVisible >= 0
          ? `可視中の配達平均${avgVisible}ms`
          : '可視中の配達は未計測';
      lines.push(`  → ${visiblePart}(可視${visibleN}件 / 裏タブ${hiddenN}件)`);
      /*
       * 次の一手を1行で言う([[instrument-must-name-the-cause-2026-08-01]])。
       * 全体平均が大きくても可視中が小さいなら、それは裏タブのタイマー間引きで
       * 説明が付く=体感には出ない。追うべきは可視中の値。
       */
      if (Number.isFinite(avgVisible) && avgVisible >= 0) {
        lines.push(
          avgVisible >= 1000
            ? '  → 🔴可視中でも配達が1秒超=iframeのイベントループが詰まっている(描画側を直しても消えない)'
            : '  → ✅可視中の配達は健全=全体平均の大きさは裏タブ滞留で説明が付く(体感には出ない)'
        );
      }
    }
  }
  return lines;
}
