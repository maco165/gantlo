// ホームと計画の画面を jsdom で描き、進捗から出る中身と、ボタンでの並べ替え・保存を確かめる。
// 幅・はみ出し・44px は描画の寸法が要るので e2e (Playwright) で見る。
import { StrictMode, act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import LessonNetwork from '../src/components/LessonNetwork';
import Waterfall from '../src/components/Waterfall';
import { LESSONS } from '../src/content/index';
import type { Lesson } from '../src/content/types';
import { stageStates } from '../src/lib/journey';
import { savePlan } from '../src/lib/plan';
import { STORAGE_KEY, completeLesson, emptyProgress, loadProgress, type Progress } from '../src/lib/progress';
import { useProgress } from '../src/lib/useProgress';
import Home from '../src/screens/Home';
import Plan from '../src/screens/Plan';
import CourseScreen from '../src/screens/CourseScreen';
import Exam from '../src/screens/Exam';
import { examBank, pickExam, seededRandom, toSavedExam } from '../src/lib/exam';
import { EXAM_SAVE_KEY, saveExamRun } from '../src/lib/examSave';
import { COURSES } from '../src/lib/route';
import { sitePages } from '../src/prerender/pages';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
beforeEach(() => {
  // jsdom は matchMedia を持たない。計画のガントチャートは幅で目盛りの字の間引き方を変えるので、狭い画面として答える
  window.matchMedia ??= ((query: string) =>
    ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList) as typeof window.matchMedia;
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const now = new Date('2026-11-23T09:00:00');
const text = (sel: string) => host.querySelector(sel)?.textContent ?? '';

function HomeProbe({ initial }: { initial: Progress }) {
  const [p] = useState(initial);
  return createElement(Home, { progress: p, now });
}

describe('ホーム (R-6)', () => {
  it('空の進捗では 8 段すべてが未学習で、最初のレッスンだけが次になる', async () => {
    await act(async () => root.render(createElement(HomeProbe, { initial: emptyProgress() })));
    const stages = [...host.querySelectorAll('.wf__row')];
    expect(stages).toHaveLength(8);
    expect(stages.every((r) => r.getAttribute('data-learned') === 'false')).toBe(true);
    const rows = [...host.querySelectorAll('.net__row')];
    expect(rows).toHaveLength(LESSONS.length);
    expect(rows.filter((r) => r.getAttribute('data-state') === 'next').map((r) => r.getAttribute('data-lesson'))).toEqual([LESSONS[0].id]);
    expect(text('.status__code')).toBe('202');
    expect(text('[data-header="X-Today-XP"] dd')).toBe('0 / 30');
    expect(host.querySelector('.home__next a')?.getAttribute('href')).toBe(`/gantlo/lesson/${LESSONS[0].id}/`);
    // 始めるボタンは何をするかを日本語で書き、HTTP の形も残す (初めての人に GET だけを見せない)
    expect(text('.home__next a .btn__label')).toBe('最初のレッスンを始める');
    expect(text('.home__next a .btn__request')).toBe(`GET /lesson/${LESSONS[0].id}`);
  });

  it('最初のレッスンを終えると、完了・紐づく段の学習済み・今日の XP の増加が出る', async () => {
    const first = LESSONS[0];
    const p = completeLesson(emptyProgress(), first.id, { correct: 5, total: 5 }, 15, now);
    await act(async () => root.render(createElement(HomeProbe, { initial: p })));
    const row = host.querySelector(`.net__row[data-lesson="${first.id}"]`);
    expect(row?.getAttribute('data-state')).toBe('done');
    expect(row?.querySelector('.net__status')?.textContent).toContain('完了');
    const learned = [...host.querySelectorAll('.wf__row[data-learned="true"]')].map((r) => r.getAttribute('data-stage'));
    expect(learned).toEqual([first.stage]);
    expect(host.querySelector(`.wf__row[data-stage="${first.stage}"]`)?.textContent).toContain('学習済み');
    expect(text('[data-header="X-Today-XP"] dd')).toBe('15 / 30');
    expect(text('[data-header="X-Streak"] dd')).toBe('1 日連続');
    expect(text('.status__code')).toBe('206');
  });
});

describe('ホームの学ぶ順にレッスンが無いとき', () => {
  const sample: Lesson[] = [{ id: 'main-a', title: 'main-a', course: 'main', stage: 'http', questions: [] }];
  const render = (p: Progress) => act(async () => root.render(createElement(Home, { progress: p, now, lessons: sample })));

  it('レッスンの無いコースだけの計画では、全部済ませたとは出さず、計画へのリンクを出す', async () => {
    await render(savePlan(emptyProgress(), ['spring'])!);
    expect(host.textContent).toContain('学ぶ順のコースにまだレッスンがありません');
    expect(host.textContent).not.toContain('全部済ませました');
    expect(host.querySelector('.home__next a')?.getAttribute('href')).toBe('/gantlo/plan/');
  });

  it('レッスンがあって全部済んだときだけ、全部済ませたと出す', async () => {
    await render(completeLesson(savePlan(emptyProgress(), ['main'])!, 'main-a', { correct: 1, total: 1 }, 10, now));
    expect(host.textContent).toContain('学ぶ順のレッスンを全部済ませました');
    expect(host.textContent).not.toContain('まだレッスンがありません');
  });
});

describe('ウォーターフォールの段の表示', () => {
  const sample: Lesson[] = ['a', 'b'].map((id) => ({ id, title: id, course: 'main', stage: 'dns', questions: [] }));
  const row = () => host.querySelector('.wf__row[data-stage="dns"]')!;
  const draw = (ids: string[]) => {
    const p = ids.reduce((acc, id) => completeLesson(acc, id, { correct: 1, total: 1 }, 10, now), emptyProgress());
    return act(async () => root.render(createElement(Waterfall, { states: stageStates(p, sample) })));
  };

  it('紐づくレッスンが 2 つの段で 1 つ済めば、学習済みで 206、塗りは 50%', async () => {
    await draw(['a']);
    expect(row().getAttribute('data-learned')).toBe('true');
    expect(row().querySelector('.wf__status')?.textContent?.trim()).toBe('206');
    expect((row().querySelector('.wf__fill') as HTMLElement).style.width).toBe('50%');
  });

  it('全部済めば 200、塗りは 100%。まだなら — で塗りは 0%', async () => {
    await draw(['a', 'b']);
    expect(row().querySelector('.wf__status')?.textContent?.trim()).toBe('200');
    expect((row().querySelector('.wf__fill') as HTMLElement).style.width).toBe('100%');
    await draw([]);
    expect(row().querySelector('.wf__status')?.textContent?.trim()).toBe('—');
    expect((row().querySelector('.wf__fill') as HTMLElement).style.width).toBe('0%');
  });
});

describe('Network の表', () => {
  const sample: Lesson[] = ['main-a', 'main-b', 'main-c'].map((id) => ({ id, title: id, course: 'main', stage: 'http', questions: [] }));
  const spring: Lesson = { id: 'spring-a', title: 'spring-a', course: 'spring', questions: [] };
  const states = () => [...host.querySelectorAll('.net__row')].map((r) => `${r.getAttribute('data-lesson')}:${r.getAttribute('data-state')}`);

  it('学ぶ順に 1 行ずつ並べ、済んだ行は完了、最初の未完了の行だけが次になる', async () => {
    const p = completeLesson(emptyProgress(), 'main-b', { correct: 1, total: 1 }, 10, now);
    await act(async () => root.render(createElement(LessonNetwork, { courses: ['spring', 'main'], progress: p, lessons: [...sample, spring] })));
    expect(states()).toEqual(['spring-a:next', 'main-a:todo', 'main-b:done', 'main-c:todo']);
    // Waterfall の列は 1 本のガントチャート (行ごとに 1/4 ずつずれる)
    const lefts = [...host.querySelectorAll('.net__bar')].map((b) => (b as HTMLElement).style.left);
    expect(lefts).toEqual(['0%', '25%', '50%', '75%']);
  });
});

function PlanProbe() {
  const [p, update] = useProgress();
  return createElement(Plan, { progress: p, updateProgress: update, now });
}

const ganttOrder = () => [...host.querySelectorAll('.gantt__row')].map((r) => r.getAttribute('data-course'));
const button = (label: string) => [...host.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent) === label) as HTMLButtonElement;
const checkbox = (course: string) => host.querySelector(`.plan__item[data-course="${course}"] input[type="checkbox"]`) as HTMLInputElement;

describe('計画の画面 (R-17・R-18)', () => {
  it('計画が無ければ既定の順で組み始め、上下のボタンで帯の順が入れ替わる', async () => {
    await act(async () => root.render(createElement(PlanProbe)));
    expect(ganttOrder()).toEqual(['main', 'spring', 'tech-history', 'mgmt-history', 'security']);
    await act(async () => button('本編 4 週 を下へ').click());
    expect(ganttOrder()).toEqual(['spring', 'main', 'tech-history', 'mgmt-history', 'security']);
    // 押したボタンに手元が残り、続けて押せる
    expect(document.activeElement).toBe(button('本編 4 週 を下へ'));
    await act(async () => button('セキュリティ を上へ').click());
    expect(ganttOrder()).toEqual(['spring', 'main', 'tech-history', 'security', 'mgmt-history']);
    // 端のボタンは押せない
    expect(button('Spring Boot の流れ を上へ').disabled).toBe(true);
    expect(button('管理の歴史 を下へ').disabled).toBe(true);
  });

  it('外したコースは帯にならず、1 つも選ばないと保存できない', async () => {
    await act(async () => root.render(createElement(PlanProbe)));
    for (const c of ['spring', 'tech-history', 'mgmt-history', 'security']) await act(async () => checkbox(c).click());
    expect(ganttOrder()).toEqual(['main']);
    await act(async () => checkbox('main').click());
    expect(ganttOrder()).toEqual([]);
    expect(button('PUT この順で学ぶ').disabled).toBe(true);
    expect(host.textContent).toContain('コースを 1 つ以上選ぶと保存できます');
  });

  it('PUT この順で学ぶ で 200 OK を出し、gantlo.v1 に残る。読み直すと同じ順で組み始める', async () => {
    await act(async () => root.render(createElement(PlanProbe)));
    await act(async () => checkbox('tech-history').click());
    await act(async () => button('セキュリティ を上へ').click());
    await act(async () => button('PUT この順で学ぶ').click());
    expect(text('.plan__save .status__code')).toBe('200');
    expect(text('.plan__save .status__reason')).toBe('OK');
    // 開始日 (計画を初めて保存した日) も残る。目安の日数は直していないので持たない
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).plan).toEqual({ courses: ['main', 'spring', 'security', 'mgmt-history'], start: '2026-11-23' });
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(createElement(PlanProbe)));
    expect(ganttOrder()).toEqual(['main', 'spring', 'security', 'mgmt-history']);
  });

  it('済んだぶんの塗りと今ここの印と次のレッスンへのリンクを出し、組み直しても済んだ記録は残る', async () => {
    const first = LESSONS[0];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completeLesson(emptyProgress(), first.id, { correct: 1, total: 1 }, 10, now)));
    await act(async () => root.render(createElement(PlanProbe)));
    const main = host.querySelector('.gantt__row[data-course="main"]');
    expect(main?.getAttribute('data-done')).toBe('1');
    expect((main?.querySelector('.gantt__done') as HTMLElement).style.width).not.toBe('0%');
    const next = LESSONS.find((l) => l.id !== first.id);
    if (next) {
      expect(host.querySelector('.gantt__here')).not.toBeNull();
      expect(host.querySelector('.gantt__next a')?.getAttribute('href')).toBe(`/gantlo/lesson/${next.id}/`);
    } else {
      expect(host.textContent).toContain('計画のレッスンを全部済ませました');
    }
    await act(async () => button('本編 4 週 を下へ').click());
    await act(async () => button('PUT この順で学ぶ').click());
    expect(loadProgress().lessons[first.id]?.done).toBe(true);
  });
});

describe('コースの画面 (B-024)', () => {
  const pages = sitePages();
  /** 書き出す HTML のコースのページの本文を、同じ jsdom で読む */
  const prerendered = (id: string) => {
    const doc = new DOMParser().parseFromString(pages.find((p) => p.path === `course/${id}/`)!.body, 'text/html');
    return { h1: doc.querySelector('h1')?.textContent, h2: [...doc.querySelectorAll('h2')].map((h) => h.textContent), links: [...doc.querySelectorAll('ol:not(nav ol) a')].map((a) => a.getAttribute('href')) };
  };

  it('5 コースとも、見出し (h1・h2) とレッスンの並びが書き出す HTML と同じで、空の記録では 202 と 1 つ目が次', async () => {
    for (const c of COURSES) {
      await act(async () => root.render(createElement(CourseScreen, { course: c.id, progress: emptyProgress() })));
      const pre = prerendered(c.id);
      expect(text('h1'), c.id).toBe(pre.h1);
      expect([...host.querySelectorAll('h2')].map((h) => h.textContent), c.id).toEqual(pre.h2);
      expect([...host.querySelectorAll('.net__name a')].map((a) => a.getAttribute('href')), c.id).toEqual(pre.links);
      const own = LESSONS.filter((l) => l.course === c.id);
      expect(text('.status__code'), c.id).toBe(own.length > 0 ? '202' : '204');
      if (own.length > 0) expect(host.querySelector('.home__next a')?.getAttribute('href'), c.id).toBe(`/gantlo/lesson/${own[0].id}/`);
    }
  });

  it('1 つ済ませると 206 と次のレッスン、全部済ませると 200 で次のレッスンのボタンは無い', async () => {
    const c = COURSES.find((x) => LESSONS.filter((l) => l.course === x.id).length >= 2)!;
    const own = LESSONS.filter((l) => l.course === c.id);
    const one = completeLesson(emptyProgress(), own[0].id, { correct: 1, total: 1 }, 3, now);
    await act(async () => root.render(createElement(CourseScreen, { course: c.id, progress: one })));
    expect(text('.status__code')).toBe('206');
    expect(host.querySelector(`.net__row[data-lesson="${own[0].id}"]`)?.getAttribute('data-state')).toBe('done');
    expect(host.querySelector('.home__next a')?.getAttribute('href')).toBe(`/gantlo/lesson/${own[1].id}/`);
    expect(text('.home__next a .btn__label')).toBe('次のレッスンを始める');
    expect(text('.home__next a .btn__request')).toBe(`GET /lesson/${own[1].id}`);
    const all = own.reduce((p, l) => completeLesson(p, l.id, { correct: 1, total: 1 }, 3, now), emptyProgress());
    await act(async () => root.render(createElement(CourseScreen, { course: c.id, progress: all })));
    expect(text('.status__code')).toBe('200');
    expect(host.querySelector('.home__next a')).toBeNull();
  });

  it('レッスンの無いコースは 204 で、書き出しと同じ空の文を出す', async () => {
    await act(async () => root.render(createElement(CourseScreen, { course: 'security', progress: emptyProgress(), lessons: [] })));
    expect(text('.status__code')).toBe('204');
    const empty = sitePages([]).find((p) => p.path === 'course/security/')!.body;
    const sentence = new DOMParser().parseFromString(empty, 'text/html').querySelectorAll('p')[1]?.textContent ?? '';
    expect(sentence).not.toBe('');
    expect(host.textContent).toContain(sentence);
  });
});

describe('模擬試験の途中の回 (A3)', () => {
  function ExamProbe() {
    const [p, update] = useProgress();
    return createElement(StrictMode, null, createElement(Exam, { progress: p, updateProgress: update }));
  }
  const items = pickExam(examBank(), seededRandom(3));

  it('期限を過ぎた途中の回は、開くと時間切れとして記録し、途中の回を消す (2 回記録しないことは tests/exam.test.ts の recordExpiredRun)', async () => {
    saveExamRun(toSavedExam(items, [{ correct: true, code: 200 }, { correct: false, code: 400 }], Date.now() - 1000, 'run-old'));
    await act(async () => root.render(createElement(ExamProbe)));
    expect(text('.status__code')).toBe('408');
    const p = loadProgress();
    expect(p.exams).toHaveLength(1);
    expect(p.exams![0]).toMatchObject({ correct: 1, total: items.length, timeUp: true, runId: 'run-old' });
    expect(localStorage.getItem(EXAM_SAVE_KEY)).toBeNull();
  });

  it('期限の前なら「続きから解く / やめて最初から」を出し、続きから解くと答えた次の問題から始まる', async () => {
    saveExamRun(toSavedExam(items, [{ correct: true, code: 200 }], Date.now() + 30 * 60_000, 'run-now'));
    await act(async () => root.render(createElement(ExamProbe)));
    expect(host.querySelector('[data-testid="exam-resume"]')).not.toBeNull();
    expect(text('.status__code')).toBe('206');
    const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    expect(button('やめて最初から')).toBeDefined();
    await act(async () => button('続きから解く')!.click());
    expect(host.querySelector('[data-testid="exam-run"]')?.getAttribute('data-question')).toBe(items[1].question.id);
    expect(loadProgress().exams ?? []).toHaveLength(0);
  });
});
