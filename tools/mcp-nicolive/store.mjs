/**
 * NicoLive Local MCP Bridge - Snapshot Store.
 *
 * 拡張が `~/Downloads/nicolivelog-mcp/<liveId>.json` に書き出した
 * Canonical Snapshot を読む。
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const MCP_FOLDER_PATH = join(homedir(), 'Downloads', 'nicolivelog-mcp');

/**
 * MCP folder の snapshot ファイル一覧（拡張子 .json のみ）を返す。
 * フォルダが存在しなければ空配列。
 *
 * @returns {Promise<string[]>}
 */
export async function listSnapshotFilenames() {
  try {
    const files = await readdir(MCP_FOLDER_PATH);
    return files.filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
}

/**
 * snapshot ファイル一覧を mtime 降順で返す（最新が先頭）。
 * @returns {Promise<{ filename: string, liveId: string, mtime: number }[]>}
 */
export async function listSnapshotsSortedByMtime() {
  const filenames = await listSnapshotFilenames();
  /** @type {{ filename: string, liveId: string, mtime: number }[]} */
  const entries = [];
  for (const filename of filenames) {
    try {
      const fullPath = join(MCP_FOLDER_PATH, filename);
      const s = await stat(fullPath);
      entries.push({
        filename,
        liveId: filename.replace(/\.json$/, ''),
        mtime: s.mtimeMs
      });
    } catch { /* no-op */ }
  }
  entries.sort((a, b) => b.mtime - a.mtime);
  return entries;
}

/**
 * 特定の liveId の snapshot を読む。見つからなければ null。
 *
 * @param {string} liveId
 * @returns {Promise<unknown>}
 */
export async function readSnapshot(liveId) {
  const safe = String(liveId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) return null;
  try {
    const path = join(MCP_FOLDER_PATH, `${safe}.json`);
    const text = await readFile(path, 'utf-8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * 最新の snapshot（mtime 最大）を読む。なければ null。
 *
 * @returns {Promise<unknown>}
 */
export async function readLatestSnapshot() {
  const entries = await listSnapshotsSortedByMtime();
  if (entries.length === 0) return null;
  return readSnapshot(entries[0].liveId);
}
