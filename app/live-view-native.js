/**
 * iPhone アプリ(mobile/・Capacitor の server.url 型)の中でだけ動く「アプリだけの機能」。
 *
 * ■ アプリの外(Safari・PC のブラウザ)では何もしない
 *   window.Capacitor が無い・isNativePlatform() が true でないときは、ボタンも出さず、通知も振動もしない。
 * ■ できること
 *   1. ギフトが届いたら通知(画面を閉じて読み上げを聞いている間も)。🔔 で ON/OFF(既定 OFF・押したときに許可を聞く)。
 *   2. ギフトが届いたら振動(🔔 が ON のとき・画面を見ている間)。
 *   3. 画面を閉じても読み上げを続ける(🗣 が ON のとき)。iOS の「裏で音を鳴らす」許可(Info.plist の
 *      UIBackgroundModes=audio)とあわせて、声と新着の取りに行きを止めない。
 *   4. 配信ページを共有シートで送る(📤)。
 * ■ プラグイン
 *   @capacitor/local-notifications・@capacitor/haptics・@capacitor/share(mobile/package.json)。
 *   読み込む先はサーバーのページなので、ネイティブ側が登録したプラグインを Capacitor.Plugins から使う。
 *
 * @module live-view-native
 */
import { giftNoticeText, pickNewGiftsForNotice } from '../src/lib/phoneNativeCues.js';

const NOTIFY_KEY = 'nls_phone_native_notify_v1';

function readOn() {
  try { return globalThis.localStorage?.getItem(NOTIFY_KEY) === 'on'; } catch { return false; }
}
function writeOn(on) {
  try { globalThis.localStorage?.setItem(NOTIFY_KEY, on ? 'on' : 'off'); } catch { /* 覚えられなくても今は動く */ }
}

/**
 * @param {{ cap?: any, isHidden?: () => boolean, voiceOn?: () => boolean }} [a]
 */
export function createPhoneNative(a = {}) {
  const cap = a.cap !== undefined ? a.cap : /** @type {any} */ (globalThis).Capacitor;
  const isHidden = a.isHidden || (() => typeof document !== 'undefined' && document.hidden);
  let native = false;
  try { native = Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()); } catch { native = false; }
  /** @param {string} name */
  const plugin = (name) => {
    if (!native) return null;
    try {
      return (cap.Plugins && cap.Plugins[name]) || (typeof cap.registerPlugin === 'function' ? cap.registerPlugin(name) : null);
    } catch {
      return null;
    }
  };
  let voiceOn = a.voiceOn || (() => false);
  let on = native && readOn();
  /** @type {Set<string>|null} */
  let seen = null;
  let nextId = 1;
  const listeners = new Set();
  const notify = () => listeners.forEach((f) => { try { f(); } catch { /* 描き直しの失敗は無視 */ } });

  async function ensurePermission() {
    const ln = plugin('LocalNotifications');
    if (!ln) return false;
    try {
      const cur = await ln.checkPermissions();
      if (cur && cur.display === 'granted') return true;
      const req = await ln.requestPermissions();
      return Boolean(req && req.display === 'granted');
    } catch {
      return false;
    }
  }

  /** @param {{ name: string, itemName: string, point: number }[]} gifts */
  function announce(gifts) {
    if (isHidden()) {
      const text = giftNoticeText(gifts);
      const ln = plugin('LocalNotifications');
      if (text && ln) {
        nextId = (nextId % 100000) + 1;
        void Promise.resolve(ln.schedule({ notifications: [{ id: nextId, title: text.title, body: text.body }] })).catch(() => {});
      }
      return;
    }
    const hp = plugin('Haptics');
    if (hp) void Promise.resolve(hp.impact({ style: 'MEDIUM' })).catch(() => {});
  }

  return {
    isNative: () => native,
    isOn: () => on,
    /** 画面を閉じても声と新着を取りに行き続けるか(アプリの中で、読み上げが ON のときだけ)。 */
    keepAliveInBackground: () => native && Boolean(voiceOn()),
    /** @param {() => boolean} f */
    setVoiceOn(f) { voiceOn = f; },
    /** タップの中で呼ぶ。ON にするときに通知の許可を聞く(断られたら OFF のまま)。 */
    async toggle() {
      if (!native) return false;
      if (on) {
        on = false;
      } else {
        on = await ensurePermission();
      }
      writeOn(on);
      notify();
      return on;
    },
    /** 新しいスナップショットのコメント鏡の行。増えたギフトがあれば知らせる。 @param {any[]} rows */
    onRows(rows) {
      if (!native) return 0;
      const r = pickNewGiftsForNotice({ rows, seen });
      seen = r.seen;
      if (on && r.gifts.length) announce(r.gifts);
      return r.gifts.length;
    },
    /** 共有シートで URL を送る。 @param {{ title: string, url: string }} x */
    async share(x) {
      const sh = plugin('Share');
      if (!sh) return false;
      try { await sh.share({ title: x.title, text: x.title, url: x.url, dialogTitle: x.title }); return true; } catch { return false; }
    },
    onChange: (/** @type {() => void} */ f) => listeners.add(f)
  };
}

const STYLE = `
#lvWebNotifyBtn,#lvWebShareBtn{position:fixed;right:12px;z-index:99995;
  min-width:44px;height:44px;padding:0 12px;border-radius:22px;border:1px solid rgba(0,0,0,.15);
  background:#fff;color:#333;font:600 15px/1 system-ui,-apple-system,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.18)}
#lvWebNotifyBtn{bottom:calc(228px + env(safe-area-inset-bottom,0px))}
#lvWebShareBtn{bottom:calc(280px + env(safe-area-inset-bottom,0px))}
#lvWebNotifyBtn[data-on="1"]{background:#f0a020;color:#fff;border-color:#f0a020}
@media (prefers-color-scheme: dark){#lvWebNotifyBtn,#lvWebShareBtn{background:#2a2a30;color:#eee;border-color:#444}}
`;

/**
 * 🔔(ギフトの通知・振動)と 📤(共有)を付ける。アプリの外では何も付けない。
 * @param {ReturnType<typeof createPhoneNative>} n
 * @param {() => { title: string, url: string }} shareTarget
 */
export function mountPhoneNativeUi(n, shareTarget) {
  if (!n.isNative() || document.getElementById('lvWebNotifyBtn')) return;
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  const bell = document.createElement('button');
  bell.id = 'lvWebNotifyBtn';
  bell.type = 'button';
  const paint = () => {
    bell.dataset.on = n.isOn() ? '1' : '0';
    bell.textContent = n.isOn() ? '🔔' : '🔕';
    bell.setAttribute('aria-label', n.isOn() ? 'ギフトの通知と振動: あり(押すと止める)' : 'ギフトの通知と振動: なし(押すと知らせる)');
  };
  bell.addEventListener('click', (ev) => { ev.stopPropagation(); void n.toggle().then(paint); });
  n.onChange(paint);
  paint();
  const share = document.createElement('button');
  share.id = 'lvWebShareBtn';
  share.type = 'button';
  share.textContent = '📤';
  share.setAttribute('aria-label', 'この配信を共有する');
  share.addEventListener('click', (ev) => { ev.stopPropagation(); void n.share(shareTarget()); });
  document.body.appendChild(bell);
  document.body.appendChild(share);
}
