import { describe, expect, it } from 'vitest';
import { findLesson } from '../src/content/index';
import { XP_PER_CORRECT, XP_PER_LAB } from '../src/lib/grade';
import { finishLesson, isGraded, lessonScore, resultCode, resultBody, resultLocation } from '../src/lib/lessonRun';
import { emptyProgress, recordAnswer } from '../src/lib/progress';

const lesson = findLesson('main-w1-l1')!;
const now = new Date(2026, 10, 19, 10, 0, 0);

describe('レッスンの採点の流れ', () => {
  it('採点するのは command・http・order・choice。実習だけは採点しない', () => {
    expect(lesson.questions.map((q) => [q.kind, isGraded(q)])).toEqual([
      ['command', true],
      ['http', true],
      ['order', true],
      ['choice', true],
      ['lab', false],
    ]);
  });

  it('正答数は採点した問題 (並べ替えを含む) で数え、XP は正解ごとと終えた実習ごとに足す', () => {
    const score = lessonScore(lesson.questions, ['right', 'wrong', 'right', 'right', 'done']);
    expect(score).toEqual({ correct: 3, total: 4, xp: 3 * XP_PER_CORRECT + XP_PER_LAB });
    // 並べ替えを誤れば正答数は減るが、分母は変わらない
    expect(lessonScore(lesson.questions, ['right', 'wrong', 'wrong', 'right', 'done'])).toEqual({ correct: 2, total: 4, xp: 2 * XP_PER_CORRECT + XP_PER_LAB });
  });

  it('実習を終えていなければ実習の XP は入らない。答えていない問題は不正解として数える', () => {
    expect(lessonScore(lesson.questions, ['right'])).toEqual({ correct: 1, total: 4, xp: XP_PER_CORRECT });
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

  it('完了画面の一覧のコードは、答えの画面に出したステータス (並べ替えの 409・メディアタイプの 415) と同じ', () => {
    expect(resultCode('wrong', 409)).toBe('409');
    expect(resultCode('wrong', 415)).toBe('415');
    expect(resultCode('wrong', 400)).toBe('400');
    expect(resultCode('right', 200)).toBe('200');
    // 応答のコードが無い (実習など) ときは結果の既定
    expect(resultCode('done')).toBe('200');
    expect(resultCode('wrong')).toBe('400');
  });

  it('完了のレスポンスの本文は lesson・correct・total・xp の JSON で、Location は /me/lessons/<id>', () => {
    expect(JSON.parse(resultBody('main-w1-l1', { correct: 2, total: 3, xp: 16 }))).toEqual({ lesson: 'main-w1-l1', correct: 2, total: 3, xp: 16 });
    expect(resultLocation('main-w1-l1')).toBe('/me/lessons/main-w1-l1');
  });
});
