/**
 * venueOpenCache.js — 「会場モードが開いているか」を安く保持する。
 *
 * ★なぜ storage を毎tick読まないか
 *   ①POP の tick は 3秒ごとに回る。ここで storage read を足すと
 *   単一LevelDB の競合を増やし、診断が重くなる既知の地雷を踏む
 *   ([[status-extras-read-not-core-read]])。
 *   → **onChanged で更新される変数**を持ち、tick は同期で読むだけにする。
 *
 * ★v0.1.1397: fail-open を【撤回】した(私の退行だったため)。
 *
 * ■ 何が起きたか(2026-08-14 実機・ユーザー「とんでもないひどい状態です」)
 *   v1394 は「分からないなら書く」に倒した。ところが会場を一度も開いていない
 *   環境では既定 true のまま = **隠れている popup が毎tick renderStoryUserLane を
 *   走らせ続けた**。2配信を同時に開くと両方が storage を奪い合い、
 *   描き直し14,965回・self_write_skipped 89% という異常値になった。
 *   ＝「書く方が無害」は**誤り**。書く側にも実コストがある。
 *
 * ■ いまの方針: **確認できたときだけ書く**(既定は書かない)。
 *   会場が開いていることを storage で確認できた場合のみ true。
 *   ★これで v1394 の根治(会場が開いていれば鏡を書く)は維持したまま、
 *     会場を使っていない人に余計な負荷を掛けない。
 *
 * @module venueOpenCache
 */
/*
 * ★v0.1.1425: 実際に購読するのは【現在状態キー】(venueLiveOpenFlag.js)。
 *   下の KEY_VENUE_OPEN は【復元用】で、venueBar.js の書き込みが
 *   「状態を復元しない」というユーザー要望のためコメントアウトされている。
 *   ＝このキーは永久に undefined → isVenueOpenCached() が常に false →
 *     v0.1.1394 の「会場が開いていれば鏡を書く」分岐が一度も通らなかった。
 *   実機: 会場は3人なのに `鏡stale(656s) … tanu332`(11分前・別配信)が居座る。
 *   ★旧キーも読み続ける(将来 venueBar 側で復元が復活したとき両方効くように)。
 */
import { KEY_VENUE_LIVE_OPEN, isVenueLiveOpen } from './venueLiveOpenFlag.js';

/** 会場が開いているかの storage キー(venueBar.js の OPEN_STORAGE_KEY と同値)。 */
export const KEY_VENUE_OPEN = 'nls_venue_open';

/** @type {boolean} 直近の値。★初期値 false=確認できるまで書かない(v1397で反転)。 */
let _venueOpen = false;

/** @returns {boolean} */
export function isVenueOpenCached() {
  return _venueOpen;
}

/**
 * storage の生値を取り込む。
 * @param {unknown} raw
 * @returns {boolean} 取り込み後の値
 */
export function setVenueOpenFromRaw(raw) {
  // venueBar.js は真偽値/オブジェクトのどちらでも書きうるので広く受ける。
  if (raw == null) {
    // ★キーが無い=一度も会場を開いていない。この場合だけ false に倒してよい
    //   (読み手が存在しないので書かなくても誰も困らない)。
    _venueOpen = false;
    return _venueOpen;
  }
  if (typeof raw === 'boolean') { _venueOpen = raw; return _venueOpen; }
  if (typeof raw === 'object') {
    const o = /** @type {any} */ (raw);
    if (typeof o.open === 'boolean') { _venueOpen = o.open; return _venueOpen; }
    if (typeof o.enabled === 'boolean') { _venueOpen = o.enabled; return _venueOpen; }
    // ★形が不明でも true にしない(v1394の退行の元)。開いている確証だけを信じる。
    _venueOpen = false;
    return _venueOpen;
  }
  _venueOpen = Boolean(raw);
  return _venueOpen;
}

/** テスト用リセット。 */
export function _resetVenueOpenCache() {
  _venueOpen = false;
}

/**
 * storage を購読して自動追従する(副作用・popup 側から1回だけ呼ぶ)。
 * ★毎tick read しない=単一LevelDBの競合を増やさない。
 * @param {any} [chromeApi]
 */
export function watchVenueOpen(chromeApi) {
  try {
    const api = chromeApi || globalThis.chrome;
    const local = api?.storage?.local;
    if (!local?.get) return;
    void local.get([KEY_VENUE_OPEN, KEY_VENUE_LIVE_OPEN])
      .then((/** @type {any} */ bag) => {
        // ★現在状態キーを優先。無ければ旧キー(将来復活したときのため)。
        if (isVenueLiveOpen(bag?.[KEY_VENUE_LIVE_OPEN], Date.now())) {
          _venueOpen = true;
          return;
        }
        setVenueOpenFromRaw(bag?.[KEY_VENUE_OPEN]);
      })
      .catch(() => { /* 読めない=書かない側のまま */ });
    api?.storage?.onChanged?.addListener?.((/** @type {any} */ changes, /** @type {any} */ area) => {
      if (area !== 'local' || !changes) return;
      if (KEY_VENUE_LIVE_OPEN in changes) {
        // ★会場が「開いた/閉じた」を押すたびにここへ来る(ハートビート含む)。
        _venueOpen = isVenueLiveOpen(changes[KEY_VENUE_LIVE_OPEN]?.newValue, Date.now());
        return;
      }
      if (KEY_VENUE_OPEN in changes) setVenueOpenFromRaw(changes[KEY_VENUE_OPEN]?.newValue);
    });
  } catch {
    /* 購読に失敗しても既定(書かない)で動く */
  }
}
