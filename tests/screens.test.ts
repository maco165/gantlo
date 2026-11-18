// ホームと計画の画面を jsdom で描き、進捗から出る中身と、ボタンでの並べ替え・保存を確かめる。
// 幅・はみ出し・44px は描画の寸法が要るので e2e (Playwright) で見る。
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import LessonNetwork from '../src/components/LessonNetwork';
import { LESSONS } from '../src/content/index';
import type { Lesson } from '../src/content/types';
import { STORAGE_KEY, completeLesson, emptyProgress, loadProgress, type Progress } from '../src/lib/progress';
import { useProgress } from '../src/lib/useProgress';
import Home from '../src/screens/Home';
import Plan from '../src/screens/Plan';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
beforeEach(() => {
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
  return createElement(Plan, { progress: p, updateProgress: update });
}

const ganttOrder = () => [...host.querySelectorAll('.gantt__row')].map((r) => r.getAttribute('data-course'));
const button = (label: string) => [...host.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent) === label) as HTMLButtonElement;
const checkbox = (course: string) => host.querySelector(`.plan__item[data-course="${course}"] input`) as HTMLInputElement;

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
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).plan).toEqual({ courses: ['main', 'spring', 'security', 'mgmt-history'] });
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
