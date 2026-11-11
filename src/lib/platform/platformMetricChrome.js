/**
 * 横の欄の数字を、配信サービスに合わせて出し分ける。
 * ニコ生の短いラベル(来場・本家コメ・広告pt・ギフトpt)は言葉の置き換え表に入っていないので、
 * ここで隠して、そのサービス自身の数字だけを足す。
 *
 * DOM は引数の root だけを触る。src/lib 直下の純粋性検査の対象外(platform/)。
 */

import { panelExtraChips, platformSectionPlan, streamAgeTitle, LOADING } from './platformMetrics.js';

/** 数でない値の札。ニコ生の「（接続中…）」「（取得不可）」「推定中」「計測中…」や最初の「—」は、ほかのサービスでは「読み込み中」にする。 */
const NOT_A_COUNT = /^(?:—|-|（接続中…）|（取得不可）|（数字非公開）|推定中|計測中…|)$/u;

/** @param {Element|null|undefined} el */
function hideEl(el) {
  if (!el || typeof /** @type {HTMLElement} */ (el).setAttribute !== 'function') return;
  const node = /** @type {HTMLElement} */ (el);
  if (!node.hidden) node.hidden = true;
  if (node.getAttribute('aria-hidden') !== 'true') node.setAttribute('aria-hidden', 'true');
  if (node.dataset) node.dataset.nlPlatformHide = '1';
}

/** @param {HTMLElement} el */
function unhideIfOurs(el) {
  if (el.dataset.nlPlatformHide !== '1') return;
  delete el.dataset.nlPlatformHide;
  el.hidden = false;
  el.removeAttribute('aria-hidden');
}

/** @param {ParentNode} root @param {string} lane */
function laneEl(root, lane) {
  if (lane === 'giftRankingFetch') return root.querySelector('#giftRankingFetchPrompt');
  return root.querySelector(`[data-lane="${lane}"]`);
}

/** @param {ParentNode} root @param {string} lane @param {string} text */
function setLaneLabel(root, lane, text) {
  const p = root.querySelector(`[data-lane="${lane}"] .nl-north-star-lane__label`);
  if (!p) return;
  let textNode = null;
  for (const n of p.childNodes) {
    if (n.nodeType === 3 && String(n.nodeValue || '').trim()) { textNode = n; break; }
  }
  const el = /** @type {HTMLElement} */ (p);
  // 0.1.2083: 前の配信(別のサービス)で付けた見出しを、見出しを持たないサービスでは元に戻す。
  //   元の見出しは最初に書き換える前に覚えておく(ミクチャで YouTube の「スーパーチャット・ギフト」が残っていた)
  if (!text) {
    // 戻すのは、いま出ているのが自分の付けた見出しのときだけ(ニコ生版の描画が書いた見出しは触らない)
    const orig = el.dataset?.nlOrigLabel;
    if (orig == null || !textNode || textNode.nodeValue !== el.dataset.nlSetLabel) return;
    textNode.nodeValue = orig;
    return;
  }
  if (el.dataset && el.dataset.nlOrigLabel == null) el.dataset.nlOrigLabel = textNode ? String(textNode.nodeValue || '') : '';
  if (el.dataset) el.dataset.nlSetLabel = text;
  if (!textNode) {
    p.insertBefore(p.ownerDocument.createTextNode(text), p.firstChild);
    return;
  }
  if (textNode.nodeValue !== text) textNode.nodeValue = text;
}

/** @param {ParentNode} root @param {string} lane @param {string} text */
function setLaneSub(root, lane, text) {
  const p = root.querySelector(`[data-lane="${lane}"] .nl-north-star-lane__sublabel`);
  if (!p) return;
  const el = /** @type {HTMLElement} */ (p);
  if (!text) {
    const orig = el.dataset?.nlOrigSub;
    if (orig != null && p.textContent === el.dataset.nlSetSub) p.textContent = orig;
    return;
  }
  if (el.dataset && el.dataset.nlOrigSub == null) el.dataset.nlOrigSub = String(p.textContent || '');
  if (el.dataset) el.dataset.nlSetSub = text;
  if (p.textContent !== text) p.textContent = text;
}

/**
 * @param {ParentNode} root
 * @param {{ platform?: string, facts?: any }} state
 */
const FOREIGN_STYLE_ID = 'nl-platform-capability-style';
const FOREIGN_STYLE = [
  'html.nl-cap-foreign .nl-live-stat-card--visitors{display:none!important;}',
  'html.nl-cap-foreign .nl-official-nico-stats__chip:has(#officialStatNicoViewers),',
  'html.nl-cap-foreign .nl-official-nico-stats__chip:has(#officialStatNicoComments),',
  'html.nl-cap-foreign .nl-official-nico-stats__chip:has(#officialStatNicoAdPts),',
  'html.nl-cap-foreign .nl-official-nico-stats__chip:has(#officialStatNicoGiftPts),',
  'html.nl-cap-foreign .nl-official-nico-stats__chip:has(#officialStatNicoCommentsRate){display:none!important;}',
  // 「広告ランキング」の欄は、2つめの公式ランキングがあるサービス(nl-cap-subboard)では使う。ニコ生だけの「watch の広告pt」の行は出さない
  'html.nl-cap-foreign [data-lane="adRanking"] .nl-north-star-ad-stats__row:first-child{display:none!important;}',
  'html.nl-cap-foreign:not(.nl-cap-subboard) [data-lane="adRanking"],html.nl-cap-foreign [data-lane="programPoints"],',
  'html.nl-cap-foreign [data-lane="eventRank"],html.nl-cap-foreign [data-lane="eventScore"],',
  'html.nl-cap-foreign [data-lane="eventVotingSupporters"],html.nl-cap-foreign #giftRankingFetchPrompt,',
  'html.nl-cap-foreign #watchOfficialEventBannerCard,html.nl-cap-foreign #watchOfficialNdgrCard,',
  'html.nl-cap-foreign #giftHistoryProgramPt{display:none!important;}',
  // ギフト欄の点線の枠: 中のギフト履歴が出ていない時は枠ごと出さない(番組累計ptは上で常に隠れる)
  'html.nl-cap-foreign .nl-north-star-gift-stack:not(:has(> [data-lane="giftHistory"]:not([hidden]))){display:none!important;}',
  'html.nl-cap-foreign:not([data-nl-gift-has="1"]) .nl-north-star-gift-stack{display:none!important;}',
  'html.nl-cap-youtube #watchConcurrentCard .nl-live-stat-label,html.nl-cap-twitch #watchConcurrentCard .nl-live-stat-label,',
  'html.nl-cap-kick #watchConcurrentCard .nl-live-stat-label,html.nl-cap-abema #watchConcurrentCard .nl-live-stat-label{font-size:0!important;line-height:1.2!important;overflow:visible!important;color:transparent!important;}',
  'html.nl-cap-youtube #watchConcurrentCard .nl-live-stat-label::after{content:"同時視聴者数";font-size:10.5px;font-weight:700;line-height:1.2;color:var(--nl-muted,#8b8494);}',
  'html.nl-cap-twitch #watchConcurrentCard .nl-live-stat-label::after,html.nl-cap-kick #watchConcurrentCard .nl-live-stat-label::after{content:"視聴者数";font-size:10.5px;font-weight:700;line-height:1.2;color:var(--nl-muted,#8b8494);}',
  'html.nl-cap-abema #watchConcurrentCard .nl-live-stat-label::after{content:"視聴数";font-size:10.5px;font-weight:700;line-height:1.2;color:var(--nl-muted,#8b8494);}',
].join('');

/** @param {ParentNode} root @param {string} platformId @param {boolean} [subBoard] 二つめの公式ランキングの欄を使うサービス */
function markCapability(root, platformId, subBoard) {
  const doc = root.ownerDocument || (root.nodeType === 9 ? /** @type {Document} */ (root) : null);
  const html = doc && doc.documentElement;
  if (!html || !html.classList) return;
  html.classList.add('nl-cap-foreign');
  html.classList.toggle('nl-cap-subboard', subBoard === true);
  const id = String(platformId || '');
  if (id) html.classList.add(`nl-cap-${id}`);
  if (doc.getElementById(FOREIGN_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = FOREIGN_STYLE_ID;
  style.textContent = FOREIGN_STYLE;
  (doc.head || html).appendChild(style);
}

/**
 * @param {ParentNode} root
 * @param {{ platform?: string, facts?: any, officialBoard?: boolean }} state
 */
export function applyPlatformMetricChrome(root, state) {
  if (!root || typeof root.querySelector !== 'function') return;
  const plan = platformSectionPlan(String(state?.platform || ''), { officialBoard: state?.officialBoard === true });
  if (plan.native) return;
  markCapability(root, plan.id, plan.subBoard === true);
  const facts = state?.facts && typeof state.facts === 'object' ? state.facts : {};

  const vis = root.querySelector('.nl-live-stat-card--visitors');
  if (vis) hideEl(vis);

  const concLabel = root.querySelector('#watchConcurrentCard .nl-live-stat-label');
  if (concLabel && concLabel.textContent !== plan.concurrentLabel) concLabel.textContent = plan.concurrentLabel;
  const concCard = root.querySelector('#watchConcurrentCard');
  if (concCard) concCard.setAttribute('title', '配信ページが出している公式の数です。');
  const concIcon = root.querySelector('#watchConcurrentCard .nl-live-stat-icon');
  if (concIcon) {
    concIcon.setAttribute('title', plan.concurrentLabel);
    concIcon.setAttribute('aria-label', plan.concurrentLabel);
  }
  // 数が来る前の札(開いた直後の「—」・ニコ生の「（接続中…）」等)を「読み込み中」に。数そのものと「N分前」は触らない。
  const est = root.querySelector('#watchConcurrentEst');
  if (est) {
    const t = String(est.textContent || '').trim();
    if (NOT_A_COUNT.test(t) || t.startsWith('~')) {
      if (est.textContent !== LOADING) est.textContent = LOADING;
      est.classList.add('is-placeholder');
      est.removeAttribute('title');
      const sub = root.querySelector('#watchConcurrentSub');
      if (sub && sub.textContent !== '') sub.textContent = '';
    }
  }
  const loading = root.querySelector('#watchConcurrentLoading');
  if (loading) loading.setAttribute('aria-label', `${plan.concurrentLabel}を読み込み中`);

  for (const id of ['officialStatNicoViewers', 'officialStatNicoComments', 'officialStatNicoAdPts', 'officialStatNicoGiftPts']) {
    const val = root.querySelector(`#${id}`);
    const chip = val && val.parentElement;
    if (chip) hideEl(chip);
  }
  const rate = root.querySelector('#officialStatNicoCommentsRate');
  if (rate) hideEl(rate);

  const row = root.querySelector('.nl-official-nico-stats__row');
  if (row) {
    row.setAttribute('aria-label', 'この配信の数字');
    const ageVal = root.querySelector('#officialStatNicoStreamAge');
    const ageChip = ageVal && ageVal.parentElement;
    if (ageChip) {
      ageChip.hidden = false;
      ageChip.removeAttribute('aria-hidden');
      const title = streamAgeTitle(facts);
      if (title) ageChip.setAttribute('title', title);
      else ageChip.removeAttribute('title');
      row.appendChild(ageChip);
    }
    const extras = panelExtraChips(plan.id, facts);
    const want = new Set(extras.map((c) => c.key));
    for (const el of row.querySelectorAll('[data-nl-metric]')) {
      if (!want.has(el.getAttribute('data-nl-metric') || '')) el.remove();
    }
    for (const chip of extras) {
      let el = row.querySelector(`[data-nl-metric="${chip.key}"]`);
      if (!el) {
        el = row.ownerDocument.createElement('div');
        el.className = 'nl-official-nico-stats__chip';
        el.setAttribute('data-nl-metric', chip.key);
        const label = row.ownerDocument.createElement('span');
        label.className = 'nl-official-nico-stats__label';
        const val = row.ownerDocument.createElement('span');
        val.className = 'nl-official-nico-stats__val';
        el.append(label, val);
        row.appendChild(el);
      }
      const label = el.querySelector('.nl-official-nico-stats__label');
      const val = el.querySelector('.nl-official-nico-stats__val');
      if (label && label.textContent !== chip.label) label.textContent = chip.label;
      if (val) {
        if (val.textContent !== chip.text) val.textContent = chip.text;
        val.classList.toggle('is-placeholder', chip.placeholder === true || chip.text === '—');
      }
      let unitEl = el.querySelector('.nl-official-nico-stats__unit');
      if (chip.unit) {
        if (!unitEl) {
          unitEl = row.ownerDocument.createElement('span');
          unitEl.className = 'nl-official-nico-stats__unit';
          el.appendChild(unitEl);
        }
        if (unitEl.textContent !== chip.unit) unitEl.textContent = chip.unit;
      } else if (unitEl) unitEl.remove();
      if (chip.title) el.setAttribute('title', chip.title);
      else el.removeAttribute('title');
    }
  }

  for (const name of plan.hide) {
    const el = laneEl(root, name);
    if (el) hideEl(el);
  }
  for (const [name, spec] of Object.entries(plan.sections || {})) {
    const el = laneEl(root, name);
    if (!el) continue;
    if (spec.show === false) hideEl(el);
    else unhideIfOurs(/** @type {HTMLElement} */ (el));
    setLaneLabel(root, name, spec.label || '');
    setLaneSub(root, name, spec.sub || '');
  }
  // このPCの記録にスパチャ・ギフト等が1件も無いうちは、中身の無い欄(見出しと空の枠)を出さない(2026-11-11 PC 計測)。
  //   ニコ生の描画が欄を出し直すたびに一瞬見えないよう、欄の hidden ではなく <html> の印と CSS で決める。
  //   印は「1件以上ある」と分かった時だけ付ける。集計が来ていない回は印を変えない(外すと一瞬出る/付けないと最初に空枠が出る)。
  const sup = facts && facts.support;
  const rootHtml = /** @type {Document} */ (root).documentElement || root.ownerDocument?.documentElement;
  if (rootHtml && sup && sup.ready === true) {
    const has = (Number(sup.superchatCount) || 0) + (Number(sup.stickerCount) || 0)
        + (Number(sup.membershipCount) || 0) + (Number(sup.membershipGiftCount) || 0) > 0;
    if (has && rootHtml.getAttribute('data-nl-gift-has') !== '1') rootHtml.setAttribute('data-nl-gift-has', '1');
    else if (!has && rootHtml.hasAttribute('data-nl-gift-has')) rootHtml.removeAttribute('data-nl-gift-has');
  }
  const pt = root.querySelector('#giftHistoryProgramPt');
  if (pt) hideEl(pt);
  const summaryNote = root.querySelector('#northStarLaneGadgetSummary-giftHistory .nl-north-star-lane__summary-note');
  if (summaryNote && summaryNote.textContent !== 'このPCの記録の合計です。') summaryNote.textContent = 'このPCの記録の合計です。';
  const note = root.querySelector('.nl-north-star-lanes__note');
  if (note && plan.note && note.textContent !== plan.note) note.textContent = plan.note;
  if (plan.trio) {
    for (const [slot, title] of Object.entries(plan.trio)) {
      const el = root.querySelector(`[data-nl-trio-slot="${slot}"]`);
      if (el && el.getAttribute('title') !== title) el.setAttribute('title', title);
    }
  }
  // 見出しと欄をこのサービスのものにした印(yt-sidepanel.html の最初の描画の隠しを外す・scripts/youtube-build.mjs)
  const html = /** @type {Document} */ (root).documentElement || root.ownerDocument?.documentElement;
  if (html && html.getAttribute('data-nl-platform-ready') !== '1') html.setAttribute('data-nl-platform-ready', '1');
  const banner = root.querySelector('#watchOfficialEventBannerCard');
  if (banner) hideEl(banner);
  const ndgr = root.querySelector('#watchOfficialNdgrCard');
  if (ndgr) hideEl(ndgr);
}

/**
 * ニコ生の描画が欄を出し直しても、次の描画で戻す。
 * @param {ParentNode & { ownerDocument?: Document, defaultView?: { MutationObserver?: typeof MutationObserver, requestAnimationFrame?: Function } }} root
 * @param {() => { platform?: string, facts?: any }|null|undefined} getState
 * @returns {() => void}
 */
export function watchPlatformMetricChrome(root, getState) {
  let scheduled = false;
  let applying = false;
  const run = () => {
    scheduled = false;
    if (applying) return;
    let state = null;
    try { state = getState() || null; } catch { state = null; }
    if (!state || !state.platform || state.platform === 'niconico') return;
    applying = true;
    try { applyPlatformMetricChrome(root, state); }
    finally { applying = false; }
  };
  const schedule = () => {
    if (scheduled || applying) return;
    scheduled = true;
    const view = root.defaultView || root.ownerDocument?.defaultView;
    if (view && typeof view.requestAnimationFrame === 'function') view.requestAnimationFrame(run);
    else run();
  };
  const View = root.defaultView || root.ownerDocument?.defaultView;
  const Obs = View && View.MutationObserver;
  if (typeof Obs === 'function') {
    const obs = new Obs(schedule);
    const watchAttr = (/** @type {Element|null} */ el) => {
      if (el) obs.observe(el, { attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
    };
    watchAttr(root.querySelector('#liveStatCards'));
    watchAttr(root.querySelector('#northStarLanes'));
    watchAttr(root.querySelector('#giftRankingFetchPrompt'));
    const row = root.querySelector('.nl-official-nico-stats__row');
    if (row) obs.observe(row, { childList: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
    for (const sel of [
      '#watchConcurrentEst',
      '#watchConcurrentCard .nl-live-stat-label',
      '[data-lane="contributionRanking"] .nl-north-star-lane__label',
      '[data-lane="giftHistory"] .nl-north-star-lane__label',
    ]) {
      const el = root.querySelector(sel);
      if (el) obs.observe(el, { characterData: true, subtree: true, childList: true });
    }
  }
  schedule();
  // 何かの理由でサービスが決まらなくても、隠した見出しを出したままにしない(3秒で外す)
  const htmlEl = /** @type {Document} */ (root).documentElement || root.ownerDocument?.documentElement;
  if (htmlEl) setTimeout(() => htmlEl.setAttribute('data-nl-platform-ready', '1'), 3000);
  return schedule;
}
