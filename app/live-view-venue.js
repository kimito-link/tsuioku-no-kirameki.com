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
import { buildPhoneVenueSeats, diffPhoneVenueEvents, phoneVenueFallbackFace } from '../src/lib/phoneVenueModel.js';
import { tierFromPoints } from '../src/lib/giftThrowProjectile.js';
import { chooseBubblePlacement, coveredBubbleIndexes } from '../src/lib/bubblePlacement.js';

const DEFAULT_FACE = '/app/images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.thumb128.png';
const BUBBLE_MS = 4500;
/** v0.1.1743: 声が終わってから吹き出しを消すまでの余韻。 */
const VOICE_TAIL_MS = 600;
/** v0.1.1742: 読み上げ中、声を待つ最長(PC の合成→送信→スマホの取得で ふつう数秒)。過ぎたら声なしで吹き出しを出す。 */
const VOICE_WAIT_MAX_MS = 15_000;
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
#lvWebVenue .v-bubble{position:absolute;left:0;top:0;z-index:2;
  width:max-content;max-width:min(60vw,220px);padding:6px 10px;border-radius:12px;background:#fff;color:#222;
  font-size:13px;line-height:1.35;box-shadow:0 2px 8px rgba(0,0,0,.35);word-break:break-word;
  animation:lvVenuePop .25s ease-out;transition:opacity .3s}
#lvWebVenue .v-bubble.leaving{opacity:0}
#lvWebVenue .v-bubble::after{content:"";position:absolute;top:100%;left:var(--tail,50%);margin-left:-6px;border:6px solid transparent;border-top-color:#fff}
#lvWebVenue .v-bubble[data-side="bottom"]::after{top:auto;bottom:100%;border-top-color:transparent;border-bottom-color:#fff}
#lvWebVenue .v-bubble[data-side="right"]::after,#lvWebVenue .v-bubble[data-side="left"]::after{left:auto;top:var(--tail,50%);margin:-6px 0 0;border-top-color:transparent}
#lvWebVenue .v-bubble[data-side="right"]::after{right:100%;border-right-color:#fff}
#lvWebVenue .v-bubble[data-side="left"]::after{left:100%;border-left-color:#fff}
@keyframes lvVenuePop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
`;

function ensureStyle() {
  if (document.getElementById('lvWebVenueStyle')) return;
  const style = document.createElement('style');
  style.id = 'lvWebVenueStyle';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

/**
 * v0.1.1747: 顔が無い・読めないときは、その人ごとのゆっくり顔(PC の会場と同じ)。それも作れないときだけ既定の顔。
 * @param {HTMLImageElement} img @param {string} src @param {{ userId?: string, key?: string }} seat
 */
function setFace(img, src, seat) {
  const fallback = () => phoneVenueFallbackFace(src, seat) || DEFAULT_FACE;
  img.onerror = () => {
    img.onerror = () => {
      img.onerror = null;
      img.src = DEFAULT_FACE;
    };
    img.src = fallback();
  };
  img.src = src || fallback();
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
  /** v0.1.1742: 読み上げ(🗣)が鳴っているか。鳴っている間はコメントの吹き出しを声に合わせる。 */
  /** @type {() => boolean} */
  let voiceActive = () => false;
  /**
   * v0.1.1751: 声がコメント鏡より先に届いた番号(番号 → 声が終わる時刻)。スマホは声を3秒ごと・鏡を5秒ごとに
   *   取るので、声が先に鳴ることがある。そのとき吹き出しを15秒待たせず、鏡に来た瞬間に出す(実機で6個が一度に出ていた)。
   * @type {Map<string, number>}
   */
  const playedEarly = new Map();
  /** 声を待っている吹き出し(コメント番号 → 出す内容と、声が来なかったときの保険のタイマー)。 */
  /** @type {Map<string, { personKey: string, text: string, timer: any }>} */
  const waitingVoice = new Map();

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
      setFace(img, seat.avatarUrl, seat);
      const name = document.createElement('div');
      name.className = 's-name';
      name.textContent = seat.name || '名無し';
      el.append(img, name);
      seatByKey.set(seat.key, el);
      return el;
    });
    seatsEl.replaceChildren(...nodes);
    relayoutBubbles();
  }

  /**
   * v0.1.1760: 吹き出しを「他の吹き出し・見出し・ギフトの札」に被らない向き(上/下/横)へ置く(判定は lib の bubblePlacement.js)。
   *   置き場が無く古い吹き出しを隠したら、隠れた方を先に消す(重なった文字は読めない=新しい発言が主役)。
   * @param {string} personKey @param {string} text @param {number} [ms] 出しておく長さ(声の長さに合わせるとき)
   */
  function bubble(personKey, text, ms = BUBBLE_MS) {
    const seat = seatByKey.get(personKey);
    if (!seat || !text) return;
    seat.querySelector('.v-bubble')?.remove();
    const b = document.createElement('div');
    b.className = 'v-bubble';
    b.textContent = text;
    b.dataset.born = String(Date.now());
    seat.appendChild(b);
    const others = liveBubbles().filter((x) => x !== b);
    const box = placeBubble(b, others);
    const otherBoxes = others.map((x) => x.getBoundingClientRect());
    for (const i of coveredBubbleIndexes(box, otherBoxes)) fadeOut(others[i]);
    bounce(personKey);
    setTimeout(() => fadeOut(b), ms);
  }

  const liveBubbles = () => /** @type {HTMLElement[]} */ (Array.from(root?.querySelectorAll('.v-bubble:not(.leaving)') || []));

  /**
   * 吹き出し1つを、その席の近くの被らない場所へ置く(席の中の絶対配置)。戻り値=置いた箱(画面座標)。
   * @param {HTMLElement} b @param {HTMLElement[]} others 避ける吹き出し
   */
  function placeBubble(b, others) {
    const seat = /** @type {HTMLElement} */ (b.parentElement);
    const face = seat.querySelector('img') || seat;
    const s = seat.getBoundingClientRect();
    const obstacles = others.map((x) => {
      const r = x.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, weight: 5 };
    });
    const head = root?.querySelector('.v-head')?.getBoundingClientRect();
    if (head) obstacles.push({ left: head.left, top: head.top, right: head.right, bottom: head.bottom, weight: 3 });
    if (giftEl?.classList.contains('show')) {
      const g = giftEl.getBoundingClientRect();
      obstacles.push({ left: g.left, top: g.top, right: g.right, bottom: g.bottom, weight: 2 });
    }
    const vw = document.documentElement.clientWidth || globalThis.innerWidth || 0;
    const vh = document.documentElement.clientHeight || globalThis.innerHeight || 0;
    const w = b.offsetWidth || 120;
    const h = b.offsetHeight || 30;
    const pl = chooseBubblePlacement({
      anchor: face.getBoundingClientRect(),
      size: { w, h },
      bounds: { left: 6, top: 6, right: Math.max(12, vw - 6), bottom: Math.max(12, vh - 6) },
      obstacles,
      gap: 8,
      prefer: /** @type {any} */ (b.dataset.side) || null
    });
    b.dataset.side = pl.side;
    b.style.left = `${pl.left - s.left}px`;
    b.style.top = `${pl.top - s.top}px`;
    b.style.setProperty('--tail', `${pl.tail}px`);
    return { left: pl.left, top: pl.top, right: pl.left + w, bottom: pl.top + h };
  }

  /** 席の並びが変わったら、出ている吹き出しを古い順に置き直す(席と一緒に動いて画面の外へはみ出さないように)。 */
  function relayoutBubbles() {
    const all = liveBubbles().sort((a, b) => Number(a.dataset.born) - Number(b.dataset.born));
    all.forEach((b, i) => placeBubble(b, all.slice(0, i)));
  }

  /** @param {Element} el */
  function fadeOut(el) {
    if (el.classList.contains('leaving')) return;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 300);
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
      for (const w of waitingVoice.values()) clearTimeout(w.timer);
      waitingVoice.clear();
      playedEarly.clear();
      void holdScreen(false);
    },
    /** v0.1.1742: 読み上げが鳴っているかを教える口。 @param {() => boolean} fn */
    setVoiceActive(fn) {
      voiceActive = typeof fn === 'function' ? fn : () => false;
    },
    /**
     * v0.1.1742: そのコメントの声が鳴り始めた=待たせていた吹き出しを出す。
     * v0.1.1743: 声が終わるまで出しておく(長い声の途中で吹き出しが消えていた)。
     * @param {string} no @param {number} [durationMs]
     */
    onVoicePlay(no, durationMs = 0) {
      const w = waitingVoice.get(String(no));
      if (!w) {
        // 鏡にまだ無い番号=声が先に来た。鏡に来たら残りの長さで出す。
        playedEarly.set(String(no), Date.now() + Math.max(0, Number(durationMs) || 0));
        while (playedEarly.size > 50) playedEarly.delete(/** @type {string} */ (playedEarly.keys().next().value));
        return;
      }
      clearTimeout(w.timer);
      waitingVoice.delete(String(no));
      if (isOpen()) bubble(w.personKey, w.text, Math.max(BUBBLE_MS, (Number(durationMs) || 0) + VOICE_TAIL_MS));
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
        } else if (ev.no && playedEarly.has(ev.no)) {
          // 声はもう鳴った(鳴っている)=待たずに出す。声が残っていればその分まで残す。
          const left = /** @type {number} */ (playedEarly.get(ev.no)) - Date.now();
          playedEarly.delete(ev.no);
          bubble(ev.personKey, ev.text, Math.max(BUBBLE_MS, left + VOICE_TAIL_MS));
        } else if (ev.no && voiceActive()) {
          // 声は PC が作って届くまで数秒遅れる=吹き出しは声が鳴った瞬間に出す。声が来なければ保険で出す。
          const timer = setTimeout(() => {
            waitingVoice.delete(ev.no);
            bubble(ev.personKey, ev.text);
          }, VOICE_WAIT_MAX_MS);
          waitingVoice.set(ev.no, { personKey: ev.personKey, text: ev.text, timer });
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
