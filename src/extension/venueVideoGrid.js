// venueVideoGrid.js — 会場モードの「動画のページ」だけに出す、席+吹き出し(DOM の配線)。
// v0.1.2270(TNKC-50・りんく 11-27 承認の見た目の案 v3): 動画では全員の吹き出しを最初から出す(漫画のように読める)。
//   並び・段・枠の色・👍・時刻の決まりは lib の videoVenueGrid.js(純関数・テスト付き)。ここは描くだけ。
//   材料は呼び出し元(YouTube 版の venue-inline-entry)が渡す動画のボード(横の欄と同じ・新しい取得なし)。
//   読むのは会場の既存の見回り(pollSpeech → paintStatStrip)に相乗りし、5秒に1回まで。
//   ★新しいタイマー・Observer・通信は作らない。ライブの会場(getVideoBoard を渡さない・種類が live)は何も変えない。
import { buildVideoVenueGridModel, VIDEO_GRID_LEGEND } from '../lib/videoVenueGrid.js';

export const VENUE_VIDEO_GRID_CSS = `  /* v0.1.2270(TNKC-50): 動画のページだけの「席+吹き出し」。ライブの会場はこの class が付かない=見た目は変わらない。
     段・タイルは上のレーンの CSS(.nlsb-venue-lane-stack)をそのまま使い、吹き出しは席の上に小さく常に出す。 */
  .nlsb-vgrid-on .nlsb-seats > .nlsb-venue-lane-stack:not(.nlsb-vgrid),
  .nlsb-vgrid-on .nlsb-seats > .nlsb-empty-message,
  .nlsb-vgrid-on .nlsb-seats > .nlsb-story-diag,
  .nlsb-vgrid-on .nlsb-bubble-layer {
    display: none !important;
  }
  .nlsb-vgrid-on .nlsb-seats.nlsb-mode-empty {
    display: block;
  }
  .nlsb-venue-lane-stack.nlsb-vgrid {
    gap: 6px;
  }
  .nlsb-vgrid .nlsb-vgrid-caption {
    margin: 0;
    padding: 5px 10px 6px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
    line-height: 1.45;
    color: #ffd88a;
    border-radius: 8px;
    background: rgba(14, 19, 27, 0.55);
  }
  .nlsb-venue-lane-stack.nlsb-vgrid .nl-story-userlane {
    align-items: flex-start;
    gap: 8px 10px;
  }
  .nlsb-vgrid .nlsb-vgrid-unit {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    width: 188px;
    max-width: calc(50% - 8px);
    min-width: 0;
  }
  .nlsb-vgrid .nlsb-vgrid-bubble {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    padding: 5px 8px 6px;
    border: 1px solid rgba(20, 29, 42, 0.16);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.97);
    color: #141d28;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.3;
    overflow-wrap: anywhere;
    word-break: break-all;
    transition: box-shadow 0.2s ease;
  }
  .nlsb-vgrid .nlsb-vgrid-bubble[data-sentiment='positive'] { border-color: #e8b09a; border-width: 2px; }
  .nlsb-vgrid .nlsb-vgrid-bubble[data-sentiment='neutral'] { border-color: rgba(20, 29, 42, 0.16); }
  .nlsb-vgrid .nlsb-vgrid-bubble[data-sentiment='negative'] { border-color: #b8bcc2; }
  .nlsb-vgrid .nlsb-vgrid-bubble[data-likes='mid'] { border-width: 2px; }
  .nlsb-vgrid .nlsb-vgrid-bubble[data-likes='high'] { border-width: 3px; }
  .nlsb-vgrid .nlsb-vgrid-bubble::after {
    position: absolute;
    top: 100%;
    left: 18px;
    width: 0;
    height: 0;
    border: 6px solid transparent;
    border-top-color: rgba(255, 255, 255, 0.97);
    content: "";
  }
  .nlsb-vgrid .nlsb-vgrid-text {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  .nlsb-vgrid .nlsb-vgrid-unit.nlsb-vgrid-jump .nl-story-userlane-cell {
    background: color-mix(in srgb, var(--nl-user-accent) 20%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--nl-user-accent) 48%, transparent);
  }
  .nlsb-vgrid .nlsb-vgrid-unit.nlsb-vgrid-jump .nlsb-vgrid-bubble {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18), 0 0 0 3px rgba(141, 200, 255, 0.55);
  }
`;

/**
 * @param {{
 *   seatsHost: HTMLElement,
 *   topBarList: HTMLElement,
 *   getRoot: () => HTMLElement,
 *   isOpen: () => boolean,
 *   liveKey: () => string,
 *   getVideoBoard?: () => any,
 *   hoverDataByEl: WeakMap<object, any>,
 *   closeHoverCard: () => void,
 *   buildTile: (participant: any) => HTMLElement,
 *   displayName: (name: string, id: string) => string,
 *   platformId: string,
 * }} deps
 */
export function createVenueVideoGrid(deps) {
  const videoGridHost = document.createElement('div');
  videoGridHost.className = 'nlsb-venue-lane-stack nl-story-userlane-stack nlsb-vgrid';
  videoGridHost.hidden = true;
  const videoGridCaption = document.createElement('p');
  videoGridCaption.className = 'nlsb-vgrid-caption';
  const videoGridBody = document.createElement('div');
  videoGridBody.className = 'nlsb-vgrid-body';
  videoGridBody.style.display = 'contents';
  videoGridHost.append(videoGridCaption, videoGridBody);
  if (typeof deps.getVideoBoard === 'function') deps.seatsHost.appendChild(videoGridHost); // ニコ生版の会場には何も足さない
  //   材料は呼び出し元(YouTube 版の venue-inline-entry)が渡す動画のボード(横の欄と同じ・新しい取得なし)。
  //   読むのは既存の見回り(pollSpeech → paintStatStrip)に相乗りし、5秒に1回まで。新しいタイマー・Observer は作らない。
  let videoGridOn = false;
  let videoGridSig = '';
  let videoGridReadAt = 0;
  let videoGridInFlight = false;
  let videoGridJumpKey = '';
  let videoGridJumpName = '';
  const VIDEO_GRID_READ_GAP_MS = 5000;
  const paintVideoGridCaption = () => {
    const who = videoGridJumpName ? `（いまは「${videoGridJumpName}」）` : '';
    videoGridCaption.replaceChildren(
      document.createTextNode(`顔を押すと、その人のコメントへ飛びます${who}`),
      document.createElement('br'),
      document.createTextNode(VIDEO_GRID_LEGEND)
    );
  };
  /** @param {boolean} on */
  const setVideoGridOn = (on) => {
    videoGridOn = on;
    videoGridHost.hidden = !on;
    deps.getRoot().classList.toggle('nlsb-vgrid-on', on);
    if (!on) {
      videoGridSig = '';
      videoGridJumpKey = '';
      videoGridJumpName = '';
      videoGridBody.replaceChildren();
    }
  };
  /** @param {import('../lib/videoVenueGrid.js').VideoGridModel} model */
  const paintVideoGrid = (model) => {
    if (model.sig === videoGridSig && videoGridOn) return;
    videoGridSig = model.sig;
    const frag = document.createDocumentFragment();
    for (const band of model.bands) {
      const wrap = document.createElement('div');
      wrap.className = 'nl-story-userlane-tier-wrap';
      wrap.dataset.vgridBand = String(band.band);
      const hint = document.createElement('p');
      hint.className = 'nl-story-userlane-tier-hint';
      hint.textContent = band.hint;
      const lane = document.createElement('div');
      lane.className = 'nl-story-userlane';
      for (const seat of band.seats) {
        const unit = document.createElement('div');
        unit.className = 'nlsb-vgrid-unit';
        if (seat.key === videoGridJumpKey) unit.classList.add('nlsb-vgrid-jump');
        unit.dataset.vgridKey = seat.key;
        unit.dataset.vgridName = seat.name;
        unit.dataset.vgridUid = seat.tileUserId;
        const bubble = document.createElement('div');
        bubble.className = 'nlsb-vgrid-bubble';
        bubble.dataset.sentiment = seat.sentiment;
        if (seat.likeBand) bubble.dataset.likes = seat.likeBand;
        const text = document.createElement('div');
        text.className = 'nlsb-vgrid-text';
        text.textContent = seat.text;
        bubble.appendChild(text);
        const tile = deps.buildTile({ key: seat.key, userId: seat.tileUserId, name: seat.name, avatar: seat.avatarUrl, lastAt: seat.lastAt });
        const metaLine = [seat.timeLabel, seat.likeLabel].filter(Boolean).join(' ');
        if (metaLine) {
          let idEl = tile.querySelector('.nl-story-userlane-meta__id');
          if (!idEl) {
            const meta = tile.querySelector('.nl-story-userlane-meta');
            if (meta) {
              idEl = document.createElement('span');
              idEl.className = 'nl-story-userlane-meta__id';
              meta.appendChild(idEl);
            }
          }
          if (idEl) idEl.textContent = metaLine;
        }
        // ホバーカード・押したときの発言パネル(ライブの席と同じ口)。手元のコメントをそのまま渡す=新しい取得なし
        deps.hoverDataByEl.set(tile, {
          uid: seat.tileUserId,
          displayName: seat.name || deps.displayName(seat.name, seat.tileUserId),
          count: seat.count,
          hasGift: false,
          giftCount: 0,
          venueRank: 0,
          lastAt: seat.lastAt,
          lastText: seat.text,
          recentTexts: seat.recentTexts,
          platformId: deps.platformId
        });
        unit.append(bubble, tile);
        lane.appendChild(unit);
      }
      wrap.append(hint, lane);
      frag.appendChild(wrap);
    }
    paintVideoGridCaption();
    videoGridBody.replaceChildren(frag);
    if (!videoGridOn) setVideoGridOn(true);
  };
  /** @param {unknown} contentKind */
  const syncVideoGrid = (contentKind) => {
    if (typeof deps.getVideoBoard !== 'function') return; // ニコ生版の会場はここで終わり(何も変えない)
    const kind = String(contentKind || '');
    if (!deps.isOpen() || (kind && kind !== 'video')) {
      if (videoGridOn) setVideoGridOn(false);
      return;
    }
    if (kind !== 'video') return; // 種類がまだ分からない間は、いまの見た目のまま(行き来させない)
    const now = Date.now();
    if (videoGridInFlight || (videoGridSig && now - videoGridReadAt < VIDEO_GRID_READ_GAP_MS)) return;
    videoGridInFlight = true;
    videoGridReadAt = now;
    const forLive = deps.liveKey();
    Promise.resolve()
      .then(() => deps.getVideoBoard())
      .then((board) => {
        if (!deps.isOpen() || forLive !== deps.liveKey()) return;
        const model = buildVideoVenueGridModel(board, { nowMs: Date.now() });
        if (!model || model.seatCount === 0) {
          if (videoGridOn) setVideoGridOn(false);
          return;
        }
        paintVideoGrid(model);
      })
      .catch(() => { /* 動画の席の失敗で会場を止めない */ })
      .finally(() => { videoGridInFlight = false; });
  };
  /**
   * 上の顔を押したら、その人の吹き出しへ飛んで光らせる(動画の席が出ているときだけ。ライブは今までどおり発言パネル)。
   * @param {MouseEvent} e
   */
  const onTopBarVideoJump = (e) => {
    if (!videoGridOn) return;
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const cell = e.target instanceof HTMLElement ? e.target.closest('.nlsb-topbar-cell') : null;
    if (!(cell instanceof HTMLElement)) return;
    const data = deps.hoverDataByEl.get(cell);
    const uid = String(data?.uid || '').trim();
    // 上の顔と席は、名前の作り方が少し違う(上は「@名前」と「名前」・席は「@名前」)。@ を外した名前・id のどれかが合えば同じ人
    const norm = (/** @type {unknown} */ v) => String(v || '').trim().replace(/^@/, '').toLowerCase();
    const names = new Set(
      [
        data?.displayName,
        uid,
        cell.querySelector('.nl-story-userlane-meta__name')?.textContent,
        cell.querySelector('.nl-story-userlane-meta__id')?.textContent,
        String(cell.querySelector('[title]')?.getAttribute('title') || '').split(' | ')[0],
      ].map(norm).filter(Boolean)
    );
    const units = Array.from(videoGridBody.querySelectorAll('.nlsb-vgrid-unit'));
    const target =
      (uid && units.find((u) => u instanceof HTMLElement && (u.dataset.vgridKey === `u:${uid}` || u.dataset.vgridUid === uid))) ||
      units.find((u) => u instanceof HTMLElement && names.has(norm(u.dataset.vgridName))) ||
      null;
    if (!(target instanceof HTMLElement)) return; // 吹き出しが無い人は今までどおり
    e.preventDefault();
    e.stopImmediatePropagation();
    deps.closeHoverCard();
    for (const u of units) if (u !== target && u instanceof HTMLElement) u.classList.remove('nlsb-vgrid-jump');
    target.classList.add('nlsb-vgrid-jump');
    videoGridJumpKey = String(target.dataset.vgridKey || '');
    videoGridJumpName = String(target.dataset.vgridName || '');
    paintVideoGridCaption();
    try { target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch { /* 飛べなくても光らせる */ }
  };
  if (typeof deps.getVideoBoard === 'function') deps.topBarList.addEventListener('click', onTopBarVideoJump, true);

  return {
    /** 会場の数字の帯を描くたびに呼ぶ(種類が 'video' のときだけ読む) */
    sync: syncVideoGrid,
    /** 動画を移った・会場を閉じた */
    reset: () => { if (videoGridOn || videoGridSig) setVideoGridOn(false); },
    /** テスト・診断用 */
    isOn: () => videoGridOn,
  };
}
