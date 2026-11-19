// おおよその予定と、巻き・遅れの計算 (R-20)。画面 (components/PlanGantt.tsx・screens/Home.tsx) はここの結果を描くだけにする。
// 予定は目安で、期限は持たない。開始日から、学ぶ順にコースごとの目安の日数をつないで帯を引き、済んだ量を今日の予定と比べる。
// 日付は端末の日付 (YYYY-MM-DD) で数え、日の差は暦の日付どうしで数える (時刻の差で数えないので、時差・夏時間でずれない)。
import { LESSONS } from '../content/index';
import type { Lesson } from '../content/types';
import { currentLesson, isDone } from './plan';
import { addDays, dayKey, isCourseDays, type Plan, type Progress } from './progress';
import { COURSES, type CourseId } from './route';
import type { Status } from './status';

/**
 * 目安の日数の既定は「1 レッスン 1 日」。1 レッスンはおよそ 5 問 (15 XP) で、1 日の目標の既定 30 XP の半分にあたる。
 * 残りの半分を復習 (間違えた問題の翌日・3 日後・7 日後) に回せる量にした
 */
export const DAYS_PER_LESSON = 1;
/** 比べるときの誤差 (目安の日数をレッスンの数で割ると端数が出るため) */
const EPS = 1e-9;

export const defaultCourseDays = (lessonCount: number): number => lessonCount * DAYS_PER_LESSON;

/** 計画の下書き (画面で直している途中のものも、保存したものも同じ形で数える) */
export type ScheduleInput = { courses: readonly CourseId[]; start: string; days?: Plan['days'] };

/** コースの目安の日数。直した値があればそれ、無ければレッスン数から。レッスンの無いコースは 0 日 (学べるものが無いので予定に入れない) */
export function courseDays(days: Plan['days'], course: CourseId, lessonCount: number): number {
  if (lessonCount <= 0) return 0;
  const set = days?.[course];
  return isCourseDays(set) ? set : defaultCourseDays(lessonCount);
}

/** a から b までの日数 (b が後なら正)。暦の日付どうしを UTC の 0 時に置いて引くので、夏時間の 23・25 時間の日でもずれない */
export function daysBetween(a: string, b: string): number {
  const utc = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

/**
 * 計画の開始日。保存した開始日があればそれ。無ければ (計画を保存する前・開始日の無い古い記録)、
 * 最初にレッスンを終えた日 (端末の日付)、それも無ければ今日
 */
export function planStart(p: Progress, now: Date): string {
  if (p.plan?.start) return p.plan.start;
  const days = Object.values(p.lessons)
    .filter((l) => l.done && l.at)
    .map((l) => new Date(l.at))
    .filter((d) => !Number.isNaN(d.getTime()))
    .map(dayKey)
    .sort();
  return days[0] ?? dayKey(now);
}

/** 予定の帯 1 本ぶん。first・last はそのコースの予定の最初と最後の日、left・width・doneWidth は軸に対する % */
export type ScheduleBar = {
  course: CourseId;
  title: string;
  count: number;
  done: number;
  days: number;
  first: string | null;
  last: string | null;
  left: number;
  width: number;
  doneWidth: number;
};

export type Verdict =
  | { kind: 'ahead'; days: number }
  | { kind: 'behind'; days: number }
  | { kind: 'on'; days: 0 }
  | { kind: 'notStarted'; days: 0 }
  | { kind: 'empty'; days: 0 };

export type Schedule = {
  start: string;
  /** 予定の最後の日。予定が 0 日なら null */
  end: string | null;
  totalDays: number;
  /** 済んだレッスンを予定の日数に直した量 (コースの目安の日数 ÷ レッスンの数 を、済んだレッスンごとに足す) */
  doneDays: number;
  /** 昨日までに済んでいる予定の量と、今日の終わりまでに済む予定の量 (日) */
  plannedBefore: number;
  plannedThrough: number;
  verdict: Verdict;
  /** 軸の最初の日と日数。開始日と予定の終わりに、今日が外れていれば今日まで広げる */
  axisStart: string;
  axisDays: number;
  bars: ScheduleBar[];
  /** 今日の線の位置 (%)。今日の日の中ほど */
  todayLeft: number;
  /** 今ここ (計画の順で最初の未完了のレッスン) の予定の位置 (%)。全部済めば null */
  hereLeft: number | null;
};

/**
 * 予定を組んで、今日と比べる。
 * - 学ぶ順にコースの目安の日数をつなぎ、開始日から帯を並べる (前の帯の終わりの次の日から次の帯が始まる)
 * - 予定の量は「開始日から何日分か」。昨日までの分 (plannedBefore) と今日の終わりまでの分 (plannedThrough) の間を予定どおりとする
 * - 済んだ量 (doneDays) が昨日までの分より少なければ遅れ、今日の終わりまでの分より多ければ巻き。日数はその差を 1 日単位に切り上げる
 */
export function buildSchedule(input: ScheduleInput, p: Progress, now: Date, lessons: readonly Lesson[] = LESSONS): Schedule {
  const today = dayKey(now);
  const { courses, start } = input;
  const groups = courses.map((c) => lessons.filter((l) => l.course === c));
  const days = courses.map((c, i) => courseDays(input.days, c, groups[i].length));
  const totalDays = days.reduce((s, d) => s + d, 0);
  const done = groups.map((ls) => ls.filter((l) => isDone(p, l.id)).length);
  const doneDays = groups.reduce((s, ls, i) => s + (ls.length > 0 ? (done[i] / ls.length) * days[i] : 0), 0);

  const elapsed = daysBetween(start, today);
  const clamp = (n: number) => Math.min(Math.max(n, 0), totalDays);
  const plannedBefore = clamp(elapsed);
  const plannedThrough = clamp(elapsed + 1);

  let verdict: Verdict;
  if (totalDays === 0) verdict = { kind: 'empty', days: 0 };
  else if (doneDays + EPS < plannedBefore) verdict = { kind: 'behind', days: Math.ceil(plannedBefore - doneDays - EPS) };
  else if (doneDays - EPS > plannedThrough) verdict = { kind: 'ahead', days: Math.ceil(doneDays - plannedThrough - EPS) };
  else if (elapsed < 0) verdict = { kind: 'notStarted', days: 0 };
  else verdict = { kind: 'on', days: 0 };

  const planEnd = addDays(start, totalDays); // 予定の終わりの次の日
  const axisStart = today < start ? today : start;
  const axisEnd = addDays(today, 1) > planEnd ? addDays(today, 1) : planEnd;
  const axisDays = Math.max(daysBetween(axisStart, axisEnd), 1);
  const pct = (n: number) => (n / axisDays) * 100;
  const startOffset = daysBetween(axisStart, start);

  let offset = 0;
  const offsets: number[] = [];
  const bars = courses.map((course, i): ScheduleBar => {
    offsets.push(offset);
    const d = days[i];
    const bar: ScheduleBar = {
      course,
      title: COURSES.find((c) => c.id === course)?.title ?? course,
      count: groups[i].length,
      done: done[i],
      days: d,
      first: d > 0 ? addDays(start, offset) : null,
      last: d > 0 ? addDays(start, offset + d - 1) : null,
      left: pct(startOffset + offset),
      width: pct(d),
      doneWidth: groups[i].length > 0 ? pct((done[i] / groups[i].length) * d) : 0,
    };
    offset += d;
    return bar;
  });

  const here = currentLesson(courses, p, lessons);
  let hereLeft: number | null = null;
  if (here) {
    const ci = courses.indexOf(here.lesson.course);
    const j = groups[ci].findIndex((l) => l.id === here.lesson.id);
    hereLeft = pct(startOffset + offsets[ci] + (groups[ci].length > 0 ? (j / groups[ci].length) * days[ci] : 0));
  }

  return {
    start,
    end: totalDays > 0 ? addDays(start, totalDays - 1) : null,
    totalDays,
    doneDays,
    plannedBefore,
    plannedThrough,
    verdict,
    axisStart,
    axisDays,
    bars,
    todayLeft: pct(daysBetween(axisStart, today) + 0.5),
    hereLeft,
  };
}

/** 巻き・遅れの短い言い方 (ホームのヘッダーと帯の見出し) */
export function verdictLabel(v: Verdict): string {
  switch (v.kind) {
    case 'ahead':
      return `${v.days} 日巻き`;
    case 'behind':
      return `${v.days} 日遅れ`;
    case 'on':
      return '予定どおり';
    case 'notStarted':
      return '開始前';
    case 'empty':
      return '予定なし';
  }
}

/** 巻き・遅れを HTTP のステータスで表す。巻きと予定どおりは 200、遅れは 408 (予定の時間内に届かなかった)、開始前は 202 */
export function scheduleStatus(s: Pick<Schedule, 'verdict' | 'start'>): Status {
  const v = s.verdict;
  switch (v.kind) {
    case 'ahead':
      return { code: 200, reason: 'OK', ja: `${verdictLabel(v)}です。予定より先に進んでいます` };
    case 'behind':
      return { code: 408, reason: 'Request Timeout', ja: `${verdictLabel(v)}です。予定は目安なので、取り戻し方は決めません` };
    case 'on':
      return { code: 200, reason: 'OK', ja: '予定どおりです' };
    case 'notStarted':
      return { code: 202, reason: 'Accepted', ja: `開始日 (${s.start}) からの予定です` };
    case 'empty':
      return { code: 204, reason: 'No Content', ja: '予定に入るレッスンがまだありません' };
  }
}
