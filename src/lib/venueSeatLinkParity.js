/**
 * venueSeatLinkParity.js — 会場タイルの「リンク欠落」実害確定計器(診断先行アプローチ)。
 *
 * 正本: venue-tile-link-parity-diagnose-DESIGN.md(会議→Fable)。
 *
 * 背景: 会場のタイル実体(<a>/<span>)は鏡由来uid(popup 由来)、席の見た目クラス
 *   nlsb-seat-link は roster 由来uid(会場側の座席割当)という【二重ソース】で判定されている。
 *   rosterDriven モードでは鏡(storage.onChanged)と roster(onLiveComments)が独立した非同期経路で
 *   更新されるため、理論上は不一致が起こりうるが実害の頻度は不明。
 *
 *   本モジュールは「直す」のではなく「実害の有無・頻度を数える」ことだけが目的(観測のみ)。
 *   掟(venueDomCensus.js と同じ): 数えるだけ・DOM/データを触らない。
 *
 * 3つの不変条件(INV):
 *   - INV-1(uid一致): タイル実体を決めた鏡uidと、席クラスを決めたroster uidが同一。
 *   - INV-2(リンク可否の一致): 席クラス(roster判定)とタイル実体のタグ(実DOM)が一致。
 *     ユーザーが見た「リンクのはずが手のマーク」はこのINV-2違反の見た目。
 *   - INV-3(href鮮度): タイルが<a>のとき、hrefが指すuidが今回paintの鏡uidと同一
 *     (diff-skip再利用で古い<a>が残っていないか)。
 *
 * @module venueSeatLinkParity
 */

/** href属性からニコニコのuidを抜く(/user/12345 形式のみ)。マッチしなければ null。 */
const HREF_UID_RE = /\/user\/(\d{1,20})(?:[/?#]|$)/;

/**
 * @returns {{
 *   paints: number, badPaints: number, checked: number,
 *   uidMismatch: number, affordanceMismatch: number, hrefStale: number,
 *   lastSample: null | {
 *     kind: string, seatIndex: number, mirrorUid: string, rosterUid: string,
 *     tileTag: string, seatLinkOn: boolean, mode: string, atWall: number
 *   },
 *   _paintDirty: boolean
 * }}
 */
export function createVenueSeatLinkParityState() {
  return {
    paints: 0,
    badPaints: 0,
    checked: 0,
    uidMismatch: 0,
    affordanceMismatch: 0,
    hrefStale: 0,
    lastSample: null,
    _paintDirty: false
  };
}

/**
 * paint(renderSeatsの席装飾ループ)の開始時に1回呼ぶ。paints をインクリメントし、
 * このpaint内で既にbadPaints計上済みかのフラグをリセットする。
 * @param {ReturnType<typeof createVenueSeatLinkParityState>|null|undefined} state
 */
export function beginVenueSeatLinkPaint(state) {
  if (!state || typeof state !== 'object') return;
  state.paints += 1;
  state._paintDirty = false;
}

/**
 * 1席ぶんの観測。呼び出し側の前提: _venueSeatIndex>=0 かつ node/entry 実在
 * (=正常スキップ系はこの関数の手前で continue 済み)。
 * @param {ReturnType<typeof createVenueSeatLinkParityState>|null|undefined} state
 * @param {{
 *   seatIndex?: unknown, mirrorUid?: unknown, rosterUid?: unknown, seatLinkOn?: unknown,
 *   tileTag?: unknown, tileHref?: unknown, mode?: unknown, wallNow?: unknown
 * }} obs
 */
export function observeVenueSeatLink(state, obs) {
  if (!state || typeof state !== 'object' || !obs || typeof obs !== 'object') return;
  const mirrorUid = String(obs.mirrorUid || '').trim();
  const rosterUid = String(obs.rosterUid || '').trim();
  const tileTag = String(obs.tileTag || '').toUpperCase();
  if (!tileTag) return; // タイル未検出(空可視)は venueDomCensus の縄張り=ここでは数えない

  state.checked += 1;
  /** @type {string} */
  let kind = '';

  // INV-1: 両uidが非空のときだけ比較(片方空を uid 不一致とは呼ばない)。
  if (mirrorUid && rosterUid && mirrorUid !== rosterUid) {
    state.uidMismatch += 1;
    kind = 'uid';
  }

  // INV-2: 席クラス判定(roster)とタイル実体タグ(実DOM)。実DOMのタグを見るので
  //   diff-skipで残った古い<span>/<a>も検出できる。
  const tileIsAnchor = tileTag === 'A';
  const seatLinkOn = obs.seatLinkOn === true;
  if (seatLinkOn !== tileIsAnchor) {
    state.affordanceMismatch += 1;
    kind = kind ? `${kind}+tag` : 'tag';
  }

  // INV-3: <a>のhrefが今回の鏡uidを指しているか(古いhref=別人リンクの残骸)。
  //   マッチしない形式(相対パス等)は fail-open(偽陽性を出さない)。
  if (tileIsAnchor && mirrorUid) {
    const m = HREF_UID_RE.exec(String(obs.tileHref || ''));
    if (m && m[1] !== mirrorUid) {
      state.hrefStale += 1;
      kind = kind ? `${kind}+href` : 'href';
    }
  }

  if (!kind) return;
  if (!state._paintDirty) {
    state.badPaints += 1;
    state._paintDirty = true;
  }
  state.lastSample = {
    kind,
    seatIndex: Math.max(0, Math.floor(Number(obs.seatIndex) || 0)),
    mirrorUid,
    rosterUid,
    tileTag,
    seatLinkOn,
    mode: obs.mode === 'mirror' ? 'mirror' : 'fallback',
    atWall: Math.max(0, Math.floor(Number(obs.wallNow) || 0))
  };
}

/**
 * storage同梱用の軽量形+状態速報1行を作る。checked=0(未観測)は⚪(誤報しない)。
 * @param {ReturnType<typeof createVenueSeatLinkParityState>|null|undefined} state
 * @param {number} wallNow 壁時計(Date.now)。lastSample.atWall との経過秒算出に使う。
 * @returns {{
 *   line: string, checked: number, paints: number, badPaints: number,
 *   uidMismatch: number, affordanceMismatch: number, hrefStale: number,
 *   lastSample: null | { kind: string, seatIndex: number, mirrorUid: string, rosterUid: string,
 *     tileTag: string, seatLinkOn: boolean, mode: string, atWall: number }
 * } | null}
 */
export function toVenueSeatLinkParityDiag(state, wallNow) {
  if (!state || typeof state !== 'object') return null;
  const bad = state.uidMismatch + state.affordanceMismatch + state.hrefStale;
  let line;
  if (state.checked <= 0) {
    line = '席リンク一致 ⚪ 未観測';
  } else if (bad === 0) {
    line = `席リンク一致 ✅ 検${state.checked}(紙${state.paints})`;
  } else {
    const s = state.lastSample;
    const ageSec = s && s.atWall > 0 ? Math.max(0, Math.round((Number(wallNow || 0) - s.atWall) / 1000)) : -1;
    line =
      `席リンク一致 🔴 uid≠${state.uidMismatch} 実体≠${state.affordanceMismatch} href古${state.hrefStale}` +
      ` / 検${state.checked}(紙${state.paints} 悪${state.badPaints})` +
      (s
        ? ` / 直近{${s.kind} 席${s.seatIndex} 鏡u:${s.mirrorUid || '-'} 席u:${s.rosterUid || '-'} tile=${s.tileTag} 級${s.seatLinkOn ? 'on' : 'off'} ${s.mode}${ageSec >= 0 ? ` ${ageSec}s前` : ''}}`
        : '');
  }
  return {
    line,
    checked: state.checked,
    paints: state.paints,
    badPaints: state.badPaints,
    uidMismatch: state.uidMismatch,
    affordanceMismatch: state.affordanceMismatch,
    hrefStale: state.hrefStale,
    lastSample: state.lastSample ? { ...state.lastSample } : null
  };
}
