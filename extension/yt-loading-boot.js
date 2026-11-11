// yt-loading-boot.js — 横の欄の最初の描画。拡張の CSP は inline script を止めるので、このファイルを <head> で読む。
// 対応表の正本は src/lib/platform/platformMetrics.js の PLATFORM_CAPABILITIES。
// ここはモジュールより前に、ニコ生だけのカードを消し、YouTube は「読み込み中」から始める。
(function () {
  try {
    var stream = new URLSearchParams(location.search).get('stream') || '';
    var head = stream.split(':')[0];
    var cap = head === 'yt' ? 'youtube'
      : (head === 'ab' ? 'abema' : head);
    var known = { youtube: 1, twitch: 1, kick: 1, abema: 1, showroom: 1, whowatch: 1, mixch: 1, tiktok: 1, twitcasting: 1 };
    if (!known[cap]) return;
    var root = document.documentElement;
    root.classList.add('nl-cap-foreign');
    root.classList.add('nl-cap-' + cap);
    var style = document.createElement('style');
    style.id = 'nl-platform-capability-style';
    style.textContent = [
      'html.nl-cap-foreign .nl-live-stat-card--visitors{display:none!important;}',
      'html.nl-cap-foreign .nl-official-nico-stats__chip:has(#officialStatNicoViewers),',
      'html.nl-cap-foreign .nl-official-nico-stats__chip:has(#officialStatNicoComments),',
      'html.nl-cap-foreign .nl-official-nico-stats__chip:has(#officialStatNicoAdPts),',
      'html.nl-cap-foreign .nl-official-nico-stats__chip:has(#officialStatNicoGiftPts){display:none!important;}',
      'html.nl-cap-foreign [data-lane="adRanking"],html.nl-cap-foreign [data-lane="programPoints"],',
      'html.nl-cap-foreign [data-lane="eventRank"],html.nl-cap-foreign [data-lane="eventScore"],',
      'html.nl-cap-foreign [data-lane="eventVotingSupporters"],html.nl-cap-foreign #giftRankingFetchPrompt,',
      'html.nl-cap-foreign #watchOfficialEventBannerCard,html.nl-cap-foreign #watchOfficialNdgrCard,',
      'html.nl-cap-foreign #giftHistoryProgramPt,html.nl-cap-foreign #noWatchRankingHint{display:none!important;}',
      'html.nl-cap-youtube #watchConcurrentCard .nl-live-stat-label,html.nl-cap-twitch #watchConcurrentCard .nl-live-stat-label,',
      'html.nl-cap-kick #watchConcurrentCard .nl-live-stat-label,html.nl-cap-abema #watchConcurrentCard .nl-live-stat-label{font-size:0!important;line-height:1.2!important;overflow:visible!important;color:transparent!important;}',
      'html.nl-cap-youtube #watchConcurrentCard .nl-live-stat-label::after{content:"同時視聴者数";font-size:10.5px;font-weight:700;line-height:1.2;color:var(--nl-muted,#8b8494);}',
      'html.nl-cap-twitch #watchConcurrentCard .nl-live-stat-label::after,html.nl-cap-kick #watchConcurrentCard .nl-live-stat-label::after{content:"視聴者数";font-size:10.5px;font-weight:700;line-height:1.2;color:var(--nl-muted,#8b8494);}',
      'html.nl-cap-abema #watchConcurrentCard .nl-live-stat-label::after{content:"視聴数";font-size:10.5px;font-weight:700;line-height:1.2;color:var(--nl-muted,#8b8494);}'
    ].join('');
    root.appendChild(style);
    if (cap !== 'youtube') return;
    root.classList.add('nl-yt-loading');
    var load = document.createElement('style');
    load.textContent = [
      'html.nl-yt-loading #watchConcurrentEst{font-size:0!important;color:transparent!important;line-height:1.25!important;}',
      'html.nl-yt-loading #watchConcurrentEst::after{content:"読み込み中";font-size:13px;font-weight:700;line-height:1.25;color:var(--nl-muted,#8b8494);}',
      'html.nl-yt-loading #watchConcurrentSub{font-size:0!important;color:transparent!important;}'
    ].join('');
    root.appendChild(load);

    function arm() {
      var est = document.getElementById('watchConcurrentEst');
      var sub = document.getElementById('watchConcurrentSub');
      var card = document.getElementById('watchConcurrentCard');
      var label = card && card.querySelector('.nl-live-stat-label');
      if (label && label.textContent !== '同時視聴者数') label.textContent = '同時視聴者数';
      if (!est) return;
      var last = '';
      var lastSub = '';
      function trim(t) { return String(t || '').replace(/^\s+|\s+$/g, ''); }
      function paint() {
        var t = trim(est.textContent);
        if (/^[0-9,]+$/.test(t)) {
          last = t;
          lastSub = sub ? sub.textContent : '';
          root.classList.remove('nl-yt-loading');
          return;
        }
        if (last) {
          if (t !== last) est.textContent = last;
          if (sub && sub.textContent !== lastSub) sub.textContent = lastSub;
          root.classList.remove('nl-yt-loading');
          return;
        }
        if (t !== '読み込み中') est.textContent = '読み込み中';
        if (sub && sub.textContent !== '') sub.textContent = '';
      }
      paint();
      var ob = new MutationObserver(paint);
      ob.observe(est, { childList: true, characterData: true, subtree: true });
      if (sub) ob.observe(sub, { childList: true, characterData: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
    else arm();
  } catch { /* 表示の先回りが失敗しても、数字自体はあとから出る */ }
})();
