import { describe, expect, it } from 'vitest';
import { LESSONS } from '../src/content/index';
import type { ChoiceQuestion, Lesson } from '../src/content/types';
import {
  EXAM_PER_WEEK,
  EXAM_TOTAL,
  EXAM_WEEKS,
  PASS_MARK,
  examBank,
  expectedText,
  formatClock,
  gradeExam,
  isPassed,
  lessonsToReread,
  pickExam,
  recordExam,
  weekOf,
  type ExamAnswer,
  type ExamItem,
} from '../src/lib/exam';
import { XP_PER_CORRECT } from '../src/lib/grade';
import { MAX_EXAM_RECORDS, emptyProgress, normalizeProgress } from '../src/lib/progress';
import { examDone } from '../src/lib/status';

/** 決まった並びを返す乱数 (毎回同じ結果にする) */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const right: ExamAnswer = { correct: true, code: 200 };
const wrong: ExamAnswer = { correct: false, code: 400 };

describe('出題の元 (本編の問題データ)', () => {
  it('本編のレッスンはすべて週 (1〜4) が読め、ほかのコースは週を持たない', () => {
    for (const l of LESSONS) {
      if (l.course === 'main') expect(weekOf(l), l.id).not.toBeNull();
      else expect(weekOf(l), l.id).toBeNull();
    }
  });

  it('どの週にも、実習を除いて EXAM_PER_WEEK 問以上ある。実習は出題の元に入らない', () => {
    const bank = examBank();
    for (const { week } of EXAM_WEEKS) expect(bank.filter((b) => b.week === week).length, `第 ${week} 週`).toBeGreaterThanOrEqual(EXAM_PER_WEEK);
    expect(bank.some((b) => b.question.kind === 'lab')).toBe(false);
    expect(bank.every((b) => b.lesson.course === 'main')).toBe(true);
  });
});

describe('pickExam', () => {
  it('40 問を、各週 10 問ずつ重ならずに選ぶ', () => {
    const items = pickExam(examBank(), seeded(1));
    expect(items).toHaveLength(EXAM_TOTAL);
    expect(EXAM_TOTAL).toBe(40);
    for (const { week } of EXAM_WEEKS) expect(items.filter((it) => it.week === week)).toHaveLength(EXAM_PER_WEEK);
    expect(new Set(items.map((it) => it.question.id)).size).toBe(EXAM_TOTAL);
  });

  it('開くたびに (乱数が違えば) 選び直し、週が並んだままにならない', () => {
    const a = pickExam(examBank(), seeded(1)).map((it) => it.question.id);
    const b = pickExam(examBank(), seeded(2)).map((it) => it.question.id);
    expect(a).not.toEqual(b);
    expect(new Set(a)).not.toEqual(new Set(b));
    const weeks = pickExam(examBank(), seeded(3)).map((it) => it.week);
    expect(weeks).not.toEqual([...weeks].sort());
  });

  it('4 択の選択肢を混ぜても、正解の id は選択肢の中にある', () => {
    for (const it of pickExam(examBank(), seeded(4))) {
      if (it.question.kind !== 'choice') continue;
      const q = it.question as ChoiceQuestion;
      expect(q.choices.map((c) => c.id)).toContain(q.answer);
    }
  });
});

/** 第 1〜4 週を 10 問ずつ持つ合成の 40 問 (週の順に並べる) */
function fakeItems(): ExamItem[] {
  const bank = examBank();
  return EXAM_WEEKS.flatMap(({ week }) => bank.filter((b) => b.week === week).slice(0, EXAM_PER_WEEK));
}
/** 週ごとの正解の数から答えを作る (週の中で先頭から正解にする) */
function answersFor(items: ExamItem[], perWeek: Record<number, number>): (ExamAnswer | undefined)[] {
  const used: Record<number, number> = {};
  return items.map((it) => {
    used[it.week] = (used[it.week] ?? 0) + 1;
    return used[it.week] <= (perWeek[it.week] ?? 0) ? right : wrong;
  });
}

describe('gradeExam', () => {
  const items = fakeItems();

  it('75% ちょうど (30 / 40) は合格、29 / 40 は不合格', () => {
    expect(PASS_MARK).toBe(0.75);
    const pass = gradeExam(items, answersFor(items, { 1: 9, 2: 8, 3: 7, 4: 6 }), false);
    expect(pass.correct).toBe(30);
    expect(pass.passed).toBe(true);
    const fail = gradeExam(items, answersFor(items, { 1: 9, 2: 8, 3: 7, 4: 5 }), false);
    expect(fail.correct).toBe(29);
    expect(fail.passed).toBe(false);
  });

  it('週ごとの正答率を出し、いちばん低い週を選ぶ (同じなら先の週)', () => {
    const r = gradeExam(items, answersFor(items, { 1: 9, 2: 6, 3: 6, 4: 10 }), false);
    expect(r.byWeek.map((w) => [w.week, w.correct, w.total])).toEqual([
      [1, 9, 10],
      [2, 6, 10],
      [3, 6, 10],
      [4, 10, 10],
    ]);
    expect(r.weakest?.week).toBe(2);
  });

  it('全部の週が満点なら、いちばん低い週は無い', () => {
    const r = gradeExam(items, items.map(() => right), false);
    expect(r.correct).toBe(40);
    expect(r.weakest).toBeNull();
  });

  it('時間切れで答えていない問題は不正解として数え、数を返す', () => {
    const answers: (ExamAnswer | undefined)[] = items.map((_, i) => (i < 31 ? right : undefined));
    const r = gradeExam(items, answers, true);
    expect(r.correct).toBe(31);
    expect(r.unanswered).toBe(9);
    expect(r.timeUp).toBe(true);
    expect(r.passed).toBe(true);
  });
});

describe('lessonsToReread', () => {
  it('その週で間違えた・答えなかった問題のあるレッスンだけを、問題データの順で返す', () => {
    const items = fakeItems();
    const answers = items.map((it, i) => (it.week === 2 && i % 2 === 0 ? wrong : it.week === 2 && i % 3 === 0 ? undefined : right));
    const want = new Set(items.filter((it, i) => it.week === 2 && answers[i]?.correct !== true).map((it) => it.lesson.id));
    const got = lessonsToReread(items, answers, 2);
    expect(got.map((l: Lesson) => l.id)).toEqual(LESSONS.filter((l) => want.has(l.id)).map((l) => l.id));
    expect(got.every((l) => weekOf(l) === 2)).toBe(true);
  });
});

describe('recordExam', () => {
  const items = fakeItems();
  const now = new Date(2026, 10, 21, 9, 0);

  it('間違えた問題と答えなかった問題は翌日の復習に入り、正解 1 問ごとに XP が入る', () => {
    const answers: (ExamAnswer | undefined)[] = items.map((_, i) => (i === 0 ? wrong : i === 1 ? undefined : right));
    const result = gradeExam(items, answers, true);
    const p = recordExam(emptyProgress(), items, answers, result, now);
    expect(p.answers[items[0].question.id].nextReview).toBe('2026-11-22');
    expect(p.answers[items[1].question.id].nextReview).toBe('2026-11-22');
    expect(p.answers[items[2].question.id].nextReview).toBeUndefined();
    expect(p.xp.total).toBe(38 * XP_PER_CORRECT);
    expect(p.streak.lastDay).toBe('2026-11-21');
    expect(p.exams).toEqual([{ at: now.toISOString(), correct: 38, total: 40, timeUp: true }]);
  });

  it('回の記録は新しい順の先頭に足し、MAX_EXAM_RECORDS 回まで残す', () => {
    let p = emptyProgress();
    for (let i = 0; i < MAX_EXAM_RECORDS + 2; i++) {
      const answers = items.map((_, j) => (j < i ? right : wrong));
      p = recordExam(p, items, answers, gradeExam(items, answers, false), new Date(2026, 10, 1 + i));
    }
    expect(p.exams).toHaveLength(MAX_EXAM_RECORDS);
    expect(p.exams?.[0].correct).toBe(MAX_EXAM_RECORDS + 1);
  });
});

describe('記録の読み直し (normalizeProgress の exams)', () => {
  it('形の合う回だけ残し、正答数が問題の数を超えるもの・問題が 0 のもの・日付として読めないものは落とす', () => {
    const p = normalizeProgress({
      ...emptyProgress(),
      exams: [
        { at: '2026-11-21T00:00:00.000Z', correct: 30, total: 40, timeUp: false },
        { at: '2026-11-20T00:00:00.000Z', correct: 41, total: 40, timeUp: false },
        { at: '2026-11-19T00:00:00.000Z', correct: 0, total: 0 },
        { at: 1, correct: 1, total: 40 },
        { at: 'not-a-date', correct: 1, total: 40, timeUp: false },
        'broken',
        { at: '2026-11-18T00:00:00.000Z', correct: 12, total: 40, timeUp: 'yes' },
      ],
    });
    expect(p?.exams).toEqual([
      { at: '2026-11-21T00:00:00.000Z', correct: 30, total: 40, timeUp: false },
      { at: '2026-11-18T00:00:00.000Z', correct: 12, total: 40, timeUp: false },
    ]);
  });

  it('配列でない exams や、残る回が無いときは欄を持たない', () => {
    expect(normalizeProgress({ ...emptyProgress(), exams: { a: 1 } })?.exams).toBeUndefined();
    expect(normalizeProgress({ ...emptyProgress(), exams: [null] })?.exams).toBeUndefined();
  });

  it('読み込んだ回は MAX_EXAM_RECORDS 回までに切る', () => {
    const exams = Array.from({ length: MAX_EXAM_RECORDS + 5 }, (_, i) => ({ at: new Date(2026, 10, 1, i).toISOString(), correct: 1, total: 40, timeUp: false }));
    expect(normalizeProgress({ ...emptyProgress(), exams })?.exams).toHaveLength(MAX_EXAM_RECORDS);
  });
});

describe('表示の部品', () => {
  it('残り時間を mm:ss にする (切り上げ、0 より小さければ 00:00)', () => {
    expect(formatClock(60 * 60_000)).toBe('60:00');
    expect(formatClock(59_001)).toBe('01:00');
    expect(formatClock(59_000)).toBe('00:59');
    expect(formatClock(-5)).toBe('00:00');
  });

  it('時間内に終えたら 201、時間切れは 408。合否を説明に入れる', () => {
    expect(examDone(30, 40, true, false)).toMatchObject({ code: 201, reason: 'Created' });
    expect(examDone(30, 40, true, false).ja).toContain('合格です');
    expect(examDone(10, 40, false, true)).toMatchObject({ code: 408, reason: 'Request Timeout' });
    expect(examDone(10, 40, false, true).ja).toContain('不合格です');
  });

  it('回の記録の合否は 75% で分ける', () => {
    expect(isPassed({ correct: 30, total: 40 })).toBe(true);
    expect(isPassed({ correct: 29, total: 40 })).toBe(false);
  });

  it('正しい答えの文は、種類ごとに模範解答・選択肢の文・正しい順を出す', () => {
    for (const it of examBank()) {
      const t = expectedText(it.question);
      expect(t.length, it.question.id).toBeGreaterThan(0);
      if (it.question.kind === 'choice') expect(t).toBe(it.question.choices.find((c) => c.id === (it.question as ChoiceQuestion).answer)?.text);
    }
  });
});
