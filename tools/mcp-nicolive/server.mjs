#!/usr/bin/env node
/**
 * NicoLive Local MCP Bridge Phase1a (PoC) — stdio JSON-RPC server.
 *
 * 拡張が `~/Downloads/nicolivelog-mcp/<liveId>.json` に書き出した
 * Canonical Snapshot を読み、MCP tools として AI に公開する。
 *
 * 起動：
 *   node tools/mcp-nicolive/server.mjs
 *
 * Claude Code の MCP 設定例（claude_desktop_config.json）：
 *   "nicolive-local": {
 *     "command": "node",
 *     "args": ["/path/to/tsuioku-no-kirameki.com/tools/mcp-nicolive/server.mjs"]
 *   }
 *
 * MCP プロトコル：JSON-RPC 2.0 over stdio。
 *   - initialize / tools/list / tools/call をサポート
 *   - resources は Phase 2 以降
 */

import {
  listSnapshotsSortedByMtime,
  readSnapshot,
  readLatestSnapshot,
  MCP_FOLDER_PATH
} from './store.mjs';

const SERVER_VERSION = '0.1.250';

const TOOLS = [
  {
    name: 'nicolive.get_current_live_context',
    description:
      '現在（最新）の watch live の context: liveId / watchUrl / aligned / seq / exportedAt',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'nicolive.get_gift_ad_rank',
    description:
      'gift / ad / event score / event rank / event title を Canonical Snapshot 形式で返す。liveId 省略時は最新 live。',
    inputSchema: {
      type: 'object',
      properties: {
        liveId: {
          type: 'string',
          description: '省略時は最新の live snapshot を使う'
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'nicolive.get_ranking_snippet',
    description:
      'diag.rankingSnippet のみを返す（貢献度・広告ランキングの PII 最小断片: 順位・pt・匿名フラグ・行数・truncated）。snapshot が無ければ error。',
    inputSchema: {
      type: 'object',
      properties: {
        liveId: {
          type: 'string',
          description: '省略時は最新の live snapshot を使う'
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'nicolive.get_diagnostics',
    description: '取得経路の整合性と未取得理由（mismatchReasons）を返す。',
    inputSchema: {
      type: 'object',
      properties: {
        liveId: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'nicolive.list_live_snapshots',
    description:
      'MCP folder にある snapshot の liveId 一覧を mtime 降順で返す。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  }
];

/* ---------- stdio JSON-RPC framing ---------- */

process.stdin.setEncoding('utf-8');
let buffer = '';

process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    if (line.trim()) {
      void handleLine(line);
    }
  }
});

async function handleLine(line) {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }
  const result = await dispatchRequest(req);
  if (result) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
}

/* ---------- MCP request dispatch ---------- */

async function dispatchRequest(req) {
  const { method, params, id } = req || {};
  // notification（id が無い）は応答しない
  const isNotification = id === undefined || id === null;
  try {
    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: 'nicolive-local-mcp',
            version: SERVER_VERSION
          }
        }
      };
    }
    if (method === 'tools/list') {
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    }
    if (method === 'tools/call') {
      const name = params?.name;
      const args = params?.arguments || {};
      const out = await dispatchTool(name, args);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            { type: 'text', text: JSON.stringify(out, null, 2) }
          ]
        }
      };
    }
    if (isNotification) return null;
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `method not found: ${method}` }
    };
  } catch (err) {
    if (isNotification) return null;
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: String(err?.message || err) }
    };
  }
}

/* ---------- Tool implementations ---------- */

async function dispatchTool(name, args) {
  if (name === 'nicolive.get_current_live_context') {
    const snap = await readLatestSnapshot();
    if (!snap) return { error: 'no_snapshot', folder: MCP_FOLDER_PATH };
    const s = /** @type {any} */ (snap);
    return {
      liveId: s?.watch?.liveId || '',
      watchUrl: s?.watch?.watchUrl || '',
      aligned: s?.watch?.aligned !== false,
      seq: s?.meta?.seq ?? 0,
      exportedAt: s?.meta?.exportedAt ?? 0,
      extensionVersion: s?.meta?.extensionVersion || '',
      snapshotVersion: s?.nlsMcpSnapshotVersion ?? null
    };
  }
  if (name === 'nicolive.get_gift_ad_rank') {
    const lid = String(args?.liveId || '').trim();
    const snap = lid ? await readSnapshot(lid) : await readLatestSnapshot();
    if (!snap) return { error: 'no_snapshot', requestedLiveId: lid };
    const s = /** @type {any} */ (snap);
    return {
      liveId: s?.watch?.liveId || lid || '',
      gift: s?.gift || {},
      rankingSnippet: s?.diag?.rankingSnippet ?? null,
      mismatchReasons: Array.isArray(s?.diag?.mismatchReasons) ? s.diag.mismatchReasons : [],
      seq: s?.meta?.seq ?? 0,
      exportedAt: s?.meta?.exportedAt ?? 0
    };
  }
  if (name === 'nicolive.get_ranking_snippet') {
    const lid = String(args?.liveId || '').trim();
    const snap = lid ? await readSnapshot(lid) : await readLatestSnapshot();
    if (!snap) return { error: 'no_snapshot', requestedLiveId: lid };
    const s = /** @type {any} */ (snap);
    return {
      liveId: s?.watch?.liveId || lid || '',
      rankingSnippet: s?.diag?.rankingSnippet ?? null,
      mismatchReasons: Array.isArray(s?.diag?.mismatchReasons) ? s.diag.mismatchReasons : [],
      seq: s?.meta?.seq ?? 0,
      exportedAt: s?.meta?.exportedAt ?? 0
    };
  }
  if (name === 'nicolive.get_diagnostics') {
    const lid = String(args?.liveId || '').trim();
    const snap = lid ? await readSnapshot(lid) : await readLatestSnapshot();
    if (!snap) return { error: 'no_snapshot', requestedLiveId: lid };
    const s = /** @type {any} */ (snap);
    return {
      liveId: s?.watch?.liveId || lid || '',
      aligned: s?.watch?.aligned !== false,
      diag: s?.diag || { mismatchReasons: [] },
      seq: s?.meta?.seq ?? 0
    };
  }
  if (name === 'nicolive.list_live_snapshots') {
    const entries = await listSnapshotsSortedByMtime();
    return {
      folder: MCP_FOLDER_PATH,
      count: entries.length,
      snapshots: entries.map((e) => ({
        liveId: e.liveId,
        filename: e.filename,
        mtime: e.mtime
      }))
    };
  }
  throw new Error(`unknown tool: ${name}`);
}

/* ---------- Startup notice ---------- */

process.stderr.write(
  `[nicolive-mcp v${SERVER_VERSION}] watching ${MCP_FOLDER_PATH}\n` +
    '  Tools: nicolive.get_current_live_context / nicolive.get_gift_ad_rank /\n' +
    '         nicolive.get_ranking_snippet / nicolive.get_diagnostics /\n' +
    '         nicolive.list_live_snapshots\n'
);
