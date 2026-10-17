/**
 * 会場モードの「ピックアップ枠」(BSP風・v0.1.1230)。
 *
 * 【なぜ会場に出すか】
 * v0.1.1226〜1228 でピックアップ選定は動くようになった(実測 scored>0)。しかし出し先が
 * ①POP の `nl-comment-ticker`(「応援 N コメント」の右)で、**会場モードを見ている間は
 * スクロールの外にあって目に入らない**。ユーザー報告「見ため変わってないかも」の正体。
 * 「埋もれるコメントを拾う」のが目的なのに、拾った先がまた埋もれていた。
 *
 * 参照した実物: ニコ生のBSP(バックステージパス)の特別コメント枠
 *   = 画面下に色付きの帯で、流れずに「留まる」1枠。
 *
 * 【設計】
 * - 会場ヘッダーの直下に**常設の1枠**を置く。DOM は一度作ったら remove しない
 *   (churn 地雷対策の流儀に倣う)。中身の差し替えだけで進行する。
 * - **高さを先に確保**する(min-height)。出たり消えたりで下の段が動かない。
 * - 空のときも枠は残し、案内文を出す(死に画面にしない)。
 *
 * @module venuePickupBanner
 */

/** 枠のCSSクラス(スタイルは venueBar 側の CSS 文字列に置く)。 */
export const VENUE_PICKUP_CLASS = 'nlsb-pickup';

/**
 * ピックアップ枠のDOMを作る(1回だけ呼ぶ)。
 *
 * @param {Document} doc
 * @returns {{ root: HTMLElement, body: HTMLElement, meta: HTMLElement, face: HTMLElement, main: HTMLElement }}
 */
export function createVenuePickupBanner(doc) {
  const root = doc.createElement('div');
  root.className = VENUE_PICKUP_CLASS;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-label', 'ピックアップされた応援コメント');

  const badge = doc.createElement('span');
  badge.className = 'nlsb-pickup__badge';
  badge.textContent = 'PICK UP';

  // 発言者のサムネ(2026-10-17・§3.5 サムネ+ハンドル名+ID+リンクをセットで出す)。無いときは隠す(空の枠を作らない)。
  const face = doc.createElement('img');
  face.className = 'nlsb-pickup__face';
  face.setAttribute('alt', '');
  face.setAttribute('hidden', '');

  // 本文の下に『ハンドル名 ・ ID:数値』の小さな行。数値IDはユーザーページへのリンク(a)、匿名はリンクなし。
  const main = doc.createElement('span');
  main.className = 'nlsb-pickup__main';
  const body = doc.createElement('span');
  body.className = 'nlsb-pickup__body';
  const meta = doc.createElement('a');
  meta.className = 'nlsb-pickup__meta';
  main.append(body, meta);

  root.append(badge, face, main);
  return { root, body, meta, face, main };
}

/**
 * 表示用の内容を組み立てる純関数(DOMに触れない=テストしやすい)。
 *
 * @param {{ entry?: any, why?: string }|null|undefined} picked pickTickerHighlightEntry の戻り
 * @param {{ maxChars?: number }} [opts]
 * @returns {{ text: string, meta: string, empty: boolean, speaker: any }}
 */
export function buildVenuePickupView(picked, opts = {}) {
  const maxChars = Math.max(8, Math.floor(Number(opts.maxChars) || 60));
  const p = picked && typeof picked === 'object' ? picked : null;
  const e = p?.entry && typeof p.entry === 'object' ? /** @type {any} */ (p.entry) : null;
  const raw = String(e?.text ?? '').replace(/\s+/g, ' ').trim();
  const isGift = String(p?.why || '') === 'gift';
  const giftName = String(e?.name ?? e?.nickname ?? '').trim();
  /** 発言者の情報セット(venuePickupSpeaker.js)。無い行(旧入力)は従来の表示。 */
  const speaker = e?.speaker && typeof e.speaker === 'object' ? e.speaker : null;
  if (!raw) {
    // ★ギフト行は本文が空のことがある(会場の行は text:'' で kind:'gift')。
    //   選ばれているのに案内文が出ると「動いていない」ように見えるので、
    //   ギフトはギフトとして必ず言葉にする(実データで踏んだ穴)。
    if (isGift) {
      return {
        text: giftName ? `${giftName} さんがギフトを贈りました` : 'ギフトが届きました',
        meta: '🎁 ギフト',
        empty: false,
        speaker
      };
    }
    return {
      text: 'コメントが流れると、ここに1件ずつ大きく出るよ',
      meta: '',
      empty: true,
      speaker: null
    };
  }
  const chars = Array.from(raw);
  const text = chars.length > maxChars ? `${chars.slice(0, maxChars).join('')}…` : raw;
  // 誰の発言かを添える(匿名は名前を出さない=無い名前を捏造しない)。
  const speakerMeta = speaker ? [String(speaker.name || ''), String(speaker.idLine || '')].filter(Boolean).join(' ・ ') : '';
  const meta = isGift ? '🎁 ギフト' : (speakerMeta || giftName || '');
  return { text, meta, empty: false, speaker };
}

/**
 * 枠の中身を更新する。同じ内容なら DOM を書き換えない(diff-skip)。
 *
 * ★「消す側」も同じ経路を通す(消す/空にする側に計器も diff-skip も無いのが
 *   ちらつき7版の真犯人だった、という既存の教訓に倣う)。
 *
 * @param {{ root: HTMLElement, body: HTMLElement, meta: HTMLElement, face?: HTMLElement|any }|null|undefined} els
 * @param {{ text: string, meta: string, empty: boolean, speaker?: any }} view
 * @returns {boolean} DOM を書き換えたら true
 */
export function applyVenuePickupView(els, view) {
  if (!els || !els.root || !els.body) return false;
  const sp = view?.speaker && typeof view.speaker === 'object' ? view.speaker : null;
  const key = `${view?.empty ? 'e' : 'f'}|${view?.text || ''}|${view?.meta || ''}|${sp ? `${sp.avatar || ''}|${sp.href || ''}` : ''}`;
  if (els.root.dataset.nlPickupKey === key) return false;
  els.root.dataset.nlPickupKey = key;
  els.body.textContent = String(view?.text || '');
  if (els.meta) {
    els.meta.textContent = String(view?.meta || '');
    // 数値IDだけユーザーページへのリンク(匿名・ギフトは href なし=リンクにしない)。
    if (sp && sp.href) {
      els.meta.setAttribute('href', String(sp.href));
      els.meta.setAttribute('target', '_blank');
      els.meta.setAttribute('rel', 'noopener noreferrer');
    } else {
      els.meta.removeAttribute('href');
      els.meta.removeAttribute('target');
      els.meta.removeAttribute('rel');
    }
  }
  if (els.face) {
    // サムネ: 発言者がいれば出す。画像が壊れていたら代替顔(identicon)へ1回だけ差し替える(白丸・壊れ画像を出さない)。
    if (sp && sp.avatar) {
      els.face.removeAttribute('hidden');
      els.face.onerror = () => {
        els.face.onerror = null;
        if (sp.fallbackAvatar && sp.fallbackAvatar !== sp.avatar) els.face.setAttribute('src', String(sp.fallbackAvatar));
        else els.face.setAttribute('hidden', '');
      };
      els.face.setAttribute('src', String(sp.avatar));
    } else {
      els.face.setAttribute('hidden', '');
      els.face.removeAttribute('src');
    }
  }
  if (view?.empty) els.root.setAttribute('data-empty', '1');
  else els.root.removeAttribute('data-empty');
  return true;
}
