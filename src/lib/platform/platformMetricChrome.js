/**
 * 横の欄の数字を、配信サービスに合わせて出し分ける。
 * ニコ生の短いラベル(来場・本家コメ・広告pt・ギフトpt)は言葉の置き換え表に入っていないので、
 * ここで隠して、そのサービス自身の数字だけを足す。
 *
 * DOM は引数の root だけを触る。src/lib 直下の純粋性検査の対象外(platform/)。
 */

import { panelExtraChips, platformSectionPlan, foreignPanelCopy, rewriteForeignWording, streamAgeTitle, LOADING, PLATFORM_CAPABILITIES } from './platformMetrics.js';

/** 数でない値の札。ニコ生の「（接続中…）」「（取得不可）」「推定中」「計測中…」や最初の「—」は、ほかのサービスでは「読み込み中」にする。 */
const NOT_A_COUNT = /^(?:—|-|（接続中…）|（取得不可）|（数字非公開）|推定中|計測中…|)$/u;

/** @param {Element|null|undefined} el */
function hideEl(el) {
  if (!el || typeof /** @type {HTMLElement} */ (el).setAttribute !== 'function') return;
  const node = /** @type {HTMLElement} */ (el);
  if (!node.hidden) node.hidden = true;
  if (node.getAttribute('aria-hidden') !== 'true') node.setAttribute('aria-hidden', 'true');
  if (node.dataset && node.dataset.nlPlatformHide !== '1') node.dataset.nlPlatformHide = '1';
}

/** 同じ値の setAttribute も変化の記録になるので、違う時だけ書く。 @param {Element} el @param {string} name @param {string} value */
function setAttrIfDiff(el, name, value) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
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

/**
 * 開いた瞬間用と、描画のあとの両方で同じ見た目にする。見出しは能力表の言葉。
 * 2つめの公式ランキングがあるサービス（nl-cap-subboard）の欄は隠さない。
 * @returns {string}
 */
export function buildForeignCapabilityCss() {
  const ids = Object.keys(PLATFORM_CAPABILITIES).filter((id) => {
    const cap = PLATFORM_CAPABILITIES[/** @type {keyof typeof PLATFORM_CAPABILITIES} */ (id)];
    return cap.native !== true;
  });
  const labelSel = ids.map((id) => `html.nl-cap-${id} #watchConcurrentCard .nl-live-stat-label`).join(',');
  const afters = ids.map((id) => {
    const cap = PLATFORM_CAPABILITIES[/** @type {keyof typeof PLATFORM_CAPABILITIES} */ (id)];
    const label = String(cap.concurrentLabel || '視聴者数').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `html.nl-cap-${id} #watchConcurrentCard .nl-live-stat-label::after{content:"${label}";font-size:10.5px;font-weight:700;line-height:1.2;color:var(--nl-muted,#8b8494);}`;
  }).join('');
  return [
    'html.nl-cap-foreign .nl-live-stat-card--visitors{display:none!important;}',
    'html.nl-cap-foreign .nl-official-nico-stats__chip:has(#officialStatNicoViewers),',
    'html.nl-cap-foreign .nl-official-nico-stats__chip:has(#officialStatNicoComments),',
    'html.nl-cap-foreign .nl-official-nico-stats__chip:has(#officialStatNicoAdPts),',
    'html.nl-cap-foreign .nl-official-nico-stats__chip:has(#officialStatNicoGiftPts),',
    'html.nl-cap-foreign .nl-official-nico-stats__chip:has(#officialStatNicoCommentsRate){display:none!important;}',
    // ニコ生だけの「watch の広告pt」の行は出さない。欄そのものは 2つめの公式ランキングがあるときだけ残す
    'html.nl-cap-foreign [data-lane="adRanking"] .nl-north-star-ad-stats__row:first-child{display:none!important;}',
    'html.nl-cap-foreign:not(.nl-cap-subboard) [data-lane="adRanking"],html.nl-cap-foreign [data-lane="programPoints"],',
    'html.nl-cap-foreign [data-lane="eventRank"],html.nl-cap-foreign [data-lane="eventScore"],',
    'html.nl-cap-foreign [data-lane="eventVotingSupporters"],html.nl-cap-foreign #giftRankingFetchPrompt,',
    'html.nl-cap-foreign #watchOfficialEventBannerCard,html.nl-cap-foreign #watchOfficialNdgrCard,',
    'html.nl-cap-foreign #giftHistoryProgramPt{display:none!important;}',
    'html.nl-cap-foreign .nl-north-star-gift-stack:not(:has(> [data-lane="giftHistory"]:not([hidden]))){display:none!important;}',
    'html.nl-cap-foreign:not([data-nl-gift-has="1"]) .nl-north-star-gift-stack{display:none!important;}',
    'html.nl-cap-foreign:not([data-nl-platform-ready]) #noWatchRankingHint{visibility:hidden;}',
    `${labelSel}{font-size:0!important;line-height:1.2!important;overflow:visible!important;color:transparent!important;}`,
    afters,
    // 数が来る前の「人」「直接値」を出さない（YouTube だけだった隠しを全サービスへ）
    'html.nl-cap-foreign.nl-count-loading #watchConcurrentSub{font-size:0!important;color:transparent!important;}',
    // なふだはニコ生の公式設定。他のサービスでは説明もボタンも出さない。
    'html.nl-cap-foreign .nl-nameplate-inline{display:none!important;}',
    'html.nl-cap-foreign .nl-record-sub:has(#nameplateOnBtn){display:none!important;}',
    // 中身のレーンが全部隠れた「公式の数字」の枠は出さない。レーンが開いたときだけ出す。
    'html.nl-cap-foreign #northStarLanes:not(:has([data-lane]:not([hidden]))){display:none!important;}',
    // 行の無いトップファン（見出しと「このPCの記録です。」だけ）は出さない。行が付いたら出す。
    // どのサービスも、順位の行が1つも無い「公式の数字」は枠ごと出さない。
    'html.nl-cap-foreign [data-lane="contributionRanking"]:not(:has([role="listitem"])){display:none!important;}',
    'html.nl-cap-foreign #northStarLanes:not(:has([role="listitem"])){display:none!important;}',
    // 送信口が能力表に無いサービスだけ、コメントを書く欄を出さない。
    'html.nl-cap-no-post .nl-comment-compose{display:none!important;}',
    // ギフトサイドバー履歴と a: の匿名（184）はニコ生だけ。広告を投げた人の段も出さない。
    'html.nl-cap-foreign details:has(#giftSubAppHistorySummary){display:none!important;}',
    'html.nl-cap-foreign .nl-anonymous-identicon-opt,html.nl-cap-foreign #anonymousIdenticonHint,html.nl-cap-foreign #foldAnonymousInRankStripHint{display:none!important;}',
    'html.nl-cap-foreign #sceneStoryUserLaneAdWrap{display:none!important;}',
    'html.nl-cap-foreign #devMonitorForceRefetchCommenterFollowBtn{display:none!important;}',
    // ギフトが無いサービス（ABEMA）は、ギフトのユーザー欄とギフトの段を出さない。
    'html.nl-cap-no-paid details:has(#giftQuickStatsMount){display:none!important;}',
    'html.nl-cap-no-paid #sceneStoryUserLaneGiftWrap{display:none!important;}',
  ].join('');
}

/** @param {ParentNode} root @param {string} platformId @param {boolean} [subBoard] 二つめの公式ランキングの欄を使うサービス @param {boolean} [commentPost] コメントを書けるサービス @param {boolean} [noPaid] ギフトの無いサービス */
function markCapability(root, platformId, subBoard, commentPost, noPaid) {
  const doc = root.ownerDocument || (root.nodeType === 9 ? /** @type {Document} */ (root) : null);
  const html = doc && doc.documentElement;
  if (!html || !html.classList) return;
  // classList.add/toggle は同じ値でも class 属性を書き直す(変化の記録が出る)ので、変わる時だけ触る。
  const cl = html.classList;
  if (!cl.contains('nl-cap-foreign')) cl.add('nl-cap-foreign');
  if (cl.contains('nl-cap-subboard') !== (subBoard === true)) cl.toggle('nl-cap-subboard', subBoard === true);
  const noPost = commentPost === false;
  if (cl.contains('nl-cap-no-post') !== noPost) cl.toggle('nl-cap-no-post', noPost);
  const unpaid = noPaid === true;
  if (cl.contains('nl-cap-no-paid') !== unpaid) cl.toggle('nl-cap-no-paid', unpaid);
  const id = String(platformId || '');
  if (id && !cl.contains(`nl-cap-${id}`)) cl.add(`nl-cap-${id}`);
  const css = buildForeignCapabilityCss();
  let style = doc.getElementById(FOREIGN_STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = FOREIGN_STYLE_ID;
    (doc.head || html).appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

/** 詳細設定の見出しなどから、ニコ生だけの「なふだ」を外す。 @param {string} text */
function dropNafuda(text) {
  return String(text || '').replace(/・なふだ/g, '').replace(/なふだ・/g, '');
}

/** 最初の文の節だけ差し替える（中のヒントは残す）。 @param {Element|null|undefined} el @param {string} text */
function setLeadText(el, text) {
  if (!el) return;
  let textNode = null;
  for (const n of el.childNodes) {
    if (n.nodeType === 3 && String(n.nodeValue || '').trim()) { textNode = n; break; }
  }
  if (!textNode) {
    el.insertBefore(el.ownerDocument.createTextNode(text), el.firstChild);
    return;
  }
  if (String(textNode.nodeValue || '').trim() !== text) textNode.nodeValue = text;
}

/** @param {ParentNode} root @param {string} from @param {string} to */
function replaceText(root, from, to) {
  if (!root || typeof root.ownerDocument === 'undefined' && !('createTreeWalker' in root)) return;
  const doc = root.nodeType === 9 ? /** @type {Document} */ (root) : root.ownerDocument;
  if (!doc || typeof doc.createTreeWalker !== 'function') return;
  const walker = doc.createTreeWalker(/** @type {Node} */ (root), 4);
  let n = walker.nextNode();
  while (n) {
    if (n.nodeValue && n.nodeValue.includes(from)) n.nodeValue = n.nodeValue.split(from).join(to);
    n = walker.nextNode();
  }
}

/** 最初の1回だけ、画面の文と title / aria-label を能力表の呼び方にする。 @param {ParentNode} root @param {string} platformId */
function applyForeignWordingOnce(root, platformId) {
  const doc = root.nodeType === 9 ? /** @type {Document} */ (root) : root.ownerDocument;
  const html = doc && doc.documentElement;
  if (!html || html.dataset.nlForeignWording === '1') return;
  const skip = '#supportTimelineBody,#commentTickerViewport,#commentInput,#userRoomList,#changelogList';
  const inSkip = (/** @type {Node} */ node) => {
    const el = node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement;
    return !!(el && typeof el.closest === 'function' && el.closest(skip));
  };
  if (doc && typeof doc.createTreeWalker === 'function') {
    const walker = doc.createTreeWalker(/** @type {Node} */ (root), 4);
    let n = walker.nextNode();
    while (n) {
      const parent = n.parentElement;
      const tag = parent && parent.tagName;
      if (n.nodeValue && tag !== 'SCRIPT' && tag !== 'STYLE' && !inSkip(n)) {
        const next = rewriteForeignWording(n.nodeValue, platformId);
        if (next !== n.nodeValue) n.nodeValue = next;
      }
      n = walker.nextNode();
    }
  }
  const scope = root.nodeType === 9 ? /** @type {Document} */ (root) : root;
  if (typeof scope.querySelectorAll === 'function') {
    for (const el of scope.querySelectorAll('[title],[aria-label],[placeholder]')) {
      if (inSkip(el)) continue;
      for (const name of ['title', 'aria-label', 'placeholder']) {
        const cur = el.getAttribute(name);
        if (!cur) continue;
        const next = rewriteForeignWording(cur, platformId);
        if (next !== cur) el.setAttribute(name, next);
      }
    }
  }
  html.dataset.nlForeignWording = '1';
}

/**
 * なふだの説明と、空でも残るニコ生の見出しを、他のサービスでは出さない。
 * コメントを書く欄は、送信できるサービスでは残す（SHOWROOM は SR_SEND_COMMENT）。
 * 下の折りたたみも、能力表の言葉に合わせる（広告・サイドバー履歴・a: の匿名は出さない）。
 * @param {ParentNode} root
 * @param {ReturnType<typeof foreignPanelCopy>} copy
 */
function rewriteForeignPanelWords(root, copy) {
  const inline = root.querySelector('.nl-nameplate-inline');
  if (inline) hideEl(/** @type {HTMLElement} */ (inline));
  const nameBtn = root.querySelector('#nameplateOnBtn');
  const block = nameBtn && typeof nameBtn.closest === 'function' ? nameBtn.closest('.nl-record-sub') : null;
  if (block) hideEl(/** @type {HTMLElement} */ (block));
  const summary = root.querySelector('#nlPopupSettings > summary');
  if (summary) {
    const next = dropNafuda(summary.textContent || '');
    if (summary.textContent !== next) summary.textContent = next;
  }
  const hint = root.querySelector('#exportToolbarHint');
  if (hint) {
    const next = dropNafuda(hint.textContent || '');
    if (hint.textContent !== next) hint.textContent = next;
  }
  const venue = root.querySelector('#venueButtonVisibleToggle');
  const venueHint = venue && venue.parentElement ? venue.parentElement.querySelector('.nl-record-sub__hint') : null;
  if (venueHint && String(venueHint.textContent || '').includes('ニコ生')) {
    venueHint.textContent = '視聴ページの右下に出る「会場モード」ボタンです。使わない場合はオフにすると出なくなります（反映には視聴ページの再読み込みが必要です）。';
  }
  if (!copy) return;
  const header = root.querySelector('.nl-header .nl-sub');
  if (header && String(header.textContent || '').includes('ニコ生')) header.textContent = copy.header;
  const timeline = root.querySelector('.nl-support-timeline__summary-label');
  if (timeline && timeline.textContent !== copy.timelineLabel) timeline.textContent = copy.timelineLabel;
  const timelineBody = root.querySelector('#supportTimelineBody');
  if (timelineBody) setAttrIfDiff(timelineBody, 'aria-label', copy.timelineAria);
  const usersMount = root.querySelector('#giftQuickStatsMount');
  const usersDetails = usersMount && typeof usersMount.closest === 'function' ? usersMount.closest('details') : null;
  if (usersDetails) {
    if (!copy.showGiftUsers) hideEl(/** @type {HTMLElement} */ (usersDetails));
    else {
      const usersSummary = usersDetails.querySelector('summary');
      if (usersSummary && usersSummary.textContent !== copy.giftUsersLabel) usersSummary.textContent = copy.giftUsersLabel;
    }
  }
  const side = root.querySelector('#giftSubAppHistorySummary');
  const sideDetails = side && typeof side.closest === 'function' ? side.closest('details') : null;
  if (sideDetails) hideEl(/** @type {HTMLElement} */ (sideDetails));
  for (const sel of ['.nl-anonymous-identicon-opt', '#anonymousIdenticonHint', '#foldAnonymousInRankStripHint', '#sceneStoryUserLaneAdWrap', '#devMonitorForceRefetchCommenterFollowBtn']) {
    const el = root.querySelector(sel);
    if (el) hideEl(/** @type {HTMLElement} */ (el));
  }
  const giftWrap = root.querySelector('#sceneStoryUserLaneGiftWrap');
  if (giftWrap && !copy.showGiftUsers) hideEl(/** @type {HTMLElement} */ (giftWrap));
  const giftLane = root.querySelector('#sceneStoryUserLaneGift');
  if (giftLane && copy.showGiftUsers) setAttrIfDiff(giftLane, 'aria-label', `${copy.paidLabel}を贈った人`);
  const effect = root.querySelector('label[for="effectSoundToggle"] > span');
  setLeadText(effect, copy.effectLabel);
  const effectHint = effect ? effect.querySelector('.nl-record-sub__hint') : null;
  if (effectHint && effectHint.textContent !== copy.effectHint) effectHint.textContent = copy.effectHint;
  const calm = root.querySelector('label[for="calmPanelMotion"] > span');
  if (calm && calm.textContent !== copy.calm) calm.textContent = copy.calm;
  const concept = root.querySelector('.nl-project-concept-body');
  if (concept) replaceText(concept, 'ニコ生の', '');
  const harvest = root.querySelector('#commentHarvestBanner');
  if (harvest) replaceText(harvest, 'ニコ生の画面改修', '配信ページの画面の変化');
  const gate = root.querySelector('#usageTermsGate');
  if (gate) {
    replaceText(gate, 'ニコニコの利用条件ページの写しではありません', 'その配信サービスの利用条件ページの写しではありません');
    replaceText(gate, 'ニコニコのサーバーから読み込まれる', 'その配信サービスのサーバーから読み込まれる');
    const link = gate.querySelector('a[href*="nicovideo.jp"]');
    const row = link && typeof link.closest === 'function' ? link.closest('tr') : null;
    if (row) hideEl(/** @type {HTMLElement} */ (row));
  }
  const shade = root.querySelector('.nl-init-shade__submsg');
  if (shade && String(shade.textContent || '').includes('ギフト履歴')) {
    shade.textContent = 'コメントの記録は、配信ページを開くと取り込めます。';
  }
  applyForeignWordingOnce(root, copy.id);
}

/**
 * @param {ParentNode} root
 * @param {{ platform?: string, facts?: any, officialBoard?: boolean }} state
 */
export function applyPlatformMetricChrome(root, state) {
  if (!root || typeof root.querySelector !== 'function') return;
  const plan = platformSectionPlan(String(state?.platform || ''), { officialBoard: state?.officialBoard === true });
  if (plan.native) return;
  const copy = foreignPanelCopy(plan.id);
  markCapability(root, plan.id, plan.subBoard === true, plan.commentPost === true, copy ? copy.showGiftUsers !== true : false);
  if (plan.nameplate !== true) rewriteForeignPanelWords(root, copy);
  const facts = state?.facts && typeof state.facts === 'object' ? state.facts : {};

  const vis = root.querySelector('.nl-live-stat-card--visitors');
  if (vis) hideEl(vis);

  const concLabel = root.querySelector('#watchConcurrentCard .nl-live-stat-label');
  if (concLabel && concLabel.textContent !== plan.concurrentLabel) concLabel.textContent = plan.concurrentLabel;
  const concCard = root.querySelector('#watchConcurrentCard');
  if (concCard) setAttrIfDiff(concCard, 'title', '配信ページが出している公式の数です。');
  const concIcon = root.querySelector('#watchConcurrentCard .nl-live-stat-icon');
  if (concIcon) {
    setAttrIfDiff(concIcon, 'title', plan.concurrentLabel);
    setAttrIfDiff(concIcon, 'aria-label', plan.concurrentLabel);
  }
  // 数が来る前の札(開いた直後の「—」・ニコ生の「（接続中…）」等)を「読み込み中」に。数そのものと「N分前」は触らない。
  const est = root.querySelector('#watchConcurrentEst');
  const sub = root.querySelector('#watchConcurrentSub');
  if (est) {
    const t = String(est.textContent || '').trim();
    if (NOT_A_COUNT.test(t) || t.startsWith('~') || t === '推定中' || t.includes('接続中')) {
      if (est.textContent !== LOADING) est.textContent = LOADING;
      if (!est.classList.contains('is-placeholder')) est.classList.add('is-placeholder');
      if (est.hasAttribute('title')) est.removeAttribute('title');
      if (sub && sub.textContent !== '') sub.textContent = '';
    }
  }
  if (sub) {
    const st = String(sub.textContent || '').trim();
    // ニコ生の同接の説明（直接値・推定）を、他のサービスの人数の横に残さない
    if (st === '直接値' || st === '材料待ち' || st.includes('推定')) sub.textContent = '';
  }
  const loading = root.querySelector('#watchConcurrentLoading');
  if (loading) setAttrIfDiff(loading, 'aria-label', `${plan.concurrentLabel}を読み込み中`);

  for (const id of ['officialStatNicoViewers', 'officialStatNicoComments', 'officialStatNicoAdPts', 'officialStatNicoGiftPts']) {
    const val = root.querySelector(`#${id}`);
    const chip = val && val.parentElement;
    if (chip) hideEl(chip);
  }
  const rate = root.querySelector('#officialStatNicoCommentsRate');
  if (rate) hideEl(rate);

  const row = root.querySelector('.nl-official-nico-stats__row');
  if (row) {
    setAttrIfDiff(row, 'aria-label', 'この配信の数字');
    const ageVal = root.querySelector('#officialStatNicoStreamAge');
    const ageChip = ageVal && ageVal.parentElement;
    if (ageChip) {
      if (ageChip.hidden) ageChip.hidden = false;
      if (ageChip.hasAttribute('aria-hidden')) ageChip.removeAttribute('aria-hidden');
      const title = streamAgeTitle(facts);
      if (title) {
        if (ageChip.getAttribute('title') !== title) ageChip.setAttribute('title', title);
      } else if (ageChip.hasAttribute('title')) ageChip.removeAttribute('title');
      // ★0.1.2126: 既に末尾なら動かさない。毎回 appendChild すると row の childList が変わったことになり、
      //   下の watchPlatformMetricChrome の見張りがそれを拾って次のフレームでまた適用する=毎フレーム(1秒に60回)
      //   回り続けていた(手元計測: 何もしていない5秒で 299回・DOM の変化 8,045件・ニコ生以外の全サービス)。
      if (row.lastElementChild !== ageChip) row.appendChild(ageChip);
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
        const ph = chip.placeholder === true || chip.text === '—';
        if (val.classList.contains('is-placeholder') !== ph) val.classList.toggle('is-placeholder', ph);
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
      if (chip.title) {
        if (el.getAttribute('title') !== chip.title) el.setAttribute('title', chip.title);
      } else if (el.hasAttribute('title')) el.removeAttribute('title');
    }
    // ★v0.1.2207: 推定・合計を先頭に置く並び(panelExtraChips の順)を DOM にも反映する。後から来たチップ(公式の数の後に
    //   数え終わった推定 等)は末尾に足されるので、順が違うときだけ並べ直す(同じなら触らない=見張りの無限ループを作らない)。
    const placed = [...row.querySelectorAll('[data-nl-metric]')];
    const order = extras.map((c) => c.key);
    if (placed.length === order.length && placed.some((el, i) => el.getAttribute('data-nl-metric') !== order[i])) {
      const anchor = ageChip && ageChip.parentElement === row ? ageChip : null;
      for (const key of order) {
        const el = row.querySelector(`[data-nl-metric="${key}"]`);
        if (el) row.insertBefore(el, anchor);
      }
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
    // 演出と同じ決まりで数えた応援(supportEventCount・v0.1.2225)。ジュエルのギフトだけの配信でも欄を出す
    const has = (Number(sup.superchatCount) || 0) + (Number(sup.stickerCount) || 0)
        + (Number(sup.membershipCount) || 0) + (Number(sup.membershipGiftCount) || 0) + (Number(sup.supportEventCount) || 0) > 0;
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
