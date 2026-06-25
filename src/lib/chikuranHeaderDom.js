/**
 * 「ちくらん風」配信者カードのヘッダー DOM ビルダー。
 *
 * status-entry.js#buildChikuranHeaderEl の DOM 生成部分を、status / 純Web 両方から再利用できる
 * 純DOMビルダーとして切り出したもの(似せて自作しない・popup/status と必ず一致)。
 * 入力は buildChikuranCardModel(live)(src/lib/chikuranCard.js)の戻り=ChikuranCardModel。
 *
 * chrome 非依存。document(happy-dom/ブラウザ)があれば動く純 DOM 生成。サムネは外部 CDN なので
 * referrerPolicy=no-referrer を付与(hotlink 保護回避・personTile と同方針)。
 *
 * @module chikuranHeaderDom
 */

/**
 * 配信者カードのヘッダー DOM(サムネ + 配信者名 + タイトル + メトリクス行)を作って返す。
 *
 * 元の buildChikuranHeaderEl と完全同一の構造・スタイル:
 *   - サムネ有り → 16:9 枠に img(no-referrer/lazy・壊れたら remove) / 無し → 🎥 プレースホルダ
 *   - 配信者名(ended は ⏹ プレフィクス・空は「(配信者名 不明)」)
 *   - タイトル(あれば)
 *   - メトリクス(経過/来場/コメント/ギフト・取れた値だけ千区切り)
 *
 * @param {import('./chikuranCard.js').ChikuranCardModel|null} m ChikuranCardModel(buildChikuranCardModel の戻り)
 * @returns {HTMLElement} head 要素(呼び出し側が好きな親へ append)
 */
export function buildChikuranHeaderDom(m) {
  const head = document.createElement('div');
  if (!m) return head;
  head.style.cssText = 'display:flex;gap:10px;align-items:flex-start;margin-bottom:8px;';

  // サムネ(無ければプレースホルダの枠)。比率 16:9 で小さく。
  const thumbWrap = document.createElement('div');
  thumbWrap.style.cssText =
    'flex:0 0 auto;width:96px;height:54px;border-radius:6px;overflow:hidden;' +
    'background:var(--nl-border);display:flex;align-items:center;justify-content:center;';
  if (m.thumbnailUrl) {
    const img = document.createElement('img');
    img.src = m.thumbnailUrl;
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    // 壊れた画像は枠だけにして残さない(失敗体験の除去)。
    img.addEventListener('error', () => { try { img.remove(); } catch { /* no-op */ } });
    thumbWrap.appendChild(img);
  } else {
    const ph = document.createElement('span');
    ph.textContent = '🎥';
    ph.style.cssText = 'font-size:20px;opacity:0.6;';
    thumbWrap.appendChild(ph);
  }
  head.appendChild(thumbWrap);

  // 右側: 配信者名 + タイトル + メトリクス行。
  const right = document.createElement('div');
  right.style.cssText = 'flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px;';

  const nameRow = document.createElement('div');
  nameRow.textContent = (m.ended ? '⏹ ' : '') + (m.broadcasterName || '(配信者名 不明)');
  nameRow.style.cssText = 'font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  right.appendChild(nameRow);

  if (m.title) {
    const titleRow = document.createElement('div');
    titleRow.textContent = m.title;
    titleRow.style.cssText =
      'font-size:12px;color:var(--nl-text-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    right.appendChild(titleRow);
  }

  // メトリクス: 経過 / 来場 / コメント / ギフト(取れた値だけ)。
  const metrics = [];
  if (m.elapsedText) metrics.push(`⏱ ${m.elapsedText}`);
  if (m.watchCount != null) metrics.push(`👤 ${m.watchCount.toLocaleString('ja-JP')}`);
  if (m.commentCount != null) metrics.push(`💬 ${m.commentCount.toLocaleString('ja-JP')}`);
  if (m.giftPoints != null && m.giftPoints > 0) metrics.push(`🎁 ${m.giftPoints.toLocaleString('ja-JP')}`);
  if (metrics.length) {
    const metaRow = document.createElement('div');
    metaRow.textContent = metrics.join('  ');
    metaRow.style.cssText = 'font-size:12px;color:var(--nl-text);margin-top:2px;';
    right.appendChild(metaRow);
  }

  head.appendChild(right);
  return head;
}
