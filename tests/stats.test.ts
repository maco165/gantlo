// 進捗の画面 (R-14)。正答率・この 7 日の XP・コースごとの進み具合の計算と、画面に出る中身を確かめる。
// 幅・はみ出し・44px・コントラストは描画の寸法が要るので e2e で見る。
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Lesson } from '../src/content/types';
import { completeLesson, emptyProgress, recordAnswer, type Progress } from '../src/lib/progress';
import { accuracy, courseProgress, formatRate, weeklyXp } from '../src/lib/stats';
import ProgressScreen from '../src/screens/ProgressScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const now = new Date('2026-11-23T09:00:00');
const q = (id: string) => ({ id, kind: 'choice' as const, prompt: id, choices: [], answer: 'a', explanation: 'x', sources: ['https://example.com/'] });
const lessons: Lesson[] = [
  { id: 'main-w1-l1', title: 'HTTP', course: 'main', stage: 'http', questions: [q('main-w1-l1-q1'), q('main-w1-l1-q2')] },
  { id: 'main-w2-l1', title: 'DNS', course: 'main', stage: 'dns', questions: [q('main-w2-l1-q1')] },
  { id: 'spring-l1', title: 'Spring', course: 'spring', questions: [q('spring-l1-q1')] },
];
const answer = (p: Progress, id: string, ok: boolean) => recordAnswer(p, id, ok, now);

describe('accuracy (正答率)', () => {
  it('答えていなければ null で、見せ方は —', () => {
    const a = accuracy(emptyProgress(), lessons);
    expect(a).toEqual({ right: 0, total: 0, rate: null });
    expect(formatRate(a)).toBe('—');
  });
  it('答えた回数 (レッスンと復習の合計) に対する正解の回数の割合', () => {
    let p = emptyProgress();
    p = answer(p, 'main-w1-l1-q1', false);
    p = answer(p, 'main-w1-l1-q1', true);
    p = answer(p, 'main-w1-l1-q2', true);
    p = answer(p, 'spring-l1-q1', true);
    const a = accuracy(p, lessons);
    expect(a).toEqual({ right: 3, total: 4, rate: 0.75 });
    expect(formatRate(a)).toBe('75%');
  });
  it('問題データから消えた問題の記録は数えない', () => {
    const p = answer(emptyProgress(), 'gone-q1', false);
    expect(accuracy(p, lessons).total).toBe(0);
  });
});

describe('weeklyXp (この 7 日の XP)', () => {
  it('今日を含む 7 日を古い順に出し、記録の無い日は 0、8 日前は入れない', () => {
    const p = emptyProgress();
    p.xp.byDay = { '2026-11-15': 99, '2026-11-17': 6, '2026-11-23': 13 };
    const days = weeklyXp(p, now);
    expect(days.map((d) => d.day)).toEqual(['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23']);
    expect(days.map((d) => d.xp)).toEqual([6, 0, 0, 0, 0, 0, 13]);
  });
  it('月をまたいでも暦どおりに数える', () => {
    expect(weeklyXp(emptyProgress(), new Date('2026-12-02T09:00:00'))[0].day).toBe('2026-11-26');
  });
});

describe('courseProgress (コースごとの進み具合)', () => {
  it('コースの順に、済んだレッスンの数・レッスンの数・正答率を出す (レッスンの無いコースは 0 / 0)', () => {
    let p = completeLesson(emptyProgress(), 'main-w1-l1', { correct: 2, total: 2 }, 6, now);
    p = answer(p, 'main-w1-l1-q1', true);
    const rows = courseProgress(p, lessons);
    expect(rows.map((r) => r.course)).toEqual(['main', 'spring', 'tech-history', 'mgmt-history', 'security']);
    expect(rows[0]).toMatchObject({ done: 1, total: 2 });
    expect(rows[0].accuracy.rate).toBe(1);
    expect(rows[1]).toMatchObject({ done: 0, total: 1 });
    expect(rows[1].accuracy.rate).toBeNull();
    expect(rows[2]).toMatchObject({ done: 0, total: 0 });
  });
});

describe('進捗の画面', () => {
  let host: HTMLElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  const render = (p: Progress) => act(async () => root.render(createElement(ProgressScreen, { progress: p, now, lessons })));
  const stat = (k: string) => host.querySelector(`[data-stat="${k}"] dd`)?.textContent;

  it('空の記録では、正答率 —・7 日の XP 0・8 段すべて未学習・202', async () => {
    await render(emptyProgress());
    expect(stat('accuracy')).toBe('—');
    expect(stat('week-xp')).toBe('0');
    expect(host.querySelectorAll('.xp7__col')).toHaveLength(7);
    expect(host.querySelectorAll('.wf__row[data-learned="false"]')).toHaveLength(8);
    expect(host.querySelector('.status__code')?.textContent).toBe('202');
  });

  it('記録があると、正答率・7 日の XP・コースの済み・学習済みの段・206 が出る', async () => {
    let p = completeLesson(emptyProgress(), 'main-w1-l1', { correct: 1, total: 2 }, 3, now);
    p = answer(p, 'main-w1-l1-q1', true);
    p = answer(p, 'main-w1-l1-q2', false);
    p.xp.byDay['2026-11-20'] = 10;
    await render(p);
    expect(stat('accuracy')).toBe('50%');
    expect(stat('week-xp')).toBe('13');
    expect(stat('streak')).toBe('1 日');
    expect(host.querySelector('.xp7__col--today')?.getAttribute('data-xp')).toBe('3');
    const main = host.querySelector('tr[data-course="main"]');
    expect(main?.textContent).toContain('1 / 2');
    expect(main?.textContent).toContain('50%');
    expect(host.querySelector('tr[data-course="tech-history"]')?.textContent).toContain('準備中');
    expect([...host.querySelectorAll('.wf__row[data-learned="true"]')].map((r) => r.getAttribute('data-stage'))).toEqual(['http']);
    expect(host.querySelector('.status__code')?.textContent).toBe('206');
  });
});
