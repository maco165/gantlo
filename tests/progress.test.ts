import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_GOAL_XP,
  MAX_IMPORT_BYTES,
  STORAGE_KEY,
  completeLesson,
  completeReview,
  currentStreak,
  dayKey,
  dueReviewIds,
  emptyProgress,
  exportFileName,
  goalXp,
  isValidDay,
  loadProgress,
  parseImport,
  parseProgressText,
  recordAnswer,
  replaceWithImported,
  resetProgress,
  saveProgress,
  setProfile,
  todayXp,
  upcomingReview,
} from '../src/lib/progress';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

const at = (day: string, hour = 9) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`);
const score = { correct: 4, total: 5 };

describe('completeLesson', () => {
  it('レッスンを終えると完了と最高の正答率が残る', () => {
    let p = completeLesson(emptyProgress(), 'main-w1-l1', score, 12, at('2026-11-23'));
    expect(p.lessons['main-w1-l1']).toMatchObject({ done: true, best: 0.8 });
    p = completeLesson(p, 'main-w1-l1', { correct: 2, total: 5 }, 6, at('2026-11-23', 10));
    expect(p.lessons['main-w1-l1'].best).toBe(0.8);
    p = completeLesson(p, 'main-w1-l1', { correct: 5, total: 5 }, 15, at('2026-11-23', 11));
    expect(p.lessons['main-w1-l1'].best).toBe(1);
  });

  it('同じ日に続けても連続日数は増えない', () => {
    let p = completeLesson(emptyProgress(), 'main-w1-l1', score, 12, at('2026-11-23', 9));
    p = completeLesson(p, 'main-w1-l2', score, 12, at('2026-11-23', 21));
    expect(p.streak).toEqual({ count: 1, lastDay: '2026-11-23' });
  });

  it('翌日に解くと 1 増え、1 日空くと 1 に戻る', () => {
    let p = completeLesson(emptyProgress(), 'main-w1-l1', score, 12, at('2026-11-23'));
    p = completeLesson(p, 'main-w1-l2', score, 12, at('2026-11-24'));
    expect(p.streak.count).toBe(2);
    p = completeLesson(p, 'main-w1-l3', score, 12, at('2026-11-26'));
    expect(p.streak.count).toBe(1);
  });

  it('月をまたいでも翌日として数える', () => {
    let p = completeLesson(emptyProgress(), 'main-w1-l1', score, 12, at('2026-11-30'));
    p = completeLesson(p, 'main-w1-l2', score, 12, at('2026-12-01'));
    expect(p.streak.count).toBe(2);
  });

  it('XP は日付ごとに足される', () => {
    let p = completeLesson(emptyProgress(), 'main-w1-l1', score, 12, at('2026-11-23', 9));
    p = completeLesson(p, 'main-w1-l2', score, 9, at('2026-11-23', 22));
    p = completeLesson(p, 'main-w1-l3', score, 15, at('2026-11-24', 8));
    expect(p.xp.byDay).toEqual({ '2026-11-23': 21, '2026-11-24': 15 });
    expect(p.xp.total).toBe(36);
    expect(todayXp(p, at('2026-11-24', 23))).toBe(15);
  });
});

describe('currentStreak', () => {
  it('今日か昨日に学んでいれば続いている。2 日以上空くと 0', () => {
    const p = completeLesson(emptyProgress(), 'main-w1-l1', score, 12, at('2026-11-23'));
    expect(currentStreak(p, at('2026-11-23', 23))).toBe(1);
    expect(currentStreak(p, at('2026-11-24', 23))).toBe(1);
    expect(currentStreak(p, at('2026-11-25'))).toBe(0);
  });
});

describe('recordAnswer: 正誤の回数', () => {
  it('問題ごとに正解と不正解の回数を数える', () => {
    let p = recordAnswer(emptyProgress(), 'q', false, at('2026-11-23'));
    p = recordAnswer(p, 'q', true, at('2026-11-24'));
    p = recordAnswer(p, 'q', true, at('2026-11-24', 10));
    expect(p.answers.q).toMatchObject({ right: 2, wrong: 1 });
  });
});

describe('復習の予定 (1・3・7 日後)', () => {
  const q = 'main-w1-l1-q1';

  it('初めてで正解した問題は、復習に入らない', () => {
    const p = recordAnswer(emptyProgress(), q, true, at('2026-11-23'));
    expect(p.answers[q].nextReview).toBeUndefined();
    expect(dueReviewIds(p, at('2026-12-31'))).toEqual([]);
  });

  it('間違えると翌日。予定日以降の正解で +3 日・+7 日、7 日後も正解したら卒業', () => {
    let p = recordAnswer(emptyProgress(), q, false, at('2026-11-23'));
    expect(p.answers[q]).toMatchObject({ stage: 0, nextReview: '2026-11-24' });
    expect(dueReviewIds(p, at('2026-11-23', 23))).toEqual([]);
    expect(dueReviewIds(p, at('2026-11-24', 0))).toEqual([q]);
    p = recordAnswer(p, q, true, at('2026-11-24'));
    expect(p.answers[q]).toMatchObject({ stage: 1, nextReview: '2026-11-27' });
    p = recordAnswer(p, q, true, at('2026-11-27'));
    expect(p.answers[q]).toMatchObject({ stage: 2, nextReview: '2026-12-04' });
    p = recordAnswer(p, q, true, at('2026-12-04'));
    expect(p.answers[q].nextReview).toBeUndefined();
    expect(p.answers[q].stage).toBeUndefined();
    expect(dueReviewIds(p, at('2027-01-01'))).toEqual([]);
  });

  it('予定日を過ぎてから正解しても、正解した日から数えて間を空ける', () => {
    let p = recordAnswer(emptyProgress(), q, false, at('2026-11-23'));
    p = recordAnswer(p, q, true, at('2026-11-26'));
    expect(p.answers[q]).toMatchObject({ stage: 1, nextReview: '2026-11-29' });
  });

  it('予定日より前の正解は、段階も予定日も据え置く', () => {
    let p = recordAnswer(emptyProgress(), q, false, at('2026-11-23', 9));
    p = recordAnswer(p, q, true, at('2026-11-23', 10));
    expect(p.answers[q]).toMatchObject({ stage: 0, nextReview: '2026-11-24' });
    p = recordAnswer(p, q, true, at('2026-11-24'));
    p = recordAnswer(p, q, true, at('2026-11-26'));
    expect(p.answers[q]).toMatchObject({ stage: 1, nextReview: '2026-11-27' });
  });

  it('復習の途中で間違えたら、翌日の段階 0 に戻す', () => {
    let p = recordAnswer(emptyProgress(), q, false, at('2026-11-23'));
    p = recordAnswer(p, q, true, at('2026-11-24'));
    p = recordAnswer(p, q, true, at('2026-11-27'));
    p = recordAnswer(p, q, false, at('2026-12-04'));
    expect(p.answers[q]).toMatchObject({ stage: 0, nextReview: '2026-12-05' });
  });

  it('月と年をまたいでも暦どおりに数える', () => {
    let p = recordAnswer(emptyProgress(), q, false, at('2026-12-31'));
    expect(p.answers[q].nextReview).toBe('2027-01-01');
    p = recordAnswer(p, q, true, at('2027-01-01'));
    expect(p.answers[q].nextReview).toBe('2027-01-04');
    p = recordAnswer(emptyProgress(), q, false, at('2028-02-28'));
    expect(p.answers[q].nextReview).toBe('2028-02-29');
  });

  it('予定を過ぎた分も今日の復習に入り、早い順 (同じ日は id の順) に並ぶ', () => {
    let p = recordAnswer(emptyProgress(), 'c', false, at('2026-11-25'));
    p = recordAnswer(p, 'b', false, at('2026-11-23'));
    p = recordAnswer(p, 'a', false, at('2026-11-25'));
    expect(dueReviewIds(p, at('2026-11-30'))).toEqual(['b', 'a', 'c']);
  });

  it('次の予定の日と件数。問題データに無い id は数えない', () => {
    let p = recordAnswer(emptyProgress(), 'a', false, at('2026-11-23'));
    p = recordAnswer(p, 'b', false, at('2026-11-23'));
    expect(upcomingReview(p, at('2026-11-23'))).toEqual({ day: '2026-11-24', count: 2 });
    expect(upcomingReview(p, at('2026-11-23'), (id) => id === 'a')).toEqual({ day: '2026-11-24', count: 1 });
    expect(upcomingReview(p, at('2026-11-24'))).toBeNull();
    expect(upcomingReview(emptyProgress(), at('2026-11-23'))).toBeNull();
  });

  it('復習を終えると XP が入り連続日数が進むが、レッスンの完了は付かない', () => {
    const p = completeReview(emptyProgress(), 6, at('2026-11-24'));
    expect(p.xp).toEqual({ total: 6, byDay: { '2026-11-24': 6 } });
    expect(p.streak).toEqual({ count: 1, lastDay: '2026-11-24' });
    expect(p.lessons).toEqual({});
  });
});

describe('日付は利用者の手元の日付で数える (時差で 1 日ずれない)', () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });
  const q = 'main-w1-l1-q1';

  it('東京の 0 時 30 分 (UTC では前の日) に間違えると、東京の翌日に復習する', () => {
    process.env.TZ = 'Asia/Tokyo';
    const now = new Date('2026-11-23T15:30:00Z'); // 東京では 2026-11-24 00:30
    expect(now.toISOString().slice(0, 10)).toBe('2026-11-23');
    expect(dayKey(now)).toBe('2026-11-24');
    const p = recordAnswer(emptyProgress(), q, false, now);
    expect(p.answers[q].nextReview).toBe('2026-11-25');
    expect(dueReviewIds(p, new Date('2026-11-24T14:59:00Z'))).toEqual([]); // 東京 11-24 23:59
    expect(dueReviewIds(p, new Date('2026-11-24T15:00:00Z'))).toEqual([q]); // 東京 11-25 00:00
    expect(exportFileName(now)).toBe('gantlo-progress-2026-11-24.json');
  });

  it('ロサンゼルスの 22 時 30 分 (UTC では次の日) に間違えると、ロサンゼルスの翌日に復習する', () => {
    process.env.TZ = 'America/Los_Angeles';
    const now = new Date('2026-11-24T06:30:00Z'); // ロサンゼルスでは 2026-11-23 22:30
    expect(now.toISOString().slice(0, 10)).toBe('2026-11-24');
    const p = recordAnswer(emptyProgress(), q, false, now);
    expect(p.answers[q].nextReview).toBe('2026-11-24');
    expect(dueReviewIds(p, new Date('2026-11-24T07:59:00Z'))).toEqual([]); // ロサンゼルス 11-23 23:59
    expect(dueReviewIds(p, new Date('2026-11-24T08:00:00Z'))).toEqual([q]); // ロサンゼルス 11-24 00:00
    // 今日の XP と連続日数も手元の日付で数える
    const done = completeReview(p, 3, now);
    expect(done.xp.byDay).toEqual({ '2026-11-23': 3 });
    expect(todayXp(done, new Date('2026-11-24T07:59:00Z'))).toBe(3);
  });

  it('夏時間の切り替わりの日をまたいでも 1 日ずつ進む', () => {
    process.env.TZ = 'America/Los_Angeles';
    // 2026-11-01 に夏時間が終わる (1 日が 25 時間)
    const p = recordAnswer(emptyProgress(), q, false, new Date(2026, 9, 31, 23, 30));
    expect(p.answers[q].nextReview).toBe('2026-11-01');
    const p2 = recordAnswer(p, q, true, new Date(2026, 10, 1, 23, 30));
    expect(p2.answers[q].nextReview).toBe('2026-11-04');
  });
});

describe('loadProgress / saveProgress', () => {
  it('保存した進捗を gantlo.v1 のキーで読み戻せる', () => {
    expect(STORAGE_KEY).toBe('gantlo.v1');
    const s = memoryStorage();
    const p = completeLesson(emptyProgress(), 'main-w1-l1', score, 12, at('2026-11-23'));
    saveProgress(p, s);
    expect(Object.keys(s.data)).toEqual(['gantlo.v1']);
    expect(loadProgress(s)).toEqual(p);
  });

  it('壊れた JSON が入っていても例外を出さず初期値で始まる', () => {
    expect(loadProgress(memoryStorage({ [STORAGE_KEY]: '{not json' }))).toEqual(emptyProgress());
    expect(loadProgress(memoryStorage({ [STORAGE_KEY]: '[1,2,3]' }))).toEqual(emptyProgress());
    expect(loadProgress(memoryStorage({ [STORAGE_KEY]: '{"v":2}' }))).toEqual(emptyProgress());
    expect(loadProgress(memoryStorage({ [STORAGE_KEY]: 'null' }))).toEqual(emptyProgress());
  });

  it('欄の一部が欠けていても残りを読む', () => {
    const p = loadProgress(memoryStorage({ [STORAGE_KEY]: JSON.stringify({ v: 1, xp: { total: 7 } }) }));
    expect(p.xp.total).toBe(7);
    expect(p.streak).toEqual({ count: 0, lastDay: null });
  });

  it('読み出しで例外が出る環境でも初期値で始まる', () => {
    const s = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {},
    };
    expect(loadProgress(s)).toEqual(emptyProgress());
  });

  it('保存できなければ false を返す', () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(saveProgress(emptyProgress(), full)).toBe(false);
    expect(saveProgress(emptyProgress(), memoryStorage())).toBe(true);
  });
});

describe('設定・計画と、記録の書き出し・読み込み・消す', () => {
  it('目標は、設定が無ければ既定の値', () => {
    expect(goalXp(emptyProgress())).toBe(DEFAULT_GOAL_XP);
    expect(goalXp(setProfile(emptyProgress(), { dailyGoalXp: 50 }))).toBe(50);
  });

  it('書き出した中身を読み戻すと同じ進捗になる', () => {
    let p = completeLesson(emptyProgress(), 'main-w1-l1', score, 12, at('2026-11-23'));
    p = setProfile(p, { dailyGoalXp: 20 });
    p = { ...p, plan: { courses: ['mgmt-history', 'main'] } };
    expect(parseProgressText(JSON.stringify(p))).toEqual(p);
  });

  it('計画は知らないコースと重なりを落とし、順は残す', () => {
    const p = parseProgressText(JSON.stringify({ v: 1, plan: { courses: ['security', 'nope', 'main', 'security', 3] } }));
    expect(p?.plan).toEqual({ courses: ['security', 'main'] });
  });

  it('読めないファイルや、ほかの形の JSON は null', () => {
    expect(parseProgressText('not json')).toBeNull();
    expect(parseProgressText('{"v":2}')).toBeNull();
    expect(parseProgressText('[]')).toBeNull();
  });

  it('選べない目標 XP は既定の値に直す', () => {
    expect(parseProgressText(JSON.stringify({ v: 1, profile: { dailyGoalXp: 7 } }))?.profile).toEqual({ dailyGoalXp: DEFAULT_GOAL_XP });
  });

  it('記録を消すと進捗は空になり、目標と計画は残る', () => {
    let p = completeLesson(emptyProgress(), 'main-w1-l1', score, 12, at('2026-11-23'));
    p = { ...setProfile(p, { dailyGoalXp: 10 }), plan: { courses: ['main'] } };
    const r = resetProgress(p);
    expect(r.lessons).toEqual({});
    expect(r.xp.total).toBe(0);
    expect(r.profile?.dailyGoalXp).toBe(10);
    expect(r.plan).toEqual({ courses: ['main'] });
  });

  it('書き出すファイルの名前は日付入り', () => {
    expect(exportFileName(at('2026-11-23'))).toBe('gantlo-progress-2026-11-23.json');
  });
});

describe('記録の読み込み (parseImport)', () => {
  const exported = () => {
    let p = completeLesson(emptyProgress(), 'main-w1-l1', score, 12, at('2026-11-23'));
    p = recordAnswer(p, 'main-w1-l1-q1', false, at('2026-11-23'));
    return setProfile(p, { dailyGoalXp: 10 });
  };
  const text = (v: unknown) => JSON.stringify(v);
  const bytes = (t: string) => new TextEncoder().encode(t).length;

  it('書き出した中身は、そのまま読み戻せる', () => {
    const p = exported();
    const t = text(p);
    expect(parseImport(t, bytes(t))).toEqual({ ok: true, progress: p });
  });

  it('1 MB を超えるファイルは、中身が正しくても 413 で読まない。1 MB ちょうどは読む', () => {
    const t = text(exported());
    expect(MAX_IMPORT_BYTES).toBe(1024 * 1024);
    const big = parseImport(t, MAX_IMPORT_BYTES + 1);
    expect(big).toMatchObject({ ok: false, code: 413 });
    expect(!big.ok && big.reason).toContain('1 MB');
    expect(parseImport(t, MAX_IMPORT_BYTES).ok).toBe(true);
  });

  it('JSON として読めないものは 422 で、理由を添える', () => {
    for (const t of ['{not json', '', '\u0000', '{"v":1,']) {
      const r = parseImport(t, bytes(t));
      expect(r).toMatchObject({ ok: false, code: 422 });
      expect(!r.ok && r.reason).toContain('JSON として読めません');
    }
  });

  it('gantlo の記録の形でないものは 422 で、どこが違うかを添える', () => {
    const cases: [unknown, string][] = [
      [[1, 2], 'オブジェクトでない'],
      [null, 'オブジェクトでない'],
      [{ v: 2, streak: {}, xp: {}, lessons: {}, answers: {} }, '版 v が 1 でない'],
      [{ v: 1 }, 'streak・xp・lessons・answers'],
      [{ v: 1, streak: {}, xp: {}, lessons: [], answers: {} }, 'lessons'],
      [{ v: 1, streak: {}, xp: 5, lessons: {}, answers: {} }, 'xp'],
    ];
    for (const [v, why] of cases) {
      const t = text(v);
      const r = parseImport(t, bytes(t));
      expect(r, t).toMatchObject({ ok: false, code: 422 });
      expect(!r.ok && r.reason, t).toContain(why);
    }
  });

  it('形が合えば、中の形の違う値は捨てて読む (localStorage の読み直しと同じ)', () => {
    const t = text({ v: 1, streak: {}, xp: { total: -3 }, lessons: { a: 'x' }, answers: { q: { right: 1, wrong: 0, last: '' } } });
    const r = parseImport(t, bytes(t));
    expect(r.ok && r.progress.lessons).toEqual({});
    expect(r.ok && r.progress.xp.total).toBe(0);
  });

  it('置き換えると読み込んだ記録になり、目標と計画は読み込んだ側に無いときだけ今の端末から引き継ぐ', () => {
    const current = { ...setProfile(emptyProgress(), { dailyGoalXp: 50 }), plan: { courses: ['security' as const] } };
    const loaded = exported();
    const r = replaceWithImported(current, loaded);
    expect(r.answers).toEqual(loaded.answers);
    expect(r.lessons).toEqual(loaded.lessons);
    expect(r.profile).toEqual({ dailyGoalXp: 10 });
    expect(r.plan).toEqual({ courses: ['security'] });
    const bare = completeLesson(emptyProgress(), 'main-w1-l2', score, 12, at('2026-11-23'));
    expect(replaceWithImported(current, bare).profile).toEqual({ dailyGoalXp: 50 });
    expect(replaceWithImported(emptyProgress(), bare)).toEqual(bare);
  });
});

describe('壊れた・悪意のある記録を読み込んでも落ちない', () => {
  it('lessons と answers の中の形の違う値は捨てる', () => {
    const p = parseProgressText(JSON.stringify({ v: 1, lessons: { a: null, b: 'x', c: { done: true, best: 'a' } }, answers: { q: 5 } }));
    expect(p?.lessons).toEqual({ c: { done: true, best: 0, at: '' } });
    expect(p?.answers).toEqual({});
  });

  it('XP の日ごとの値・合計・連続日数は、0 以上の有限の数だけ受ける', () => {
    const p = parseProgressText('{"v":1,"xp":{"total":1e400,"byDay":{"2026-11-18":"abc","2026-11-19":5,"あした":3}},"streak":{"count":-1,"lastDay":"2026-02-31"}}');
    expect(p?.xp).toEqual({ total: 0, byDay: { '2026-11-19': 5 } });
    expect(p?.streak).toEqual({ count: 0, lastDay: null });
  });

  it('復習の予定は実在する日付だけ残し、段階は 0〜2 に収める', () => {
    const p = parseProgressText(JSON.stringify({ v: 1, answers: { a: { right: 0, wrong: 1, last: '', stage: 9, nextReview: '2026-11-24' }, b: { right: 0, wrong: 1, last: '', nextReview: '2026-02-31' } } }));
    expect(p?.answers.a).toMatchObject({ stage: 2, nextReview: '2026-11-24' });
    expect(p?.answers.b.nextReview).toBeUndefined();
    expect(isValidDay('2028-02-29')).toBe(true);
    expect(isValidDay('2027-02-29')).toBe(false);
  });
});
