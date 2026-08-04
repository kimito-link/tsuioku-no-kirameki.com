import { describe, it, expect } from 'vitest';
import {
  resolveComeviewAvatarUrl,
  comeviewUserPageUrl,
  mergeComeviewRowWithProfile,
  comeviewUserKeyForRow,
  buildComeviewCopyText,
  normalizeComeviewNgList,
  addComeviewNgEntry,
  removeComeviewNgEntry,
  isComeviewRowHidden,
  extractUserCommentRows,
  comeviewPinStorageKey,
  COMEVIEW_NG_MAX
} from './comeviewActions.js';

describe('comeviewUserKeyForRow', () => {
  it('userId があれば u: キー', () => {
    expect(comeviewUserKeyForRow({ userId: '12345', name: 'たろう' })).toBe('u:12345');
  });
  it('userId が無ければ名前で代替(匿名コメ対策)', () => {
    expect(comeviewUserKeyForRow({ userId: '', name: 'たろう' })).toBe('n:たろう');
  });
  it('汎用名(匿名/名無し)はキーにしない=全匿名が1人扱いになる事故防止', () => {
    expect(comeviewUserKeyForRow({ userId: '', name: '匿名' })).toBe('');
    expect(comeviewUserKeyForRow({ userId: '', name: '名無し' })).toBe('');
  });
  it('どちらも無い行は識別不能で空文字', () => {
    expect(comeviewUserKeyForRow({ userId: '', name: '' })).toBe('');
    expect(comeviewUserKeyForRow(null)).toBe('');
  });
});

describe('buildComeviewCopyText', () => {
  it('名前があれば「名前: 本文」', () => {
    expect(buildComeviewCopyText({ name: 'たろう', text: 'こんにちは' })).toBe(
      'たろう: こんにちは'
    );
  });
  it('名前が無ければ本文だけ', () => {
    expect(buildComeviewCopyText({ name: '', text: 'こんにちは' })).toBe('こんにちは');
  });
  it('本文が無ければ空文字', () => {
    expect(buildComeviewCopyText({ name: 'たろう', text: '' })).toBe('');
    expect(buildComeviewCopyText(null)).toBe('');
  });
});

describe('NG リスト(追加/解除/正規化)', () => {
  it('追加は冪等(同じユーザーを二重に入れない)', () => {
    const a = addComeviewNgEntry([], { userId: '1', name: 'たろう' }, 100);
    expect(a.added).toBe(true);
    expect(a.key).toBe('u:1');
    const b = addComeviewNgEntry(a.list, { userId: '1', name: 'たろう' }, 200);
    expect(b.added).toBe(false);
    expect(b.list).toHaveLength(1);
  });
  it('識別不能な行は追加されない', () => {
    const a = addComeviewNgEntry([], { userId: '', name: '' }, 100);
    expect(a.added).toBe(false);
    expect(a.list).toHaveLength(0);
  });
  it('解除で消える', () => {
    const a = addComeviewNgEntry([], { userId: '1', name: 'たろう' }, 100);
    expect(removeComeviewNgEntry(a.list, 'u:1')).toHaveLength(0);
  });
  it('上限を超えたら古い順に捨てる', () => {
    let list = [];
    for (let i = 0; i < COMEVIEW_NG_MAX + 5; i += 1) {
      list = addComeviewNgEntry(list, { userId: String(i), name: '' }, i).list;
    }
    expect(list).toHaveLength(COMEVIEW_NG_MAX);
    expect(list[0].key).toBe('u:5');
  });
  it('normalize は壊れた要素と重複を捨てる', () => {
    const out = normalizeComeviewNgList([
      { key: 'u:1', name: 'a', at: 1 },
      { key: 'u:1', name: 'dupe', at: 2 },
      { name: 'キー無し' },
      'string',
      null,
      { key: 'n:たろう', name: 'たろう', at: 3 }
    ]);
    expect(out.map((e) => e.key)).toEqual(['u:1', 'n:たろう']);
  });
  it('normalize は配列以外を空にする', () => {
    expect(normalizeComeviewNgList(undefined)).toEqual([]);
    expect(normalizeComeviewNgList({})).toEqual([]);
  });
});

describe('isComeviewRowHidden', () => {
  const ng = new Set(['u:1']);
  const hidden = new Set(['no:7']);
  it('NG ユーザーの行は隠す', () => {
    expect(isComeviewRowHidden({ id: 'no:9', userId: '1', name: 'x' }, ng, hidden)).toBe(true);
  });
  it('行単位の非表示 id は隠す', () => {
    expect(isComeviewRowHidden({ id: 'no:7', userId: '2', name: 'y' }, ng, hidden)).toBe(true);
  });
  it('どちらにも該当しなければ表示', () => {
    expect(isComeviewRowHidden({ id: 'no:9', userId: '2', name: 'y' }, ng, hidden)).toBe(false);
  });
});

describe('extractUserCommentRows(追憶独自: この人の発言だけ)', () => {
  const archive = [
    { commentNo: 1, text: 'あ', userId: '1', name: 'たろう' },
    { commentNo: 2, text: 'い', userId: '2', name: 'じろう' },
    { commentNo: 3, text: 'う', userId: '1', name: 'たろう' },
    { commentNo: 4, text: '', userId: '1', name: 'たろう' }, // 空本文は除外
    { commentNo: 5, text: 'え', userId: '', name: 'たろう' } // userId 無し=別キー
  ];
  it('userId キーで本人の発言だけ昇順に取り出す', () => {
    const { rows, total } = extractUserCommentRows(archive, 'u:1');
    expect(total).toBe(2);
    expect(rows.map((r) => r.text)).toEqual(['あ', 'う']);
  });
  it('名前キー(匿名)はそのキーの行だけ', () => {
    const { rows, total } = extractUserCommentRows(archive, 'n:たろう');
    expect(total).toBe(1);
    expect(rows[0].text).toBe('え');
  });
  it('max を超える分は total に数えつつ末尾だけ返す', () => {
    const many = [];
    for (let i = 0; i < 10; i += 1) {
      many.push({ commentNo: i + 1, text: `c${i}`, userId: '1', name: 'たろう' });
    }
    const { rows, total } = extractUserCommentRows(many, 'u:1', 3);
    expect(total).toBe(10);
    expect(rows.map((r) => r.text)).toEqual(['c7', 'c8', 'c9']);
  });
  it('無効入力は空', () => {
    expect(extractUserCommentRows(null, 'u:1')).toEqual({ rows: [], total: 0 });
    expect(extractUserCommentRows(archive, '')).toEqual({ rows: [], total: 0 });
  });

  // ───────────────────────────────────────────────────────────────────
  // v0.1.1248(2026-08-04): 実機で踏んだバグの回帰テスト。
  //   venueBar.js:3668 が【生の uid】("140475218")を渡していたため、
  //   "140475218" !== "u:140475218" で全行が外れ、パネルが常に
  //   「この配信の記録にはまだ発言がありません」を出していた
  //   (速報では同一人物が6〜12件発言・応援者ランキング1位)。
  //
  //   ★このバグを既存テストが見逃した理由: 上のテストは全部 'u:1' 形式
  //     (=正しい形)でしか呼んでおらず、【呼び出し側が間違った形を渡す】
  //     ケースを一度も試していなかった。関数は正しく動いていた。
  //     よってここでは「間違った形を渡すと0件になる」ことを明示的に固定し、
  //     この関数が接頭辞つきキーを要求する契約であることを断言する。
  // ───────────────────────────────────────────────────────────────────
  it('【実機バグの回帰】生の userId を渡すと0件になる(接頭辞つきキーが必須)', () => {
    // 実機で渡していた値と同じ形。u: が無いので必ず外れる。
    expect(extractUserCommentRows(archive, '1')).toEqual({ rows: [], total: 0 });
    // 正しい形なら取れる=データではなくキーの書式だけの問題だったことの対比。
    expect(extractUserCommentRows(archive, 'u:1').total).toBe(2);
  });

  it('【契約】comeviewUserKeyForRow の戻り値をそのまま渡せば一致する', () => {
    // 呼び出し側は必ずこの関数を経由すること(comeview-entry.js:1052 が正しい例)。
    const key = comeviewUserKeyForRow({ userId: '1' });
    expect(key).toBe('u:1');
    expect(extractUserCommentRows(archive, key).total).toBe(2);
  });
});

describe('resolveComeviewAvatarUrl(本家と同じサムネ解決)', () => {
  it('取り込み済み avatar URL を最優先', () => {
    expect(resolveComeviewAvatarUrl({ avatar: 'https://x/a.jpg', userId: '99' })).toBe(
      'https://x/a.jpg'
    );
  });
  it('数値 userId は本家の確定パターンで生成(popup と同じ)', () => {
    expect(resolveComeviewAvatarUrl({ avatar: '', userId: '143172392' })).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/14317/143172392.jpg'
    );
  });
  it('匿名(a:…)はパネルと同じ identicon(同じ人=同じ模様・人ごとに違う)', () => {
    const a = resolveComeviewAvatarUrl({ avatar: '', userId: 'a:XYZ' });
    const a2 = resolveComeviewAvatarUrl({ avatar: '', userId: 'a:XYZ' });
    const b = resolveComeviewAvatarUrl({ avatar: '', userId: 'a:OTHER' });
    expect(a.startsWith('data:')).toBe(true);
    expect(a2).toBe(a);
    expect(b).not.toBe(a);
  });
  it('どちらも無ければ空(呼び出し側フォールバック)', () => {
    expect(resolveComeviewAvatarUrl({ avatar: '', userId: '' })).toBe('');
    expect(resolveComeviewAvatarUrl(null)).toBe('');
  });
});

describe('mergeComeviewRowWithProfile(パネルと同じプロフィール情報源で補完)', () => {
  const profiles = {
    '41312990': { nickname: '∞いっちゃん∞', avatarUrl: 'https://x/icchan.jpg' }
  };
  it('名前/サムネが空の行をキャッシュで補完する', () => {
    const out = mergeComeviewRowWithProfile(
      { name: '', avatar: '', userId: '41312990' },
      profiles
    );
    expect(out.name).toBe('∞いっちゃん∞');
    expect(out.avatar).toBe('https://x/icchan.jpg');
  });
  it('行自身の値があれば上書きしない', () => {
    const out = mergeComeviewRowWithProfile(
      { name: '元の名前', avatar: 'https://x/own.jpg', userId: '41312990' },
      profiles
    );
    expect(out.name).toBe('元の名前');
    expect(out.avatar).toBe('https://x/own.jpg');
  });
  it('キャッシュに無い uid / uid 無しはそのまま返す', () => {
    const row = { name: '', avatar: '', userId: '999' };
    expect(mergeComeviewRowWithProfile(row, profiles)).toBe(row);
    const row2 = { name: '', avatar: '', userId: '' };
    expect(mergeComeviewRowWithProfile(row2, profiles)).toBe(row2);
    expect(mergeComeviewRowWithProfile(null, profiles)).toBe(null);
  });
});

describe('comeviewUserPageUrl(情報セット原則のリンク部分)', () => {
  it('数値 ID はユーザーページ URL', () => {
    expect(comeviewUserPageUrl('41199319')).toBe('https://www.nicovideo.jp/user/41199319');
  });
  it('匿名(a:…)/空は公開ページが無いので空文字', () => {
    expect(comeviewUserPageUrl('a:XYZ')).toBe('');
    expect(comeviewUserPageUrl('')).toBe('');
    expect(comeviewUserPageUrl(null)).toBe('');
  });
});

describe('comeviewPinStorageKey', () => {
  it('lv を正規化してキー化', () => {
    expect(comeviewPinStorageKey(' LV123 ')).toBe('nls_comeview_pin_lv123');
  });
});
