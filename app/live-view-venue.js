/**
 * v0.1.1739: スマホの「かんたん会場モード」。右下の 🎪 を押すと全画面の会場になる。
 *   最近コメントした人の顔が客席に並び、新しいコメントはその人の顔の上に吹き出しで出る。
 *   ギフトは画面の真ん中に「誰が・何を・何pt」を大きく出す(金額が大きいほど大きく・長く)。
 *   ★中身(誰が座るか・何が新しいか)は src/lib/phoneVenueModel.js(純関数)。ここは描くだけ。
 *   ★文字はすべて textContent(届いたデータをそのまま HTML にしない)。顔が読めなければ既定の顔(§3.6)。
 *   ★開いている間は画面が暗くならないようにする(Wake Lock・使えない端末では何もしない)。
 *
 * @module live-view-venue
 */
import { buildPhoneVenueSeats, diffPhoneVenueEvents } from '../src/lib/phoneVenueModel.js';
import { tierFromPoints } from '../src/lib/giftThrowProjectile.js';

const DEFAULT_FACE = '/app/images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.thumb128.png';
const BUBBLE_MS = 4500;
/** @type {Record<string, number>} */
const GIFT_MS = { small: 2500, medium: 3500, large: 5000, mega: 7000 };

const STYLE = `
#lvWebVenueBtn{position:fixed;right:12px;bottom:calc(124px + env(safe-area-inset-bottom,0px));z-index:99995;
  width:44px;height:44px;border-radius:22px;border:1px solid rgba(0,0,0,.15);background:#fff;
  font:20px/1 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.18)}
@media (prefers-color-scheme: dark){#lvWebVenueBtn{background:#2a2a30;border-color:#444}}
#lvWebVenue{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;
  background:radial-gradient(ellipse at 50% 0%,#3b2a5a 0%,#16121f 60%,#0c0a12 100%);color:#fff;
  font:14px/1.4 system-ui,-apple-system,"Hiragino Sans",sans-serif;overflow:hidden}
#lvWebVenue[hidden]{display:none}
#lvWebVenue .v-head{display:flex;align-items:center;gap:8px;padding:calc(8px + env(safe-area-inset-top,0px)) 12px 8px}
#lvWebVenue .v-title{flex:1;font-weight:700;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lvWebVenue .v-close{width:40px;height:40px;border-radius:20px;border:0;background:rgba(255,255,255,.15);color:#fff;font-size:18px}
#lvWebVenue .v-stage{flex:1;position:relative;display:flex;align-items:center;justify-content:center;padding:8px}
#lvWebVenue .v-empty{opacity:.6;text-align:center}
#lvWebVenue .v-gift{position:absolute;left:50%;top:45%;transform:translate(-50%,-50%) scale(.6);opacity:0;
  max-width:90%;text-align:center;padding:14px 20px;border-radius:18px;background:rgba(232,97,140,.92);
  box-shadow:0 0 40px rgba(255,180,210,.6);transition:transform .35s cubic-bezier(.2,1.4,.4,1),opacity .35s;pointer-events:none}
#lvWebVenue .v-gift.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
#lvWebVenue .v-gift .g-item{font-size:22px;font-weight:800}
#lvWebVenue .v-gift[data-tier="large"] .g-item{font-size:28px}
#lvWebVenue .v-gift[data-tier="mega"]{background:linear-gradient(135deg,#f6c343,#e8618c);}
#lvWebVenue .v-gift[data-tier="mega"] .g-item{font-size:34px}
#lvWebVenue .v-seats{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:14px 8px;
  padding:52px 10px calc(14px + env(safe-area-inset-bottom,0px));max-height:62vh;overflow:visible}
#lvWebVenue .v-seat{position:relative;display:flex;flex-direction:column;align-items:center;min-width:0}
#lvWebVenue .v-seat img{width:52px;height:52px;border-radius:50%;object-fit:cover;background:#2a2238;border:2px solid rgba(255,255,255,.25)}
#lvWebVenue .v-seat .s-name{max-width:100%;font-size:11px;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lvWebVenue .v-seat.bounce img{animation:lvVenueBounce .5s ease}
@keyframes lvVenueBounce{0%,100%{transform:translateY(0)}40%{transform:translateY(-10px)}}
#lvWebVenue .v-bubble{position:absolute;bottom:calc(100% + 2px);left:50%;transform:translateX(-50%);z-index:2;
  width:max-content;max-width:min(60vw,220px);padding:6px 10px;border-radius:12px;background:#fff;color:#222;
  font-size:13px;line-height:1.35;box-shadow:0 2px 8px rgba(0,0,0,.35);word-break:break-word;
  animation:lvVenuePop .25s ease-out}
#lvWebVenue .v-bubble::after{content:"";position:absolute;top:100%;left:var(--tail,50%);margin-left:-6px;border:6px solid transparent;border-top-color:#fff}
@keyframes lvVenuePop{from{opacity:0;transform:translateX(-50%) translateY(6px)}to{opacity:1;transform:translateX(-50%)}}
`;

function ensureStyle() {
  if (document.getElementById('lvWebVenueStyle')) return;
  const style = document.createElement('style');
  style.id = 'lvWebVenueStyle';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

/** @param {HTMLImageElement} img @param {string} src */
function setFace(img, src) {
  img.onerror = () => {
    img.onerror = null;
    img.src = DEFAULT_FACE;
  };
  img.src = src || DEFAULT_FACE;
}

export function createPhoneVenue() {
  /** @type {Set<string>|null} */
  let seen = null;
  /** @type {any[]} */
  let lastRows = [];
  /** @type {HTMLElement|null} */
  let root = null;
  /** @type {HTMLElement|null} */
  let seatsEl = null;
  /** @type {HTMLElement|null} */
  let giftEl = null;
  /** @type {any} */
  let wakeLock = null;
  /** @type {Map<string, HTMLElement>} */
  const seatByKey = new Map();
  /** @type {{ item: string, who: string, tier: string }[]} */
  const giftQueue = [];
  let giftBusy = false;
  let seatsSig = '';

  const isOpen = () => !!root && !root.hidden;

  /** 席を描く。同じ人の席は使い回す(描き直しが何度来ても、出ている吹き出しを消さない)。 */
  function paintSeats() {
    if (!seatsEl) return;
    const seats = buildPhoneVenueSeats(lastRows);
    const sig = seats.map((x) => `${x.key}|${x.avatarUrl}|${x.name}`).join('\n');
    if (sig === seatsSig) return;
    seatsSig = sig;
    const old = new Map(seatByKey);
    seatByKey.clear();
    if (!seats.length) {
      const p = document.createElement('div');
      p.className = 'v-empty';
      p.textContent = 'コメントが来ると、ここに顔が並びます';
      seatsEl.replaceChildren(p);
      return;
    }
    const nodes = seats.map((seat) => {
      const reuse = old.get(seat.key);
      if (reuse) {
        seatByKey.set(seat.key, reuse);
        return reuse;
      }
      const el = document.createElement('div');
      el.className = 'v-seat';
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      setFace(img, seat.avatarUrl);
      const name = document.createElement('div');
      name.className = 's-name';
      name.textContent = seat.name || '名無し';
      el.append(img, name);
      seatByKey.set(seat.key, el);
      return el;
    });
    seatsEl.replaceChildren(...nodes);
  }

  /** @param {string} personKey @param {string} text */
  function bubble(personKey, text) {
    const seat = seatByKey.get(personKey);
    if (!seat || !text) return;
    seat.querySelector('.v-bubble')?.remove();
    const b = document.createElement('div');
    b.className = 'v-bubble';
    b.textContent = text;
    seat.appendChild(b);
    // 端の席の吹き出しが画面の外にはみ出さないよう、はみ出た分だけ内側へずらす。
    const r = b.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || globalThis.innerWidth || 0;
    const shift = r.left < 6 ? 6 - r.left : vw && r.right > vw - 6 ? vw - 6 - r.right : 0;
    if (shift) {
      b.style.marginLeft = `${shift}px`;
      b.style.setProperty('--tail', `calc(50% - ${shift}px)`);
    }
    bounce(personKey);
    setTimeout(() => b.remove(), BUBBLE_MS);
  }

  /** @param {string} personKey */
  function bounce(personKey) {
    const seat = seatByKey.get(personKey);
    if (!seat) return;
    seat.classList.remove('bounce');
    void seat.offsetWidth;
    seat.classList.add('bounce');
  }

  function nextGift() {
    if (!giftEl || giftBusy) return;
    const g = giftQueue.shift();
    if (!g) return;
    giftBusy = true;
    giftEl.dataset.tier = g.tier;
    const item = document.createElement('div');
    item.className = 'g-item';
    item.textContent = `🎁 ${g.item}`;
    const who = document.createElement('div');
    who.textContent = g.who;
    giftEl.replaceChildren(item, who);
    giftEl.classList.add('show');
    setTimeout(() => {
      giftEl?.classList.remove('show');
      setTimeout(() => {
        giftBusy = false;
        nextGift();
      }, 400);
    }, GIFT_MS[g.tier] || GIFT_MS.small);
  }

  async function holdScreen(on) {
    try {
      if (on && !wakeLock && /** @type {any} */ (navigator).wakeLock) {
        wakeLock = await /** @type {any} */ (navigator).wakeLock.request('screen');
      } else if (!on && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch {
      wakeLock = null; // 使えない端末・電池節約中は何もしない
    }
  }

  function build() {
    ensureStyle();
    root = document.createElement('div');
    root.id = 'lvWebVenue';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'かんたん会場モード');
    const head = document.createElement('div');
    head.className = 'v-head';
    const title = document.createElement('div');
    title.className = 'v-title';
    title.textContent = '🎪 会場';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'v-close';
    close.textContent = '✕';
    close.setAttribute('aria-label', '会場を閉じる');
    close.addEventListener('click', () => api.close());
    head.append(title, close);
    const stage = document.createElement('div');
    stage.className = 'v-stage';
    giftEl = document.createElement('div');
    giftEl.className = 'v-gift';
    stage.appendChild(giftEl);
    seatsEl = document.createElement('div');
    seatsEl.className = 'v-seats';
    root.append(head, stage, seatsEl);
    document.body.appendChild(root);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && isOpen()) void holdScreen(true);
    });
  }

  const api = {
    isOpen,
    open() {
      if (!root) build();
      if (!root) return;
      root.hidden = false;
      paintSeats();
      void holdScreen(true);
    },
    close() {
      if (root) root.hidden = true;
      giftQueue.length = 0;
      void holdScreen(false);
    },
    /** 鏡の行(古→新)が届くたびに呼ぶ。閉じている間も「見た」ことは覚える(開いた瞬間に一斉に出さない)。 @param {any[]} rows */
    onRows(rows) {
      lastRows = Array.isArray(rows) ? rows : [];
      const r = diffPhoneVenueEvents({ rows: lastRows, seen });
      seen = r.seen;
      if (!isOpen()) return;
      paintSeats();
      for (const ev of r.events) {
        if (ev.type === 'gift') {
          const pt = ev.point > 0 ? ` (${ev.point.toLocaleString('ja-JP')}pt)` : '';
          giftQueue.push({ item: ev.itemName || 'ギフト', who: `${ev.name || '名無し'} さんから${pt}`, tier: tierFromPoints(ev.point) });
          bounce(ev.personKey); // 品名は真ん中に大きく出すので、席は跳ねるだけ(吹き出しを重ねない)
        } else {
          bubble(ev.personKey, ev.text);
        }
      }
      while (giftQueue.length > 5) giftQueue.shift();
      nextGift();
    }
  };
  return api;
}

/** @param {ReturnType<typeof createPhoneVenue>} venue */
export function mountPhoneVenueUi(venue) {
  if (document.getElementById('lvWebVenueBtn')) return;
  ensureStyle();
  const btn = document.createElement('button');
  btn.id = 'lvWebVenueBtn';
  btn.type = 'button';
  btn.textContent = '🎪';
  btn.setAttribute('aria-label', 'かんたん会場モードを開く');
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    venue.open();
  });
  document.body.appendChild(btn);
}
