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
  freezeState,
  inRowOf,
  missedDays,
  pendingFreezes,
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
  type Progress,
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

describe('休みの札 (freeze)', () => {
  /** 続けて n 日学んだ記録 (start から) */
  const studyDays = (start: string, n: number, p = emptyProgress()) => {
    let out = p;
    for (let i = 0; i < n; i++) {
      const d = new Date(`${start}T09:00:00`);
      d.setDate(d.getDate() + i);
      out = completeReview(out, 3, d);
    }
    return out;
  };

  it('学んだ日が 7 日たまるごとに 1 個、最大 2 個', () => {
    expect(freezeState(studyDays('2026-11-01', 6)).count).toBe(0);
    expect(freezeState(studyDays('2026-11-01', 7))).toMatchObject({ count: 1, toward: 0 });
    expect(freezeState(studyDays('2026-11-01', 14)).count).toBe(2);
    // 2 個あるときは足さずに数え直す
    expect(freezeState(studyDays('2026-11-01', 21))).toMatchObject({ count: 2, toward: 0 });
  });

  it('同じ日に何度学んでも、札までの日は 1 日だけ進む', () => {
    let p = completeReview(emptyProgress(), 3, at('2026-11-01', 9));
    p = completeReview(p, 3, at('2026-11-01', 21));
    expect(freezeState(p).toward).toBe(1);
  });

  it('1 日休んでも、次に学ぶと札を 1 個使って連続を保ち、使った日を残す', () => {
    let p = studyDays('2026-11-01', 7); // 11-07 まで 7 日。札 1
    expect(currentStreak(p, at('2026-11-09'))).toBe(7); // 11-08 を休んだが、札で埋められる
    expect(pendingFreezes(p, at('2026-11-09'))).toBe(1);
    p = completeReview(p, 3, at('2026-11-09'));
    expect(p.streak.count).toBe(8);
    expect(freezeState(p)).toMatchObject({ count: 0, used: ['2026-11-08'] });
  });

  it('休んだ日が札より多ければ、札は使わずに 1 に戻る', () => {
    let p = studyDays('2026-11-01', 7); // 札 1
    expect(currentStreak(p, at('2026-11-10'))).toBe(0); // 2 日休んだ
    expect(pendingFreezes(p, at('2026-11-10'))).toBe(0);
    p = completeReview(p, 3, at('2026-11-10'));
    expect(p.streak.count).toBe(1);
    expect(freezeState(p).count).toBe(1);
  });

  it('札が 2 個なら 2 日休んでも保つ。使った日は新しい順', () => {
    let p = studyDays('2026-11-01', 14); // 11-14 まで。札 2
    p = completeReview(p, 3, at('2026-11-17'));
    expect(p.streak.count).toBe(15);
    expect(freezeState(p)).toMatchObject({ count: 0, used: ['2026-11-16', '2026-11-15'] });
  });

  it('札の欄が無い古い記録は、学んだ日の数から数える', () => {
    const old = { v: 1, streak: { count: 3, lastDay: '2026-11-08' }, xp: { total: 30, byDay: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`2026-11-0${i + 1}`, 3])) }, lessons: {}, answers: {} };
    const p = parseProgressText(JSON.stringify(old))!;
    expect(p.freeze).toBeUndefined();
    expect(freezeState(p)).toEqual({ count: 1, toward: 2, used: [] });
    // 11-09 を休んで 11-10 に学ぶと、数えた札を使う
    expect(completeReview(p, 3, at('2026-11-10')).streak.count).toBe(4);
  });

  it('読み直しで札の欄を確かめる (範囲外は丸め、形の違う日付は落とす)', () => {
    const raw = { ...emptyProgress(), freeze: { count: 5, toward: 9, used: ['2026-11-02', 'x', '2026-11-03', '2026-11-02'] } };
    expect(parseProgressText(JSON.stringify(raw))!.freeze).toEqual({ count: 2, toward: 6, used: ['2026-11-03', '2026-11-02'] });
    const broken = { ...emptyProgress(), freeze: { count: 'a' } };
    expect(parseProgressText(JSON.stringify(broken))!.freeze).toBeUndefined();
  });

  it('保存して読み直しても札が残る。記録を消すと消える', () => {
    const p = studyDays('2026-11-01', 7);
    const s = memoryStorage();
    saveProgress(p, s);
    expect(loadProgress(s).freeze).toEqual(p.freeze);
    expect(resetProgress(p).freeze).toBeUndefined();
  });

  it('missedDays は両端を含まず、長い空きは札の上限 + 1 で数えるのをやめる', () => {
    expect(missedDays('2026-11-01', '2026-11-04')).toEqual(['2026-11-02', '2026-11-03']);
    expect(missedDays('2026-11-01', '2026-11-02')).toEqual([]);
    expect(missedDays('2020-01-01', '2026-11-02')).toHaveLength(3);
    expect(missedDays('2026-11-05', '2026-11-02')).toEqual([]);
  });
});

describe('続けて正解した数 (inRow) と日ごとの答えた数', () => {
  it('正解で 1 ずつ増え、間違えると 0 に戻る', () => {
    let p = recordAnswer(emptyProgress(), 'q1', true, at('2026-11-01'));
    expect(p.answers.q1.inRow).toBe(1);
    p = recordAnswer(p, 'q1', true, at('2026-11-02'));
    expect(p.answers.q1.inRow).toBe(2);
    p = recordAnswer(p, 'q1', false, at('2026-11-03'));
    expect(p.answers.q1.inRow).toBe(0);
  });

  it('inRow の無い古い記録は、回数と復習の段階から推す', () => {
    expect(inRowOf({ right: 3, wrong: 0, last: '' })).toBe(3);
    expect(inRowOf({ right: 0, wrong: 2, last: '' })).toBe(0);
    expect(inRowOf({ right: 3, wrong: 1, last: '' })).toBe(2); // 卒業 (予定が無い)
    expect(inRowOf({ right: 1, wrong: 1, last: '', stage: 1, nextReview: '2026-11-05' })).toBe(1);
    expect(inRowOf({ right: 1, wrong: 1, last: '', stage: 0, nextReview: '2026-11-05' })).toBe(0);
    // 古い記録に答えを足すと、推した数から数える
    const old = { ...emptyProgress(), answers: { q1: { right: 1, wrong: 1, last: '', stage: 1, nextReview: '2026-11-05' } } };
    expect(recordAnswer(old, 'q1', true, at('2026-11-05')).answers.q1.inRow).toBe(2);
  });

  it('日ごとに答えた数を数え、模擬試験で答えなかった問題は数えない', () => {
    let p = recordAnswer(emptyProgress(), 'q1', true, at('2026-11-01'));
    p = recordAnswer(p, 'q2', false, at('2026-11-01', 22));
    p = recordAnswer(p, 'q3', false, at('2026-11-01', 23), { answered: false });
    expect(p.answered).toEqual({ '2026-11-01': 2 });
  });

  it('読み直しで inRow と日ごとの数が残り、壊れた値は落とす', () => {
    const raw = { ...emptyProgress(), answers: { q1: { right: 2, wrong: 0, last: '', inRow: 50 }, q2: { right: 1, wrong: 0, last: '', inRow: -1 } }, answered: { '2026-11-01': 4, bad: 3, '2026-11-02': 'x' } };
    const p = parseProgressText(JSON.stringify(raw))!;
    expect(p.answers.q1.inRow).toBe(9);
    expect(p.answers.q2.inRow).toBeUndefined();
    expect(p.answered).toEqual({ '2026-11-01': 4 });
  });
});

describe('週の目標 (profile.weeklyGoalDays)', () => {
  it('1〜7 の整数だけ残し、ほかの設定を変えない', () => {
    const p = setProfile(emptyProgress(), { weeklyGoalDays: 5 });
    expect(parseProgressText(JSON.stringify(p))!.profile).toEqual({ dailyGoalXp: DEFAULT_GOAL_XP, weeklyGoalDays: 5 });
    for (const bad of [0, 8, 2.5, '3']) {
      const raw = { ...emptyProgress(), profile: { dailyGoalXp: 20, weeklyGoalDays: bad } };
      expect(parseProgressText(JSON.stringify(raw))!.profile).toEqual({ dailyGoalXp: 20 });
    }
  });

  it('目標を外すと記録から消える', () => {
    const p = setProfile(setProfile(emptyProgress(), { weeklyGoalDays: 3 }), { weeklyGoalDays: undefined });
    expect(parseProgressText(JSON.stringify(p))!.profile?.weeklyGoalDays).toBeUndefined();
  });
});

describe('読み直しの欄の並び', () => {
  it('一番外の欄は読んだ記録の並びのまま (localStorage と書き出しが同じ文字列になる)', () => {
    let p = recordAnswer(emptyProgress(), 'q1', true, at('2026-11-01'));
    p = completeReview(p, 3, at('2026-11-01'));
    p = setProfile(p, { dailyGoalXp: 10 });
    const text = JSON.stringify(p);
    expect(JSON.stringify(parseProgressText(text))).toBe(text);
  });
});

describe('読み込むファイルの知らない欄と Object の鍵', () => {
  it('知らない欄は残し (新しい版が足した欄を古い版で消さない)、__proto__・constructor は写さない', () => {
    const text = '{"v":1,"streak":{"count":0,"lastDay":null},"xp":{"total":0,"byDay":{}},"lessons":{},"answers":{},"__proto__":{"x":1},"constructor":1,"futureField":{"a":[1]}}';
    const r = parseImport(text, text.length);
    expect(r.ok).toBe(true);
    const p = (r as { progress: Record<string, unknown> }).progress;
    expect(Object.keys(p)).toEqual(['v', 'streak', 'xp', 'lessons', 'answers', 'futureField']);
    expect(Object.hasOwn(p, 'constructor')).toBe(false);
    expect(Object.getPrototypeOf(p)).toBe(Object.prototype);
    expect(JSON.stringify(p)).toBe('{"v":1,"streak":{"count":0,"lastDay":null},"xp":{"total":0,"byDay":{}},"lessons":{},"answers":{},"futureField":{"a":[1]}}');
  });
  it('形が違って落とした知っている欄は戻さない', () => {
    const p = parseProgressText(JSON.stringify({ ...emptyProgress(), freeze: 'x', exams: 3 }))!;
    expect(Object.hasOwn(p, 'freeze')).toBe(false);
    expect(Object.hasOwn(p, 'exams')).toBe(false);
  });
});

describe('時刻帯を西へ移って日付が戻ったとき', () => {
  it('最後に学んだ日が今日より後なら同じ日とみなし、連続と札の数えを動かさない', () => {
    const p: Progress = { ...emptyProgress(), streak: { count: 5, lastDay: '2026-11-24' }, freeze: { count: 1, toward: 3, used: [] }, xp: { total: 3, byDay: { '2026-11-24': 3 } } };
    expect(currentStreak(p, at('2026-11-23'))).toBe(5);
    const next = completeReview(p, 3, at('2026-11-23'));
    expect(next.streak).toEqual({ count: 5, lastDay: '2026-11-24' });
    expect(freezeState(next)).toEqual({ count: 1, toward: 3, used: [] });
    // 次の日 (11-24) も同じ日。その次の日 (11-25) は 1 日進む
    expect(completeReview(next, 3, at('2026-11-24')).streak.count).toBe(5);
    expect(completeReview(next, 3, at('2026-11-25')).streak.count).toBe(6);
  });
});
