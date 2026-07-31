// @ts-nocheck — DOM 専用; 会場側のホバーカードは venueBar.js からの緩い注入で使う
/**
 * venueHoverCard.js — 会場アイコンのホバープレビューカード(純ロジック+DOMビルダー)。
 *
 * 背景(wayfinder→to-spec方式・venue-avatar-hover-preview-DESIGN系・2026-07-30):
 *   会場モードの参加者タイルは既にブラウザ標準の title 属性でツールチップ(表示名+UID)を
 *   出しているが(personTileDom.js)、情報量が1行の固定文字列に限られ、サムネイルが
 *   実物か・identicon代替か・読み込み失敗(白丸)かを目視で確認する手段が無かった。
 *
 *   本モジュールは buildPersonTileEl(3箇所=popup応援レーン/会場席/会場トップバーで共有される
 *   「1バイトも変えない」退化ガード対象)には一切手を入れず、venueBar.js側だけでホバー時に
 *   別要素(シングルトンカード)を被せる設計(「タイル本体は共通・演出は呼び出し側が被せる」
 *   という既存の設計思想[personTileDom.js]に従う)。
 *
 *   サムネ状態は事前スコア(profileTier/thumbScore)を使わず、ホバー時点の実DOM(img.complete/
 *   naturalWidth)を観測して判定する。理由: 鏡供給モードのアイテム(LaneMirrorCell)は
 *   displaySrc/title/idLine/nameLine/userIdの5フィールドのみでprofileTier/thumbScoreを
 *   持たないため、事前スコアに頼るとモード(mirror/fallback)間でカードの中身が変わる
 *   =新しいdriftの温床になる。実DOMは常にモード非依存で取得できる「唯一の真実」。
 *
 * @module venueHoverCard
 */

import { isNumericNicoUserId } from '../domain/user/identity.js';

/**
 * @typedef {{ src: string, kind: 'real-http'|'identicon'|'tv-fallback'|'none',
 *             load: 'ok'|'loading'|'failed' }} VenueTileThumbState
 */

/**
 * タイル実DOM(.nl-story-userlane-cell)からサムネ状態を読む(観測のみ・1ノードも変更しない)。
 * @param {HTMLElement|null|undefined} cellEl
 * @returns {VenueTileThumbState}
 */
export function readVenueTileThumbState(cellEl) {
  const img =
    cellEl && typeof cellEl.querySelector === 'function'
      ? cellEl.querySelector('.nl-story-userlane-avatar')
      : null;
  if (!img) return { src: '', kind: 'none', load: 'loading' };

  const src = String(img.src || '');
  let kind = /** @type {VenueTileThumbState['kind']} */ ('none');
  if (img.classList && img.classList.contains('nl-avatar--tv-fallback')) {
    kind = 'tv-fallback';
  } else if (src.startsWith('data:image/svg+xml')) {
    kind = 'identicon';
  } else if (/^https?:/i.test(src)) {
    kind = 'real-http';
  }

  let load = /** @type {VenueTileThumbState['load']} */ ('ok');
  if (!img.complete) {
    load = 'loading';
  } else if (Number(img.naturalWidth) === 0) {
    load = 'failed';
  }

  return { src, kind, load };
}

/**
 * @typedef {{
 *   displayName: string,
 *   idLine: string,
 *   idKind: 'registered'|'anonymous'|'none',
 *   avatarSrc: string,
 *   statLine: string,
 *   lastText: string,
 *   thumbStatusLabel: string,
 *   thumbKind: VenueTileThumbState['kind'],
 *   thumbLoad: VenueTileThumbState['load']
 * }} VenueHoverCardModel
 */

/**
 * 2026-07-30(council-fable設計・venue-hover-card-content-DESIGN.md MVP-2): 「最後に
 * コメントした時刻」を相対時刻の粗い粒度で返す純関数。参加者データに既在のlastAt(epoch ms)
 * から算出し、新規API取得は行わない。nowMsは呼び出し側(openHoverCardFor)が注入する
 * (純関数内でDate.now()を呼ばない・地雷G-1)。
 *
 * @param {unknown} lastAt 最終発言時刻(epoch ms)
 * @param {unknown} nowMs カードを開いた瞬間のDate.now()
 * @returns {string} 空文字=出さない(データ不足・クロック異常時のfail-closed)
 */
export function formatVenueHoverRelativeTime(lastAt, nowMs) {
  const a = Number(lastAt);
  const n = Number(nowMs);
  if (!Number.isFinite(a) || a <= 0 || !Number.isFinite(n) || n <= 0) return '';
  const d = n - a;
  if (d < 60_000) return 'たった今'; // 負値(時計ズレ)もここに丸める。
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}分前`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}時間前`;
  if (d < 30 * 86_400_000) return `${Math.floor(d / 86_400_000)}日前`;
  // 30日超は単位/クロック異常とみなし出さない(v1044「56年前」事故の再発防止・fail-closed)。
  return '';
}

/** @param {VenueTileThumbState['kind']} kind @param {VenueTileThumbState['load']} load @returns {string} */
function resolveThumbStatusLabel(kind, load) {
  if (load === 'loading') return '読み込み中';
  if (load === 'failed') return '読み込み失敗(白丸)';
  if (kind === 'identicon') return '代替顔(identicon)';
  if (kind === 'tv-fallback') return '公式デフォルト';
  if (kind === 'real-http') return '実サムネ';
  return '不明';
}

/**
 * ホバーカードに出す直前発言の最大文字数。これを超えたら末尾を「…」で畳む。
 * カードは会場の上に重なるので、長文コメントで縦に伸びると席を覆ってしまう。
 */
export const HOVER_LAST_TEXT_MAX = 60;

/**
 * カード表示モデルを組み立てる純関数。ホバー時点で手元にあるデータのみ(新規取得ゼロ)。
 * @param {{
 *   uid?: unknown, displayName?: unknown, count?: unknown, hasGift?: unknown,
 *   giftCount?: unknown, venueRank?: unknown, thumb?: Partial<VenueTileThumbState>,
 *   lastAt?: unknown, nowMs?: unknown, diagMode?: unknown, tier?: unknown,
 *   lastText?: unknown
 * }} input
 * @returns {VenueHoverCardModel}
 */
export function buildVenueHoverCardModel(input) {
  const i = input && typeof input === 'object' ? input : {};
  const uid = String(i.uid || '').trim();
  const displayName = String(i.displayName || '').trim();
  const count = Math.max(0, Math.floor(Number(i.count) || 0));
  const hasGift = i.hasGift === true;
  const giftCount = Math.max(0, Math.floor(Number(i.giftCount) || 0));
  const venueRank = Math.max(0, Math.floor(Number(i.venueRank) || 0));
  const thumb = i.thumb && typeof i.thumb === 'object' ? i.thumb : {};
  const thumbSrc = String(thumb.src || '');
  const thumbKind = /** @type {VenueTileThumbState['kind']} */ (thumb.kind || 'none');
  const thumbLoad = /** @type {VenueTileThumbState['load']} */ (thumb.load || 'loading');
  // 2026-07-30(council-fable設計・venue-hover-card-content-DESIGN.md MVP-1): 診断情報
  // (サムネ状態ラベル)は🩺状態パネル開時のみ表示する(diagMode===trueのときだけ)。
  // thumbKind/thumbLoadはdiagModeに関わらず常に返す(dataset刻印=機械層はモード非依存)。
  const diagMode = i.diagMode === true;

  // ID種別判定はisNumericNicoUserId一択(唯一の判定基準・新しい判定ロジックを作らない)。
  let idKind = /** @type {VenueHoverCardModel['idKind']} */ ('none');
  let idLine = '';
  if (uid) {
    if (isNumericNicoUserId(uid)) {
      idKind = 'registered';
      idLine = `ID:${uid}(本登録)`;
    } else {
      idKind = 'anonymous';
      idLine = `匿名(${uid})`;
    }
  }

  // 失敗した実サムネURLはカードへ再セットしない(既存のnegative-cache/バックオフを迂回する
  // 野良再プローブを作らない・venueAvatarLoadGuardの流儀を尊重)。identicon/tv-fallbackは
  // ローカル生成物であり再取得ではないため、load状態に関わらずそのまま出す。
  const avatarSrc =
    thumbKind === 'real-http' && thumbLoad !== 'ok' ? '' : thumbSrc;

  // 2026-07-30(MVP-2): lastAt/nowMsが両方有効なら「発言N(3分前)」のように括弧で埋め込む。
  // 専用行・専用DOM・タイマー更新は追加しない(カード寿命は数秒なのでtick更新は不要)。
  const relTime = formatVenueHoverRelativeTime(i.lastAt, i.nowMs);
  const statParts = [];
  // 2026-07-31(ユーザー指摘): 広告段・ギフト段の人は「発言」していない。その段に載る条件は
  //   投擲(広告/ギフト)であって発言ではないため、「発言N」と出すのは意味が合わない。
  //   lastAt の実体は capturedAt(その行を記録した時刻・venueSeats.js:138)なので、
  //   投擲で載った人にとっては実質「最後に投げたタイミング」を指す。ラベルだけを段に
  //   合わせて出し分ける(データも集計も変えない)。
  //   ★count は preCount の最低1仕様(venueLaneMirrorSupply.js:100)で、発言0でも1になる。
  //     投擲段では件数を出すとその1が「発言1」の嘘になるので、件数ごと出さず時刻だけ出す。
  const tier = String(i.tier || '').trim();
  if (tier === 'ad') {
    statParts.push(relTime ? `広告(${relTime})` : '広告');
  } else if (tier === 'gift') {
    statParts.push(relTime ? `ギフト(${relTime})` : 'ギフト');
  } else {
    statParts.push(relTime ? `発言 ${count}(${relTime})` : `発言 ${count}`);
  }
  if (hasGift) statParts.push(`🎁${giftCount}`);
  if (venueRank === 1) statParts.push('🥇1位');
  else if (venueRank === 2) statParts.push('🥈2位');
  else if (venueRank === 3) statParts.push('🥉3位');

  // 2026-07-31(ユーザー要望): 「この人が直前に何を言ったか」をカードで読めるようにする。
  //   participant.lastText(既存データ・新規取得ゼロ)をそのまま出す。長文はカードが伸びて
  //   会場を覆うので上限で切る(切ったことが分かるよう省略記号を付ける)。
  //   投擲段(広告/ギフト)は発言由来ではないので出さない=「発言していないのに本文が出る」嘘を作らない。
  const isThrowTier = tier === 'ad' || tier === 'gift';
  const rawLastText = String(i.lastText || '').replace(/\s+/g, ' ').trim();
  const lastText =
    isThrowTier || !rawLastText
      ? ''
      : rawLastText.length > HOVER_LAST_TEXT_MAX
        ? `${rawLastText.slice(0, HOVER_LAST_TEXT_MAX)}…`
        : rawLastText;

  return {
    displayName,
    idLine,
    idKind,
    avatarSrc,
    statLine: statParts.join(' ・ '),
    lastText,
    thumbStatusLabel: diagMode ? resolveThumbStatusLabel(thumbKind, thumbLoad) : '',
    thumbKind,
    thumbLoad
  };
}

/**
 * シングルトンカード要素を生成する(会場stage初期化時に1回だけ呼ぶ)。
 * @param {Document} doc
 * @returns {HTMLElement}
 */
export function createVenueHoverCardEl(doc) {
  const card = doc.createElement('div');
  card.className = 'nlsb-hover-card';
  card.setAttribute('aria-hidden', 'true');

  const avatarBox = doc.createElement('div');
  avatarBox.className = 'nlsb-hover-card__avatar-box';
  const avatarImg = doc.createElement('img');
  avatarImg.className = 'nlsb-hover-card__avatar';
  avatarImg.alt = '';
  avatarImg.decoding = 'async';
  avatarImg.addEventListener('error', () => {
    avatarImg.hidden = true;
  });
  avatarBox.appendChild(avatarImg);

  const body = doc.createElement('div');
  body.className = 'nlsb-hover-card__body';
  const nameEl = doc.createElement('div');
  nameEl.className = 'nlsb-hover-card__name';
  const idEl = doc.createElement('div');
  idEl.className = 'nlsb-hover-card__id';
  const statsEl = doc.createElement('div');
  statsEl.className = 'nlsb-hover-card__stats';
  const thumbStatusEl = doc.createElement('div');
  thumbStatusEl.className = 'nlsb-hover-card__thumb-status';
  // 2026-07-31(ユーザー要望): 直前の発言内容。「この人が何を言ったか」が分からないと
  //   名前と件数だけでは誰なのか思い出せない、という指摘への回答。
  const lastTextEl = doc.createElement('div');
  lastTextEl.className = 'nlsb-hover-card__last-text';
  // 2026-07-30(council-fable設計・venue-hover-card-content-DESIGN.md 必答1): 「名前→活動→
  // (補足として)ID」の情報序列を構造でも表現する。IDは文言そのまま・体裁だけ格下げ(CSS側で
  // font-size縮小)。ロジック変更ゼロ・isNumericNicoUserId判定基準は不変。
  //   発言本文は「活動」の直後=名前の次に読みたい情報なので stats の後ろに置く。
  body.append(nameEl, statsEl, lastTextEl, idEl, thumbStatusEl);

  card.append(avatarBox, body);
  return card;
}

/**
 * モデルをカードへ反映する(ノードは再生成せず、既存ノードの中身だけ差し替える)。
 * @param {HTMLElement} cardEl createVenueHoverCardElで作った要素
 * @param {VenueHoverCardModel} model
 */
export function renderVenueHoverCard(cardEl, model) {
  if (!cardEl || typeof cardEl.querySelector !== 'function') return;
  const m = model && typeof model === 'object' ? model : {};

  const avatarImg = cardEl.querySelector('.nlsb-hover-card__avatar');
  if (avatarImg) {
    const src = String(m.avatarSrc || '');
    avatarImg.hidden = !src;
    if (src) avatarImg.src = src;
  }

  const nameEl = cardEl.querySelector('.nlsb-hover-card__name');
  if (nameEl) nameEl.textContent = String(m.displayName || '');

  const idEl = cardEl.querySelector('.nlsb-hover-card__id');
  if (idEl) idEl.textContent = String(m.idLine || '');

  const statsEl = cardEl.querySelector('.nlsb-hover-card__stats');
  if (statsEl) statsEl.textContent = String(m.statLine || '');

  // 2026-07-31: 直前の発言内容。無い(未発言/投擲段/データ未到達)ときは行ごと消して隙間を作らない。
  const lastTextEl = cardEl.querySelector('.nlsb-hover-card__last-text');
  if (lastTextEl) {
    const text = String(m.lastText || '');
    lastTextEl.textContent = text ? `「${text}」` : '';
    lastTextEl.hidden = !text;
  }

  const thumbStatusEl = cardEl.querySelector('.nlsb-hover-card__thumb-status');
  if (thumbStatusEl) {
    const label = String(m.thumbStatusLabel || '');
    thumbStatusEl.textContent = label;
    // 2026-07-30(MVP-1): 診断行は空(diagMode:false)のとき隙間を残さずhiddenにする。
    thumbStatusEl.hidden = !label;
  }

  // 将来の census/実機確認用フック(data属性)。挙動には使わない(印字専用)。
  cardEl.dataset.thumbKind = String(m.thumbKind || '');
  cardEl.dataset.thumbLoad = String(m.thumbLoad || '');
}

/** カード位置計算のデフォルト値。 */
const VENUE_HOVER_CARD_MARGIN = 8;
const VENUE_HOVER_CARD_GAP = 6;

/**
 * カードの表示位置を計算する純関数。上配置優先・入らなければ下へフリップ・左右クランプ。
 * @param {{
 *   anchor?: { left?: number, top?: number, width?: number, height?: number },
 *   card?: { width?: number, height?: number },
 *   viewport?: { width?: number, height?: number },
 *   margin?: number, gap?: number
 * }} a
 * @returns {{ left: number, top: number, placement: 'above'|'below' }}
 */
export function resolveVenueHoverCardPlacement(a) {
  const input = a && typeof a === 'object' ? a : {};
  const anchor = input.anchor && typeof input.anchor === 'object' ? input.anchor : {};
  const card = input.card && typeof input.card === 'object' ? input.card : {};
  const viewport = input.viewport && typeof input.viewport === 'object' ? input.viewport : {};

  const anchorLeft = Number.isFinite(Number(anchor.left)) ? Number(anchor.left) : 0;
  const anchorTop = Number.isFinite(Number(anchor.top)) ? Number(anchor.top) : 0;
  const anchorWidth = Number.isFinite(Number(anchor.width)) ? Number(anchor.width) : 0;
  const anchorHeight = Number.isFinite(Number(anchor.height)) ? Number(anchor.height) : 0;
  const cardWidth = Number.isFinite(Number(card.width)) ? Number(card.width) : 0;
  const cardHeight = Number.isFinite(Number(card.height)) ? Number(card.height) : 0;
  const viewportWidth = Number.isFinite(Number(viewport.width)) && Number(viewport.width) > 0 ? Number(viewport.width) : 1280;
  const viewportHeight = Number.isFinite(Number(viewport.height)) && Number(viewport.height) > 0 ? Number(viewport.height) : 800;
  const margin = Number.isFinite(Number(input.margin)) ? Number(input.margin) : VENUE_HOVER_CARD_MARGIN;
  const gap = Number.isFinite(Number(input.gap)) ? Number(input.gap) : VENUE_HOVER_CARD_GAP;

  const anchorCenterX = anchorLeft + anchorWidth / 2;
  let left = anchorCenterX - cardWidth / 2;
  left = Math.max(margin, Math.min(left, viewportWidth - cardWidth - margin));

  const spaceAbove = anchorTop - gap;
  const fitsAbove = spaceAbove >= cardHeight + margin;

  let top;
  let placement;
  if (fitsAbove) {
    placement = 'above';
    top = anchorTop - gap - cardHeight;
  } else {
    placement = 'below';
    top = anchorTop + anchorHeight + gap;
  }
  top = Math.max(margin, Math.min(top, viewportHeight - cardHeight - margin));

  return { left, top, placement };
}
