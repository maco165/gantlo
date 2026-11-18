import { describe, expect, it } from 'vitest';
import { LESSONS, findLesson, findQuestion, lessonsOf } from '../src/content/index';
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
