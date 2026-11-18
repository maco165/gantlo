import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GOAL_XP,
  STORAGE_KEY,
  completeLesson,
  currentStreak,
  emptyProgress,
  exportFileName,
  goalXp,
  isValidDay,
  loadProgress,
  parseProgressText,
  recordAnswer,
  resetProgress,
  saveProgress,
  setProfile,
  todayXp,
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

describe('recordAnswer', () => {
  it('問題ごとに正解と不正解の回数を数え、復習の予定はそのまま残す', () => {
    const start = parseProgressText(JSON.stringify({ v: 1, answers: { q: { right: 0, wrong: 1, last: '', stage: 1, nextReview: '2026-11-27' } } }))!;
    let p = recordAnswer(start, 'q', false, at('2026-11-23'));
    p = recordAnswer(p, 'q', true, at('2026-11-24'));
    expect(p.answers.q).toMatchObject({ right: 1, wrong: 2, stage: 1, nextReview: '2026-11-27' });
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
