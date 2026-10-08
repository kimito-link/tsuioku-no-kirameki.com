// ext-census-sw.js — Service Worker 側: 各拡張文書の「忙しさ」報告を受けて、storage の台帳へ足す。
//   backfill-sw-entry.js(SW の IIFE バンドル)から import されて、SW 起動時に onMessage を登録する。
//
// ■ なぜ SW が書くのか
//   各文書が直接 storage に書くと、書き込みごとに全拡張ページへ onChanged が配られる(診断が負荷を増やす本末転倒)。
//   書き手を SW 1 か所に絞り、文書は runtime.sendMessage で要約(≤400B)を送るだけにする。
// ■ SW は 30 秒で眠って記憶を失う
//   台帳はメモリに持たず、報告のたびに storage から「読んで・足して・書く」。同時に来た報告は直列化する。
//   書き込みは 1 通あたり ≤約4KB(最大 10 文書ぶん)・文書数 N なら 1 分あたり最大 N 回。
// ■ 記録(コメント保存)の経路には一切触らない(記録系の storage キーを読まない・書かない)。台帳キー1つだけを読み書きする。
import { mergeCensusReport } from '../lib/extDocBusyCensus.js';
import { KEY_EXT_PROCESS_CENSUS, EXT_CENSUS_MESSAGE_TYPE } from '../lib/extProcessCensusKey.js';

/**
 * 報告を台帳へ足す関数を作る(直列化・失敗は握る)。
 * @param {{ storage: { get: (k: string) => Promise<any>, set: (o: Record<string, unknown>) => Promise<void> }, now?: () => number }} deps
 * @returns {(report: unknown) => Promise<void>}
 */
export function createCensusWriter(deps) {
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  /** @type {Promise<void>} */
  let chain = Promise.resolve();
  return (report) => {
    chain = chain
      .then(async () => {
        const got = await deps.storage.get(KEY_EXT_PROCESS_CENSUS);
        const rec = mergeCensusReport(got ? got[KEY_EXT_PROCESS_CENSUS] : null, report, now());
        await deps.storage.set({ [KEY_EXT_PROCESS_CENSUS]: rec });
      })
      .catch(() => {
        /* 診断の失敗で次の報告を止めない */
      });
    return chain;
  };
}

/**
 * onMessage を登録する(自拡張からの NLS_DOC_CENSUS だけ受ける)。
 * @param {any} chromeApi
 * @param {{ now?: () => number }} [opts]
 */
export function registerExtCensusSw(chromeApi, opts = {}) {
  const write = createCensusWriter({ storage: chromeApi.storage.local, now: opts.now });
  chromeApi.runtime.onMessage.addListener((/** @type {any} */ msg, /** @type {any} */ sender) => {
    if (!msg || msg.type !== EXT_CENSUS_MESSAGE_TYPE) return false;
    if (!sender || sender.id !== chromeApi.runtime.id) return false;
    void write(msg.report);
    return false; // 応答は返さない(同期で閉じる)
  });
}

try {
  // @ts-ignore — SW グローバル。テスト/非拡張環境では chrome が無いので何もしない。
  const c = typeof chrome !== 'undefined' ? chrome : null;
  if (c && c.runtime && c.runtime.onMessage && c.storage && c.storage.local) registerExtCensusSw(c);
} catch {
  /* no-op: 登録失敗でも SW の他機能を止めない */
}
