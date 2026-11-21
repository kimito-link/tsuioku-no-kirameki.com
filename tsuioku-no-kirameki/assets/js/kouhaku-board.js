/*
 * 紅白の順位を、当サイトの /api/kouhaku-ranking だけから描く。
 * ニコニコのページは取りに行かない。アイコンは返ってきた公開URLをブラウザが見る。
 */
/* global document, location, fetch */
(function () {
  'use strict';
  var BLANK_ICON = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg';
  var root = document.getElementById('kouhaku-root');
  if (!root) return;
  var match = location.pathname.match(/\/live\/kouhaku\/u\/(\d{1,16})\/?$/);
  var userId = match ? match[1] : '';
  var endpoint = userId
    ? '/api/kouhaku-ranking?user=' + encodeURIComponent(userId)
    : '/api/kouhaku-ranking';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function localPath(value) {
    var path = String(value || '');
    return /^\/live\/kouhaku\/u\/\d{1,16}\/$/.test(path) ? path : '';
  }

  function httpsOnly(value) {
    var url = String(value || '');
    var scheme = url.split(':')[0];
    if (scheme !== 'https') return '';
    return url;
  }

  function iconSrc(value) {
    var url = httpsOnly(value);
    if (url.indexOf('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/') !== 0) return BLANK_ICON;
    return url;
  }

  function iconImage(entry, size) {
    var img = el('img', size > 40 ? 'ava ava--lg' : 'ava');
    img.src = iconSrc(entry.iconUrl);
    img.alt = entry.displayName || '';
    img.width = size;
    img.height = size;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', function () {
      if (img.getAttribute('data-fallback') === '1') return;
      img.setAttribute('data-fallback', '1');
      img.src = BLANK_ICON;
    });
    return img;
  }

  function fillMeta(label) {
    var meta = document.getElementById('official-meta');
    if (!meta) return;
    meta.textContent = '';
    var faceSrc = meta.getAttribute('data-face') || '';
    if (faceSrc) {
      var face = el('img', 'face');
      face.src = faceSrc;
      face.alt = '';
      meta.appendChild(face);
    }
    var text = el('span');
    text.appendChild(document.createTextNode('最終の公式更新 '));
    text.appendChild(el('b', '', label || '—'));
    text.appendChild(document.createTextNode('。公式は1日1回更新です。'));
    meta.appendChild(text);
  }

  function renderBoard(data) {
    fillMeta(data.officialUpdateLabel);
    root.textContent = '';
    var teams = el('div', 'teams');
    [['aka', '紅組', data.aka], ['shiro', '白組', data.shiro]].forEach(function (part) {
      var section = el('section', 'team team--' + part[0]);
      section.appendChild(el('h2', '', part[1]));
      (part[2] || []).forEach(function (entry) {
        var href = localPath(entry.pagePath);
        var row = el('div', 'row');
        row.appendChild(el('div', 'rank', String(entry.rank)));
        var who = href ? el('a', 'who') : el('div', 'who');
        if (href) who.href = href;
        who.appendChild(iconImage(entry, 28));
        var body = el('span', 'who-text');
        body.appendChild(el('span', 'name', entry.displayName));
        body.appendChild(el('span', 'score', entry.scoreLabel));
        who.appendChild(body);
        row.appendChild(who);
        row.appendChild(el('p', 'sub', entry.gapLabel));
        row.appendChild(el('p', 'sub', entry.deltaLabel));
        var shareUrl = httpsOnly(entry.shareUrl);
        if (shareUrl.indexOf('https://x.com/intent/post?') === 0) {
          var cheer = el('a', 'cheer', '応援');
          cheer.href = shareUrl;
          cheer.target = '_blank';
          cheer.rel = 'noopener noreferrer';
          row.appendChild(cheer);
        }
        section.appendChild(row);
      });
      teams.appendChild(section);
    });
    root.appendChild(teams);
  }

  function renderProfile(data) {
    var entry = data.entry || {};
    fillMeta(data.officialUpdateLabel);
    if (entry.displayName) document.title = entry.displayName + ' ' + entry.teamLabel + ' ' + entry.rank + '位 ― 紅白歌枠合戦2026';
    root.textContent = '';
    var hero = el('article', 'hero hero--' + (entry.team === 'shiro' ? 'shiro' : 'aka'));
    hero.appendChild(iconImage(entry, 72));
    hero.appendChild(el('p', 'team-name', entry.teamLabel || ''));
    hero.appendChild(el('p', 'big', entry.rank ? String(entry.rank) + '位' : '—'));
    hero.appendChild(el('h2', '', entry.displayName || ''));
    hero.appendChild(el('p', '', entry.scoreLabel ? '公式 ' + entry.scoreLabel : ''));
    hero.appendChild(el('p', '', entry.gapLabel || ''));
    hero.appendChild(el('p', '', entry.deltaLabel || ''));
    var actions = el('div', 'actions');
    var share = data.share || {};
    var xUrl = httpsOnly(share.xUrl);
    var lineUrl = httpsOnly(share.lineUrl);
    if (xUrl.indexOf('https://x.com/intent/post?') === 0) {
      var x = el('a', 'btn btn--primary', 'Xで応援を伝える');
      x.href = xUrl;
      x.target = '_blank';
      x.rel = 'noopener noreferrer';
      actions.appendChild(x);
    }
    if (lineUrl.indexOf('https://social-plugins.line.me/lineit/share?') === 0) {
      var line = el('a', 'btn', 'LINEで応援を伝える');
      line.href = lineUrl;
      line.target = '_blank';
      line.rel = 'noopener noreferrer';
      actions.appendChild(line);
    }
    var official = httpsOnly(data.officialUserUrl);
    if (/^https:\/\/www\.nicovideo\.jp\/user\/\d{1,16}$/.test(official)) {
      var user = el('a', 'btn btn--block', 'ニコニコのユーザーページ');
      user.href = official;
      user.target = '_blank';
      user.rel = 'noopener noreferrer';
      actions.appendChild(user);
    }
    hero.appendChild(actions);
    root.appendChild(hero);
  }

  fetch(endpoint, { cache: 'no-store' })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (!data || data.ok === false) throw new Error('unavailable');
      if (userId) {
        if (!data.found || !data.entry) {
          root.textContent = '';
          root.appendChild(el('p', 'empty', 'この順位表には、いまその人は載っていません。'));
          return;
        }
        renderProfile(data);
        return;
      }
      renderBoard(data);
    })
    .catch(function () {
      root.textContent = '';
      root.appendChild(el('p', 'empty', 'いまは順位を表示できません。しばらくしてから、もう一度開いてください。'));
    });
})();
