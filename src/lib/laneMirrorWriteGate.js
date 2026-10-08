/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】配信別の鏡(v2)を「同じ内容なら書かない」ための署名とゲート
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし(書くのは laneMirrorPerLivePublish.js)
 * 【正本宣言】鏡の書き込み抑制の判定(署名・60秒の鮮度床)はこのファイルのみ
 *
 * laneMirrorWriteGate.js — 配信別の鏡(v2)+受領証の無条件 storage.set を、内容が同じなら止める。
 *
 * ■ なぜ要るか(2026-10-08・設計 docs/handoff/ext-process-busy-census-DESIGN.md §C-④)
 *   拡張の全ページは1本のメインスレッドを共有し、storage.set のたびに【開いている全拡張ページへ
 *   onChanged が全文(old+new)で配られる】。鏡(約62KB)+受領証を renderStoryUserLane の呼び出しごとに
 *   無条件で書いていた(実機の描き直し3,628回・描画1,237回・内容は同じ)。
 *   ★測定(7ページ・鏡62KB×2を3秒ごと): 各ページが60秒で約2.4MB の通知を受けた。
 *
 * ■ 守ること(崩すと過去の実損が戻る)
 *   1. ★統計(stats)・バッジ(pulse)の変化は【書く】。これらは鍵(contentHash)に入れない決まり(ちらつき対策)なので、
 *      署名は contentHash ではなく【鏡の中身そのもの】(capturedAt と domSelf を除いた全体)から作る。
 *      contentHash で判定すると、件数が変わっても書かれず 🎁📣💬 が最大60秒止まる。
 *   2. ★60秒に1回は同内容でも書く(鮮度の床)。会場の鏡の有効窓は180秒(venueLaneMirrorSupply の SOFT 窓)。
 *      床を窓より小さく保つことで「鏡が656秒凍結した」実損の再発を構造で防ぐ。
 *   3. 受領証(domSelf)は署名に含めない: 表示面固有の受領証で、タイル寸法の突き合わせ用=分単位で足りる。
 *   4. 壊れた署名(空)は常に「書く」側へ倒す(判定できないときに止めない)。
 *
 * @module laneMirrorWriteGate
 */

import { CANONICAL_TIME_FIELD } from './timeAuthority.js';

/** 同内容でも書く間隔の下限[ms]。会場の鏡の有効窓(180秒)より十分小さく。 */
export const LANE_MIRROR_WRITE_FLOOR_MS = 60_000;
/** ゲートが覚える配信の最大数(配信を渡り歩いても太らない)。 */
const DEFAULT_MAX_LIVES = 8;

/**
 * 文字列の指紋(長さ+2種の32bit ハッシュ)。署名の全文を配信ごとに保持しない(約62KB×配信数のメモリを避ける)。
 * @param {string} s
 * @returns {string}
 */
function fingerprint(s) {
  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = (Math.imul(h2, 33) + c) | 0;
  }
  return `${s.length}:${(h1 >>> 0).toString(36)}:${(h2 >>> 0).toString(36)}`;
}

/**
 * 鏡の中身そのものの署名(capturedAt と domSelf を除く)。
 *   ★時刻を含めない(毎回別物になって抑制が効かない)・受領証を含めない(別キーに書く)・
 *   ★stats/pulse は含める(変化は書く)。壊れた入力は空文字(=ゲートは書く側に倒れる)。
 * @param {unknown} snap buildLaneMirrorSnapshot の戻り
 * @returns {string}
 */
export function laneMirrorWriteSignature(snap) {
  if (!snap || typeof snap !== 'object') return '';
  try {
    const rest = { .../** @type {Record<string, unknown>} */ (snap) };
    delete rest[CANONICAL_TIME_FIELD]; // 時刻は毎回変わる=署名に入れると抑制が効かない(フィールド名は時刻の正本 timeAuthority に委ねる)
    delete rest.domSelf; // 受領証本体は別キーに書く(測定時刻・寸法は毎回変わるので署名に入れない)
    // ★ただし受領証の【指紋】は入れる(内容ベースで、DOM が変わらなければ安定する)。タイルを描き直したら署名が変わり、
    //   受領証が最大60秒遅れて会場の診断が「未計測」になるのを防ぐ。
    const dom = /** @type {{ fingerprint?: unknown, fingerprintFor?: unknown }|undefined} */ (
      /** @type {Record<string, unknown>} */ (snap).domSelf
    );
    return fingerprint(`${JSON.stringify(rest)}|${String((dom && dom.fingerprint) || '')}|${String((dom && dom.fingerprintFor) || '')}`);
  } catch {
    return '';
  }
}

/**
 * 鏡の「構造」の目印(顔ぶれ・並び+受領証の指紋)。統計・バッジ・発言抜粋・時刻は含めない。
 *   構造が変わったら即書く/それ以外の変化は changeFloorMs にまとめる、の判定に使う(2026-10-08・実機の並べ比較)。
 *   ★contentHash は統計・バッジを入れない決まり(ちらつき対策)なので、構造の目印としてそのまま使える。
 * @param {unknown} snap buildLaneMirrorSnapshot の戻り
 * @returns {string}
 */
export function laneMirrorStructureKey(snap) {
  if (!snap || typeof snap !== 'object') return '';
  const o = /** @type {Record<string, any>} */ (snap);
  const dom = o.domSelf && typeof o.domSelf === 'object' ? o.domSelf : {};
  return `${String(o.contentHash || '')}|${String(dom.fingerprint || '')}|${String(dom.fingerprintFor || '')}`;
}

/**
 * @param {{ floorMs?: number, maxLives?: number, changeFloorMs?: number }} [opts]
 *   changeFloorMs: 構造が同じまま中身(統計・バッジ・発言抜粋)だけ変わったときの最短書き込み間隔[ms]。0=変化のたびに書く(従来)。
 */
export function createLaneMirrorWriteGate(opts = {}) {
  const floorMs = typeof opts.floorMs === 'number' && opts.floorMs > 0 ? opts.floorMs : LANE_MIRROR_WRITE_FLOOR_MS;
  const maxLives = typeof opts.maxLives === 'number' && opts.maxLives > 0 ? Math.floor(opts.maxLives) : DEFAULT_MAX_LIVES;
  const changeFloorMs = typeof opts.changeFloorMs === 'number' && opts.changeFloorMs > 0 ? opts.changeFloorMs : 0;
  /** @type {Map<string, { sig: string, at: number, struct: string }>} */
  const state = new Map();
  return {
    /**
     * @param {string} lid
     * @param {string} sig laneMirrorWriteSignature の戻り
     * @param {number} nowMs
     * @param {string} [structKey] laneMirrorStructureKey(顔ぶれ・並びの目印)。省略=構造は不明=変化は常に即書く側(従来)
     * @returns {{ write: boolean, reason: string }}
     */
    shouldWrite(lid, sig, nowMs, structKey) {
      const key = String(lid || '');
      const prev = state.get(key);
      const struct = typeof structKey === 'string' ? structKey : '';
      const changed = !!prev && sig !== prev.sig;
      // 中身だけの変化(構造が同じ)は changeFloorMs にまとめる。構造の変化・構造不明・床なしは即書く。
      const throttledChange = changed && changeFloorMs > 0 && !!struct && struct === prev.struct && nowMs >= prev.at && nowMs - prev.at < changeFloorMs;
      const write = !prev || !sig || nowMs < prev.at || (changed ? !throttledChange : nowMs - prev.at >= floorMs);
      if (!write) return { write: false, reason: throttledChange ? '中身だけの変化(最短間隔内)' : '同内容(60秒以内)' };
      state.delete(key); // 並びを「最後に書いた順」に保つ(上限を超えたら一番古い配信から忘れる)
      state.set(key, { sig, at: nowMs, struct });
      while (state.size > maxLives) {
        const oldest = state.keys().next().value;
        if (oldest === undefined) break;
        state.delete(oldest);
      }
      return { write: true, reason: '' };
    },
    /** 書き込みが失敗したとき等に呼ぶ: 次の shouldWrite は(同じ署名でも)書く側に倒れる。 */
    forget(/** @type {string} */ lid) {
      state.delete(String(lid || ''));
    },
    size() {
      return state.size;
    }
  };
}
