import { describe, expect, it } from 'vitest';
import { findLesson } from '../src/content/index';
import { XP_PER_CORRECT, XP_PER_LAB } from '../src/lib/grade';
import { finishLesson, isGraded, isSupported, lessonScore, resultBody, resultLocation } from '../src/lib/lessonRun';
import { emptyProgress, recordAnswer } from '../src/lib/progress';

const lesson = findLesson('main-w1-l1')!;
const now = new Date(2026, 10, 19, 10, 0, 0);

describe('レッスンの採点の流れ', () => {
  it('採点するのは command・http・choice。実習は採点せず、並べ替えはまだ解けない', () => {
    expect(lesson.questions.map((q) => [q.kind, isGraded(q), isSupported(q)])).toEqual([
      ['command', true, true],
      ['http', true, true],
      ['order', false, false],
      ['choice', true, true],
      ['lab', false, true],
    ]);
  });

  it('正答数は採点した問題だけで数え、XP は正解ごとと終えた実習ごとに足す', () => {
    const score = lessonScore(lesson.questions, ['right', 'wrong', 'skipped', 'right', 'done']);
    expect(score).toEqual({ correct: 2, total: 3, xp: 2 * XP_PER_CORRECT + XP_PER_LAB });
  });

  it('実習を終えていなければ実習の XP は入らない。答えていない問題は不正解として数える', () => {
    expect(lessonScore(lesson.questions, ['right'])).toEqual({ correct: 1, total: 3, xp: XP_PER_CORRECT });
  });

  it('終えると、完了・最高の正答率・XP が残り、問題ごとの正誤の回数はそのまま残る', () => {
    let p = recordAnswer(emptyProgress(), 'main-w1-l1-q2', false, now);
    p = finishLesson(p, lesson.id, { correct: 2, total: 3, xp: 16 }, now);
    expect(p.lessons[lesson.id]).toMatchObject({ done: true, best: 2 / 3 });
    expect(p.xp.total).toBe(16);
    expect(p.answers['main-w1-l1-q2']).toMatchObject({ right: 0, wrong: 1 });
    // やり直して下がっても、最高の正答率は下がらない
    p = finishLesson(p, lesson.id, { correct: 1, total: 3, xp: 3 }, now);
    expect(p.lessons[lesson.id].best).toBe(2 / 3);
    expect(p.xp.total).toBe(19);
  });

  it('完了のレスポンスの本文は lesson・correct・total・xp の JSON で、Location は /me/lessons/<id>', () => {
    expect(JSON.parse(resultBody('main-w1-l1', { correct: 2, total: 3, xp: 16 }))).toEqual({ lesson: 'main-w1-l1', correct: 2, total: 3, xp: 16 });
    expect(resultLocation('main-w1-l1')).toBe('/me/lessons/main-w1-l1');
  });
});
