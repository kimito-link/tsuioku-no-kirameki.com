/**
 * サイドパネルの iframe(中の popup)の読み込みを「親の最初の描画のあと」まで遅らせる、読み込み役(時計・iframe は引数で受け取る)。v0.1.1693
 *
 * ■ なぜ要るか(2026-10-19・実機の黒い幕の記録)
 *   サイドパネルを開いて縞(黒い幕)が見えている長さ=親(sidepanel.html)の最初の描画までの時間。
 *   実機の起動の年表で、親の最初の描画と中の popup の最初の描画の差が 1〜2ms だった。親は無地のクリーム色なのに、
 *   中の popup(HTML 495KB・スクリプト 1.5MB)の解析・スタイル計算が同じ主スレッドで先に走り、親の最初のフレームも遅れていた疑いが強い。
 *   → iframe の src を、親の最初の描画の【後】に付ける。親は自分だけで先に最初のフレームを出せる。
 *
 * ■ 単一障害点にしない(v0.1.1419 の教訓・v0.1.1421 で撤回した事故の再発防止)
 *   当時は src を JS で付ける設計で、その JS が走らなければパネルが永久に空(全面真っ黒)になった。
 *   今回の守り(重ねる):
 *     1. この役は極小の別スクリプト(sidepanel-iframe-boot)に隔離し、重い本体(sidepanel.js)より前に読ませる=本体が壊れても動く。
 *     2. 関門(親の最初の描画)が開かなくても、IFRAME_FAILSAFE_MS で【必ず】読み込ませる(保険タイマーは最初に立てる)。
 *     3. 関門が壊れても(reject)・探索が失敗しても、素の src で読み込む。
 *     4. 同じ src を2回付けない(二重ロードしない)。
 *   ★ビルドで dist/sidepanel-iframe-boot.js が出荷物に入っていることを stage-submission が必須にする。
 *
 * ■ lv が無いとき(ツールバーから開いた)の自力探索(v0.1.1435)
 *   最初の読み込みを探索の結果に合わせる(IFRAME_PICK_MAX_WAIT_MS まで待つ)=素の src を先に読み込んで二重ロードしない。
 *   探索が間に合わなければ素の src で読み込み、遅れて分かった lv で付け替える(従来と同じ)。
 * @module sidepanelIframeLoader
 */

/** 親の最初の描画を待つ上限(ms)。呼び出し側が関門を作るときの目安(この値で諦めて読み込ませる)。 */
export const IFRAME_START_MAX_WAIT_MS = 120;
/** lv の自力探索を待つ上限(ms)。 */
export const IFRAME_PICK_MAX_WAIT_MS = 300;
/** 何があっても iframe を読み込ませる時刻(ms)=保険。 */
export const IFRAME_FAILSAFE_MS = 1500;

/**
 * @param {{
 *   iframe: { setAttribute: (name: string, value: string) => void },
 *   base: string,
 *   target: string,
 *   needsPick: boolean,
 *   pickSrc?: () => Promise<string>,
 *   gatePromise: Promise<unknown>,
 *   setTimer: (fn: () => void, ms: number) => unknown
 * }} deps
 *   base=素の src / target=lv が取れているときの lv 付きの src(取れていなければ base) /
 *   needsPick=lv が無く自力探索が要るか / pickSrc=探索して lv 付きの src を返す(取れなければ '') /
 *   gatePromise=親の最初の描画(か上限の時間)で解決する関門
 * @returns {{ run: () => void, update: (src: string) => void }}
 */
export function createSidepanelIframeLoader(deps) {
  const { iframe, base, target, needsPick, pickSrc, gatePromise, setTimer } = deps;
  let loaded = false;
  let started = false;
  let current = '';
  /** v0.1.1696: 読み込む前に「見せる配信が変わった」と分かったときの src(次に付ける src をこれに差し替える)。 */
  let override = '';

  /** 最初は付ける。付けたあとは「違う src のときだけ」付け替える(同じ値を付け直して再読み込みさせない)。 @param {string} src */
  const load = (src) => {
    const s = String(src || base || '');
    if (!s) return;
    if (!loaded) {
      loaded = true;
      current = s;
      iframe.setAttribute('src', s);
      return;
    }
    if (s !== current) {
      current = s;
      iframe.setAttribute('src', s);
    }
  };

  return {
    run() {
      if (started) return;
      started = true;
      // ★保険を最初に立てる(以降の処理が何で失敗しても、ここは動く)。
      setTimer(() => {
        if (!loaded) load(override || target || base);
      }, IFRAME_FAILSAFE_MS);

      const gateDone = Promise.resolve(gatePromise).then(
        () => {},
        () => {}
      );
      if (!needsPick || typeof pickSrc !== 'function') {
        void gateDone.then(() => load(override || target));
        return;
      }
      let pickedSrc = '';
      const pickP = Promise.resolve()
        .then(() => pickSrc())
        .then(
          (s) => {
            pickedSrc = typeof s === 'string' ? s : '';
          },
          () => {
            pickedSrc = '';
          }
        );
      const pickCapped = Promise.race([pickP, new Promise((resolve) => { setTimer(() => resolve(undefined), IFRAME_PICK_MAX_WAIT_MS); })]);
      void Promise.all([gateDone, pickCapped]).then(() => load(override || pickedSrc || target));
      // 遅れて lv が分かったら付け替える(読み込み済みで、違う src のときだけ)。
      void pickP.then(() => {
        if (loaded && pickedSrc && pickedSrc !== current) load(pickedSrc);
      });
    },
    /**
     * v0.1.1696: 見せる配信が変わったとき(別の watch タブがアクティブになった)に呼ぶ。
     *   まだ読み込む前なら、次に付ける src を差し替える。読み込み済みなら、違う src のときだけ付け替える(同じなら何もしない)。
     * @param {string} src
     */
    update(src) {
      const s = String(src || '');
      if (!s) return;
      if (!loaded) {
        override = s;
        return;
      }
      load(s);
    }
  };
}
