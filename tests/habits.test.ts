// 学び続ける仕組み (#55): 週の目標・カレンダー・復習の予測・到達・まとめのカード。計算と、進捗とホームの画面に出る中身を見る。
// 寸法・44px・コントラスト・ダウンロードは e2e (scripts/e2e-habits.mjs) で見る。
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Lesson } from '../src/content/types';
import { CALENDAR_WEEKS, levelOf, reviewForecast, studyCalendar } from '../src/lib/calendar';
import { freezeText, weekStart, weekStudied, weeklyTargetText } from '../src/lib/habits';
import { countMastery, courseMastery, masteryOf } from '../src/lib/mastery';
import { completeReview, emptyProgress, parseProgressText, recordAnswer, setProfile, type Progress } from '../src/lib/progress';
import { drawSummary, summaryOf, type CardTheme } from '../src/lib/summaryCard';
import Home from '../src/screens/Home';
import ProgressScreen from '../src/screens/ProgressScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia;
  }
});

const now = new Date('2026-11-25T09:00:00'); // 水曜
const at = (day: string, hour = 9) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`);
const q = (id: string, kind: 'choice' | 'lab' = 'choice') =>
  kind === 'lab' ? ({ id, kind, prompt: id, steps: ['a'], expected: 'x', sources: ['https://example.com/'] } as never) : { id, kind, prompt: id, choices: [], answer: 'a', explanation: 'x', sources: ['https://example.com/'] };
const lessons: Lesson[] = [
  { id: 'main-w1-l1', title: 'HTTP', course: 'main', stage: 'http', questions: [q('m1'), q('m2'), q('m3'), q('mlab', 'lab')] },
  { id: 'spring-l1', title: 'Spring', course: 'spring', questions: [q('s1')] },
];

describe('週の目標', () => {
  it('週の頭は月曜。日曜は前の月曜の週', () => {
    expect(weekStart(at('2026-11-25'))).toBe('2026-11-23');
    expect(weekStart(at('2026-11-29'))).toBe('2026-11-23');
    expect(weekStart(at('2026-11-23'))).toBe('2026-11-23');
  });
  it('今週 (月曜から今日まで) に学んだ日を数え、先週の日曜は入れない', () => {
    let p = completeReview(emptyProgress(), 3, at('2026-11-22')); // 先週の日曜
    p = completeReview(p, 3, at('2026-11-23'));
    p = completeReview(p, 3, at('2026-11-25'));
    expect(weekStudied(p, now)).toBe(2);
    expect(weeklyTargetText(p, now)).toBe('今週 2 日 (週の目標は設定で決めます)');
    expect(weeklyTargetText(setProfile(p, { weeklyGoalDays: 3 }), now)).toBe('今週 2 / 3 日');
    expect(weeklyTargetText(setProfile(p, { weeklyGoalDays: 2 }), now)).toBe('今週 2 / 2 日 · 達成');
  });
});

describe('休みの札の見せ方', () => {
  it('数・次の札まで・使った日', () => {
    expect(freezeText(emptyProgress(), now)).toBe('休みの札 0 / 2 · 次の札まで あと 7 日');
    const p: Progress = { ...emptyProgress(), streak: { count: 9, lastDay: '2026-11-23' }, freeze: { count: 1, toward: 2, used: ['2026-11-20'] } };
    expect(freezeText(p, now)).toBe('休みの札 1 / 2 · 次に学ぶと 1 個使って連続を保ちます · 使った日 11/20');
  });
});

describe('カレンダー', () => {
  it('26 週 × 7 日。最初の列は 25 週前の月曜、最後の列は今週で、今日より先は future', () => {
    const cal = studyCalendar(emptyProgress(), now);
    expect(cal).toHaveLength(CALENDAR_WEEKS);
    expect(cal.every((w) => w.length === 7)).toBe(true);
    expect(cal[0][0].day).toBe('2026-06-01');
    expect(cal[25].map((c) => c.future)).toEqual([false, false, false, true, true, true, true]);
  });
  it('日ごとの答えた数で濃さを決め、数の無い学んだ日は 1', () => {
    expect([0, 1, 5, 6, 15, 16, 30, 31, 200].map((n) => levelOf(n, false))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(levelOf(0, true)).toBe(1);
    // 古い記録 (answered の欄が無い) の学んだ日
    const old = parseProgressText(JSON.stringify({ v: 1, streak: { count: 1, lastDay: '2026-11-24' }, xp: { total: 3, byDay: { '2026-11-24': 3 } }, lessons: {}, answers: {} }))!;
    const cell = studyCalendar(old, now).flat().find((c) => c.day === '2026-11-24')!;
    expect(cell).toMatchObject({ count: 0, studied: true, level: 1 });
  });
});

describe('この先 14 日の復習', () => {
  it('今日には過ぎた予定も入れ、14 日目より先と、知らない問題は数えない', () => {
    const p = emptyProgress();
    p.answers = {
      a: { right: 0, wrong: 1, last: '', stage: 0, nextReview: '2026-11-20' },
      b: { right: 0, wrong: 1, last: '', stage: 0, nextReview: '2026-11-25' },
      c: { right: 1, wrong: 1, last: '', stage: 1, nextReview: '2026-11-28' },
      d: { right: 1, wrong: 1, last: '', stage: 2, nextReview: '2026-12-09' },
      gone: { right: 0, wrong: 1, last: '', stage: 0, nextReview: '2026-11-26' },
    };
    const f = reviewForecast(p, now, (id) => id !== 'gone');
    expect(f).toHaveLength(14);
    expect(f[0]).toEqual({ day: '2026-11-25', count: 2 });
    expect(f.find((d) => d.day === '2026-11-28')?.count).toBe(1);
    expect(f.reduce((s, d) => s + d.count, 0)).toBe(3);
  });
});

describe('問題ごとの到達', () => {
  it('まだ・間違えた・1 回・2 回続けての 4 つ。実習は数えない', () => {
    let p = emptyProgress();
    p = recordAnswer(p, 'm1', false, now);
    p = recordAnswer(p, 'm2', true, now);
    p = recordAnswer(p, 'm3', true, now);
    p = recordAnswer(p, 'm3', true, now);
    expect(countMastery(p, lessons.slice(0, 1))).toEqual({ new: 0, wrong: 1, once: 1, twice: 1, total: 3 });
    expect(courseMastery(p, lessons).map((c) => [c.course, c.counts.total])).toEqual([
      ['main', 3],
      ['spring', 1],
      ['tech-history', 0],
      ['mgmt-history', 0],
      ['security', 0],
    ]);
  });
  it('正解のあと間違えると、直近の誤りに戻る。古い記録も推して分ける', () => {
    let p = recordAnswer(recordAnswer(emptyProgress(), 'm1', true, now), 'm1', false, now);
    expect(masteryOf(p.answers.m1)).toBe('wrong');
    expect(masteryOf({ right: 2, wrong: 0, last: '' })).toBe('twice');
    expect(masteryOf({ right: 3, wrong: 1, last: '' })).toBe('twice');
    expect(masteryOf(undefined)).toBe('new');
  });
});

describe('学習のまとめのカード', () => {
  const theme: CardTheme = { body: '#000', surface: '#111', border: '#222', text: '#fff', sub: '#aaa', success: '#0f0', info: '#00f', error: '#f00', muted: '#333', font: 'sans-serif', code: 'monospace', display: 'serif' };
  /** 描いた字を拾う偽の canvas */
  const fakeCtx = () => {
    const texts: string[] = [];
    const ctx = new Proxy({ texts } as Record<string, unknown>, {
      get: (t, k) => (k === 'fillText' ? (s: string) => texts.push(s) : k === 'measureText' ? (s: string) => ({ width: s.length * 10 }) : k in t ? t[k as string] : () => {}),
      set: (t, k, v) => ((t[k as string] = v), true),
    });
    return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
  };

  it('期間・学んだ日・解いた問題・連続・コースごとの到達を描き、問題の id や答えは描かない', () => {
    let p = completeReview(emptyProgress(), 3, at('2026-11-20'));
    p = completeReview(p, 3, at('2026-11-25'));
    p = recordAnswer(p, 'm1', true, now);
    p = recordAnswer(p, 'm1', true, now);
    const s = summaryOf(p, now, lessons);
    expect(s).toMatchObject({ spanDays: 6, studied: 2, answered: 2, streak: 1 });
    const { ctx, texts } = fakeCtx();
    drawSummary(ctx, s, theme);
    const all = texts.join('\n');
    for (const t of ['6 日', '2 日', '2 問', '1 日', '本編 4 週', '2 回続けて 1 / 3 (33%)', 'maco165.github.io/gantlo/']) expect(all).toContain(t);
    expect(all).not.toMatch(/m1|2026-11|@/);
  });
});

describe('画面', () => {
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

  it('進捗: 182 のマスに日付と数の読み上げと title、14 日の予測、到達の表、札と週の行', async () => {
    let p = recordAnswer(emptyProgress(), 'm1', false, now);
    p = completeReview(p, 3, now);
    await act(async () => root.render(createElement(ProgressScreen, { progress: p, now, lessons })));
    const cells = host.querySelectorAll('.cal li[data-day]');
    expect(cells).toHaveLength(26 * 7 - 4); // 今週の木〜日は先の日
    const today = host.querySelector('.cal li[data-day="2026-11-25"]')!;
    expect(today.getAttribute('title')).toBe('11/25 (水) 1 問');
    expect(today.textContent).toBe('11/25 (水) 1 問');
    expect(host.querySelectorAll('[data-testid="forecast"] li')).toHaveLength(14);
    expect(host.querySelector('[data-testid="forecast"] li[data-day="2026-11-26"]')?.getAttribute('data-due')).toBe('1');
    expect(host.querySelector('tr[data-mastery-course="main"] td[data-mastery="wrong"]')?.getAttribute('data-count')).toBe('1');
    expect(host.querySelector('[data-header="X-Streak-Freeze"] dd')?.textContent).toContain('休みの札 0 / 2');
    expect(host.querySelector('[data-header="X-Weekly-Target"] dd')?.textContent).toBe('今週 1 日 (週の目標は設定で決めます)');
  });

  it('ホーム: 札と週の目標のヘッダー', async () => {
    const p = setProfile(completeReview(emptyProgress(), 3, now), { weeklyGoalDays: 4 });
    await act(async () => root.render(createElement(Home, { progress: p, now })));
    expect(host.querySelector('[data-header="X-Streak-Freeze"] dd')?.textContent).toBe('休みの札 0 / 2 · 次の札まで あと 6 日');
    expect(host.querySelector('[data-header="X-Weekly-Target"] dd')?.textContent).toBe('今週 1 / 4 日');
  });
});
