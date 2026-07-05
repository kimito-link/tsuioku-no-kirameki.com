import os from 'node:os';
import { defineConfig } from 'vitest/config';

const maxWorkers = Math.max(1, Math.min(4, os.cpus()?.length || 4));

export default defineConfig({
  test: {
    environment: 'node',
    // Windows + Claude Code ターミナルで threads プールがハングして見える退行対策
    pool: 'forks',
    maxWorkers,
    fileParallelism: maxWorkers > 1,
    include: [
      'src/**/*.test.js',
      // アーキテクチャレベルの不変条件（レイヤ依存など）は
      // docs/lane-architecture-redesign.md §5 Phase 0 で導入。
      'tests/contract/**/*.test.js',
      // scripts/ 配下の純関数テスト(2026-07-05: install-local-sounds.mjs の選別ロジック等)。
      'scripts/**/*.test.js'
    ]
  }
});
