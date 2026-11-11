import { laneHiddenByService, omittedOfficialStatKeys } from '../../lib/serviceStatPolicy.js';

/** いま描いている配信の公開数字。レーンを出すかはこの印だけを見る。 */
/** @type {Record<string, unknown>|null} */
let serviceStatSnapshot = null;

/** @param {unknown} snapshot */
export function rememberServiceStatSnapshot(snapshot) {
  serviceStatSnapshot = snapshot && typeof snapshot === 'object'
    ? /** @type {Record<string, unknown>} */ (snapshot)
    : null;
}

/**
 * 北極星レーンの枠（`.nl-north-star-lane[data-lane=<laneId>]`）の表示/非表示を切替える。
 * 空データのイベント系レーンを丸ごと隠して縦スペースを食わせない用途。
 * `hidden` 属性は CSS `.nl-north-star-lane[hidden]{display:none!important}` で確実に
 * 効く（specificity 負け対策＝[[reference_north_star_lane_hidden_css_specificity]]）。
 * そのサービスに数字が無いレーンは、後から出そうとしても隠したままにする。
 * @param {string} laneId
 * @param {boolean} hidden
 */
export function setNorthStarLaneHidden(laneId, hidden) {
  const lane = document.querySelector(
    '.nl-north-star-lane[data-lane="' + String(laneId || '').replace(/"/g, '') + '"]'
  );
  if (!(lane instanceof HTMLElement)) return;
  const forceHide = !hidden && laneHiddenByService(serviceStatSnapshot, laneId);
  if (hidden || forceHide) lane.setAttribute('hidden', '');
  else lane.removeAttribute('hidden');
}

/**
 * 来場・本家コメ・広告pt・ギフトpt と、数字の無い順位レーンを、公開しているものだけ残す。
 * @param {any} snapshot
 */
export function applyUnpublishedStatChips(snapshot) {
  const omit = new Set(omittedOfficialStatKeys(snapshot));
  const chipOf = {
    viewers: 'officialStatNicoViewers',
    comments: 'officialStatNicoComments',
    adPts: 'officialStatNicoAdPts',
    giftPts: 'officialStatNicoGiftPts',
  };
  const defaultLabel = {
    officialStatNicoViewers: '来場',
    officialStatNicoComments: '本家コメ',
    officialStatNicoAdPts: '広告pt',
    officialStatNicoGiftPts: 'ギフトpt',
  };
  const commentLabel = snapshot?.serviceMetrics && snapshot.serviceMetrics.commentLabel
    ? String(snapshot.serviceMetrics.commentLabel)
    : '';
  for (const [key, id] of Object.entries(chipOf)) {
    const el = document.getElementById(id);
    const chip = el && el.closest('.nl-official-nico-stats__chip');
    if (!(chip instanceof HTMLElement)) continue;
    chip.hidden = omit.has(key);
    const label = chip.querySelector('.nl-official-nico-stats__label');
    const fallback = defaultLabel[/** @type {keyof typeof defaultLabel} */ (id)];
    if (label) label.textContent = id === 'officialStatNicoComments' && commentLabel ? commentLabel : fallback;
  }
  for (const laneId of ['contributionRanking', 'adRanking', 'giftHistory']) {
    if (laneHiddenByService(snapshot, laneId)) setNorthStarLaneHidden(laneId, true);
  }
}
