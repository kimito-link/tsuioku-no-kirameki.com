import { describe, expect, it } from 'vitest';
import {
  venueParticipantKey,
  collectVenueParticipants,
  countAnonymousParticipants,
  collectAudienceFaceUserIds,
  VENUE_AUDIENCE_FACE_MAX,
  resolveVenueLayoutMode,
  venueRowsFromUserLaneCandidates,
  buildVenueTiers,
  resolveVenueTierMinScale,
  VENUE_FULLSCREEN_MAX_SEATS,
  rankVenueParticipants,
  assignVenueSeats,
  buildVenueSeating,
  hasRealThumbnail,
  deriveNicoUserIconUrl,
  resolveVenueEffectiveAvatar,
  participantHasEffectiveThumbnail,
  resolveVenueRegularScore,
  selectVenueVipRegularKeys,
  VENUE_VIP_REGULAR_SCORE_THRESHOLD,
  VENUE_VIP_REGULAR_MAX,
  VENUE_MAX_SEATS,
  VENUE_FRONT_ROW_SEATS
} from './venueSeats.js';

const isGeneric = (name) => ['匿名', '名無し'].includes(String(name).trim());

describe('venueParticipantKey', () => {
  it('userId を最優先キーにする', () => {
    expect(venueParticipantKey({ userId: '123', name: 'たろう' })).toBe('u:123');
  });
  it('userId 無しは個人名をキーにする', () => {
    expect(venueParticipantKey({ name: 'たろう' })).toBe('n:たろう');
  });
  it('汎用プレースホルダ名はアリーナに座らない(null)', () => {
    expect(venueParticipantKey({ name: '匿名' }, isGeneric)).toBeNull();
  });
  it('userIdがあれば名前が無くても・汎用名でもアリーナに座る(匿名も満員感のため参加)', () => {
    // ユーザー方針「匿名もいれたほうが満員感が出る」: userId 付きなら席に出す。
    expect(venueParticipantKey({ userId: '999', name: '匿名' }, isGeneric)).toBe('u:999');
    expect(venueParticipantKey({ userId: '999' })).toBe('u:999');
  });
  it('userIdが無い匿名・汎用名のみアリーナに座らない(null)', () => {
    expect(venueParticipantKey({ name: '匿名' }, isGeneric)).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 方針ドリフト検知(2026-06-17 確定)。venueSeats.js#venueParticipantKey の JSDoc 正本ルール
//   「アクティブユーザー(=userId が観測できた人)は匿名/非匿名問わず全員着席」を test で固定する。
//   ⚠️ もし将来うっかり旧方針(2026-06-13「匿名はアリーナじゃない=名前のある人だけ」)に戻したら、
//      ここが落ちて気づける。コメントだけの正本は読み飛ばされる→test で物理的に固定するのが Task。
// ───────────────────────────────────────────────────────────────────────────
describe('venueParticipantKey 方針ドリフト検知(匿名も着席・正本固定)', () => {
  it('a: 形式の匿名 userId(実機で実在)でも席キーを返す', () => {
    // 実機のニコ生匿名(184)は userId が `a:xxxxx` 形式で来る。これも着席が正。
    expect(venueParticipantKey({ userId: 'a:9f3kZ', name: '匿名' }, isGeneric)).toBe('u:a:9f3kZ');
    expect(venueParticipantKey({ userId: 'a:9f3kZ' })).toBe('u:a:9f3kZ');
  });
  it('数値ID・匿名a:・名前ありを「同じ土俵で」席キーにする(差別しない)', () => {
    // popup 応援アイコン列と会場の顔ぶれを一致させる前提。userId があればどの形式でも u:${uid}。
    expect(venueParticipantKey({ userId: '12345678' })).toBe('u:12345678');
    expect(venueParticipantKey({ userId: 'a:anon01' })).toBe('u:a:anon01');
    expect(venueParticipantKey({ userId: '777', name: 'なまえ' })).toBe('u:777');
  });
  it('席に座れないのは「userIdも識別名も無い」1ケースだけ', () => {
    // 来場者数(PV・無言視聴者)は userId が取れないのでここに来ない=null になるのが正。
    expect(venueParticipantKey({})).toBeNull();
    expect(venueParticipantKey({ name: '匿名' }, isGeneric)).toBeNull();
    expect(venueParticipantKey({ name: '名無し' }, isGeneric)).toBeNull();
  });
});

describe('buildVenueSeating promoteUserIds', () => {
  it('userIdがある匿名は自動的にアリーナ席となる', () => {
    const rows = [
      { userId: 'a:talker', name: '', text: 'やあ', capturedAt: 30 },
      { userId: 'a:silent', name: '', text: 'x', capturedAt: 20 },
      { userId: 'named', name: 'A', text: 'y', capturedAt: 10 }
    ];
    const r = buildVenueSeating(rows, {
      isGenericName: isGeneric,
      promoteUserIds: new Set(['a:talker'])
    });
    // アリーナ: named + a:talker + a:silent = 3人
    expect(r.participantCount).toBe(3);
    // 観客: アリーナに座ったので0人
    expect(r.anonymousCount).toBe(0);
    expect(r.seatByKey.has('u:a:talker')).toBe(true);
    expect(r.seatByKey.has('u:a:silent')).toBe(true);
  });
});

describe('deriveNicoUserIconUrl / effective avatar (診断サムネ0人の修正 v0.1.735)', () => {
  it('数値 userId からアカウントアイコン URL を導出', () => {
    const url = deriveNicoUserIconUrl('123456789');
    expect(url).toContain('nicoaccount/usericon');
    expect(url).toContain('123456789.jpg');
    expect(hasRealThumbnail(url)).toBe(true);
  });
  it('匿名(数値でない/空)は空文字', () => {
    expect(deriveNicoUserIconUrl('')).toBe('');
    expect(deriveNicoUserIconUrl('abc')).toBe('');
    expect(deriveNicoUserIconUrl(null)).toBe('');
  });
  it('stored avatar(http)を最優先・無ければ userId 由来', () => {
    expect(resolveVenueEffectiveAvatar({ avatar: 'https://x/y.jpg', userId: '999' })).toBe('https://x/y.jpg');
    expect(resolveVenueEffectiveAvatar({ avatar: '', userId: '123456' })).toContain('123456.jpg');
    expect(resolveVenueEffectiveAvatar({ avatar: 'data:image/svg', userId: '' })).toBe('');
  });
  it('participantHasEffectiveThumbnail: 数値userIdの人はサムネ持ち扱い(席表示と一致)', () => {
    // これが修正の核: avatar 空でも数値 userId があれば席ではアイコンが出る=サムネ持ち。
    expect(participantHasEffectiveThumbnail({ avatar: '', userId: '12345678' })).toBe(true);
    expect(participantHasEffectiveThumbnail({ avatar: '', userId: '' })).toBe(false);
    expect(participantHasEffectiveThumbnail({ avatar: 'https://a/b.jpg', userId: '' })).toBe(true);
  });
});

describe('resolveVenueRegularScore (VIP常連光らせの素スコア)', () => {
  it('発言0・ギフト無しは 0', () => {
    expect(resolveVenueRegularScore({ count: 0, hasGift: false })).toBe(0);
  });
  it('発言数が増えるほどスコアが上がる(単調・頭打ち)', () => {
    const a = resolveVenueRegularScore({ count: 1 });
    const b = resolveVenueRegularScore({ count: 10 });
    const c = resolveVenueRegularScore({ count: 40 });
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    // commentCap=40 で頭打ち=それ以上は伸びが鈍る(青天井でない)
    const d = resolveVenueRegularScore({ count: 400 });
    expect(d).toBeLessThanOrEqual(100);
    expect(d - c).toBeLessThan(c - b); // 伸びは逓減
  });
  it('ギフトを送ると大きく加点される(同じ発言数でも光りやすい)', () => {
    const noGift = resolveVenueRegularScore({ count: 5, hasGift: false });
    const gift = resolveVenueRegularScore({ count: 5, hasGift: true });
    expect(gift).toBeGreaterThan(noGift);
    // giftFlag は 0.30 の重み=30点ぶん
    expect(gift - noGift).toBeCloseTo(30, 0);
  });
  it('giftPoints があれば更に加点(任意・無くても成立)', () => {
    const flagOnly = resolveVenueRegularScore({ count: 5, hasGift: true });
    const withPoints = resolveVenueRegularScore({ count: 5, hasGift: true, giftPoints: 5000 });
    expect(withPoints).toBeGreaterThan(flagOnly);
  });
  it('0..100 にクランプされ・不正入力は 0', () => {
    expect(resolveVenueRegularScore(null)).toBe(0);
    expect(resolveVenueRegularScore({ count: -5, giftPoints: -100 })).toBe(0);
    expect(resolveVenueRegularScore({ count: 9999, hasGift: true, giftPoints: 9e9 })).toBeLessThanOrEqual(100);
  });
});

describe('selectVenueVipRegularKeys (相対評価=上位N人 v0.1.739)', () => {
  it('実データ相当(発言1〜5回)でも上位が必ず光る(絶対閾値で全員0になる退行の根治)', () => {
    // 実機: 名前付きは1〜5回が大多数。旧 score>=30 だと全員光らず。相対なら上位が光る。
    const participants = [
      { key: 'u:a', count: 5, hasGift: false },
      { key: 'u:b', count: 4, hasGift: false },
      { key: 'u:c', count: 3, hasGift: false },
      { key: 'u:d', count: 1, hasGift: false },
      { key: 'u:e', count: 1, hasGift: false }
    ];
    const keys = selectVenueVipRegularKeys(participants, { max: 3 });
    expect(keys.size).toBe(3); // 上位3人が光る(絶対閾値時代は0)
    expect(keys.has('u:a')).toBe(true);
    expect(keys.has('u:b')).toBe(true);
    expect(keys.has('u:c')).toBe(true);
  });
  it('ギフト送信者はスコアが高く必ず上位入り', () => {
    const participants = [
      { key: 'u:talker', count: 5, hasGift: false },
      { key: 'u:gifter', count: 1, hasGift: true }, // 1コメだがギフトで高スコア
      { key: 'u:quiet', count: 2, hasGift: false }
    ];
    const keys = selectVenueVipRegularKeys(participants, { max: 2 });
    expect(keys.has('u:gifter')).toBe(true); // ギフトは必ず
    expect(keys.has('u:talker')).toBe(true);
  });
  it('上限 max を超えては光らせない(特別感を保つ)', () => {
    const participants = Array.from({ length: 20 }, (_, i) => ({
      key: `u:${i}`,
      count: 5,
      hasGift: false
    }));
    const keys = selectVenueVipRegularKeys(participants, { max: 8 });
    expect(keys.size).toBe(8);
  });
  it('スコア降順で上位が選ばれる', () => {
    const participants = [
      { key: 'u:low', count: 1, hasGift: false },
      { key: 'u:high', count: 40, hasGift: true },
      { key: 'u:mid', count: 5, hasGift: false }
    ];
    const keys = selectVenueVipRegularKeys(participants, { max: 2 });
    expect(keys.has('u:high')).toBe(true);
    expect(keys.has('u:mid')).toBe(true);
    expect(keys.has('u:low')).toBe(false);
  });
  it('発言0・ギフト無し(score 0)は上位枠が空いていても光らない(最低バー)', () => {
    const participants = [{ key: 'u:zero', count: 0, hasGift: false }];
    expect(selectVenueVipRegularKeys(participants, { max: 8 }).size).toBe(0);
  });
  it('key の無い参加者は無視・空配列で空集合', () => {
    expect(selectVenueVipRegularKeys([]).size).toBe(0);
    expect(selectVenueVipRegularKeys([{ count: 99, hasGift: true }]).size).toBe(0);
  });
  it('既定の定数が公開されている', () => {
    expect(VENUE_VIP_REGULAR_SCORE_THRESHOLD).toBeGreaterThan(0);
    expect(VENUE_VIP_REGULAR_MAX).toBeGreaterThan(0);
  });
});

describe('venueRowsFromUserLaneCandidates が実発言数を運ぶ(VIP光らせ実機修正 v0.1.734)', () => {
  it('candidate の commentCount/giftCount が preCount/preHasGift に写り、スコアに乗る', () => {
    const candidates = [
      { userId: 'regular', nickname: '常連', avatarUrl: '', commentCount: 30, giftCount: 0, _laneSortAt: 100 },
      { userId: 'gifter', nickname: 'ギフト主', avatarUrl: '', commentCount: 2, giftCount: 3, _laneSortAt: 90 },
      { userId: 'passerby', nickname: '通りすがり', avatarUrl: '', commentCount: 1, giftCount: 0, _laneSortAt: 80 }
    ];
    const rows = venueRowsFromUserLaneCandidates(candidates);
    expect(rows[0].preCount).toBe(30);
    expect(rows[1].preHasGift).toBe(true);
    expect(rows[2].preCount).toBe(1);
    // 相対評価=上位2人。常連(30コメ)とギフト主が上位、通りすがり(1コメ)は枠外。
    const r = buildVenueSeating(rows, { isGenericName: isGeneric, vipRegularMax: 2 });
    const seatOf = (k) => r.seats.find((s) => s.participant.key === k);
    expect(seatOf('u:regular').isVipRegular).toBe(true);
    expect(seatOf('u:gifter').isVipRegular).toBe(true);
    expect(seatOf('u:passerby').isVipRegular).toBe(false);
  });
  it('回帰: candidate に commentCount が無い旧データでも壊れない(count=1 既定)', () => {
    const rows = venueRowsFromUserLaneCandidates([{ userId: 'x', nickname: 'X', _laneSortAt: 1 }]);
    expect(rows[0].preCount).toBe(1);
    expect(rows[0].preHasGift).toBe(false);
  });
});

describe('collectVenueParticipants preCount 集約', () => {
  it('preCount を出現回数の代わりに加算する(集約済み入力)', () => {
    const rows = [
      { userId: 'a', name: 'A', preCount: 12, preHasGift: false, capturedAt: 5 }
    ];
    const [p] = collectVenueParticipants(rows);
    expect(p.count).toBe(12);
    expect(p.hasGift).toBe(false);
  });
  it('生コメント経路(preCount 無し)は従来通り1ずつ数える', () => {
    const rows = [
      { userId: 'a', name: 'A', text: '1', capturedAt: 1 },
      { userId: 'a', name: 'A', text: '2', capturedAt: 2 },
      { userId: 'a', name: 'A', text: '3', isGift: true, capturedAt: 3 }
    ];
    const [p] = collectVenueParticipants(rows);
    expect(p.count).toBe(3);
    expect(p.hasGift).toBe(true);
  });
});

describe('buildVenueSeating の isVipRegular フラグ', () => {
  it('相対評価: 上位枠が埋まると下位の常連は光らない(常連>通りすがりの順位)', () => {
    const rows = [];
    // u:regular: 多発言+ギフトで最高スコア
    for (let i = 0; i < 30; i += 1) {
      rows.push({ userId: 'regular', name: '常連さん', text: `c${i}`, capturedAt: i, isGift: i === 0 });
    }
    // 中位の人を max ぶん埋めて、通りすがりが上位枠に入れない状況を作る
    for (let u = 0; u < 8; u += 1) {
      for (let i = 0; i < 5; i += 1) {
        rows.push({ userId: 'mid' + u, name: '常連' + u, text: `m${i}`, capturedAt: 50 + i });
      }
    }
    // u:quiet: 1回だけ(最下位)
    rows.push({ userId: 'quiet', name: '通りすがり', text: 'こんにちは', capturedAt: 100 });
    const r = buildVenueSeating(rows, { isGenericName: isGeneric, vipRegularMax: 8 });
    const regularSeat = r.seats.find((s) => s.participant.key === 'u:regular');
    const quietSeat = r.seats.find((s) => s.participant.key === 'u:quiet');
    expect(regularSeat.isVipRegular).toBe(true); // 最高スコア=必ず光る
    expect(quietSeat.isVipRegular).toBe(false); // 上位8枠が埋まり光らない
  });
  it('vipRegular:false で全席 false(無効化・後方互換)', () => {
    const rows = [];
    for (let i = 0; i < 30; i += 1) {
      rows.push({ userId: 'regular', name: '常連', text: `c${i}`, capturedAt: i, isGift: true });
    }
    const r = buildVenueSeating(rows, { isGenericName: isGeneric, vipRegular: false });
    expect(r.seats.every((s) => s.isVipRegular === false)).toBe(true);
  });
});

describe('countAnonymousParticipants', () => {
  it('userIdのない匿名のみカウントする(userIdありはアリーナ座席へ)', () => {
    const rows = [
      { name: '匿名', text: '1' }, // userIdなし
      { userId: 'x', name: '匿名', text: '2' }, // アリーナへ
      { userId: 'y', name: '匿名', text: '3' }, // アリーナへ
      { userId: 'a', name: 'A', text: '4' } // アリーナへ
    ];
    expect(countAnonymousParticipants(rows, isGeneric)).toBe(1);
  });
  it('userId 無し匿名は最大1人ぶんだけ加える(水増ししない)', () => {
    const rows = [
      { name: '匿名', text: '1' },
      { name: '名無し', text: '2' },
      { text: '3' }
    ];
    expect(countAnonymousParticipants(rows, isGeneric)).toBe(1);
  });
  it('userIdのない匿名も n:匿名 としてキーを持ち、1つの席を共有する', () => {
    const rows = [
      { name: '匿名', text: 'x', capturedAt: 1 }, // userIdなし。キーは n:匿名 になる
      { userId: 'a:1', name: '', text: 'y', capturedAt: 2 } // u:a:1 になる
    ];
    // どちらもアリーナに座るので、匿名のみカウントの処理(countAnonymousParticipants)からは除外されるべき？
    // いや、countAnonymousParticipants は venueParticipantKey が無い人を数える関数だった。
    // 今回 venueParticipantKey が n:匿名 を返すようになったので、countは0になる。
    const count = countAnonymousParticipants(rows);
    expect(count).toBe(0);
  });
});

describe('collectVenueParticipants', () => {
  it('同一参加者をまとめ最終発言と発言数を集計する', () => {
    const rows = [
      { userId: 'a', name: 'A', text: 'おはよう', capturedAt: 100 },
      { userId: 'a', name: 'A', text: 'こんにちは', capturedAt: 300 },
      { userId: 'b', name: 'B', text: 'やあ', capturedAt: 200 }
    ];
    const ps = collectVenueParticipants(rows);
    expect(ps).toHaveLength(2);
    const a = ps.find((p) => p.key === 'u:a');
    expect(a.count).toBe(2);
    expect(a.lastText).toBe('こんにちは');
    expect(a.lastAt).toBe(300);
  });

  it('ギフトフラグを保持する', () => {
    const rows = [
      { userId: 'a', name: 'A', text: 'ギフト!', capturedAt: 100, isGift: true }
    ];
    expect(collectVenueParticipants(rows)[0].hasGift).toBe(true);
  });

  it('userIdが無い匿名(汎用名)はアリーナ参加者から除外する', () => {
    const rows = [
      { name: '匿名', text: 'x', capturedAt: 1 }, // userIdなし
      { userId: 'b', name: '匿名', text: 'z', capturedAt: 3 }, // userIdあり=アリーナへ
      { userId: 'a', name: 'A', text: 'y', capturedAt: 2 }
    ];
    const ps = collectVenueParticipants(rows, { isGenericName: isGeneric });
    expect(ps).toHaveLength(2); // a と b
    expect(ps.map(p => p.key).sort()).toEqual(['u:a', 'u:b']);
  });

  it('初出順を保つ', () => {
    const rows = [
      { userId: 'b', name: 'B', text: '1', capturedAt: 10 },
      { userId: 'a', name: 'A', text: '2', capturedAt: 20 }
    ];
    expect(collectVenueParticipants(rows).map((p) => p.key)).toEqual(['u:b', 'u:a']);
  });
});

describe('collectAudienceFaceUserIds', () => {
  it('userIdの無い匿名のみ顔つき観客として処理される(通常は総数のみ)', () => {
    const rows = [
      { userId: 'a:1', name: '匿名', text: 'x', capturedAt: 10 }, // アリーナへ
      { userId: 'a:2', name: '', text: 'y', capturedAt: 20 },     // アリーナへ
      { name: '匿名', text: 'z', capturedAt: 30 }                 // 観客へ
    ];
    // excludeKeys は空とみなされるので、キーを持つ人は除外されない(フォールバック挙動)が、ここではキーを持つかテスト
    const r = collectAudienceFaceUserIds(rows, { isGenericName: isGeneric });
    // すべてアリーナなので観客は 0 人になるが、古い挙動では userId なしが1人
    expect(r.faceUserIds).toEqual([]);
    expect(r.totalAnonymous).toBe(1);
  });

  it('あふれた人は観客席に落ちて顔を出す', () => {
    const rows = [];
    for (let i = 0; i < 10; i++) {
      rows.push({ userId: `a:${i}`, name: '', text: 'c', capturedAt: i });
    }
    const excludeKeys = new Set(['u:a:0', 'u:a:1']); // 2人だけアリーナ
    const r = collectAudienceFaceUserIds(rows, { max: 3, excludeKeys });
    expect(r.faceUserIds).toEqual(['a:9', 'a:8', 'a:7']); // 直近3人(あふれた8人のうち)
    expect(r.totalAnonymous).toBe(8); // あふれた総数
  });

  it('userId なし匿名は総数に1だけ加える(顔は出さない)', () => {
    const rows = [
      { name: '匿名', text: 'x', capturedAt: 1 }, // userIdなしなので観客へ。だが顔は出さない。
      { userId: 'a:1', name: '', text: 'y', capturedAt: 2 } // アリーナへ座るので観客から除外される。
    ];
    const r = collectAudienceFaceUserIds(rows, { isGenericName: isGeneric });
    expect(r.faceUserIds).toEqual([]); // a:1 はアリーナへ行くので観客席に顔は出ない
    expect(r.totalAnonymous).toBe(1); // アリーナのa:1は含まれず、userIdなしの匿名が1人
  });

  it('既定 cap 定数', () => {
    expect(VENUE_AUDIENCE_FACE_MAX).toBe(120);
  });
});

describe('resolveVenueLayoutMode', () => {
  it('人数でモードが切り替わる(empty/vip/normal/packed)', () => {
    expect(resolveVenueLayoutMode(0)).toBe('empty');
    expect(resolveVenueLayoutMode(1)).toBe('vip');
    expect(resolveVenueLayoutMode(8)).toBe('vip');
    expect(resolveVenueLayoutMode(9)).toBe('normal');
    expect(resolveVenueLayoutMode(30)).toBe('normal');
    expect(resolveVenueLayoutMode(31)).toBe('packed');
    expect(resolveVenueLayoutMode(150)).toBe('packed');
  });
  it('不正値は empty に丸める', () => {
    expect(resolveVenueLayoutMode(-3)).toBe('empty');
    expect(resolveVenueLayoutMode(NaN)).toBe('empty');
  });
});

describe('rankVenueParticipants', () => {
  it('全員1回発言・サムネなしは最終発言が新しい順(④ライブ層)', () => {
    const ps = [
      { key: 'u:a', avatar: '', lastAt: 300, count: 1, hasGift: false },
      { key: 'u:b', avatar: '', lastAt: 100, count: 1, hasGift: true },
      { key: 'u:c', avatar: '', lastAt: 200, count: 1, hasGift: false }
    ];
    // sticky/サムネ/常連(count>=2) いずれも該当なし → 全員④で lastAt 降順。
    expect(rankVenueParticipants(ps).map((p) => p.key)).toEqual(['u:a', 'u:c', 'u:b']);
  });

  it('v0.1.790: 一度座った人(prevSeatByKey)は黙っても降ろさない(満席維持)', () => {
    // cap=2。前回 u:a(席0)/u:b(席1) が座っていた。今回 u:c が新しくしゃべった(lastAt 最新)。
    // 旧実装は「最近順」で u:c が u:b(古い)を押し出して減らした。新実装は sticky 最優先で
    // u:a/u:b が残り、満席の u:c は座れない(=常連が新着に押し出されない)。
    const ps = [
      { key: 'u:a', avatar: '', lastAt: 100, count: 1, hasGift: false },
      { key: 'u:b', avatar: '', lastAt: 90, count: 1, hasGift: false },
      { key: 'u:c', avatar: '', lastAt: 999, count: 1, hasGift: false } // 今しゃべった新規
    ];
    const prev = new Map([['u:a', 0], ['u:b', 1]]);
    const ranked = rankVenueParticipants(ps, 2, prev);
    expect(ranked.map((p) => p.key).sort()).toEqual(['u:a', 'u:b']);
  });

  it('v0.1.790: 空席があれば新着も座る(満席でない限り締め出さない)', () => {
    const ps = [
      { key: 'u:a', avatar: '', lastAt: 100, count: 1, hasGift: false },
      { key: 'u:c', avatar: '', lastAt: 999, count: 1, hasGift: false }
    ];
    const prev = new Map([['u:a', 0]]); // 1人だけ前回着席・cap=3 で空席あり
    const ranked = rankVenueParticipants(ps, 3, prev);
    expect(ranked.map((p) => p.key).sort()).toEqual(['u:a', 'u:c']);
  });

  it('実サムネ持ちは発言が古くても常連枠で残る(②サムネ層)', () => {
    const ps = [
      { key: 'u:a', avatar: '', lastAt: 999, count: 1, hasGift: true }, // 匿名・今しゃべった
      { key: 'u:b', avatar: 'https://example.com/b.png', lastAt: 1, count: 1, hasGift: false } // 顔出し・古い
    ];
    // cap=1 でも顔出し u:b が残る(②が④より上)。
    expect(rankVenueParticipants(ps, 1).map((p) => p.key)).toEqual(['u:b']);
  });

  it('発言数が多い常連は黙っても残る(③常連層が④ライブ層より上)', () => {
    const ps = [
      { key: 'u:regular', avatar: '', lastAt: 1, count: 50, hasGift: false }, // 常連・今は黙ってる
      { key: 'u:newbie', avatar: '', lastAt: 999, count: 1, hasGift: false } // 新規・今しゃべった
    ];
    // cap=1。常連 u:regular(count>=2) が③で先に確保され、新規は④止まりで席に入れない。
    expect(rankVenueParticipants(ps, 1).map((p) => p.key)).toEqual(['u:regular']);
  });

  it('サムネ持ち同士は発言数の多い順→最近順', () => {
    const ps = [
      { key: 'u:a', avatar: 'https://e/a.png', lastAt: 300, count: 1, hasGift: false },
      { key: 'u:b', avatar: 'https://e/b.png', lastAt: 100, count: 5, hasGift: true },
      { key: 'u:c', avatar: 'https://e/c.png', lastAt: 200, count: 1, hasGift: false }
    ];
    // 発言数最多の u:b が先頭。残り同数(count1)は lastAt 降順で u:a→u:c。
    expect(rankVenueParticipants(ps).map((p) => p.key)).toEqual(['u:b', 'u:a', 'u:c']);
  });
});

describe('hasRealThumbnail', () => {
  it('http(s) URL は実サムネ', () => {
    expect(hasRealThumbnail('https://example.com/a.png')).toBe(true);
    expect(hasRealThumbnail('http://example.com/a.png')).toBe(true);
    expect(hasRealThumbnail('HTTPS://EXAMPLE.COM/A.PNG')).toBe(true);
  });
  it('空 / data: / blob: / 相対パスは実サムネではない', () => {
    expect(hasRealThumbnail('')).toBe(false);
    expect(hasRealThumbnail('data:image/png;base64,AAAA')).toBe(false);
    expect(hasRealThumbnail('blob:https://example.com/x')).toBe(false);
    expect(hasRealThumbnail('/img/a.png')).toBe(false);
    expect(hasRealThumbnail(null)).toBe(false);
    expect(hasRealThumbnail(undefined)).toBe(false);
  });
});

describe('assignVenueSeats', () => {
  it('前回の席を維持する(同じ人=同じ席=吹き出しが飛ばない)', () => {
    const ranked = [
      { key: 'u:a', lastAt: 300, count: 1, hasGift: false },
      { key: 'u:b', lastAt: 200, count: 1, hasGift: false }
    ];
    const prev = new Map([['u:a', 5], ['u:b', 2]]);
    const { seatByKey } = assignVenueSeats(ranked, prev, 50);
    expect(seatByKey.get('u:a')).toBe(5);
    expect(seatByKey.get('u:b')).toBe(2);
  });

  it('降りた人の席を新規参加者が埋める(入れ替え)', () => {
    // 前回 u:a が席0、u:b が席1。今回 u:a が降り u:c が新規参加。
    const ranked = [
      { key: 'u:b', lastAt: 300, count: 1, hasGift: false },
      { key: 'u:c', lastAt: 200, count: 1, hasGift: false }
    ];
    const prev = new Map([['u:a', 0], ['u:b', 1]]);
    const { seatByKey } = assignVenueSeats(ranked, prev, 50);
    expect(seatByKey.get('u:b')).toBe(1); // 維持
    expect(seatByKey.get('u:c')).toBe(0); // 空いた席0を埋める
  });

  it('frontRow 予約: 匿名の前列 prev を破棄し実サムネ持ちに前列を譲る', () => {
    // 前回、匿名 anon が前列席0を占有。今回 ランク上位の実サムネ持ち real が登場。
    const ranked = [
      { key: 'real', avatar: 'https://e/r.png', lastAt: 100, count: 1, hasGift: false },
      { key: 'anon', avatar: '', lastAt: 90, count: 1, hasGift: false }
    ];
    const prev = new Map([['anon', 0]]); // 匿名が前列席0 を prev で持っている
    const { seatByKey } = assignVenueSeats(ranked, prev, 50, 1); // frontRow=1
    // 匿名の前列 prev(0)は破棄され、実サムネ持ちが前列席0 を取る。
    expect(seatByKey.get('real')).toBe(0);
    // 匿名はアリーナに残るが後列(>= frontRow=1)へ。
    expect(seatByKey.get('anon')).toBeGreaterThanOrEqual(1);
  });

  it('frontRow 予約: 実サムネ持ちの前列 prev は維持される(飛ばさない)', () => {
    const ranked = [
      { key: 'real', avatar: 'https://e/r.png', lastAt: 100, count: 1, hasGift: false }
    ];
    const prev = new Map([['real', 0]]);
    const { seatByKey } = assignVenueSeats(ranked, prev, 50, 5);
    expect(seatByKey.get('real')).toBe(0); // 実サムネ持ちの前列は維持
  });

  it('frontRow=0 なら従来挙動(予約なし・匿名も前列 prev 維持)', () => {
    const ranked = [{ key: 'anon', avatar: '', lastAt: 1, count: 1, hasGift: false }];
    const prev = new Map([['anon', 0]]);
    const { seatByKey } = assignVenueSeats(ranked, prev, 50, 0);
    expect(seatByKey.get('anon')).toBe(0); // frontRow=0 なら破棄しない
  });

  it('席は昇順で返る', () => {
    const ranked = [
      { key: 'u:a', lastAt: 1, count: 1, hasGift: false },
      { key: 'u:b', lastAt: 1, count: 1, hasGift: false }
    ];
    const prev = new Map([['u:a', 3], ['u:b', 1]]);
    const { seats } = assignVenueSeats(ranked, prev, 50);
    expect(seats.map((s) => s.seatIndex)).toEqual([1, 3]);
  });

  it('prev が範囲外/重複でも安全に再割り当てする', () => {
    const ranked = [
      { key: 'u:a', lastAt: 1, count: 1, hasGift: false },
      { key: 'u:b', lastAt: 1, count: 1, hasGift: false }
    ];
    // u:a の前回席が cap 超過(99)→無視して空き席を割り当て
    const prev = new Map([['u:a', 99], ['u:b', 0]]);
    const { seatByKey } = assignVenueSeats(ranked, prev, 3);
    expect(seatByKey.get('u:b')).toBe(0);
    expect(seatByKey.get('u:a')).toBe(1);
  });
});

describe('buildVenueSeating', () => {
  it('発言行から席割りまで一気通貫し前列フラグを付ける(実サムネ持ちが前列)', () => {
    // 2026-06-14 方針「サムネ持ちを前列に優先」: 実サムネ(http)持ちを前列、匿名は後列。
    const rows = [];
    for (let i = 0; i < 25; i++) {
      // 偶数番だけ実サムネ(http avatar)を持たせる → 13人が前列候補。
      const avatar = i % 2 === 0 ? `https://example.com/a${i}.png` : '';
      rows.push({ userId: `u${i}`, name: `U${i}`, avatar, text: `c${i}`, capturedAt: i });
    }
    const { seats, participantCount } = buildVenueSeating(rows, { frontRowSeats: 20 });
    expect(participantCount).toBe(25);
    expect(seats).toHaveLength(25);
    // 実サムネ持ち13人 ≤ frontRow(20) なので全員前列、匿名12人は後列に流れる。
    const front = seats.filter((s) => s.isFrontRow);
    const back = seats.filter((s) => !s.isFrontRow);
    expect(front).toHaveLength(13);
    expect(back).toHaveLength(12);
    // 前列は全員実サムネ持ち、後列は全員匿名(実サムネなし)であること。
    expect(front.every((s) => /^https?:\/\//.test(s.participant.avatar))).toBe(true);
    expect(back.every((s) => !/^https?:\/\//.test(s.participant.avatar))).toBe(true);
  });

  it('実サムネ持ちが前列、匿名はアリーナに残るが後列へ(満員感を保つ)', () => {
    const rows = [
      { userId: 'anon1', name: '匿名1', avatar: '', text: 'x', capturedAt: 1 },
      { userId: 'anon2', name: '匿名2', avatar: '', text: 'y', capturedAt: 2 },
      { userId: 'real1', name: 'リアル', avatar: 'https://example.com/r.png', text: 'z', capturedAt: 3 }
    ];
    const { seats } = buildVenueSeating(rows, { frontRowSeats: 1 });
    const realSeat = seats.find((s) => s.participant.userId === 'real1');
    // 実サムネ持ちは前列(seatIndex < frontRow=1 → seatIndex 0)。
    expect(realSeat.seatIndex).toBe(0);
    expect(realSeat.isFrontRow).toBe(true);
    // 匿名2人はアリーナに残る(=席を持つ)が後列。
    expect(seats).toHaveLength(3);
    expect(seats.filter((s) => !s.isFrontRow)).toHaveLength(2);
  });

  it('seatByKey を次回入力に渡すと席が安定する', () => {
    const rows1 = [
      { userId: 'a', name: 'A', text: '1', capturedAt: 10 },
      { userId: 'b', name: 'B', text: '2', capturedAt: 20 }
    ];
    const r1 = buildVenueSeating(rows1);
    const seatA = r1.seatByKey.get('u:a');
    // 次フレーム: A がさらに発言(席は変わらないはず)
    const rows2 = [...rows1, { userId: 'a', name: 'A', text: '3', capturedAt: 30 }];
    const r2 = buildVenueSeating(rows2, { prevSeatByKey: r1.seatByKey });
    expect(r2.seatByKey.get('u:a')).toBe(seatA);
  });

  it('名前あり・userIdあり匿名はアリーナ席・userId無し匿名は anonymousCount に分離する', () => {
    const rows = [
      { userId: 'a', name: 'A', text: '1', capturedAt: 10 },
      { userId: 'x', name: '匿名', text: '2', capturedAt: 20 },
      { name: '匿名', text: '3', capturedAt: 30 } // userId無し
    ];
    const r = buildVenueSeating(rows, { isGenericName: isGeneric });
    expect(r.seats).toHaveLength(2); // アリーナは A と x
    expect(r.participantCount).toBe(2);
    expect(r.anonymousCount).toBe(1); // 匿名1人(userId無し)
  });

  it('既定の上限と前列定数', () => {
    expect(VENUE_MAX_SEATS).toBe(50);
    expect(VENUE_FRONT_ROW_SEATS).toBe(20);
    // 2026-06-22 会場「全員500人」(council/venue-all-faces-500): 旧150 では大規模配信で大半が
    //   点描逃げ=「全員出ない」核だったため 500 に引き上げ(段数 maxRows・DOMプール・縦スクロールと整合)。
    expect(VENUE_FULLSCREEN_MAX_SEATS).toBe(500);
  });
});

describe('venueRowsFromUserLaneCandidates', () => {
  it('userLane集計の出力を会場行へ変換する(名前ありはアリーナ・匿名は観客)', () => {
    const candidates = [
      { userId: '100', nickname: 'たろう', avatarUrl: 'https://x/a.png', _laneSortAt: 300 },
      { userId: '200', nickname: '', avatarUrl: 'https://x/b.png', _laneSortAt: 200 }, // 匿名(名前なし)
      { userId: '', nickname: 'ゴースト', _laneSortAt: 100 } // userId 無し=除外
    ];
    const rows = venueRowsFromUserLaneCandidates(candidates);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ userId: '100', name: 'たろう', avatar: 'https://x/a.png', capturedAt: 300 });
    expect(rows[1]).toMatchObject({ userId: '200', name: '', capturedAt: 200 });

    // 会場席に流すと: userIdありはアリーナ、userIdなしは観客に分離される
    const seating = buildVenueSeating(rows, { maxSeats: VENUE_FULLSCREEN_MAX_SEATS });
    expect(seating.participantCount).toBe(2); // たろう と userId 200 の匿名
    expect(seating.anonymousCount).toBe(0);
  });

  it('非配列や不正要素を安全に無視する', () => {
    expect(venueRowsFromUserLaneCandidates(null)).toEqual([]);
    expect(venueRowsFromUserLaneCandidates([null, {}, { userId: ' ' }])).toEqual([]);
  });
});

describe('resolveVenueTierMinScale', () => {
  it('人数が増えるほど最奥段が小さく密に(満席感)', () => {
    expect(resolveVenueTierMinScale(10)).toBe(0.62);
    expect(resolveVenueTierMinScale(16)).toBe(0.62);
    expect(resolveVenueTierMinScale(64)).toBe(0.58);
    expect(resolveVenueTierMinScale(150)).toBe(0.54);
    expect(resolveVenueTierMinScale(405)).toBe(0.5);
  });
  it('下限 0.50 を割らない(顔が潰れすぎない)', () => {
    expect(resolveVenueTierMinScale(99999)).toBe(0.5);
  });
});

describe('buildVenueTiers', () => {
  it('0人は空', () => {
    expect(buildVenueTiers(0)).toEqual([]);
  });

  it('少人数(<=8)は1段・手前スケール1.0', () => {
    const t = buildVenueTiers(5);
    expect(t).toHaveLength(1);
    expect(t[0].count).toBe(5);
    expect(t[0].scale).toBe(1);
    expect(t[0].depth).toBe(0);
  });

  it('人数が増えると段数が増える(最大8段・2026-06-14 満席感で6→8)', () => {
    expect(buildVenueTiers(8)).toHaveLength(1);
    expect(buildVenueTiers(16)).toHaveLength(2);
    expect(buildVenueTiers(30)).toHaveLength(3);
    expect(buildVenueTiers(50)).toHaveLength(4);
    expect(buildVenueTiers(88)).toHaveLength(5);
    expect(buildVenueTiers(128)).toHaveLength(6); // <= 8*16
    expect(buildVenueTiers(170)).toHaveLength(7); // <= 8*22
    expect(buildVenueTiers(300)).toHaveLength(8); // それ超は8段
  });

  it('全段の合計人数が入力と一致する(取りこぼし/水増しなし)', () => {
    for (const n of [3, 9, 17, 31, 55, 99, 150]) {
      const total = buildVenueTiers(n).reduce((a, t) => a + t.count, 0);
      expect(total).toBe(n);
    }
  });

  it('maxPerRow: どの段も上限を超えない(横はみ出し=見切れ防止 v0.1.737)', () => {
    // 実機: 75席を maxPerRow なしだと後段が20席になり横溢れ→overflow-x:hidden で見切れていた。
    for (const [n, perRow] of [[75, 12], [40, 10], [150, 14], [96, 13]]) {
      const tiers = buildVenueTiers(n, { maxPerRow: perRow });
      const counts = tiers.map((t) => t.count);
      expect(Math.max(...counts)).toBeLessThanOrEqual(perRow);
      // 8段×perRow に収まる人数なら取りこぼし無し
      if (n <= 8 * perRow) {
        expect(counts.reduce((a, b) => a + b, 0)).toBe(n);
      }
    }
  });

  it('maxPerRow 無し(既定)は従来通り後段が広がる(後方互換)', () => {
    const tiers = buildVenueTiers(75);
    const counts = tiers.map((t) => t.count);
    // 既定では最後段が前段より多い(横幅は呼び出し側が面倒見る前提の旧挙動)
    expect(Math.max(...counts)).toBeGreaterThan(12);
  });

  it('手前ほど大きく奥ほど小さい(scaleが単調減少)', () => {
    const t = buildVenueTiers(30);
    for (let i = 1; i < t.length; i += 1) {
      expect(t[i].scale).toBeLessThan(t[i - 1].scale);
    }
    // 最奥は人数連動 minScale(30人 → 0.58)。明示 minScale を渡せば従来値も使える。
    expect(t[t.length - 1].scale).toBeCloseTo(0.58, 5);
    const t62 = buildVenueTiers(30, { minScale: 0.62 });
    expect(t62[t62.length - 1].scale).toBeCloseTo(0.62, 5);
  });

  it('奥の段ほど横に広い(後方客席が広がる)', () => {
    const t = buildVenueTiers(30);
    // 前列より最奥のほうが席数が多い(重み +25%/段)
    expect(t[t.length - 1].count).toBeGreaterThanOrEqual(t[0].count);
  });

  it('minScale を指定できる', () => {
    const t = buildVenueTiers(30, { minScale: 0.4 });
    expect(t[t.length - 1].scale).toBeCloseTo(0.4, 5);
  });

  // 2026-06-22 会場「全員500人」(council/venue-all-faces-500)
  it('maxRows 既定(8)は従来どおり最大8段で頭打ち(後方互換)', () => {
    expect(buildVenueTiers(300).length).toBeLessThanOrEqual(8);
    expect(buildVenueTiers(300, { maxPerRow: 10 }).length).toBeLessThanOrEqual(8);
  });

  it('maxRows>8 を渡すと8段を超えて全員ぶん段を積む(縦スクロール用・取りこぼしなし)', () => {
    // maxPerRow あり: 500人を perRow=14 で全員収めるには ceil(500/14)=36 段必要。
    const withPerRow = buildVenueTiers(500, { maxPerRow: 14, maxRows: 40 });
    expect(withPerRow.length).toBeGreaterThan(8);
    expect(withPerRow.length).toBeLessThanOrEqual(40);
    const counts = withPerRow.map((t) => t.count);
    expect(Math.max(...counts)).toBeLessThanOrEqual(14); // 横はみ出さない
    expect(counts.reduce((a, b) => a + b, 0)).toBe(500); // 全員ぶん取りこぼしなし

    // maxPerRow 無しでも maxRows>8 なら frontMax 基準で段を伸ばす。
    const noPerRow = buildVenueTiers(500, { maxRows: 40 });
    expect(noPerRow.length).toBeGreaterThan(8);
    expect(noPerRow.reduce((a, t) => a + t.count, 0)).toBe(500);
  });

  it('maxRows>8 でも段数は maxRows と必要数の小さい方で頭打ち', () => {
    // 500人を perRow=14 だと36段必要だが maxRows=12 で頭打ち=12段まで。
    const capped = buildVenueTiers(500, { maxPerRow: 14, maxRows: 12 });
    expect(capped.length).toBe(12);
  });
});
