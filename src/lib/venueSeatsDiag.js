/**
 * 会場モード(venueBar.js)の「座席健全度」診断。会場が描いている席の純観測値を組み立てる純関数群。
 * 記録/描画には一切触れない(voiceDiag.js と同思想=会場が書き status が読んで色セルに再表示)。
 *
 * 目的(2026-06-22 ユーザー要望): 会場座席情報を健全度パネルに載せ、AI も人間も
 *   ミス(配信者本人の混入・顔ぶれずれ・会場の固着)を一目で発見できるようにする。
 *
 * @typedef {{
 *   enabled: boolean,            // 会場モードが開いているか
 *   liveId: string,              // ★v0.1.1050: 会場が観測した配信ID(空=未観測)。パリティ突合で別配信の残骸を弾くガード
 *   seatsShown: number,          // 同時表示している席数(visibleSeats の数)
 *   participantCount: number,    // 会場参加者数(buildVenueSeating の論理席=実コメントした人)
 *   otherCount: number,          // 席に表示しきれなかった「ほか N 人」
 *   broadcasterInSeats: boolean, // 配信者本人が席に混入しているか(true=除外漏れ=異常)
 *   broadcasterKnown: boolean,   // 配信者 uid が判明しているか(false=混入判定できない)
 *   lastUpdateAt: number,        // 最後に席を更新した時刻(epoch ms・0=未更新)。古い=会場が固着の兆候
 *   perRow: number,              // 1段に収まる席数(seatsPerRow の実測)。0=未観測
 *   venueMaxRows: number,        // 積んだ段数(全席÷perRow を 500/perRow で cap)。0=未観測
 *   seatAreaWidth: number,       // 席エリアの実測幅px(clientWidth)。0=レイアウト未確定/事故の兆候
 *   visibleCapReason: 'participant'|'grid'|'hardCap'|'',  // 可視席が何で頭打ちになったか(''=未観測)
 *   laneParity: { mode: string, verdict: string, reason?: string, line: string, unexplained: number, mirrorAgeSec: number,
 *                 dom?: null | { measured: boolean, ghost: number, bare: number, visibleEmpty: number, unkeyed: number,
 *                               dupIntra: number, dupCross: number, strays: number,
 *                               charFrame: number, crowdOn: boolean, crowdCount: number } }|null,
 *   anonExcluded: number,
 *   unseated: number,
 *   storyDiagMirror: { present: boolean, ageSec: number|null },
 *   openLatency: { opens: number, mirrorMs: number, aggregateMs: number, firstPaintMs: number,
 *                  firstSeatMs: number, mirrorTimedOut: boolean, mirrorAbsent: boolean, line: string },
 *   sceneReceipt: { match: boolean, line: string }|null,
 *   seatLinkParity: { line: string, checked: number, paints: number, badPaints: number,
 *     uidMismatch: number, affordanceMismatch: number, hrefStale: number,
 *     lastSample: null | { kind: string, seatIndex: number, mirrorUid: string, rosterUid: string,
 *       tileTag: string, seatLinkOn: boolean, mode: string, atWall: number } }|null,
 *   yukkuriNamedCensus: { line: string, checked: number, yukkuriNamed: number, outOfRangeDigits: number,
 *     lastSample: null | { uid: string, name: string, digits: number } }|null,
 *   mirrorIntakeLine: string,
 *   mirrorIntake: { changedEvents:number, keyMatched:number, keyMissed:number, accepted:number,
 *     rejectedByGate:number, lastMissedKeys:string[], lastExpectedKey:string,
 *     lastAcceptedAt:number, lastRejectReason:string }|null,
 *   avatarProbe: {usericonSucceeded:number,usericonFailed:number,failedTimeout:number,failedError:number,retriedTotal:number,lastFailAgoMs:number}|null
 * }} VenueSeatsDiagState
 *
 * laneParity は v0.1.1111 の「会場=①レーンのメンバー一致トークン」(venueLaneParity.js)。null=未観測。
 *   v0.1.1113(Tri-Parity): dom=実DOM census 要約(venueDomCensus.js)。measured=false 相当は null。
 * anonExcluded(2026-07-14 会場独自受け皿の撤去): fallback時に会場独自の受け皿を持たなくなったため、
 *   「なぜ段が少ないか」を黙らないための計器(「消す側」に計器を、の鉄則)。匿名として除外した人数。
 * seatLinkParity(2026-07-14 診断先行・venue-tile-link-parity-diagnose-DESIGN.md): タイル実体(鏡uid)⇄
 *   席クラス(roster uid)の二重ソース不一致が実害を出しているかを数えるだけの計器(修正はしない)。null=未観測。
 * yukkuriNamedCensus(2026-07-15 診断先行・venue-yukkuri-named-diagnose): 「名前ありゆっくり顔」の
 *   実害を数えるだけの計器(修正はしない)。null=未観測。
 */

/** 初期 会場座席診断 state。 */
export function makeInitialVenueSeatsDiag() {
  return {
    enabled: false,
    liveId: '',
    seatsShown: 0,
    participantCount: 0,
    otherCount: 0,
    broadcasterInSeats: false,
    broadcasterKnown: false,
    lastUpdateAt: 0,
    perRow: 0,
    venueMaxRows: 0,
    seatAreaWidth: 0,
    visibleCapReason: '',
    laneParity: /** @type {VenueSeatsDiagState['laneParity']} */ (null),
    sceneReceipt: /** @type {VenueSeatsDiagState['sceneReceipt']} */ (null),
    anonExcluded: 0,
    unseated: 0,
    storyDiagMirror: { present: false, ageSec: /** @type {number|null} */ (null) },
    // v0.1.1207: 会場の立ち上がり分解(開く→鏡→集計→初描画→初席)。未観測は -1。
    openLatency: {
      opens: 0, mirrorMs: -1, aggregateMs: -1, firstPaintMs: -1, firstSeatMs: -1,
      mirrorTimedOut: false, mirrorAbsent: false, line: '会場立ち上がり ⚪ 未観測'
    },
    seatLinkParity: /** @type {VenueSeatsDiagState['seatLinkParity']} */ (null),
    yukkuriNamedCensus: /** @type {VenueSeatsDiagState['yukkuriNamedCensus']} */ (null),
    // ★v0.1.1317: 会場が鏡を受け取れているかの1行(未観測は空文字=状態速報に出ない)。
    mirrorIntakeLine: '',
    /*
     * ★v0.1.1405: 判定の【材料】(行だけでは画面のセルが作れない)。
     *   ★この関数は「フィールドを個別列挙して作り直す」型なので、
     *     ここに足さないと venueBar が載せても **黙って落ちる**
     *     ([[venue-mirror-is-the-primary-path-2026-08-01]] を5回踏んだ箇所)。
     */
    mirrorIntake: /** @type {VenueSeatsDiagState['mirrorIntake']} */ (null),
    // ★v0.1.1348: 会場のアイコン実績(初期は未計測=null)。
    avatarProbe: /** @type {VenueSeatsDiagState['avatarProbe']} */ (null)
  };
}

/**
 * 会場の「可視席数が何で頭打ちになったか」を判定する純関数。
 * 会場は論理席(participantCount)を持つが、実際に描画する席は
 *   visibleSeatCount = min(participantCount, perRow*venueMaxRows, hardCap)
 * で絞られる。どの項が min を決めたか=なぜ全員出ないかの真因を1語で返す。
 *   - 'participant': participantCount が最小=全員が可視(絞られていない・正常)
 *   - 'grid':        perRow*venueMaxRows が最小=段数/列数(=画面幅・レイアウト)で頭打ち
 *   - 'hardCap':     hardCap(500)が最小=席プール上限で頭打ち(超大型配信)
 * 同値のときは participant > grid > hardCap の優先で「より内側の制約」を返す
 *   (participant が最小なら絞られていない、を最優先で報告する)。
 *
 * @param {{ participantCount?: number, perRow?: number, venueMaxRows?: number, hardCap?: number }} obs
 * @returns {'participant'|'grid'|'hardCap'|''} 未観測(値が揃わない)は ''
 */
export function classifyVenueVisibleCapReason(obs) {
  const o = obs && typeof obs === 'object' ? obs : {};
  const participant = Math.max(0, Math.floor(Number(o.participantCount) || 0));
  const perRow = Math.max(0, Math.floor(Number(o.perRow) || 0));
  const rows = Math.max(0, Math.floor(Number(o.venueMaxRows) || 0));
  const hardCap = Math.max(0, Math.floor(Number(o.hardCap) || 0));
  // perRow/rows が未観測(0)なら grid 項を評価できない=判定不能。
  if (participant <= 0 || perRow <= 0 || rows <= 0 || hardCap <= 0) return '';
  const grid = perRow * rows;
  const min = Math.min(participant, grid, hardCap);
  if (participant <= min) return 'participant';
  if (grid <= min) return 'grid';
  return 'hardCap';
}

/**
 * storage 書き込み用の軽量スナップショット(ago は読み手側で算出するため base を渡す)。
 * @param {Partial<VenueSeatsDiagState>|null|undefined} diag
 * @param {number} [nowMs]
 * @returns {VenueSeatsDiagState & { capturedAt: number }}
 */
export function buildVenueSeatsDiagSnapshot(diag, nowMs) {
  const base = makeInitialVenueSeatsDiag();
  const d = /** @type {any} */ (diag && typeof diag === 'object' ? diag : {});
  /** @param {unknown} x @param {number} fallback @returns {number} */
  const num = (x, fallback) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  };
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const perRow = num(d.perRow, base.perRow);
  const venueMaxRows = num(d.venueMaxRows, base.venueMaxRows);
  const participantCount = num(d.participantCount, base.participantCount);
  const seatAreaWidth = num(d.seatAreaWidth, base.seatAreaWidth);
  // visibleCapReason は会場から渡ってくればそれを尊重、無ければ観測値から導出。
  const reasonIn = typeof d.visibleCapReason === 'string' ? d.visibleCapReason : '';
  const visibleCapReason =
    reasonIn === 'participant' || reasonIn === 'grid' || reasonIn === 'hardCap'
      ? reasonIn
      : classifyVenueVisibleCapReason({
          participantCount,
          perRow,
          venueMaxRows,
          hardCap: num(d.hardCap, 0)
        });
  // v0.1.1111: 会場=①レーンのメンバー一致トークン(venueLaneParity.js の toVenueLaneParityDiag 出力)。
  //   storage へは検証済みの軽量形だけ通す(未知の巨大オブジェクトを写さない)。
  const lpIn = /** @type {any} */ (d.laneParity && typeof d.laneParity === 'object' ? d.laneParity : null);
  // v0.1.1113(Tri-Parity): dom 要約(実DOM census)。検証済みの数値だけ通す(keys/段別詳細は通さない)。
  const lpDomIn = /** @type {any} */ (lpIn && lpIn.dom && typeof lpIn.dom === 'object' ? lpIn.dom : null);
  const lpDom =
    lpDomIn && lpDomIn.measured === true
      ? {
          measured: true,
          ghost: Math.max(0, Math.floor(num(lpDomIn.ghost, 0))),
          bare: Math.max(0, Math.floor(num(lpDomIn.bare, 0))),
          visibleEmpty: Math.max(0, Math.floor(num(lpDomIn.visibleEmpty, 0))),
          unkeyed: Math.max(0, Math.floor(num(lpDomIn.unkeyed, 0))),
          // v0.1.1116: 白円計器(blank=avatarがblank.jpg・blankAnon=数値ID鍵でないのに白円=導出バグ)。
          blank: Math.max(0, Math.floor(num(lpDomIn.blank, 0))),
          blankAnon: Math.max(0, Math.floor(num(lpDomIn.blankAnon, 0))),
          dupIntra: Math.max(0, Math.floor(num(lpDomIn.dupIntra, 0))),
          dupCross: Math.max(0, Math.floor(num(lpDomIn.dupCross, 0))),
          strays: Math.max(0, Math.floor(num(lpDomIn.strays, 0))),
          charFrame: Math.max(0, Math.floor(num(lpDomIn.charFrame, 0))),
          crowdOn: lpDomIn.crowdOn === true,
          crowdCount: Math.max(0, Math.floor(num(lpDomIn.crowdCount, 0))),
          probeFail: Math.max(0, Math.floor(num(lpDomIn.probeFail, 0)))
        }
      : null;
  const laneParity = lpIn
    ? {
        mode: String(lpIn.mode || ''),
        verdict: String(lpIn.verdict || ''),
        reason: String(lpIn.reason || ''),
        line: String(lpIn.line || ''),
        unexplained: Math.max(0, Math.floor(num(lpIn.unexplained, 0))),
        mirrorAgeSec: Math.floor(num(lpIn.mirrorAgeSec, 0)),
        dom: lpDom
      }
    : null;
  const sdmIn = /** @type {any} */ (d.storyDiagMirror && typeof d.storyDiagMirror === 'object' ? d.storyDiagMirror : null);
  const sdmAge = Number(sdmIn?.ageSec);
  // v0.1.1207: 立ち上がり分解はそのまま通す(純関数側で整形済み・ここでは型だけ守る)。
  const olIn = /** @type {any} */ (d.openLatency && typeof d.openLatency === 'object' ? d.openLatency : null);
  const openLatency = olIn
    ? {
        opens: num(olIn.opens, 0),
        mirrorMs: num(olIn.mirrorMs, -1),
        aggregateMs: num(olIn.aggregateMs, -1),
        firstPaintMs: num(olIn.firstPaintMs, -1),
        firstSeatMs: num(olIn.firstSeatMs, -1),
        mirrorTimedOut: olIn.mirrorTimedOut === true,
        mirrorAbsent: olIn.mirrorAbsent === true,
        line: String(olIn.line || '')
      }
    : base.openLatency;
  const storyDiagMirror = {
    present: sdmIn?.present === true,
    ageSec: sdmIn?.present === true && Number.isFinite(sdmAge) ? Math.max(0, Math.floor(sdmAge)) : null
  };
  // v0.1.1137(lanescene-structural-review MVP): ①=会場の鏡世代突合(軽量な代理指標)。
  //   検証済みの match/line だけ通す(未知の巨大オブジェクトを写さない)。
  const srIn = /** @type {any} */ (d.sceneReceipt && typeof d.sceneReceipt === 'object' ? d.sceneReceipt : null);
  const sceneReceipt = srIn ? { match: srIn.match === true, line: String(srIn.line || '') } : null;
  // 2026-07-14 席リンク一致計器: 検証済みのフィールドだけ通す(未知の巨大オブジェクトを写さない)。
  const slpIn = /** @type {any} */ (d.seatLinkParity && typeof d.seatLinkParity === 'object' ? d.seatLinkParity : null);
  const slpSampleIn = /** @type {any} */ (slpIn?.lastSample && typeof slpIn.lastSample === 'object' ? slpIn.lastSample : null);
  const seatLinkParity = slpIn
    ? {
        line: String(slpIn.line || ''),
        checked: Math.max(0, Math.floor(num(slpIn.checked, 0))),
        paints: Math.max(0, Math.floor(num(slpIn.paints, 0))),
        badPaints: Math.max(0, Math.floor(num(slpIn.badPaints, 0))),
        uidMismatch: Math.max(0, Math.floor(num(slpIn.uidMismatch, 0))),
        affordanceMismatch: Math.max(0, Math.floor(num(slpIn.affordanceMismatch, 0))),
        hrefStale: Math.max(0, Math.floor(num(slpIn.hrefStale, 0))),
        lastSample: slpSampleIn
          ? {
              kind: String(slpSampleIn.kind || ''),
              seatIndex: Math.max(0, Math.floor(num(slpSampleIn.seatIndex, 0))),
              mirrorUid: String(slpSampleIn.mirrorUid || ''),
              rosterUid: String(slpSampleIn.rosterUid || ''),
              tileTag: String(slpSampleIn.tileTag || ''),
              seatLinkOn: slpSampleIn.seatLinkOn === true,
              mode: String(slpSampleIn.mode || ''),
              atWall: Math.max(0, Math.floor(num(slpSampleIn.atWall, 0)))
            }
          : null
      }
    : null;
  // 2026-07-15 診断先行(venue-yukkuri-named-diagnose): 検証済みのフィールドだけ通す。
  const ynIn = /** @type {any} */ (d.yukkuriNamedCensus && typeof d.yukkuriNamedCensus === 'object' ? d.yukkuriNamedCensus : null);
  const ynSampleIn = /** @type {any} */ (ynIn?.lastSample && typeof ynIn.lastSample === 'object' ? ynIn.lastSample : null);
  const yukkuriNamedCensus = ynIn
    ? {
        line: String(ynIn.line || ''),
        checked: Math.max(0, Math.floor(num(ynIn.checked, 0))),
        yukkuriNamed: Math.max(0, Math.floor(num(ynIn.yukkuriNamed, 0))),
        outOfRangeDigits: Math.max(0, Math.floor(num(ynIn.outOfRangeDigits, 0))),
        lastSample: ynSampleIn
          ? {
              uid: String(ynSampleIn.uid || ''),
              name: String(ynSampleIn.name || ''),
              digits: Math.max(0, Math.floor(num(ynSampleIn.digits, 0)))
            }
          : null
      }
    : null;
  return {
    enabled: !!d.enabled,
    liveId: String(d.liveId || base.liveId),
    seatsShown: num(d.seatsShown, base.seatsShown),
    participantCount,
    otherCount: num(d.otherCount, base.otherCount),
    broadcasterInSeats: !!d.broadcasterInSeats,
    broadcasterKnown: !!d.broadcasterKnown,
    lastUpdateAt: num(d.lastUpdateAt, base.lastUpdateAt),
    perRow,
    venueMaxRows,
    seatAreaWidth,
    visibleCapReason,
    laneParity,
    sceneReceipt,
    anonExcluded: Math.max(0, Math.floor(num(d.anonExcluded, 0))),
    // venue-exact-parity-SPEC-2026-08-07 §5-3: 席なし(uid で席に結びつかなかった段タイル)件数。
    unseated: Math.max(0, Math.floor(num(d.unseated, 0))),
    storyDiagMirror,
    openLatency,
    seatLinkParity,
    yukkuriNamedCensus,
    /*
     * ★v0.1.1317: 会場が鏡を受け取れているかの1行(会場が完全一致しない件の切り分け)。
     *   文字列1本だけ通す(未知の巨大オブジェクトを写さない=このファイルの既存方針)。
     *   空文字なら状態速報側で行ごと出さない=普段の速報を汚さない。
     */
    mirrorIntakeLine: String(d.mirrorIntakeLine || ''),
    // ★v0.1.1405: 判定の材料を素通しする(数値/文字列のみ・構造は固定)。
    mirrorIntake: (() => {
      const mi = /** @type {any} */ (d.mirrorIntake);
      if (!mi || typeof mi !== 'object') return null;
      const num = (/** @type {unknown} */ x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
      return {
        changedEvents: num(mi.changedEvents),
        keyMatched: num(mi.keyMatched),
        keyMissed: num(mi.keyMissed),
        accepted: num(mi.accepted),
        rejectedByGate: num(mi.rejectedByGate),
        lastMissedKeys: Array.isArray(mi.lastMissedKeys) ? mi.lastMissedKeys.slice(0, 3).map(String) : [],
        lastExpectedKey: String(mi.lastExpectedKey || ''),
        lastAcceptedAt: num(mi.lastAcceptedAt),
        lastRejectReason: String(mi.lastRejectReason || '')
      };
    })(),
    /*
     * ★v0.1.1348: 会場のアイコン実績(6値だけ)を通す。
     *
     * ■ なぜ必要か: v0.1.1347 で読み手に `venueSeatsDiag.avatarProbe` を読む行を足したが、
     *   ここを通していなかったため【永久に出ない行】だった(書き手の実出力で通し確認せず出荷)。
     *   ★このファイルは「個別列挙して作り直す」方式なので、
     *     載せ忘れた値は静かに消える([[venue-mirror-is-the-primary-path]]・6回目)。
     *
     * ★未知フィールドは通さない既存方針を守り、数値6つだけを検証して写す。
     */
    avatarProbe: (() => {
      const p = d.avatarProbe;
      if (!p || typeof p !== 'object') return null;
      return {
        usericonSucceeded: Math.max(0, Math.floor(num(p.usericonSucceeded, 0))),
        usericonFailed: Math.max(0, Math.floor(num(p.usericonFailed, 0))),
        failedTimeout: Math.max(0, Math.floor(num(p.failedTimeout, 0))),
        failedError: Math.max(0, Math.floor(num(p.failedError, 0))),
        retriedTotal: Math.max(0, Math.floor(num(p.retriedTotal, 0))),
        lastFailAgoMs: Math.max(-1, Math.floor(num(p.lastFailAgoMs, -1)))
      };
    })(),
    capturedAt: now
  };
}
