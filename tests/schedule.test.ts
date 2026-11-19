import { afterEach, describe, expect, it } from 'vitest';
import type { Lesson } from '../src/content/types';
import { savePlan } from '../src/lib/plan';
import {
  STORAGE_KEY,
  completeLesson,
  setProfile,
  emptyProgress,
  loadProgress,
  parseImport,
  replaceWithImported,
  resetProgress,
  saveProgress,
  type Progress,
} from '../src/lib/progress';
import type { CourseId } from '../src/lib/route';
import {
  DAYS_PER_LESSON,
  addMonths,
  axisTicks,
  buildSchedule,
  courseDays,
  daysBetween,
  defaultCourseDays,
  labelTicks,
  planStart,
  scheduleStatus,
  verdictLabel,
  verdictTone,
} from '../src/lib/schedule';
import type { GanttView } from '../src/lib/progress';

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

/** コースごとにレッスンの数を変えた見本 (本編 4・Spring 2・セキュリティ 6。技術の歴史は 0) */
const lesson = (course: CourseId, n: number): Lesson => ({ id: `${course}-l${n}`, title: `${course} ${n}`, course, questions: [] });
const SAMPLE: Lesson[] = [
  ...[1, 2, 3, 4].map((n) => lesson('main', n)),
  ...[1, 2].map((n) => lesson('spring', n)),
  ...[1, 2, 3, 4, 5, 6].map((n) => lesson('security', n)),
];
/** 端末の時刻の、その日の昼 (日付の境目から遠い時刻) */
const noon = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0);
};
const finish = (p: Progress, ...ids: string[]) => ids.reduce((acc, id) => completeLesson(acc, id, { correct: 5, total: 5 }, 15, noon('2026-11-23')), p);
const main4 = (p: Progress, today: string, days?: Partial<Record<CourseId, number>>) =>
  buildSchedule({ courses: ['main', 'spring'], start: '2026-11-23', days }, p, noon(today), SAMPLE);

describe('予定の帯 (開始日と目安の日数から、学ぶ順に並ぶ)', () => {
  it('開始日から学ぶ順に、前の帯の最後の日の次の日から次の帯が始まる', () => {
    const s = buildSchedule({ courses: ['security', 'main', 'spring'], start: '2026-11-23' }, emptyProgress(), noon('2026-11-23'), SAMPLE);
    expect(s.bars.map((b) => [b.course, b.days, b.first, b.last])).toEqual([
      ['security', 6, '2026-11-23', '2026-11-28'],
      ['main', 4, '2026-11-29', '2026-12-02'],
      ['spring', 2, '2026-12-03', '2026-12-04'],
    ]);
    expect(s.totalDays).toBe(12);
    expect(s.end).toBe('2026-12-04');
    // 軸は開始日から予定の終わりまで。帯の幅は日数に比例し、隙間なく並ぶ
    expect(s.axisStart).toBe('2026-11-23');
    expect(s.axisDays).toBe(12);
    [0, 50, (10 / 12) * 100].forEach((v, i) => expect(s.bars[i].left).toBeCloseTo(v, 10));
    [50, (4 / 12) * 100, (2 / 12) * 100].forEach((v, i) => expect(s.bars[i].width).toBeCloseTo(v, 10));
  });

  it('目安の日数を直すと、そのコースの帯が伸び縮みし、後ろの帯がずれる', () => {
    const s = buildSchedule({ courses: ['main', 'spring'], start: '2026-11-23', days: { main: 10 } }, emptyProgress(), noon('2026-11-23'), SAMPLE);
    expect(s.bars.map((b) => [b.days, b.first, b.last])).toEqual([
      [10, '2026-11-23', '2026-12-02'],
      [2, '2026-12-03', '2026-12-04'],
    ]);
    expect(s.bars[1].left).toBeCloseTo((10 / 12) * 100, 10);
  });

  it('月と年をまたいでも暦どおりに並ぶ', () => {
    const s = buildSchedule({ courses: ['security'], start: '2026-12-29' }, emptyProgress(), noon('2026-12-29'), SAMPLE);
    expect([s.bars[0].first, s.bars[0].last]).toEqual(['2026-12-29', '2027-01-03']);
  });

  it('レッスンの無いコースは 0 日で、日数を直しても予定に入らない (学べるものが無いので遅れにしない)', () => {
    const s = buildSchedule({ courses: ['main', 'tech-history', 'spring'], start: '2026-11-23', days: { 'tech-history': 30 } }, emptyProgress(), noon('2026-11-23'), SAMPLE);
    expect(s.bars[1]).toMatchObject({ course: 'tech-history', days: 0, first: null, last: null, width: 0 });
    expect(s.bars[2].first).toBe('2026-11-27');
    expect(s.totalDays).toBe(6);
  });

  it('済んだレッスンの割合だけ帯を塗る。今日の線は今日の日の中ほど、今ここは最初の未完了のレッスンの予定の位置', () => {
    const p = finish(emptyProgress(), 'main-l1', 'main-l2');
    const s = main4(p, '2026-11-24', { main: 8 });
    // 本編 8 日 + Spring 2 日 = 10 日。本編の 2/4 が済み → 帯の半分 (4 日ぶん)
    expect(s.bars[0].doneWidth).toBeCloseTo(40, 10);
    expect(s.todayLeft).toBeCloseTo((1.5 / 10) * 100, 10);
    expect(s.hereLeft).toBeCloseTo((4 / 10) * 100, 10);
    expect(buildSchedule({ courses: ['spring'], start: '2026-11-23' }, finish(emptyProgress(), 'spring-l1', 'spring-l2'), noon('2026-11-23'), SAMPLE).hereLeft).toBeNull();
  });

  it('今日が予定の外なら、軸を今日まで広げて今日の線を軸の中に引く', () => {
    const after = main4(emptyProgress(), '2026-12-10');
    expect(after.axisStart).toBe('2026-11-23');
    expect(after.axisDays).toBe(18); // 11-23〜12-10
    expect(after.todayLeft).toBeCloseTo((17.5 / 18) * 100, 10);
    const before = main4(emptyProgress(), '2026-11-20');
    expect(before.axisStart).toBe('2026-11-20');
    expect(before.bars[0].left).toBeCloseTo((3 / 9) * 100, 10);
    expect(before.todayLeft).toBeCloseTo((0.5 / 9) * 100, 10);
  });
});

describe('目安の日数の既定と保存', () => {
  it('既定は 1 レッスン 1 日 (レッスン数から決まる)', () => {
    expect(DAYS_PER_LESSON).toBe(1);
    expect(defaultCourseDays(4)).toBe(4);
    expect(courseDays(undefined, 'main', 4)).toBe(4);
    expect(courseDays({ spring: 9 }, 'main', 4)).toBe(4);
    expect(courseDays({ main: 9 }, 'main', 4)).toBe(9);
    expect(courseDays({ main: 9 }, 'main', 0)).toBe(0);
  });

  it('直した日数と開始日を保存し、読み直しても戻る。直していないコースは保存しない (問題が増えれば既定も伸びる)', () => {
    const storage = memoryStorage();
    const saved = savePlan(emptyProgress(), ['main', 'spring'], { start: '2026-11-23', days: { main: 7 } })!;
    expect(saved.plan).toEqual({ courses: ['main', 'spring'], start: '2026-11-23', days: { main: 7 } });
    expect(saveProgress(saved, storage)).toBe(true);
    expect(JSON.parse(storage.data[STORAGE_KEY]).plan).toEqual({ courses: ['main', 'spring'], start: '2026-11-23', days: { main: 7 } });
    const reloaded = loadProgress(storage);
    expect(reloaded.plan).toEqual(saved.plan);
    expect(planStart(reloaded, noon('2027-01-01'))).toBe('2026-11-23');
    // 順だけを組み直しても (開始日と日数を渡さなくても)、開始日と日数は残る
    expect(savePlan(reloaded, ['spring', 'main'])!.plan).toEqual({ courses: ['spring', 'main'], start: '2026-11-23', days: { main: 7 } });
  });

  it('壊れた開始日と日数 (実在しない日・0・端数・上限超え・知らないコース・文字) は読むときに落とし、既定で補う', () => {
    const raw = {
      ...emptyProgress(),
      plan: { courses: ['main'], start: '2026-02-30', days: { main: 0, spring: 1.5, security: 400, nope: 3, 'tech-history': '5', 'mgmt-history': 12 } },
    };
    const p = loadProgress(memoryStorage({ [STORAGE_KEY]: JSON.stringify(raw) }));
    expect(p.plan).toEqual({ courses: ['main'], days: { 'mgmt-history': 12 } });
    expect(main4(p, '2026-11-23').bars[0].days).toBe(4);
  });
});

describe('巻き・遅れ・予定どおり (済んだ量を、今日の予定と比べる)', () => {
  // 本編 4 レッスン 4 日 + Spring 2 レッスン 2 日。開始 11-23。11-25 (3 日目) は、昨日までの予定が 2 日、今日の終わりまでが 3 日
  it('済んだ量が昨日までの予定と今日の終わりまでの予定の間なら、予定どおり (200)', () => {
    for (const ids of [['main-l1', 'main-l2'], ['main-l1', 'main-l2', 'main-l3']]) {
      const s = main4(finish(emptyProgress(), ...ids), '2026-11-25');
      expect(s.plannedBefore).toBe(2);
      expect(s.plannedThrough).toBe(3);
      expect(s.verdict).toEqual({ kind: 'on', days: 0 });
      expect(scheduleStatus(s)).toMatchObject({ code: 200, reason: 'OK', ja: '予定どおりです' });
      expect(verdictLabel(s.verdict)).toBe('予定どおり');
    }
  });

  it('昨日までの予定より少なければ遅れ (408)。日数は足りない量 (日) を切り上げる', () => {
    const one = main4(finish(emptyProgress(), 'main-l1'), '2026-11-25');
    expect(one.verdict).toEqual({ kind: 'behind', days: 1 });
    expect(scheduleStatus(one)).toMatchObject({ code: 408, reason: 'Request Timeout' });
    expect(scheduleStatus(one).ja).toContain('1 日遅れ');
    expect(main4(emptyProgress(), '2026-11-25').verdict).toEqual({ kind: 'behind', days: 2 });
  });

  it('今日の終わりまでの予定より多ければ巻き (200)。日数は先に進んだ量 (日) を切り上げる', () => {
    const s = main4(finish(emptyProgress(), 'main-l1', 'main-l2', 'main-l3', 'main-l4'), '2026-11-25');
    expect(s.verdict).toEqual({ kind: 'ahead', days: 1 });
    expect(scheduleStatus(s)).toMatchObject({ code: 200, reason: 'OK' });
    expect(scheduleStatus(s).ja).toContain('1 日巻き');
    const all = main4(finish(emptyProgress(), 'main-l1', 'main-l2', 'main-l3', 'main-l4', 'spring-l1', 'spring-l2'), '2026-11-23');
    expect(all.verdict).toEqual({ kind: 'ahead', days: 5 });
  });

  it('目安の日数を変えると判定が変わる (同じ済み・同じ今日で、日数を延ばすと遅れが巻きになる)', () => {
    const p = finish(emptyProgress(), 'main-l1');
    expect(main4(p, '2026-11-25').verdict).toEqual({ kind: 'behind', days: 1 });
    // 本編を 12 日にすると 1 レッスン 3 日。1 つ済めば 3 日ぶんで、今日の終わりまで (3 日) と同じ
    expect(main4(p, '2026-11-25', { main: 12 }).verdict).toEqual({ kind: 'on', days: 0 });
    // 本編を 20 日にすると 1 レッスン 5 日。5 - 3 = 2 日巻き
    expect(main4(p, '2026-11-25', { main: 20 }).verdict).toEqual({ kind: 'ahead', days: 2 });
  });

  it('1 レッスンが 1 日に満たない日数でも、半端な差は 1 日に切り上げる', () => {
    // 本編 2 日 (1 レッスン 0.5 日)。11-24 は昨日まで 1 日・今日の終わりまで 2 日
    const p = finish(emptyProgress(), 'main-l1');
    expect(main4(p, '2026-11-24', { main: 2 }).verdict).toEqual({ kind: 'behind', days: 1 });
    expect(main4(finish(p, 'main-l2'), '2026-11-24', { main: 2 }).verdict).toEqual({ kind: 'on', days: 0 });
  });

  it('計画の外のコースの済みは数えない。計画の中なら順を飛ばして済ませても数える', () => {
    const outside = finish(emptyProgress(), 'security-l1', 'security-l2', 'security-l3');
    expect(main4(outside, '2026-11-24').verdict).toEqual({ kind: 'behind', days: 1 });
    expect(main4(finish(emptyProgress(), 'spring-l2'), '2026-11-24').verdict).toEqual({ kind: 'on', days: 0 });
  });

  it('開始日が先なら開始前 (202)。開始前に済ませたぶんは巻き', () => {
    const s = main4(emptyProgress(), '2026-11-20');
    expect(s.verdict).toEqual({ kind: 'notStarted', days: 0 });
    expect(scheduleStatus(s)).toMatchObject({ code: 202, ja: '開始日 (2026-11-23) からの予定です' });
    expect(main4(finish(emptyProgress(), 'main-l1'), '2026-11-20').verdict).toEqual({ kind: 'ahead', days: 1 });
  });

  it('予定の終わりを過ぎたら、残りの量がそのまま遅れになる。全部済めば予定どおり', () => {
    expect(main4(finish(emptyProgress(), 'main-l1'), '2026-12-31').verdict).toEqual({ kind: 'behind', days: 5 });
    const all = finish(emptyProgress(), 'main-l1', 'main-l2', 'main-l3', 'main-l4', 'spring-l1', 'spring-l2');
    expect(main4(all, '2026-12-31').verdict).toEqual({ kind: 'on', days: 0 });
  });

  it('予定に入るレッスンが無ければ判定しない (204)', () => {
    const s = buildSchedule({ courses: ['tech-history'], start: '2026-11-23' }, emptyProgress(), noon('2026-12-01'), SAMPLE);
    expect(s.verdict.kind).toBe('empty');
    expect(scheduleStatus(s).code).toBe(204);
  });
});

describe('古い記録 (開始日・日数の無い計画) と、書き出し・読み込み', () => {
  it('開始日の無い記録は、最初にレッスンを終えた日を開始日にし、それも無ければ今日にする', () => {
    const old: Progress = { ...emptyProgress(), plan: { courses: ['main'] } };
    expect(planStart(old, noon('2026-12-01'))).toBe('2026-12-01');
    const p = {
      ...old,
      lessons: {
        'main-l2': { done: true, best: 1, at: noon('2026-11-25').toISOString() },
        'main-l1': { done: true, best: 1, at: noon('2026-11-21').toISOString() },
        broken: { done: true, best: 1, at: 'not-a-date' },
      },
    };
    expect(planStart(p, noon('2026-12-01'))).toBe('2026-11-21');
    // 既定で補った予定でも壊れずに判定できる
    const now = noon('2026-11-22');
    expect(buildSchedule({ courses: ['main'], start: planStart(p, now), days: p.plan?.days }, p, now, SAMPLE).verdict).toEqual({ kind: 'on', days: 0 });
  });

  it('書き出したファイルを読み込んでも、開始日と目安の日数は失われない', () => {
    const p = savePlan(finish(emptyProgress(), 'main-l1'), ['spring', 'main'], { start: '2026-11-20', days: { spring: 5 } })!;
    const text = JSON.stringify(p);
    const r = parseImport(text, text.length);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.progress.plan).toEqual({ courses: ['spring', 'main'], start: '2026-11-20', days: { spring: 5 } });
    expect(replaceWithImported(emptyProgress(), r.progress).plan).toEqual(r.progress.plan);
    // 読み込んだ側に計画が無ければ、今の端末の計画 (開始日と日数も) を引き継ぐ
    const noPlan = { ...emptyProgress() };
    expect(replaceWithImported(p, noPlan).plan).toEqual(p.plan);
    // 写しなので、元を変えても引き継いだ計画は変わらない
    const kept = replaceWithImported(p, noPlan);
    p.plan!.days!.spring = 9;
    expect(kept.plan!.days).toEqual({ spring: 5 });
    // 記録を消しても計画 (開始日と日数も) は残る
    expect(resetProgress(kept).plan).toEqual({ courses: ['spring', 'main'], start: '2026-11-20', days: { spring: 5 } });
  });
});

describe('日付は端末の日付で数える (時差・夏時間でずれない)', () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it('東京の 0 時 30 分 (UTC では前の日) は、東京の日付で 2 日目に数える', () => {
    process.env.TZ = 'Asia/Tokyo';
    const now = new Date('2026-11-23T15:30:00Z'); // 東京では 2026-11-24 00:30
    const s = buildSchedule({ courses: ['main'], start: '2026-11-23' }, emptyProgress(), now, SAMPLE);
    expect(s.plannedBefore).toBe(1);
    expect(s.verdict).toEqual({ kind: 'behind', days: 1 });
    // その時刻に終えたレッスンの日は東京の日付
    const p = completeLesson(emptyProgress(), 'main-l1', { correct: 1, total: 1 }, 3, now);
    expect(planStart(p, now)).toBe('2026-11-24');
  });

  it('ロサンゼルスの 22 時 30 分 (UTC では次の日) は、ロサンゼルスの日付で 1 日目に数える', () => {
    process.env.TZ = 'America/Los_Angeles';
    const now = new Date('2026-11-24T06:30:00Z'); // ロサンゼルスでは 2026-11-23 22:30
    const s = buildSchedule({ courses: ['main'], start: '2026-11-23' }, emptyProgress(), now, SAMPLE);
    expect(s.plannedBefore).toBe(0);
    expect(s.verdict).toEqual({ kind: 'on', days: 0 });
    expect(planStart(emptyProgress(), now)).toBe('2026-11-23');
  });

  it('夏時間の終わり (25 時間の日) と始まり (23 時間の日) をまたいでも 1 日ずつ数える', () => {
    process.env.TZ = 'America/Los_Angeles';
    // 2026-11-01 に夏時間が終わる。10-31 の 0 時 30 分から 11-02 の 0 時 30 分までは 49 時間
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    const fall = buildSchedule({ courses: ['main'], start: '2026-10-31' }, emptyProgress(), new Date(2026, 10, 2, 0, 30), SAMPLE);
    expect(fall.plannedBefore).toBe(2);
    expect(fall.bars[0].last).toBe('2026-11-03');
    // 2027-03-14 に夏時間が始まる。03-13 の 23 時 30 分から 03-15 の 0 時 30 分までは 24 時間
    const spring = buildSchedule({ courses: ['main'], start: '2027-03-13' }, emptyProgress(), new Date(2027, 2, 15, 0, 30), SAMPLE);
    expect(spring.plannedBefore).toBe(2);
    expect(spring.bars[0].last).toBe('2027-03-16');
    expect(spring.todayLeft).toBeCloseTo((2.5 / 4) * 100, 10);
  });
});

describe('表示する期間と日付の目盛り (R-21)', () => {
  const view = (v: GanttView, today: string, p: Progress = emptyProgress(), days?: Partial<Record<CourseId, number>>) =>
    buildSchedule({ courses: ['main', 'spring'], start: '2026-11-23', days }, p, noon(today), SAMPLE, v);

  it('全体は開始日から予定の終わりまで (期間を渡さないときと同じ)', () => {
    const all = view({ kind: 'all' }, '2026-11-25');
    expect([all.axisStart, all.axisEnd, all.axisDays]).toEqual(['2026-11-23', '2026-11-28', 6]);
    expect(all).toEqual(main4(emptyProgress(), '2026-11-25'));
  });

  it('2 週は今日から 14 日、1 か月は今日から 1 か月後の前の日まで、指定は両端を含む', () => {
    expect(['axisStart', 'axisEnd', 'axisDays'].map((k) => view({ kind: '2w' }, '2026-11-25')[k as 'axisStart'])).toEqual(['2026-11-25', '2026-12-08', 14]);
    const m = view({ kind: '1m' }, '2026-11-25');
    expect([m.axisStart, m.axisEnd, m.axisDays]).toEqual(['2026-11-25', '2026-12-24', 30]);
    // 1-31 の 1 か月後は 2-28 (行き先の月に無い日はその月の最後の日)
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    const jan = view({ kind: '1m' }, '2027-01-31');
    expect([jan.axisStart, jan.axisEnd]).toEqual(['2027-01-31', '2027-02-27']);
    const r = view({ kind: 'range', from: '2026-11-20', to: '2026-11-21' }, '2026-11-25');
    expect([r.axisStart, r.axisEnd, r.axisDays]).toEqual(['2026-11-20', '2026-11-21', 2]);
  });

  it('期間の外にはみ出す帯は端で切れ、外の帯は幅 0 になる。済みの塗りも端で切る', () => {
    // 本編 4 日 (11-23〜11-26)・Spring 2 日 (11-27〜11-28) を、11-25〜11-26 だけ見る
    const p = finish(emptyProgress(), 'main-l1', 'main-l2', 'main-l3');
    const s = view({ kind: 'range', from: '2026-11-25', to: '2026-11-26' }, '2026-11-25', p);
    expect(s.bars[0]).toMatchObject({ left: 0, width: 100, cutStart: true, cutEnd: false });
    expect(s.bars[0].doneWidth).toBeCloseTo(50, 10); // 済み 3 日ぶん (11-25 の終わりまで) のうち、期間に入るのは 11-25 の 1 日
    expect(s.bars[1]).toMatchObject({ width: 0, cutStart: false, cutEnd: false });
    // 両側にはみ出す帯は、両端で切れて期間いっぱい
    const long = view({ kind: '2w' }, '2026-11-25', emptyProgress(), { main: 20 });
    expect(long.bars[0]).toMatchObject({ left: 0, width: 100, cutStart: true, cutEnd: true, doneWidth: 0 });
    // 期間が帯より前なら、帯は幅 0
    const before = view({ kind: 'range', from: '2026-11-01', to: '2026-11-10' }, '2026-11-25');
    expect(before.bars.map((b) => b.width)).toEqual([0, 0]);
    for (const b of [...s.bars, ...long.bars, ...before.bars]) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.left + b.width).toBeLessThanOrEqual(100 + 1e-9);
    }
  });

  it('今日と今ここが期間の外なら線と印を出さない。巻き・遅れは期間によらない', () => {
    const p = finish(emptyProgress(), 'main-l1');
    const out = view({ kind: 'range', from: '2026-12-01', to: '2026-12-10' }, '2026-11-25', p);
    expect(out.todayLeft).toBeNull();
    expect(out.hereLeft).toBeNull();
    const inView = view({ kind: '2w' }, '2026-11-25', p);
    expect(inView.todayLeft).toBeCloseTo((0.5 / 14) * 100, 10);
    expect(out.verdict).toEqual(inView.verdict);
    expect(out.verdict).toEqual(main4(p, '2026-11-25').verdict);
  });

  it('目盛りは週の頭 (月曜) と月の境 (1 日)。1 日が月曜なら月の境の 1 本だけ。1 月は年も書く', () => {
    expect(axisTicks('2026-11-23', 14)).toEqual([
      { day: '2026-11-23', kind: 'week', left: 0, label: '11/23' },
      { day: '2026-11-30', kind: 'week', left: 50, label: '11/30' },
      { day: '2026-12-01', kind: 'month', left: (8 / 14) * 100, label: '12月' },
    ]);
    const feb = axisTicks('2027-01-01', 35);
    expect(feb.filter((t) => t.kind === 'month').map((t) => [t.day, t.label])).toEqual([
      ['2027-01-01', '2027年1月'],
      ['2027-02-01', '2月'],
    ]);
    expect(feb.filter((t) => t.day === '2027-02-01')).toHaveLength(1); // 2027-02-01 は月曜
    expect(feb.filter((t) => t.kind === 'week').map((t) => t.day)).toEqual(['2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25']);
    // 表示する期間を変えると目盛りも変わる
    expect(view({ kind: '2w' }, '2026-11-25').ticks.map((t) => t.day)).toEqual(['2026-11-30', '2026-12-01', '2026-12-07']);
    expect(view({ kind: 'all' }, '2026-11-25').ticks.map((t) => t.day)).toEqual(['2026-11-23']);
  });

  it('字が重ならないよう間引く。月の境を先に残し、線は全部残す', () => {
    const ticks = axisTicks('2026-11-01', 120); // 4 か月・週の頭 17 本
    const labeled = labelTicks(ticks, 18).filter((t) => t.label !== null);
    expect(labelTicks(ticks, 18)).toHaveLength(ticks.length);
    for (let i = 1; i < labeled.length; i++) expect(labeled[i].left - labeled[i - 1].left).toBeGreaterThanOrEqual(18);
    expect(labeled.filter((t) => t.kind === 'month').map((t) => t.day)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']);
    // 間が広ければ全部に字が付く
    expect(labelTicks(axisTicks('2026-11-23', 14), 5).every((t) => t.label !== null)).toBe(true);
    // 近い週の頭 (11-30) と月の境 (12-01) は、月の境の字を残す
    expect(labelTicks(axisTicks('2026-11-23', 14), 18).map((t) => t.label)).toEqual(['11/23', null, '12月']);
  });

  it('選んだ期間は設定 (profile) に保存され、読み直し・書き出し・読み込み・目標を変える・記録を消すで失われない', () => {
    const storage = memoryStorage();
    const p = setProfile(emptyProgress(), { ganttView: { kind: 'range', from: '2026-11-20', to: '2026-12-20' } });
    saveProgress(p, storage);
    const reloaded = loadProgress(storage);
    expect(reloaded.profile?.ganttView).toEqual({ kind: 'range', from: '2026-11-20', to: '2026-12-20' });
    expect(setProfile(reloaded, { dailyGoalXp: 50 }).profile).toEqual({ dailyGoalXp: 50, ganttView: { kind: 'range', from: '2026-11-20', to: '2026-12-20' } });
    expect(resetProgress(reloaded).profile?.ganttView).toEqual(reloaded.profile?.ganttView);
    const text = JSON.stringify(setProfile(emptyProgress(), { ganttView: { kind: '2w' } }));
    const r = parseImport(text, text.length);
    expect(r.ok && r.progress.profile?.ganttView).toEqual({ kind: '2w' });
    // 壊れた値 (知らない種類・終わりが始まりより前・実在しない日) は落とす
    for (const bad of [{ kind: '3w' }, { kind: 'range', from: '2026-12-20', to: '2026-11-20' }, { kind: 'range', from: '2026-02-30', to: '2026-03-01' }, 'all']) {
      const raw = { ...emptyProgress(), profile: { dailyGoalXp: 30, ganttView: bad } };
      expect(loadProgress(memoryStorage({ [STORAGE_KEY]: JSON.stringify(raw) })).profile).toEqual({ dailyGoalXp: 30 });
    }
  });

  it('判定の色: 予定どおりは成功 (緑)、巻きは情報 (青)、遅れは誤り。開始前と予定なしは色を付けない', () => {
    expect(verdictTone({ kind: 'on', days: 0 })).toBe('success');
    expect(verdictTone({ kind: 'ahead', days: 2 })).toBe('info');
    expect(verdictTone({ kind: 'behind', days: 1 })).toBe('error');
    expect(verdictTone({ kind: 'notStarted', days: 0 })).toBeNull();
    expect(verdictTone({ kind: 'empty', days: 0 })).toBeNull();
  });
});
