/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { paintNorthStarLaneBody } from './northStarLaneDom.js';
import { sanitizeMirrorHtml } from './mirrorSanitize.js';

/**
 * C0(北極星レーン複製): popup-entry.js#renderNorthStarLane の【mirrorHtml を sanitize して body へ
 * 流し込むコア】を、純Web /live-view が再利用できる純DOM関数として切り出す前提テスト。
 *   - mirrorHtml 有り → sanitizeMirrorHtml を通して body.innerHTML にセット・data-lane-state=ok・lane を表示
 *   - 空/sanitize 後空 → body をクリア・lane を hide(missing)
 *   - 同一 sanitized は差分スキップ(白フラッシュ防止・popup と同型)
 * popup の待機UI/レール/ガジェット同期は純Webでは不要=このコアだけを共有する。
 */

const io = { sanitizeMirrorHtml };

function makeLane(laneId) {
  const lane = document.createElement('div');
  lane.className = 'nl-north-star-lane';
  lane.hidden = true;
  const body = document.createElement('div');
  body.id = `northStarLaneBody-${laneId}`;
  lane.appendChild(body);
  document.body.replaceChildren(lane);
  return { lane, body };
}

describe('paintNorthStarLaneBody', () => {
  it('mirrorHtml 有り: sanitize して body にセット・data-lane-state=ok・lane 表示', () => {
    const { lane, body } = makeLane('contributionRanking');
    paintNorthStarLaneBody(body, '<div class="x">こくんぼ 5000貢</div>', io);
    expect(body.innerHTML.length).toBeGreaterThan(0);
    expect(body.textContent).toContain('こくんぼ');
    expect(body.getAttribute('data-lane-state')).toBe('ok');
    expect(lane.hidden).toBe(false);
  });

  it('空 mirrorHtml: body クリア・lane hide・data-lane-state=missing', () => {
    const { lane, body } = makeLane('giftHistory');
    body.innerHTML = '<div>old</div>';
    lane.hidden = false;
    paintNorthStarLaneBody(body, '', io);
    expect(body.innerHTML).toBe('');
    expect(lane.hidden).toBe(true);
    expect(body.getAttribute('data-lane-state')).toBe('missing');
  });

  it('fallbackState を渡すと空時に data-lane-state に反映', () => {
    const { body } = makeLane('adRanking');
    paintNorthStarLaneBody(body, '', io, 'fetch_error');
    expect(body.getAttribute('data-lane-state')).toBe('fetch_error');
  });

  it('同一 sanitized は差分スキップ(innerHTML を再代入しない=白フラッシュ防止)', () => {
    const { body } = makeLane('programPoints');
    const html = '<div class="y">番組pt 2840</div>';
    paintNorthStarLaneBody(body, html, io);
    const firstChild = body.firstChild;
    paintNorthStarLaneBody(body, html, io); // 同一
    expect(body.firstChild).toBe(firstChild); // 同じノード=再代入されていない
  });

  it('異なる sanitized は更新する', () => {
    const { body } = makeLane('eventScore');
    paintNorthStarLaneBody(body, '<div>A</div>', io);
    paintNorthStarLaneBody(body, '<div>B</div>', io);
    expect(body.textContent).toContain('B');
    expect(body.textContent).not.toContain('A');
  });

  // ネガコン: sanitize 後に空になる入力(script だけ等)は missing 扱い。
  it('ネガコン: sanitize 後空になる入力は missing(危険タグを貼らない)', () => {
    const { body } = makeLane('eventRank');
    // sanitizeMirrorHtml が落とすであろう内容(script のみ)。落ちて空なら missing。
    paintNorthStarLaneBody(body, '<script>alert(1)</script>', io);
    expect(body.innerHTML).not.toContain('<script');
  });

  it('ネガコン: body=null/欠落で投げない', () => {
    expect(() => paintNorthStarLaneBody(null, '<div>x</div>', io)).not.toThrow();
  });
});
