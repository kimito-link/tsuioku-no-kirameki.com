/**
 * v0.1.1899 PICK UP の吹き出しをドラッグで動かし、位置を覚える(りんく「ドラッグでうごかせるようにしておきたい」)。
 *   位置は会場(layoutEl)に対する割合で KEY_VENUE_PICKUP_POS に保存。ダブルクリックで自動位置(映像の上端中央)へ戻す。
 *   名前のリンク(a[href])から始めた押下はドラッグにしない(リンクを開けるように)。計算は lib/venuePickupBanner.js の純関数。
 * 【この箱に入らないもの】自動位置の計算(venueBar の placePickup)・吹き出しの中身
 * @module venuePickupDrag
 */
import {
  VENUE_PICKUP_DRAG_THRESHOLD_PX,
  clampVenuePickupPx,
  normalizeVenuePickupSavedPos,
  venuePickupPosToSave,
  venuePickupSavedPlacement,
  venuePickupViewportBounds
} from '../lib/venuePickupBanner.js';
import { KEY_VENUE_PICKUP_POS } from '../lib/storageKeys.js';
import { safeStorageLocalGet, safeStorageLocalSet } from '../lib/safeStorageLocal.js';

/**
 * @param {HTMLElement} root 吹き出し
 * @param {HTMLElement} layoutEl 吹き出しの親(会場)
 * @param {() => void} replace 自動位置/保存位置で置き直す(venueBar の placePickup)。窓の resize でも呼ぶ
 * @returns {{ place: (at: { left:number, top:number } | null) => void, dragging: () => boolean }}
 */
export function attachVenuePickupDrag(root, layoutEl, replace) {
  /** @type {{ cx:number, top:number } | null} */
  let savedPos = null;
  /** 一度でも動かしたことがあるか(保存キーが在る=null でも学習済み)。無ければ初めて出たときに案内を数秒出す。 */
  let learned = true;
  let introShown = false;
  /** @type {{ id:number, sx:number, sy:number, cx0:number, top0:number, moved:boolean } | null} */
  let drag = null;
  const relayout = () => { try { replace(); } catch { /* 位置合わせの失敗は無視 */ } };
  const viewportBounds = (/** @type {DOMRect} */ L) => venuePickupViewportBounds(L, { width: window.innerWidth, height: window.innerHeight });
  void safeStorageLocalGet(KEY_VENUE_PICKUP_POS).then((bag) => {
    learned = !!bag && Object.prototype.hasOwnProperty.call(bag, KEY_VENUE_PICKUP_POS);
    savedPos = normalizeVenuePickupSavedPos(bag?.[KEY_VENUE_PICKUP_POS]);
    relayout();
  }).catch(() => {});
  window.addEventListener('resize', relayout);

  // ★りんく「ドラッグでうごかせますとユーザーがわかるようにしてほしい」: つまみ(⠿)を常に出し、
  //   上に「ドラッグで動かせます」の札を、触れたとき・まだ動かしたことのない人には初めて出たときに数秒出す。
  //   スタイルはインライン(会場の CSS は venueBar の行数ラチェットがあるため・ここで完結させる)。
  root.title = 'ドラッグで動かせます(ダブルクリックで元の位置)';
  root.style.cursor = 'grab';
  root.style.touchAction = 'none';
  root.style.userSelect = 'none';
  const grip = root.ownerDocument.createElement('span');
  grip.className = 'nlsb-pickup__grip';
  grip.textContent = '⠿';
  grip.setAttribute('aria-hidden', 'true');
  Object.assign(grip.style, { flex: '0 0 auto', marginLeft: 'auto', fontSize: '22px', lineHeight: '1', color: 'rgba(31, 35, 40, 0.4)', letterSpacing: '-2px' });
  const hint = root.ownerDocument.createElement('span');
  hint.className = 'nlsb-pickup__hint';
  hint.textContent = '✋ ドラッグで動かせます(ダブルクリックで元の位置)';
  hint.setAttribute('aria-hidden', 'true');
  Object.assign(hint.style, {
    position: 'absolute', top: '-30px', right: '18px', padding: '3px 10px', borderRadius: '999px',
    background: 'rgba(31, 35, 40, 0.88)', color: '#fff', fontSize: '12px', fontWeight: '700', whiteSpace: 'nowrap',
    pointerEvents: 'none', opacity: '0', transition: 'opacity 0.2s'
  });
  root.append(grip, hint);
  let hintTimer = 0;
  const showHint = (/** @type {boolean} */ on, ms = 0) => {
    clearTimeout(hintTimer);
    // 窓の上端に置いてあると上の札が見切れるので、そのときは下に出す
    const nearTop = on && root.getBoundingClientRect().top < 34;
    hint.style.top = nearTop ? 'auto' : '-30px';
    hint.style.bottom = nearTop ? '-30px' : 'auto';
    hint.style.opacity = on ? '1' : '0';
    root.toggleAttribute('data-hint', on);
    if (on && ms) hintTimer = Number(setTimeout(() => showHint(false), ms));
  };
  root.addEventListener('pointerenter', () => { if (!drag) showHint(true); });
  root.addEventListener('pointerleave', () => { if (!drag) showHint(false); });

  root.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    if (ev.target instanceof Element && ev.target.closest('a[href]')) return;
    const r = root.getBoundingClientRect();
    const L = layoutEl.getBoundingClientRect();
    drag = { id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, cx0: r.left + r.width / 2 - L.left, top0: r.top - L.top, moved: false };
  });
  // ★動きと離しは window で受ける(速く動かすと最初の move で吹き出しの外へ出て、吹き出しに届かず止まった・e2e で実測)。
  window.addEventListener('pointermove', (ev) => {
    const d = drag;
    if (!d || ev.pointerId !== d.id) return;
    const dx = ev.clientX - d.sx;
    const dy = ev.clientY - d.sy;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < VENUE_PICKUP_DRAG_THRESHOLD_PX) return;
      d.moved = true;
      try { root.setPointerCapture(ev.pointerId); } catch { /* 取れなくても動かす */ }
      root.setAttribute('data-dragging', '1');
      root.style.cursor = 'grabbing';
      showHint(false);
    }
    ev.preventDefault();
    const L = layoutEl.getBoundingClientRect();
    const p = clampVenuePickupPx(d.cx0 + dx, d.top0 + dy, L, root.getBoundingClientRect(), viewportBounds(L));
    root.style.left = `${p.left}px`;
    root.style.top = `${p.top}px`;
  });
  const endDrag = (/** @type {PointerEvent} */ ev) => {
    const d = drag;
    if (!d || ev.pointerId !== d.id) return;
    drag = null;
    root.removeAttribute('data-dragging');
    root.style.cursor = 'grab';
    if (!d.moved) return;
    learned = true;
    const L = layoutEl.getBoundingClientRect();
    const r = root.getBoundingClientRect();
    const toSave = venuePickupPosToSave({ left: r.left + r.width / 2 - L.left, top: r.top - L.top }, L);
    if (!toSave) return;
    savedPos = toSave;
    root.setAttribute('data-moved', '1');
    void safeStorageLocalSet({ [KEY_VENUE_PICKUP_POS]: toSave }).catch(() => {});
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  root.addEventListener('dblclick', (ev) => {
    if (ev.target instanceof Element && ev.target.closest('a[href]')) return;
    savedPos = null;
    void safeStorageLocalSet({ [KEY_VENUE_PICKUP_POS]: null }).catch(() => {});
    relayout();
  });
  return {
    /** 置く: ドラッグ中は触らない・保存位置があればそこ(窓の内側に締める)・無ければ自動位置 at(null=CSS の既定)。 */
    place(at) {
      if (drag) return;
      const L = layoutEl.getBoundingClientRect();
      const saved = venuePickupSavedPlacement(savedPos, L, root.getBoundingClientRect(), viewportBounds(L));
      const pos = saved || at;
      root.style.left = pos ? `${pos.left}px` : '';
      root.style.top = pos ? `${pos.top}px` : '';
      root.toggleAttribute('data-moved', !!saved);
      if (!learned && !introShown && !root.hasAttribute('data-empty')) {
        introShown = true;
        showHint(true, 6000);
      }
    },
    dragging: () => !!drag
  };
}
