/**
 * externalFetchCells.js — 外部API(貢献度/ニコニ広告)の取得をセルにする(純関数)。
 *
 * ★なぜ要るか
 *   ギフト貢献度と広告ランキングは **拡張の外(ニコニコのAPI)** から取る。
 *   取れないとき、原因は少なくとも3通りあって打ち手が違う:
 *     1. そもそも送っていない  → リーダー選出/間引きの問題(拡張側)
 *     2. 送ったが応答が無い    → SW未応答/ネットワーク
 *     3. 応答したが0件         → その配信に実際にデータが無い(=正常なことが多い)
 *   ＝ 既存の ns-contrib / ns-ad セルは「state」しか出さないので区別できない。
 *
 * ★[[check-the-external-dependency-first-2026-08-11]]:
 *   **拡張の中を見る前に外部の生死を確かめる**(6版空振りした教訓)。
 *   このセルはその「外の生死」を画面に出す。
 *
 * ★掟2: 0件そのものは異常ではない(広告が無い配信は普通にある)。
 *   **送ったのにエラー/無応答** のときだけ症状にする。
 *
 * @module externalFetchCells
 */

/** @param {unknown} v @returns {number} */
function n0(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {string} id @param {string} label
 * @param {'ok'|'warn'|'bad'|'na'} level @param {string} text
 * @returns {import('./healthCells.js').HealthCell}
 */
function cell(id, label, level, text) {
  return { id, label, kind: /** @type {'state'} */ ('state'), value: null, level, text };
}

/**
 * 1系統(貢献度 or 広告)の取得結果を判定する。
 *
 * @param {{ sent:number, lastOk:unknown, lastStatus:unknown, lastRows:unknown, lastError:unknown, lastAgoMs:unknown }} v
 * @returns {{ level:'ok'|'warn'|'bad'|'na', text:string }}
 */
function judgeFetch(v) {
  const sent = n0(v.sent);
  if (sent <= 0) {
    // まだ一度も送っていない=取得のタイミングが来ていない(掟5の左側)。
    return { level: 'na', text: '—' };
  }
  const err = String(v.lastError || '').trim();
  const status = n0(v.lastStatus);
  const rows = n0(v.lastRows);
  const agoMs = Number(v.lastAgoMs);
  const agoText = Number.isFinite(agoMs) && agoMs >= 0 ? `${Math.round(agoMs / 1000)}秒前` : '';

  if (err) {
    return { level: 'bad', text: `${sent}回送信・エラー: ${err}${agoText ? ` (${agoText})` : ''}` };
  }
  if (status >= 400) {
    return { level: 'bad', text: `${sent}回送信・応答${status}${agoText ? ` (${agoText})` : ''}` };
  }
  if (v.lastOk !== true && status === 0) {
    // 送ったのに応答が記録されていない=無応答の疑い。
    return { level: 'warn', text: `${sent}回送信・応答がありません${agoText ? ` (${agoText})` : ''}` };
  }
  /*
   * ★0件は異常にしない(掟2)。広告もギフトも無い配信は普通にある。
   *   「取れている・中身が0」と「取れていない」を区別して出す。
   */
  return {
    level: 'ok',
    text: rows > 0 ? `${rows}件 取得${agoText ? ` (${agoText})` : ''}` : `取得できています(0件)${agoText ? ` (${agoText})` : ''}`
  };
}

/**
 * 外部取得のセル。
 * @param {any} data buildHealthCells と同じ入力
 * @returns {Array<import('./healthCells.js').HealthCell>}
 */
export function buildExternalFetchCells(data) {
  /** @type {Array<import('./healthCells.js').HealthCell>} */
  const out = [];
  const p = data?.fastDiag?.content?.giftDiagnostics?.externalFetchProbe ?? null;

  if (!p || typeof p !== 'object') {
    out.push(cell('fetch-koken', 'ギフト貢献度の取得', 'na', '—'));
    out.push(cell('fetch-nicoad', '広告ランキングの取得', 'na', '—'));
    out.push(cell('fetch-leader', '取得役の選出', 'na', '—'));
    return out;
  }

  const koken = judgeFetch({
    sent: n0(p.kokenSent), lastOk: p.kokenLastOk, lastStatus: p.kokenLastStatus,
    lastRows: p.kokenLastRows, lastError: p.kokenLastError, lastAgoMs: p.kokenLastAgoMs
  });
  out.push(cell('fetch-koken', 'ギフト貢献度の取得', koken.level, koken.text));

  const nicoad = judgeFetch({
    sent: n0(p.nicoadSent), lastOk: p.nicoadLastOk, lastStatus: p.nicoadLastStatus,
    lastRows: p.nicoadLastRows, lastError: p.nicoadLastError, lastAgoMs: null
  });
  out.push(cell('fetch-nicoad', '広告ランキングの取得', nicoad.level, nicoad.text));

  /* ── 取得役の選出(多タブのとき1つだけが取りに行く) ─────────
   * ★見送り(leaderSkipped)は **防御**(掟1)。多くても正常。
   *   ただし **一度も走っていない** なら誰も取りに行っていない＝症状。
   */
  const ran = n0(p.leaderRan);
  const skipped = n0(p.leaderSkipped);
  const ticks = n0(p.intervalTicks);
  if (ticks <= 0) {
    out.push(cell('fetch-leader', '取得役の選出', 'na', '—'));
  } else if (ran <= 0) {
    out.push(cell(
      'fetch-leader', '取得役の選出', 'warn',
      `${ticks}回中0回(他のタブが取得役です。1つだけ開くと確実です)`
    ));
  } else {
    out.push(cell(
      'fetch-leader', '取得役の選出', 'ok',
      `${ran}/${ticks}回 実行${skipped > 0 ? `(${skipped}回は他タブに譲りました)` : ''}`
    ));
  }

  return out;
}
