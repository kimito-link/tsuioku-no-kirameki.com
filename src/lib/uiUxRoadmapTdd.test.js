/**
 * フェーズ1以降の受け入れテストの置き場（it.todo）。
 * 実装するフェーズで it を本実装に置き換え、対応する E2E/単体を追加する。
 */
import { describe, it } from 'vitest';

describe('フェーズ1: ツールバー × インライン（E2E または messaging と接続）', () => {
  it.todo(
    'watch 上にインラインホストがあるとき、policy prefer_focus_inline でツールバー操作が iframe 前面化に繋がる'
  );
  it.todo('always_open_popup のときは従来どおり別窓ポップアップが開く');
});

describe('フェーズ2: 単一スクロール（popup / 埋め込み）', () => {
  it.todo(
    'ツールバーポップアップで縦スクロール担当が過剰にネストしない（仕様どおり 1 本化）'
  );
  it.todo('inline=1 埋め込みではヘッダ固定＋グリッドのみスクロール等、方針 B の受け入れ');
});

describe('フェーズ3: 下ドック時の主役（応援表示 vs 入力）', () => {
  it.todo('下ドック相当レイアウトで応援ブロックが視覚的に優先される、または折りたたみ初期状態');
});

describe('フェーズ4: storage による逃げ道', () => {
  it.todo('「常に別窓」フラグが prefer_focus_inline を上書きする');
});
