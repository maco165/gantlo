import { describe, expect, it } from 'vitest';
import { LESSONS, dueQuestions, dueReviewCount, findLesson, findQuestion, lessonsOf } from '../src/content/index';
import { emptyProgress, recordAnswer } from '../src/lib/progress';
import { STAGES } from '../src/content/stages';

describe('問題データの読み込み', () => {
  it('courses/<course>/*.json のレッスンを読み、コースで引ける', () => {
    expect(LESSONS.length).toBeGreaterThan(0);
    expect(lessonsOf('main').map((l) => l.id)).toContain('main-w1-l1');
    expect(lessonsOf('main').every((l) => l.course === 'main')).toBe(true);
  });

  it('レッスンと問題を id で引ける', () => {
    expect(findLesson('main-w1-l1')?.title).toBeTruthy();
    expect(findQuestion('main-w1-l1-q1')?.lesson.id).toBe('main-w1-l1');
    expect(findQuestion('nope')).toBeUndefined();
  });

  it('本編のレッスンはどれも旅の段に紐づく', () => {
    const ids = STAGES.map((s) => s.id);
    for (const l of lessonsOf('main')) expect(ids, l.id).toContain(l.stage);
  });
});

describe('今日の復習の問題', () => {
  it('予定が今日までの問題を引き、問題データから消えた id は出さず数えない', () => {
    let p = recordAnswer(emptyProgress(), 'main-w1-l1-q1', false, new Date('2026-11-23T09:00:00'));
    p = recordAnswer(p, 'gone-question', false, new Date('2026-11-23T09:00:00'));
    const now = new Date('2026-11-24T09:00:00');
    expect(dueQuestions(p, now).map((r) => r.question.id)).toEqual(['main-w1-l1-q1']);
    expect(dueQuestions(p, now)[0].lesson.id).toBe('main-w1-l1');
    expect(dueReviewCount(p, now)).toBe(1);
    expect(dueReviewCount(p, new Date('2026-11-23T23:59:00'))).toBe(0);
  });
});
