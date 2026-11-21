/**
 * /live/ に埋め込んだ紅白は、デスクトップでは紅組と白組が横並び、
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
          : board;
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
async function teamLayout(page) {
  await page.locator('#kouhaku-title').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  return page.evaluate(() => {
    const seen = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.height > 0 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1;
    };
    const aka = document.querySelector('#kouhaku .team--aka').getBoundingClientRect();
    const shiro = document.querySelector('#kouhaku .team--shiro').getBoundingClientRect();
    return {
      akaHead: seen('#kouhaku .team--aka h2'),
      shiroHead: seen('#kouhaku .team--shiro h2'),
      akaRow: seen('#kouhaku .team--aka .row'),
      shiroRow: seen('#kouhaku .team--shiro .row'),
      akaRows: document.querySelectorAll('#kouhaku .team--aka .row').length,
      shiroRows: document.querySelectorAll('#kouhaku .team--shiro .row').length,
      sideBySide: shiro.left > aka.left + 80,
      stacked: shiro.top > aka.top + 40
    };
  });
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

  test('携帯幅でも白組が枠の外に隠れず、先頭同士を比べられる', async ({ page }) => {
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
    expect(layout.stacked).toBe(true);
    expect(layout.sideBySide).toBe(false);
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
