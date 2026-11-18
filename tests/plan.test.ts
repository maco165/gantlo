import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Lesson } from '../src/content/types';
import * as plan from '../src/lib/plan';
import { DEFAULT_ORDER, canSavePlan, currentLesson, moveCourse, planBars, planLessons, planOrder, savePlan, toggleCourse } from '../src/lib/plan';
import { STORAGE_KEY, completeLesson, emptyProgress, loadProgress, saveProgress, type Progress } from '../src/lib/progress';
import type { CourseId } from '../src/lib/route';

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

/** 帯の長さを確かめやすいように、コースごとにレッスンの数を変えた見本 (本編 4・Spring 2・セキュリティ 6) */
const lesson = (course: CourseId, n: number): Lesson => ({ id: `${course}-l${n}`, title: `${course} ${n}`, course, questions: [] });
const SAMPLE: Lesson[] = [
  ...[1, 2, 3, 4].map((n) => lesson('main', n)),
  ...[1, 2].map((n) => lesson('spring', n)),
  ...[1, 2, 3, 4, 5, 6].map((n) => lesson('security', n)),
];
const at = new Date('2026-11-23T09:00:00');
const finish = (p: Progress, ...ids: string[]) => ids.reduce((acc, id) => completeLesson(acc, id, { correct: 5, total: 5 }, 10, at), p);

afterEach(() => {
  vi.useRealTimers();
});

describe('計画を組む (R-17)', () => {
  it('選んだコースが並べた順に、レッスンの数に比例した長さの帯で、重ならず隙間なく並ぶ', () => {
    const bars = planBars(['security', 'main', 'spring'], emptyProgress(), SAMPLE);
    expect(bars.map((b) => b.course)).toEqual(['security', 'main', 'spring']);
    expect(bars.map((b) => b.count)).toEqual([6, 4, 2]);
    // 長さはレッスンの数に比例する (全 12 レッスン)
    for (const b of bars) expect(b.width).toBeCloseTo((b.count / 12) * 100, 10);
    // 1 本目は 0 から始まり、次の帯は前の帯の終わりから始まり、最後は 100 で終わる
    expect(bars[0].left).toBe(0);
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].left).toBeCloseTo(bars[i - 1].left + bars[i - 1].width, 10);
      expect(bars[i].start).toBe(bars[i - 1].start + bars[i - 1].count);
    }
    const last = bars[bars.length - 1];
    expect(last.left + last.width).toBeCloseTo(100, 10);
  });

  it('選ばないコースは帯にならない。レッスンの無いコースは長さ 0 の帯で、ほかの帯の間を空けない', () => {
    const bars = planBars(['main', 'tech-history', 'spring'], emptyProgress(), SAMPLE);
    expect(bars.map((b) => b.course)).toEqual(['main', 'tech-history', 'spring']);
    expect(bars[1]).toMatchObject({ count: 0, width: 0 });
    expect(bars[2].left).toBeCloseTo(bars[0].width, 10);
    expect(bars[2].left + bars[2].width).toBeCloseTo(100, 10);
  });

  it('上下に動かすと帯の順が入れ替わる。端では動かない', () => {
    const order: CourseId[] = ['main', 'spring', 'security'];
    const down = moveCourse(order, 'main', 1);
    expect(down).toEqual(['spring', 'main', 'security']);
    expect(planBars(down, emptyProgress(), SAMPLE).map((b) => b.course)).toEqual(['spring', 'main', 'security']);
    expect(planBars(down, emptyProgress(), SAMPLE)[0].left).toBe(0);
    expect(planBars(down, emptyProgress(), SAMPLE)[1].left).toBeCloseTo((2 / 12) * 100, 10);
    expect(moveCourse(down, 'security', -1)).toEqual(['spring', 'security', 'main']);
    expect(moveCourse(order, 'main', -1)).toEqual(order);
    expect(moveCourse(order, 'security', 1)).toEqual(order);
  });

  it('選ぶと最後に足し、外すと順から抜く', () => {
    expect(toggleCourse(['main'], 'security')).toEqual(['main', 'security']);
    expect(toggleCourse(['main', 'security'], 'main')).toEqual(['security']);
  });

  it('コースを 1 つも選ばないと保存できない', () => {
    expect(canSavePlan([])).toBe(false);
    expect(savePlan(emptyProgress(), [])).toBeNull();
    expect(canSavePlan(['spring'])).toBe(true);
  });

  it('計画は日付と期間を持たない (保存した計画はコースの並びだけ)', () => {
    const saved = savePlan(emptyProgress(), ['spring', 'main']);
    expect(saved?.plan).toEqual({ courses: ['spring', 'main'] });
    // 外から期限や期間の欄が入っていても、読み込むと落ちる
    const storage = memoryStorage({
      [STORAGE_KEY]: JSON.stringify({ ...emptyProgress(), plan: { courses: ['main'], start: '2026-11-23', deadline: '2026-12-31', weeks: 4 } }),
    });
    expect(loadProgress(storage).plan).toEqual({ courses: ['main'] });
    // 帯は日付ではなくレッスンの数で測る
    const keys = Object.keys(planBars(['main'], emptyProgress(), SAMPLE)[0]).sort();
    expect(keys).toEqual(['count', 'course', 'done', 'doneWidth', 'left', 'start', 'title', 'width']);
  });

  it('計画は localStorage (gantlo.v1) に残り、読み直すと戻る', () => {
    const storage = memoryStorage();
    const saved = savePlan(emptyProgress(), ['security', 'main'])!;
    expect(saveProgress(saved, storage)).toBe(true);
    expect(JSON.parse(storage.data[STORAGE_KEY]).plan).toEqual({ courses: ['security', 'main'] });
    const reloaded = loadProgress(storage);
    expect(reloaded.plan).toEqual({ courses: ['security', 'main'] });
    expect(planOrder(reloaded)).toEqual(['security', 'main']);
  });

  it('保存した計画のコースが空なら、既定の順で学ぶ', () => {
    expect(planOrder({ ...emptyProgress(), plan: { courses: [] } })).toEqual([...DEFAULT_ORDER]);
  });

  it('保存するとき、重なったコースを落とし、最初の位置を残す', () => {
    expect(savePlan(emptyProgress(), ['security', 'main', 'security', 'spring', 'main'])?.plan).toEqual({ courses: ['security', 'main', 'spring'] });
  });

  it('計画が無いときは、全コースを既定の順 (本編 → 追加のコース) で学ぶ', () => {
    expect(planOrder(emptyProgress())).toEqual([...DEFAULT_ORDER]);
    expect(DEFAULT_ORDER[0]).toBe('main');
    expect(planLessons(DEFAULT_ORDER, SAMPLE).map((l) => l.id)[0]).toBe('main-l1');
  });
});

describe('学習管理 (R-18)', () => {
  it('済んだレッスンの数だけ各コースの帯が塗られる', () => {
    const p = finish(emptyProgress(), 'main-l1', 'main-l3', 'security-l2');
    const bars = planBars(['main', 'spring', 'security'], p, SAMPLE);
    expect(bars.map((b) => b.done)).toEqual([2, 0, 1]);
    expect(bars[0].doneWidth).toBeCloseTo((2 / 12) * 100, 10);
    expect(bars[1].doneWidth).toBe(0);
    expect(bars[2].doneWidth).toBeCloseTo((1 / 12) * 100, 10);
    for (const b of bars) expect(b.doneWidth).toBeLessThanOrEqual(b.width);
  });

  it('「今ここ」は計画の順で最初の未完了のレッスンを指す', () => {
    expect(currentLesson(['main', 'spring'], emptyProgress(), SAMPLE)).toMatchObject({ index: 0, total: 6, left: 0, lesson: { id: 'main-l1' } });
    const p = finish(emptyProgress(), 'main-l1', 'main-l2', 'spring-l1');
    expect(currentLesson(['main', 'spring'], p, SAMPLE)?.lesson.id).toBe('main-l3');
    expect(currentLesson(['spring', 'main'], p, SAMPLE)).toMatchObject({ index: 1, left: (1 / 6) * 100, lesson: { id: 'spring-l2' } });
    const all = finish(p, 'main-l3', 'main-l4', 'spring-l2');
    expect(currentLesson(['main', 'spring'], all, SAMPLE)).toBeNull();
  });

  it('計画を組み直しても済んだ記録は消えない', () => {
    const p = finish(savePlan(emptyProgress(), ['main', 'spring'])!, 'main-l1', 'spring-l1');
    const re = savePlan(p, ['security', 'spring'])!;
    expect(re.lessons).toEqual(p.lessons);
    expect(re.xp).toEqual(p.xp);
    expect(re.streak).toEqual(p.streak);
    // 計画から外したコースの記録も残り、戻すとまた塗られる
    const back = savePlan(re, ['main'])!;
    expect(planBars(['main'], back, SAMPLE)[0].done).toBe(1);
  });

  it('期限と遅れの判定を持たない (今日の日付が変わっても結果は同じ)', () => {
    const p = finish(emptyProgress(), 'main-l1');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T09:00:00'));
    const before = { bars: planBars(['main', 'security'], p, SAMPLE), here: currentLesson(['main', 'security'], p, SAMPLE) };
    vi.setSystemTime(new Date('2028-03-01T09:00:00'));
    const after = { bars: planBars(['main', 'security'], p, SAMPLE), here: currentLesson(['main', 'security'], p, SAMPLE) };
    expect(after).toEqual(before);
    expect(Object.keys(before.here!).sort()).toEqual(['index', 'left', 'lesson', 'total']);
    // 期限・遅れ・予定日を扱う関数を持たない
    expect(Object.keys(plan).filter((k) => /due|late|overdue|deadline|schedule|behind/i.test(k))).toEqual([]);
  });
});
