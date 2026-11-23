/**
 * /live/ に埋め込んだ紅白は、デスクトップでも携帯幅でも紅組と白組が横並び。
 * 携帯幅では両方の見出しと先頭の順位が同じ画面に入る。
 * 拡張は使わない。順位 API はフィクスチャで返す。
 */
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function entry(team, rank) {
  const id = team === 'shiro' ? 2000 + rank : 1000 + rank;
  return {
    rank,
    userId: String(id),
    displayName: team === 'shiro' ? `白${rank}` : `紅${rank}`,
    team,
    teamLabel: team === 'shiro' ? '白組' : '紅組',
    scoreLabel: `${3000 - rank} pt`,
    gapLabel: '1位まであと 10 pt',
    deltaLabel: '前回の公式更新から —',
    pagePath: `/live/kouhaku/u/${id}/`,
    iconUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg',
    shareUrl: 'https://x.com/intent/post?text=test'
  };
}

function fixtureBoard(asked) {
  if (asked !== '1' && asked !== '3') return board;
  const palette = [
    { id: 'aka', label: '紅組', color: '#9d2948', background: '#ffe4ea' },
    { id: 'shiro', label: '白組', color: '#8a5a12', background: '#fffdf8' },
    { id: 'niji', label: '虹組', color: '#14375c', background: '#eef4fb' }
  ];
  const count = Number(asked);
  return {
    ok: true,
    layoutClass: count >= 3 ? 'teams teams--many' : 'teams teams--1',
    officialUpdateLabel: board.officialUpdateLabel,
    columns: palette.slice(0, count).map((group) => ({
      ...group,
      entries: [entry(group.id === 'shiro' ? 'shiro' : 'aka', 1)]
    })),
    aka: [],
    shiro: []
  };
}

const board = {
  ok: true,
  officialUpdateLabel: '11月21日（土）15時55分頃更新分',
  aka: Array.from({ length: 25 }, (_, i) => entry('aka', i + 1)),
  shiro: Array.from({ length: 25 }, (_, i) => entry('shiro', i + 1))
};

/**
 * @param {string} pathname
 * @returns {string|null}
 */
function mapPath(pathname) {
  if (pathname === '/live' || pathname === '/live/') return 'tsuioku-no-kirameki/live/index.html';
  if (pathname === '/live/kouhaku' || pathname === '/live/kouhaku/') return 'tsuioku-no-kirameki/live/kouhaku/index.html';
  if (/^\/live\/kouhaku\/u\/\d+\/?$/.test(pathname)) return 'tsuioku-no-kirameki/live/kouhaku/u/index.html';
  if (pathname === '/live/event/kouhaku-2026' || pathname === '/live/event/kouhaku-2026/') return 'tsuioku-no-kirameki/live/event/index.html';
  if (/^\/live\/event\/kouhaku-2026\/u\/\d+\/?$/.test(pathname)) return 'tsuioku-no-kirameki/live/event/u/index.html';
  if (pathname.startsWith('/assets/') || pathname.startsWith('/images/')) return `tsuioku-no-kirameki${pathname}`;
  if (pathname.startsWith('/app/') || pathname.startsWith('/extension/')) return pathname.slice(1);
  return null;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/api/kouhaku-ranking') {
        const user = url.searchParams.get('user');
        const asked = String(req.headers['x-fixture-teams'] || '');
        const body = user
          ? {
            ok: true,
            found: true,
            officialUpdateLabel: board.officialUpdateLabel,
            officialUserUrl: `https://www.nicovideo.jp/user/${user}`,
            entry: board.aka[0],
            share: {
              xUrl: 'https://x.com/intent/post?text=hello',
              lineUrl: 'https://social-plugins.line.me/lineit/share?url=https%3A%2F%2Fexample.com%2F'
            }
          }
          : fixtureBoard(asked);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(body));
        return;
      }
      if (url.pathname.startsWith('/api/live-')) {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end('{"ok":true,"lives":[]}');
        return;
      }
      const rel = mapPath(url.pathname);
      if (!rel) {
        res.writeHead(404);
        res.end('no');
        return;
      }
      try {
        const body = await readFile(path.join(repoRoot, rel));
        const type = rel.endsWith('.css') ? 'text/css; charset=utf-8'
          : rel.endsWith('.js') ? 'text/javascript; charset=utf-8'
            : rel.endsWith('.png') ? 'image/png'
              : 'text/html; charset=utf-8';
        res.writeHead(200, { 'content-type': type });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end('no');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

/**
 * 見出しを画面の上に置いたあと、紅組と白組の見出しと先頭行が画面内にあるか。
 * @param {import('@playwright/test').Page} page
 */
async function teamLayout(page, root = '#kouhaku') {
  const title = page.locator('#kouhaku-title');
  await (await title.count() ? title : page.locator('h1').first()).evaluate((el) => el.scrollIntoView({ block: 'start' }));
  return page.evaluate((rootSelector) => {
    const seen = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.height > 0 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1;
    };
    const aka = document.querySelector(`${rootSelector} .team--aka`).getBoundingClientRect();
    const shiro = document.querySelector(`${rootSelector} .team--shiro`).getBoundingClientRect();
    const teams = document.querySelector(`${rootSelector} .teams`);
    const cheer = document.querySelector(`${rootSelector} .cheer`);
    const cheerBox = cheer ? cheer.getBoundingClientRect() : { height: 0, width: 0 };
    return {
      akaHead: seen(`${rootSelector} .team--aka h2`),
      shiroHead: seen(`${rootSelector} .team--shiro h2`),
      akaRow: seen(`${rootSelector} .team--aka .row`),
      shiroRow: seen(`${rootSelector} .team--shiro .row`),
      akaRows: document.querySelectorAll(`${rootSelector} .team--aka .row`).length,
      shiroRows: document.querySelectorAll(`${rootSelector} .team--shiro .row`).length,
      sideBySide: shiro.left > aka.left + 40,
      stacked: shiro.top > aka.top + 40,
      columns: getComputedStyle(teams).gridTemplateColumns.split(' ').length,
      cheerHeight: cheerBox.height,
      cheerWidth: cheerBox.width,
      quietHidden: document.querySelector(`${rootSelector} .sub--quiet`)
        ? getComputedStyle(document.querySelector(`${rootSelector} .sub--quiet`)).display === 'none'
        : false
    };
  }, root);
}

test.describe('/live/ の紅白は紅組と白組の両方', () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {string} */
  let origin;

  test.beforeAll(async () => {
    server = await startServer();
    const address = server.address();
    origin = `http://127.0.0.1:${address.port}`;
  });

  test.afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('デスクトップ幅では横並びで、両方の先頭が見える', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${origin}/live/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#kouhaku .team--shiro h2')).toHaveText('白組');
    const layout = await teamLayout(page);
    expect(layout.akaRows).toBe(25);
    expect(layout.shiroRows).toBe(25);
    expect(layout.akaHead).toBe(true);
    expect(layout.shiroHead).toBe(true);
    expect(layout.akaRow).toBe(true);
    expect(layout.shiroRow).toBe(true);
    expect(layout.sideBySide).toBe(true);
    await expect(page.locator('#list')).toHaveCount(1);
  });

  test('幅390でも紅組と白組が左右2列', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/live/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#kouhaku .team--aka h2')).toHaveText('紅組');
    const layout = await teamLayout(page);
    expect(layout.akaRows).toBe(25);
    expect(layout.shiroRows).toBe(25);
    expect(layout.akaHead).toBe(true);
    expect(layout.shiroHead).toBe(true);
    expect(layout.akaRow).toBe(true);
    expect(layout.shiroRow).toBe(true);
    expect(layout.sideBySide).toBe(true);
    expect(layout.stacked).toBe(false);
    expect(layout.columns).toBe(2);
    expect(layout.cheerHeight).toBeGreaterThanOrEqual(40);
    expect(layout.cheerWidth).toBeGreaterThanOrEqual(40);
    expect(layout.quietHidden).toBe(true);
    await expect(page.locator('#kouhaku .team--aka .sub').first()).toContainText('pt');
  });

  test('順位ページとイベントページも幅390で2列', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/live/kouhaku/`, { waitUntil: 'domcontentloaded' });
    const dedicated = await teamLayout(page, '#kouhaku-root');
    expect(dedicated.sideBySide).toBe(true);
    expect(dedicated.columns).toBe(2);
    expect(dedicated.akaHead).toBe(true);
    expect(dedicated.shiroHead).toBe(true);
    await page.goto(`${origin}/live/event/kouhaku-2026/`, { waitUntil: 'domcontentloaded' });
    const eventPage = await teamLayout(page, '#kouhaku-root');
    expect(eventPage.sideBySide).toBe(true);
    expect(eventPage.columns).toBe(2);
    expect(eventPage.shiroHead).toBe(true);
  });

  test('デスクトップの Chrome では順位の下に拡張の案内が出る', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${origin}/live/`, { waitUntil: 'domcontentloaded' });
    const cta = page.locator('#kouhaku .app-cta');
    await expect(cta).toContainText('推しの配信を見逃さない');
    const href = await cta.locator('a').getAttribute('href');
    expect(href.startsWith('https://chromewebstore.google.com/detail/cjbabignmmodaickpeckiojjabnlogdb?')).toBe(true);
    expect(href).toContain('openExternalBrowser=1');
    const row = await page.locator('#kouhaku .row').first().boundingBox();
    const box = await cta.boundingBox();
    expect(box.y).toBeGreaterThan(row.y + row.height);
    await expect(page.locator('#kouhaku .app-cta a')).toHaveText('Chrome 拡張を入れる（無料）');
  });

  test('順位ページでも案内は表の下', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${origin}/live/kouhaku/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#kouhaku-root .team--shiro h2')).toHaveText('白組');
    const row = await page.locator('#kouhaku-root .row').first().boundingBox();
    const box = await page.locator('#kouhaku-root .app-cta').boundingBox();
    expect(box.y).toBeGreaterThan(row.y + row.height);
  });

  test('推しページでは応援ボタンの近く、順位より下', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/live/kouhaku/u/1001/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.hero h2')).toHaveText('紅1');
    const name = await page.locator('.hero h2').boundingBox();
    const share = await page.locator('a', { hasText: 'Xで応援を伝える' }).boundingBox();
    const box = await page.locator('.hero .app-cta').boundingBox();
    expect(box.y).toBeGreaterThan(name.y + name.height);
    expect(box.y).toBeGreaterThan(share.y);
    const href = await page.locator('.hero .app-cta a').getAttribute('href');
    expect(href).toContain('openExternalBrowser=1');
    expect(href.startsWith('https://')).toBe(true);
  });

  test.describe('店のリンクが無い端末', () => {
    test.use({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    });

    test('iPhone では案内を出さない', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${origin}/live/`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#kouhaku .team--shiro h2')).toHaveText('白組');
      await expect(page.locator('.app-cta')).toHaveCount(0);
    });
  });

  test('イベント順位ページでも案内は表の下', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${origin}/live/event/kouhaku-2026/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#kouhaku-root .team--shiro h2')).toHaveText('白組');
    const row = await page.locator('#kouhaku-root .row').first().boundingBox();
    const box = await page.locator('#kouhaku-root .app-cta').boundingBox();
    expect(box.y).toBeGreaterThan(row.y + row.height);
  });

  test.describe('組が2つでないとき', () => {
    test('1組は1列のまま', async ({ page }) => {
      await page.setExtraHTTPHeaders({ 'x-fixture-teams': '1' });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${origin}/live/`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#kouhaku .teams')).toHaveClass(/teams--1/);
      await expect(page.locator('#kouhaku .team')).toHaveCount(1);
      const columns = await page.locator('#kouhaku .teams').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      expect(columns).toBe(1);
    });

    test('3組以上は狭い幅では横スクロール、PCでは横並び', async ({ page }) => {
      await page.setExtraHTTPHeaders({ 'x-fixture-teams': '3' });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${origin}/live/`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#kouhaku .teams')).toHaveClass(/teams--many/);
      await expect(page.locator('#kouhaku h2', { hasText: '虹組' })).toHaveCount(1);
      const phone = await page.locator('#kouhaku .teams').evaluate((el) => ({
        overflow: getComputedStyle(el).overflowX,
        scrolls: el.scrollWidth > el.clientWidth + 8
      }));
      expect(phone.overflow).toBe('auto');
      expect(phone.scrolls).toBe(true);
      await page.setViewportSize({ width: 1280, height: 900 });
      const wide = await page.locator('#kouhaku .team').evaluateAll((nodes) => {
        const boxes = nodes.map((node) => node.getBoundingClientRect());
        return {
          count: boxes.length,
          sameRow: Math.max(...boxes.map((box) => box.top)) - Math.min(...boxes.map((box) => box.top)) < 20,
          spread: boxes[boxes.length - 1].left > boxes[0].left + 200
        };
      });
      expect(wide.count).toBe(3);
      expect(wide.sameRow).toBe(true);
      expect(wide.spread).toBe(true);
    });
  });

  test.describe('Android', () => {
    test.use({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    });

    test('Android でも店の URL が無いので案内を出さない', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${origin}/live/kouhaku/`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.team--aka h2')).toHaveText('紅組');
      await expect(page.locator('.app-cta')).toHaveCount(0);
    });
  });
});
