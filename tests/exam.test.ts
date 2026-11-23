import { describe, expect, it } from 'vitest';
import { LESSONS } from '../src/content/index';
import type { ChoiceQuestion, Lesson } from '../src/content/types';
import {
  examRandom,
  seededRandom,
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
  fromSavedExam,
  loadExamRun,
  recordExpiredRun,
  toSavedExam,
  toggleMark,
  nextIndex,
  examSlots,
  answeredCount,
  type ExamAnswer,
  type ExamItem,
} from '../src/lib/exam';
import { EXAM_SAVE_KEY, LEGACY_EXAM_SAVE_KEY, clearExamRun, saveExamRun, savedRunId } from '../src/lib/examSave';
import { XP_PER_CORRECT } from '../src/lib/grade';
import { MAX_EXAM_RECORDS, STORAGE_KEY, emptyProgress, normalizeProgress } from '../src/lib/progress';
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
    const bank = examBank(LESSONS);
    for (const { week } of EXAM_WEEKS) expect(bank.filter((b) => b.week === week).length, `第 ${week} 週`).toBeGreaterThanOrEqual(EXAM_PER_WEEK);
    expect(bank.some((b) => b.question.kind === 'lab')).toBe(false);
    expect(bank.every((b) => b.lesson.course === 'main')).toBe(true);
  });
});

describe('pickExam', () => {
  it('40 問を、各週 10 問ずつ重ならずに選ぶ', () => {
    const items = pickExam(examBank(LESSONS), seeded(1));
    expect(items).toHaveLength(EXAM_TOTAL);
    expect(EXAM_TOTAL).toBe(40);
    for (const { week } of EXAM_WEEKS) expect(items.filter((it) => it.week === week)).toHaveLength(EXAM_PER_WEEK);
    expect(new Set(items.map((it) => it.question.id)).size).toBe(EXAM_TOTAL);
  });

  it('開くたびに (乱数が違えば) 選び直し、週が並んだままにならない', () => {
    const a = pickExam(examBank(LESSONS), seeded(1)).map((it) => it.question.id);
    const b = pickExam(examBank(LESSONS), seeded(2)).map((it) => it.question.id);
    expect(a).not.toEqual(b);
    expect(new Set(a)).not.toEqual(new Set(b));
    const weeks = pickExam(examBank(LESSONS), seeded(3)).map((it) => it.week);
    expect(weeks).not.toEqual([...weeks].sort());
  });

  it('4 択の選択肢を混ぜても、正解の id は選択肢の中にある', () => {
    for (const it of pickExam(examBank(LESSONS), seeded(4))) {
      if (it.question.kind !== 'choice') continue;
      const q = it.question as ChoiceQuestion;
      expect(q.choices.map((c) => c.id)).toContain(q.answer);
    }
  });
});

/** 第 1〜4 週を 10 問ずつ持つ合成の 40 問 (週の順に並べる) */
function fakeItems(): ExamItem[] {
  const bank = examBank(LESSONS);
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
    const got = lessonsToReread(items, answers, 2, LESSONS);
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
    for (const it of examBank(LESSONS)) {
      const t = expectedText(it.question);
      expect(t.length, it.question.id).toBeGreaterThan(0);
      if (it.question.kind === 'choice') expect(t).toBe(it.question.choices.find((c) => c.id === (it.question as ChoiceQuestion).answer)?.text);
    }
  });
});

describe('模擬試験の種 (検査で出題を固定する)', () => {
  const ids = (r: () => number) => pickExam(examBank(LESSONS), r).map((x) => `${x.question.id}:${JSON.stringify(x.question)}`);
  it('同じ種なら、選ぶ問題・並び・選択肢の順まで同じ', () => {
    expect(ids(examRandom('?seed=7'))).toEqual(ids(examRandom('?seed=7')));
    expect(ids(seededRandom(7))).toEqual(ids(examRandom('?seed=7')));
  });
  it('種が違えば出題が変わる', () => {
    expect(ids(examRandom('?seed=1'))).not.toEqual(ids(examRandom('?seed=2')));
  });
  it('種が無いか読めなければ Math.random を使う (本番の出題は固定しない)', () => {
    for (const q of ['', '?seed=', '?seed=abc', '?seed=-1', '?seed=12345678901']) expect(examRandom(q), q).toBe(Math.random);
  });
  it('乱数は 0 以上 1 未満', () => {
    const r = seededRandom(0);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v >= 0 && v < 1).toBe(true);
    }
  });
});

describe('途中の回の保存と読み直し (A3)', () => {
  const bank = examBank(LESSONS);
  const items = pickExam(bank, seeded(7));
  const answers: ExamAnswer[] = [right, wrong, right];
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };

  it('出題 (問題の id と、混ぜた選択肢・項目の並び)・答え・期限を残し、同じ回に読み直せる', () => {
    const saved = toSavedExam(items, answers, 1_800_000_000_000, 'run-1');
    const back = fromSavedExam(JSON.parse(JSON.stringify(saved)), bank);
    expect(back).not.toBeNull();
    expect(back!.items.map((it) => it.question)).toEqual(items.map((it) => it.question));
    expect(back!.items.map((it) => [it.lesson.id, it.week])).toEqual(items.map((it) => [it.lesson.id, it.week]));
    expect(back!.answers).toEqual(answers);
    expect(back!.deadline).toBe(1_800_000_000_000);
    expect(back!.runId).toBe('run-1');
  });

  it('localStorage の別のキー (gantlo.exam.v2) に置き、進捗のキー (gantlo.v1) は触らない。消すとキーごと無くなる', () => {
    const s = memory();
    saveExamRun(toSavedExam(items, answers, 1, 'run-1'), s);
    expect([...s.m.keys()]).toEqual([EXAM_SAVE_KEY]);
    expect(EXAM_SAVE_KEY).not.toBe(STORAGE_KEY);
    expect(loadExamRun(bank, s)?.answers).toEqual(answers);
    clearExamRun(s);
    expect(s.m.size).toBe(0);
    expect(loadExamRun(bank, s)).toBeNull();
  });

  it('形が違う・問題データに無い問題・同じ問題が 2 回・選択肢や項目の並びが合わない・答えが問題の数より多い中身は読まず、消す', () => {
    const good = toSavedExam(items, answers, 1, 'run-1');
    const choiceAt = good.items.findIndex((it) => bank.find((b) => b.question.id === it.id)?.question.kind === 'choice');
    expect(choiceAt).toBeGreaterThanOrEqual(0);
    const bad: unknown[] = [
      null,
      'x',
      { ...good, v: 3 },
      { ...good, runId: undefined },
      { ...good, runId: '' },
      { ...good, deadline: 'soon' },
      { ...good, deadline: Number.POSITIVE_INFINITY },
      { ...good, items: [] },
      { ...good, items: good.items.map((it, i) => (i === 0 ? { ...it, id: 'no-such-question' } : it)) },
      { ...good, items: good.items.map((it, i) => (i === 1 ? good.items[0] : it)) },
      { ...good, items: good.items.map((it, i) => (i === choiceAt ? { ...it, order: it.order!.slice(1) } : it)) },
      { ...good, items: good.items.map((it, i) => (i === choiceAt ? { ...it, order: undefined } : it)) },
      // 答えが問題の数より多い (問題の数ちょうどは、全部に答えて採点の前の確かめにいる回なので読む)
      { ...good, answers: [...good.items.map(() => right), right] },
      { ...good, answers: [{ correct: 'yes', code: 200 }] },
    ];
    for (const raw of bad) expect(fromSavedExam(raw, bank), JSON.stringify(raw)?.slice(0, 80)).toBeNull();
    const s = memory();
    s.setItem(EXAM_SAVE_KEY, '{broken');
    expect(loadExamRun(bank, s)).toBeNull();
    expect(s.m.size).toBe(0);
    s.setItem(EXAM_SAVE_KEY, JSON.stringify({ ...good, v: 3 }));
    expect(loadExamRun(bank, s)).toBeNull();
    expect(s.m.size).toBe(0);
  });

  it('期限を過ぎた回の採点 (recordExpiredRun) は、何回呼んでも記録は 1 件 (開いたときの effect が 2 回走っても・2 つのタブでも。R-003)', () => {
    const run = fromSavedExam(toSavedExam(items, answers, 1, 'run-x'), bank)!;
    const once = recordExpiredRun(emptyProgress(), run, new Date('2026-11-23T10:00:00Z')).progress;
    const twice = recordExpiredRun(once, run, new Date('2026-11-23T10:00:05Z')).progress;
    expect(once.exams).toHaveLength(1);
    expect(once.exams![0]).toMatchObject({ timeUp: true, runId: 'run-x', correct: 2, total: items.length });
    expect(twice).toBe(once);
    // 別の回なら記録が増える
    const other = recordExpiredRun(once, { ...run, runId: 'run-y' }, new Date('2026-11-23T10:01:00Z')).progress;
    expect(other.exams).toHaveLength(2);
    // 回の id は記録の読み直しでも残る
    expect(normalizeProgress(JSON.parse(JSON.stringify(once)))?.exams?.[0].runId).toBe('run-x');
  });

  it('もう記録した回の保存は読み直さずに捨てる (別のタブで採点した回が戻らない。指摘 4)', () => {
    const s = memory();
    saveExamRun(toSavedExam(items, answers, Date.now() + 60_000, 'run-done'), s);
    const recorded = recordExpiredRun(emptyProgress(), fromSavedExam(toSavedExam(items, answers, 1, 'run-done'), bank)!, new Date()).progress;
    expect(loadExamRun(bank, s, emptyProgress())?.runId).toBe('run-done');
    expect(loadExamRun(bank, s, recorded)).toBeNull();
    expect(s.m.size).toBe(0);
  });

  it('走っている画面は、残っている回が自分の回のときだけ残し直す (別のタブが採点して消した回を戻さない。指摘 4)', () => {
    const s = memory();
    const mine = toSavedExam(items, answers, 1, 'run-a');
    expect(saveExamRun(mine, s, { onlyIfSame: true })).toBe(false);
    expect(s.m.size).toBe(0);
    saveExamRun(mine, s);
    expect(saveExamRun({ ...mine, answers: [right] }, s, { onlyIfSame: true })).toBe(true);
    saveExamRun(toSavedExam(items, answers, 1, 'run-b'), s);
    expect(saveExamRun(mine, s, { onlyIfSame: true })).toBe(false);
    expect(savedRunId(s)).toBe('run-b');
  });
});

describe('見直しの印と前へ・一覧から移る (#55)', () => {
  const bank = examBank(LESSONS);
  const items = pickExam(bank, seeded(11));
  const right = { correct: true, code: 200 };
  const wrong = { correct: false, code: 400 };

  it('答えは位置ごとに残し (飛ばした位置は null)、今の位置と印も残して読み直せる', () => {
    const answers = [right, undefined, wrong];
    const saved = toSavedExam(items, answers, 1, 'run-n', { index: 7, marks: [2, 1, 2, 99] });
    expect(saved.answers).toEqual([right, null, wrong]);
    expect(saved.marks).toEqual([1, 2]);
    const back = fromSavedExam(JSON.parse(JSON.stringify(saved)), bank)!;
    expect(back.answers).toEqual([right, undefined, wrong]);
    expect(back.index).toBe(7);
    expect(back.marks).toEqual([1, 2]);
    expect(answeredCount(back.answers)).toBe(2);
  });

  it('古い保存 (index と marks が無く、答えを前から詰めたもの) は、答えた数を今の位置として読む', () => {
    const old = { v: 1, runId: 'old', items: toSavedExam(items, [], 1, 'old').items, answers: [right, wrong, right], deadline: 1 };
    const back = fromSavedExam(old, bank)!;
    expect(back.index).toBe(3);
    expect(back.marks).toEqual([]);
    expect(back.answers).toEqual([right, wrong, right]);
  });

  it('全部に答えた回 (採点の前の確かめ) も読み直せ、位置は最後の問題を超えない。範囲外の位置は読み直さない', () => {
    const all = items.map(() => right);
    const back = fromSavedExam(toSavedExam(items, all, 1, 'all'), bank)!;
    expect(back.index).toBe(items.length - 1);
    const bad = fromSavedExam({ ...toSavedExam(items, [right], 1, 'x'), index: 500 }, bank)!;
    expect(bad.index).toBe(1);
  });

  it('印の付け外し・次の位置・一覧の状態', () => {
    expect(toggleMark([], 3)).toEqual([3]);
    expect(toggleMark([1, 3], 3)).toEqual([1]);
    expect(nextIndex(0, 40)).toBe(1);
    expect(nextIndex(39, 40)).toBeNull();
    expect(examSlots(3, [right, undefined, wrong], [1])).toEqual([
      { index: 0, answered: true, marked: false },
      { index: 1, answered: false, marked: true },
      { index: 2, answered: true, marked: false },
    ]);
  });

  it('飛ばした問題は採点で未回答 (不正解) になり、復習に入るが、その日に答えた数には数えない', () => {
    const answers = [right, undefined, wrong];
    const three = items.slice(0, 3);
    const result = gradeExam(three, answers, false);
    expect(result).toMatchObject({ correct: 1, unanswered: 1 });
    const p = recordExam(emptyProgress(), three, answers, result, new Date('2026-11-23T10:00:00'), 'r');
    expect(Object.values(p.answered ?? {})).toEqual([2]);
    expect(p.answers[three[1].question.id].nextReview).toBe('2026-11-24');
  });
});

describe('保存の鍵の分け (R-002)', () => {
  const bank = examBank(LESSONS);
  const items = pickExam(bank, seeded(5));
  const right = { correct: true, code: 200 };
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };

  it('新しい形は gantlo.exam.v2 に書き、前の版の鍵 (v1) には書かない (前の版の JS が null を含む回を消すため)', () => {
    const s = memory();
    saveExamRun(toSavedExam(items, [right, undefined, right], 1, 'run-n', { index: 2, marks: [1] }), s);
    expect([...s.m.keys()]).toEqual(['gantlo.exam.v2']);
    expect(EXAM_SAVE_KEY).toBe('gantlo.exam.v2');
    expect(JSON.parse(s.m.get('gantlo.exam.v2')!).v).toBe(2);
  });

  it('前の版の鍵の回は、読むときに新しい鍵へ移して消す (詰めた答え・index なしの形のまま読める)', () => {
    const s = memory();
    const old = { v: 1, runId: 'old', items: toSavedExam(items, [], 1, 'old').items, answers: [right, right], deadline: 9e15 };
    s.setItem(LEGACY_EXAM_SAVE_KEY, JSON.stringify(old));
    expect(savedRunId(s)).toBe('old');
    expect(s.m.has(LEGACY_EXAM_SAVE_KEY)).toBe(false);
    const back = loadExamRun(bank, s)!;
    expect(back.runId).toBe('old');
    expect(back.index).toBe(2);
  });

  it('新しい鍵に回があれば、前の版の鍵の回は捨てる。消すと両方の鍵が無くなる', () => {
    const s = memory();
    saveExamRun(toSavedExam(items, [right], 1, 'new'), s);
    s.setItem(LEGACY_EXAM_SAVE_KEY, JSON.stringify({ v: 1, runId: 'old', items: [], answers: [], deadline: 1 }));
    expect(savedRunId(s)).toBe('new');
    expect(s.m.has(LEGACY_EXAM_SAVE_KEY)).toBe(false);
    s.setItem(LEGACY_EXAM_SAVE_KEY, '{}');
    clearExamRun(s);
    expect(s.m.size).toBe(0);
  });
});
