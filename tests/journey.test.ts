import { describe, expect, it } from 'vitest';
import { LESSONS } from '../src/content/index';
import { STAGES } from '../src/content/stages';
import type { Lesson } from '../src/content/types';
import { stageStates } from '../src/lib/journey';
import { currentLesson, planOrder } from '../src/lib/plan';
import { completeLesson, emptyProgress } from '../src/lib/progress';
import { COURSES } from '../src/lib/route';

const at = new Date('2026-11-23T09:00:00');
const done = (ids: string[]) => ids.reduce((p, id) => completeLesson(p, id, { correct: 1, total: 1 }, 10, at), emptyProgress());

describe('ホームの旅の段 (R-6)', () => {
  it('全レッスンが、旅の段か追加のコースのどちらかに紐づく', () => {
    const stageIds = STAGES.map((s) => s.id);
    const extra = COURSES.filter((c) => c.id !== 'main').map((c) => c.id as string);
    for (const l of LESSONS) {
      const onStage = typeof l.stage === 'string' && stageIds.includes(l.stage);
      const onExtra = extra.includes(l.course);
      expect(onStage || onExtra, l.id).toBe(true);
      // 本編のレッスンは必ず段を持つ
      if (l.course === 'main') expect(onStage, l.id).toBe(true);
    }
  });

  it('空の進捗では 8 段すべてが未学習で、最初のレッスンだけが次になる', () => {
    const p = emptyProgress();
    expect(stageStates(p).every((s) => !s.learned && s.done === 0)).toBe(true);
    expect(currentLesson(planOrder(p), p)?.lesson.id).toBe(LESSONS[0].id);
  });

  it('レッスンを 1 つ終えると、そのレッスンに紐づく段だけが学習済みになり、次が進む', () => {
    const first = LESSONS[0];
    const p = done([first.id]);
    const states = stageStates(p);
    for (const s of states) expect(s.learned, s.id).toBe(s.id === first.stage);
    expect(currentLesson(planOrder(p), p)?.lesson.id).not.toBe(first.id);
  });

  it('段に紐づくレッスンが複数あるときは、1 つ済めば学習済みで、塗りは済んだ割合 (done / total)', () => {
    const sample: Lesson[] = [
      { id: 'a', title: 'a', course: 'main', stage: 'dns', questions: [] },
      { id: 'b', title: 'b', course: 'main', stage: 'dns', questions: [] },
      { id: 'c', title: 'c', course: 'tech-history', stage: 'dns', questions: [] },
      { id: 'd', title: 'd', course: 'spring', questions: [] },
    ];
    const dns = (ids: string[]) => stageStates(done(ids), sample).find((s) => s.id === 'dns');
    expect(dns([])).toEqual({ id: 'dns', done: 0, total: 3, learned: false });
    expect(dns(['d'])?.learned).toBe(false);
    expect(dns(['c'])).toEqual({ id: 'dns', done: 1, total: 3, learned: true });
    expect(dns(['a', 'b', 'c'])).toEqual({ id: 'dns', done: 3, total: 3, learned: true });
  });
});
