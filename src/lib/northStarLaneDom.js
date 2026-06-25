/**
 * 北極星レーン(公式値レーン)の body へ mirrorHtml を sanitize して流し込むコア。
 *
 * popup-entry.js#renderNorthStarLane の「sanitizeMirrorHtml を通して body.innerHTML にセット +
 * 同一なら差分スキップ + 空なら hide」という核だけを、純Web /live-view が再利用できる純DOM関数として
 * 切り出したもの。popup 側の待機UI/レール/ガジェット同期は純Webでは不要なので含めない(コアだけ共有)。
 *
 * chrome 非依存。sanitizeMirrorHtml(src/lib/mirrorSanitize.js)を io で注入する(生 outerHTML を
 * 直貼りせず必ず sanitize=popup と同じ・XSS/巨大化対策)。
 *
 * @module northStarLaneDom
 */

/** 同一 sanitized HTML の再代入を避ける差分スキップキャッシュ(白フラッシュ防止・popup と同型)。 */
const _lastSanitizedByBody = new WeakMap();

/**
 * @typedef {{ sanitizeMirrorHtml: (html: string) => string }} NorthStarLaneIo
 */

/**
 * 北極星レーン body に mirrorHtml を流し込む。
 *   - mirrorHtml 有り → sanitizeMirrorHtml → body.innerHTML(同一なら差分スキップ)・data-lane-state=ok・lane 表示
 *   - 空 / sanitize 後空 → body クリア・lane hide・data-lane-state=fallbackState(既定 'missing')
 *
 * lane の表示/非表示は body の直近祖先 .nl-north-star-lane の hidden で行う(popup の setNorthStarLaneHidden 相当)。
 *
 * @param {HTMLElement|null} body `#northStarLaneBody-<laneId>`
 * @param {string|null|undefined} mirrorHtml 生 outerHTML(sanitize 前)
 * @param {NorthStarLaneIo} io sanitizeMirrorHtml を注入
 * @param {string} [fallbackState] 空時の data-lane-state(既定 'missing')
 */
export function paintNorthStarLaneBody(body, mirrorHtml, io, fallbackState) {
  if (!body || typeof body !== 'object' || !('innerHTML' in body)) return;
  const lane = typeof body.closest === 'function' ? body.closest('.nl-north-star-lane') : null;
  const setHidden = (/** @type {boolean} */ hidden) => { if (lane && 'hidden' in lane) /** @type {any} */ (lane).hidden = hidden; };

  const raw = typeof mirrorHtml === 'string' ? mirrorHtml.trim() : '';
  const fallSt = typeof fallbackState === 'string' && fallbackState ? fallbackState : 'missing';

  if (!raw) {
    body.innerHTML = '';
    _lastSanitizedByBody.delete(body);
    body.setAttribute('data-lane-state', fallSt);
    setHidden(true);
    return;
  }

  const sanitized = io.sanitizeMirrorHtml(raw);
  if (!sanitized) {
    body.innerHTML = '';
    _lastSanitizedByBody.delete(body);
    body.setAttribute('data-lane-state', fallSt);
    setHidden(true);
    return;
  }

  // 同一 sanitized は再代入しない(子 <img>/<iframe> 再 load による白フラッシュ防止・popup v0.1.622 と同型)。
  if (_lastSanitizedByBody.get(body) !== sanitized || !body.firstChild) {
    body.innerHTML = sanitized;
    _lastSanitizedByBody.set(body, sanitized);
  }
  body.setAttribute('data-lane-state', 'ok');
  setHidden(false);
}
