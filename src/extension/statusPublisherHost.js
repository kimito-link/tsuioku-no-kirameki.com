/**
 * 【層】L2 画面層(DOM・chrome を触る。判定は statusPublisherPlan.js に任せる)
 * 【この箱に入るもの】サイドパネルの中に、見えない状態画面(送信担当)の iframe を1つ置く処理
 * 【この箱に入らないもの】送信そのもの(status-entry.js の既存の自動公開がやる)・判定の理屈(statusPublisherPlan.js)
 * 【書けるstorageキー】なし(読むだけ)
 *
 * ★設計の理由と起動条件は statusPublisherPlan.js の冒頭。ここは「いつ・どう置くか」だけ。
 *   - 開いて15秒後(幕を重くしない)から確認。キーと同意が無ければ何もしない。60秒ごとに再確認(別のパネルが閉じたら引き継ぐ)。
 *   - iframe は 1px・透明・操作不能・読み上げ対象外。位置は固定(レイアウトを動かさない)。
 *   - 既存の `document.querySelector('iframe')`(サイドパネルの計器が最初の iframe を見る)を壊さないよう、必ず body の【末尾】へ足す。
 * @module statusPublisherHost
 */
import {
  STATUS_PUBLISHER_PATH,
  STATUS_PUBLISHER_RECHECK_MS,
  STATUS_PUBLISHER_START_DELAY_MS,
  decideStatusPublisherStart,
  isStatusPublisherLockHeld
} from '../lib/statusPublisherPlan.js';
import {
  KEY_STATUS_DEVICE_CRED as KEY_DEVICE_CRED,
  KEY_STATUS_UPLOAD_CONFIG as KEY_UPLOAD_CONFIG,
  KEY_WEB_PUBLISH_OPT_IN as KEY_OPT_IN
} from '../lib/storageKeys.js';
import { parseDeviceCred } from '../lib/devicePublishCredentials.js';

/**
 * @param {{
 *   document: Document, storage: { get: (keys: string[]) => Promise<Record<string, any>> },
 *   locks?: any, getUrl: (path: string) => string,
 *   setTimeout?: typeof setTimeout, setInterval?: typeof setInterval, delayMs?: number, recheckMs?: number
 * }} deps
 */
export function startStatusPublisherHost(deps) {
  const st = deps.setTimeout || globalThis.setTimeout;
  const si = deps.setInterval || globalThis.setInterval;
  const state = { started: false, lastReason: '', checks: 0 };
  /** @type {any} */ let timer = null;

  const tick = async () => {
    if (state.started) return state;
    state.checks += 1;
    try {
      // 印(data-nl-status-publisher)で、この文書にもう置いてあれば二重に置かない(再読み込みや二重呼び出しの保険)。
      if (deps.document.querySelector && deps.document.querySelector('iframe[data-nl-status-publisher]')) {
        state.started = true;
        state.lastReason = 'already_in_dom';
        return state;
      }
      const bag = await deps.storage.get([KEY_UPLOAD_CONFIG, KEY_OPT_IN, KEY_DEVICE_CRED]);
      const cfg = bag?.[KEY_UPLOAD_CONFIG];
      const decision = decideStatusPublisherStart({
        // ★v0.1.1731: 共有キー、または利用者ごとの鍵(状態画面が同意 ON のときにもらう)があれば送信担当を置く。
        hasKeys:
          Boolean(cfg && String(cfg.ingestKey || '').trim() && String(cfg.viewToken || '').trim()) ||
          Boolean(parseDeviceCred(bag?.[KEY_DEVICE_CRED], '')),
        optedIn: bag?.[KEY_OPT_IN] === true,
        lockHeld: await isStatusPublisherLockHeld(deps.locks),
        alreadyStarted: state.started,
        hidden: deps.document.visibilityState === 'hidden'
      });
      state.lastReason = decision.reason;
      if (!decision.start) return state;
      const iframe = deps.document.createElement('iframe');
      iframe.setAttribute('src', deps.getUrl(STATUS_PUBLISHER_PATH));
      iframe.setAttribute('tabindex', '-1');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('title', 'status publisher');
      iframe.setAttribute('data-nl-status-publisher', '1');
      iframe.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0;';
      deps.document.body.appendChild(iframe);
      state.started = true;
      if (timer != null) { try { globalThis.clearInterval(timer); } catch { /* no-op */ } timer = null; }
    } catch {
      state.lastReason = 'error';
    }
    return state;
  };

  st(() => {
    void tick();
    if (!state.started) timer = si(() => { void tick(); }, deps.recheckMs ?? STATUS_PUBLISHER_RECHECK_MS);
  }, deps.delayMs ?? STATUS_PUBLISHER_START_DELAY_MS);
  return { tick, state };
}
