// @ts-nocheck
/**
 * スマホ閲覧用 status Web 版。
 *
 *   - URL の ?v=<token> を読み、GET /api/status?v=<token> で概要 jsonBlob を取得。
 *   - 拡張の status ページと同じ整形(statusFormat.js を共用)で描画。
 *   - 60 秒ポーリングで自動更新(document.hidden 時は休む)。
 *
 * 拡張に依存しない純 Web。データは PC 拡張が「スマホへ送信」した時点のスナップショット。
 *
 * @module app
 */

import { buildOverviewText, buildLiveBlockText } from '../src/lib/statusFormat.js';

const POLL_INTERVAL_MS = 60_000;
let _timerId = null;

bootstrap();

function bootstrap() {
  const token = new URLSearchParams(location.search).get('v') || '';
  if (!token) {
    showError('URL に閲覧トークン(?v=...)がありません。PC の拡張から「スマホへ送信」してください。');
    return;
  }
  refresh(token);
  startPolling(token);
}

function startPolling(token) {
  if (_timerId != null) return;
  _timerId = window.setInterval(() => {
    if (document.hidden) return;
    refresh(token).catch(() => {});
  }, POLL_INTERVAL_MS);
}

async function refresh(token) {
  try {
    const res = await fetch(`/api/status?v=${encodeURIComponent(token)}`, {
      cache: 'no-store'
    });
    if (res.status === 404) {
      showError('まだデータがありません。PC の拡張の status ページから「スマホへ送信」してください。');
      return;
    }
    if (!res.ok) {
      showError(`取得に失敗しました (HTTP ${res.status})`);
      return;
    }
    const json = await res.json();
    const data = json?.data;
    if (!data || typeof data !== 'object') {
      showError('データの形式が不正です。');
      return;
    }
    render(data);
  } catch (err) {
    showError('通信エラー: ' + String(err?.message || err));
  }
}

function render(jsonBlob) {
  const lives = Array.isArray(jsonBlob.lives) ? jsonBlob.lives : [];

  // 概要
  const overviewEl = document.getElementById('overviewBody');
  if (overviewEl) {
    const overviewText = buildOverviewText(lives);
    if (overviewText) {
      overviewEl.textContent = overviewText;
      overviewEl.classList.remove('empty-note');
    } else {
      overviewEl.textContent = '視聴中の配信はありません。';
      overviewEl.classList.add('empty-note');
    }
  }

  // 配信ごと
  const livesEl = document.getElementById('livesBody');
  if (livesEl) {
    if (!lives.length) {
      livesEl.className = 'empty-note';
      livesEl.textContent = '視聴中の配信が見つかりませんでした。';
    } else {
      livesEl.className = '';
      livesEl.innerHTML = '';
      for (const live of lives) {
        const pre = document.createElement('pre');
        pre.textContent = buildLiveBlockText(live);
        const wrap = document.createElement('div');
        wrap.className = 'live-block';
        wrap.appendChild(pre);
        livesEl.appendChild(wrap);
      }
    }
  }

  // 最終更新(送信時刻 generatedAt)
  const metaEl = document.getElementById('metaLastUpdate');
  if (metaEl) {
    const gen = jsonBlob.generatedAt ? new Date(jsonBlob.generatedAt) : null;
    if (gen && !Number.isNaN(gen.getTime())) {
      const hh = String(gen.getHours()).padStart(2, '0');
      const mm = String(gen.getMinutes()).padStart(2, '0');
      metaEl.textContent = `送信時刻 ${hh}:${mm}`;
    } else {
      metaEl.textContent = '送信時刻 —';
    }
  }
}

function showError(msg) {
  const overviewEl = document.getElementById('overviewBody');
  if (overviewEl) {
    overviewEl.textContent = msg;
    overviewEl.classList.add('empty-note');
  }
  const livesEl = document.getElementById('livesBody');
  if (livesEl) {
    livesEl.className = 'empty-note';
    livesEl.textContent = '';
  }
}
