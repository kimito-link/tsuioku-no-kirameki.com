/**
 * 保存済みの紅白順位から共有 JPEG を焼き、/api/kouhaku-og-image へ置く。
 * 公式ページへは行かない。順位が新しく保存されたときだけ呼ぶ。
 *
 *   KOUHAKU_RESULT=/tmp/out.json KOUHAKU_API=https://app.tsuioku-no-kirameki.com node scripts/kouhaku-og-bake.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ogSpecForBoard, ogSpecForEntry } from '../src/lib/kouhaku/ogSpec.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const python = path.join(root, 'tools', 'kouhaku_og.py');
const api = (process.env.KOUHAKU_API || 'https://app.tsuioku-no-kirameki.com').replace(/\/$/, '');
const resultPath = process.env.KOUHAKU_RESULT || '';
const key = process.env.STATUS_INGEST_KEY || process.env.INGEST_KEY || '';

function readResult() {
  if (!resultPath) return null;
  try {
    return JSON.parse(readFileSync(resultPath, 'utf8'));
  } catch {
    return null;
  }
}

function render(spec, outFile) {
  const proc = spawnSync('python3', [python, outFile], {
    input: JSON.stringify(spec),
    encoding: 'utf8'
  });
  if (proc.status !== 0) {
    throw new Error(proc.stderr || proc.stdout || 'og render failed');
  }
  return readFileSync(outFile);
}

async function put(id, bytes) {
  const res = await fetch(`${api}/api/kouhaku-og-image?ingest=1`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-share-key': key
    },
    body: JSON.stringify({ id, jpegBase64: bytes.toString('base64') })
  });
  if (!res.ok) throw new Error(`ingest ${id} HTTP ${res.status}`);
}

const prior = readResult();
if (!prior || prior.action !== 'saved') {
  console.log(`skip bake: ${prior && prior.action ? prior.action : 'no-saved-result'} ${prior && prior.reason ? prior.reason : ''}`);
  process.exit(0);
}
if (!key) {
  console.error('STATUS_INGEST_KEY が無いので共有画像は置けません');
  process.exit(1);
}

const boardRes = await fetch(`${api}/api/kouhaku-ranking`, { cache: 'no-store' });
if (!boardRes.ok) {
  console.error(`board HTTP ${boardRes.status}`);
  process.exit(1);
}
const board = await boardRes.json();
const label = String(board.officialUpdateLabel || '');
const cards = [{ id: 'board', spec: ogSpecForBoard(label) }];
for (const entry of [...(board.aka || []), ...(board.shiro || [])]) {
  if (!entry || !/^\d{1,16}$/.test(String(entry.userId || ''))) continue;
  cards.push({ id: String(entry.userId), spec: ogSpecForEntry(entry, label) });
}

let stored = 0;
for (const card of cards) {
  const file = path.join(tmpdir(), `kouhaku-og-${card.id}.jpg`);
  const bytes = render(card.spec, file);
  await put(card.id, bytes);
  stored += 1;
}
console.log(`baked ${stored}`);
