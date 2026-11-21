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
  if (pathname.startsWith('/assets/') || pathname.startsWith('/images/')) return `tsuioku-no-kirameki${pathname}`;
  if (pathname.startsWith('/app/') || pathname.startsWith('/extension/')) return pathname.slice(1);
  return null;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/api/kouhaku-ranking') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(board));
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
});
