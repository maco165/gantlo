// おおよその予定と、巻き・遅れの計算 (R-20)。画面 (components/PlanGantt.tsx・screens/Home.tsx) はここの結果を描くだけにする。
// 予定は目安で、期限は持たない。開始日から、学ぶ順にコースごとの目安の日数をつないで帯を引き、済んだ量を今日の予定と比べる。
// 日付は端末の日付 (YYYY-MM-DD) で数え、日の差は暦の日付どうしで数える (時刻の差で数えないので、時差・夏時間でずれない)。
import { LESSONS } from '../content/index';
import type { Lesson } from '../content/types';
import { currentLesson, isDone, planOrder } from './plan';
import { addDays, dayKey, isCourseDays, rangeDays, type GanttView, type Plan, type Progress } from './progress';
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
  return rangeDays(a, b) - 1;
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

/**
 * 予定の帯 1 本ぶん。first・last はそのコースの予定の最初と最後の日。
 * left・width・doneWidth は表示する期間の軸に対する % で、期間の外にはみ出すぶんは端で切る (cutStart・cutEnd が切った印)
 */
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
  cutStart: boolean;
  cutEnd: boolean;
};

export type Verdict =
  | { kind: 'ahead'; days: number }
  | { kind: 'behind'; days: number }
  | { kind: 'on'; days: 0 }
  | { kind: 'notStarted'; days: 0 }
  | { kind: 'empty'; days: 0 };

/** 日付の目盛り 1 本。週の頭 (月曜) と月の境 (1 日)。label が null の目盛りは線だけ (狭い幅で字が重ならないよう間引いたもの) */
export type Tick = { day: string; kind: 'week' | 'month'; left: number; label: string | null };

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
  /** 表示する期間 (軸) の最初の日と日数。全体なら開始日から予定の終わりまでで、今日が外れていれば今日まで広げる */
  axisStart: string;
  axisDays: number;
  /** 軸の最後の日 (含む) */
  axisEnd: string;
  bars: ScheduleBar[];
  /** 日付の目盛り (週の頭・月の境)。字は間引く前の全部に付けてあり、labelTicks で間引く */
  ticks: Tick[];
  /** 今日の線の位置 (%)。今日の日の中ほど。表示する期間の外なら null */
  todayLeft: number | null;
  /** 今ここ (計画の順で最初の未完了のレッスン) の予定の位置 (%)。全部済むか、表示する期間の外なら null */
  hereLeft: number | null;
};

/** 月を足す。行き先の月に無い日 (1-31 の 1 か月後など) は、その月の最後の日にする */
export function addMonths(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
}

/** 曜日 (0 が日曜)。暦の日付から数える (端末の時差によらない) */
const weekday = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/**
 * 表示する期間の最初の日と、最後の日の次の日。
 * - 全体: 開始日から予定の終わりまで。今日が外れていれば今日まで広げる
 * - 2 週: 今日から 14 日 / 1 か月: 今日から 1 か月後の前の日まで (11-25 なら 12-24 まで)
 * - 指定: from から to まで (両端を含む)
 */
export function viewRange(view: GanttView, start: string, totalDays: number, today: string): { from: string; until: string } {
  switch (view.kind) {
    case '2w':
      return { from: today, until: addDays(today, 14) };
    case '1m':
      return { from: today, until: addMonths(today, 1) };
    case 'range':
      return { from: view.from, until: addDays(view.to, 1) };
    case 'all': {
      const planEnd = addDays(start, totalDays);
      const from = today < start ? today : start;
      const until = addDays(today, 1) > planEnd ? addDays(today, 1) : planEnd;
      return { from, until: until > from ? until : addDays(from, 1) };
    }
  }
}

/** 目盛りの数の上限。超えるときは週の頭を描かず、月の境だけにする (長い全体の期間で、線が多すぎて画面が重くならないように) */
export const MAX_TICKS = 200;

/**
 * 目盛り: 期間の中の週の頭 (月曜) と月の境 (1 日)。1 日が月曜なら月の境として 1 本だけ。字は「11/23」、月の境は「12月」(1 月は年も)。
 * 合わせて MAX_TICKS 本を超えるときは月の境だけにする
 */
export function axisTicks(from: string, days: number): Tick[] {
  const out = allTicks(from, days);
  return out.length > MAX_TICKS ? out.filter((t) => t.kind === 'month') : out;
}

function allTicks(from: string, days: number): Tick[] {
  const out: Tick[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    const [y, m, d] = day.split('-').map(Number);
    if (d === 1) out.push({ day, kind: 'month', left: (i / days) * 100, label: m === 1 ? `${y}年1月` : `${m}月` });
    else if (weekday(day) === 1) out.push({ day, kind: 'week', left: (i / days) * 100, label: `${m}/${d}` });
  }
  return out;
}

/**
 * 字が重ならないよう目盛りの字を間引く。字と字の間を minGap (%) 以上空ける。
 * 月の境を先に残し、週の頭は空いている所にだけ残す。線は全部残す
 */
export function labelTicks(ticks: readonly Tick[], minGap: number): Tick[] {
  const kept: number[] = [];
  const fits = (left: number) => kept.every((k) => Math.abs(k - left) >= minGap);
  const keep = new Set<Tick>();
  for (const kind of ['month', 'week'] as const) {
    for (const t of ticks) {
      if (t.kind !== kind || !fits(t.left)) continue;
      kept.push(t.left);
      keep.add(t);
    }
  }
  return ticks.map((t) => (keep.has(t) ? t : { ...t, label: null }));
}

/**
 * 予定を組んで、今日と比べる。
 * - 学ぶ順にコースの目安の日数をつなぎ、開始日から帯を並べる (前の帯の終わりの次の日から次の帯が始まる)
 * - 予定の量は「開始日から何日分か」。昨日までの分 (plannedBefore) と今日の終わりまでの分 (plannedThrough) の間を予定どおりとする
 * - 済んだ量 (doneDays) が昨日までの分より少なければ遅れ、今日の終わりまでの分より多ければ巻き。日数はその差を 1 日単位に切り上げる
 * - 帯・今日の線・今ここ・目盛りは、表示する期間 (view。既定は全体) の軸に置き、期間の外は端で切る。巻き・遅れは期間によらない
 */
export function buildSchedule(
  input: ScheduleInput,
  p: Progress,
  now: Date,
  lessons: readonly Lesson[] = LESSONS,
  view: GanttView = { kind: 'all' },
): Schedule {
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

  // 軸: 表示する期間。日の位置 (開始日からの日数) を % に直し、期間の外は 0〜100 に収める
  const range = viewRange(view, start, totalDays, today);
  const axisDays = Math.max(daysBetween(range.from, range.until), 1);
  const startOffset = daysBetween(range.from, start);
  const pos = (dayFromStart: number) => ((startOffset + dayFromStart) / axisDays) * 100;
  const cut = (n: number) => Math.min(Math.max(n, 0), 100);
  const inside = (left: number) => (left >= 0 && left <= 100 ? left : null);

  let offset = 0;
  const offsets: number[] = [];
  const bars = courses.map((course, i): ScheduleBar => {
    offsets.push(offset);
    const d = days[i];
    const a = pos(offset);
    const b = pos(offset + d);
    const doneEnd = pos(offset + (groups[i].length > 0 ? (done[i] / groups[i].length) * d : 0));
    const left = cut(a);
    const bar: ScheduleBar = {
      course,
      title: COURSES.find((c) => c.id === course)?.title ?? course,
      count: groups[i].length,
      done: done[i],
      days: d,
      first: d > 0 ? addDays(start, offset) : null,
      last: d > 0 ? addDays(start, offset + d - 1) : null,
      left,
      width: Math.max(cut(b) - left, 0),
      doneWidth: Math.max(cut(doneEnd) - left, 0),
      cutStart: d > 0 && a < 0 && b > 0,
      cutEnd: d > 0 && b > 100 && a < 100,
    };
    offset += d;
    return bar;
  });

  const here = currentLesson(courses, p, lessons);
  let hereLeft: number | null = null;
  if (here) {
    const ci = courses.indexOf(here.lesson.course);
    const j = groups[ci].findIndex((l) => l.id === here.lesson.id);
    hereLeft = inside(pos(offsets[ci] + (groups[ci].length > 0 ? (j / groups[ci].length) * days[ci] : 0)));
  }

  return {
    start,
    end: totalDays > 0 ? addDays(start, totalDays - 1) : null,
    totalDays,
    doneDays,
    plannedBefore,
    plannedThrough,
    verdict,
    axisStart: range.from,
    axisDays,
    axisEnd: addDays(range.from, axisDays - 1),
    bars,
    ticks: axisTicks(range.from, axisDays),
    todayLeft: inside(pos(elapsed + 0.5)),
    hereLeft,
  };
}

/**
 * 既定と同じ日数を打ったら、直した値として残さない (既定に戻す)。範囲外の値は受け取らず、そのままにする。
 * 直していないコースはレッスン数から数え直すので、問題が増えれば伸びる
 */
export function setCourseDays(days: Plan['days'], course: CourseId, value: number, lessonCount: number): NonNullable<Plan['days']> {
  const next = { ...days };
  if (!isCourseDays(value)) return next;
  if (value === defaultCourseDays(lessonCount)) delete next[course];
  else next[course] = value;
  return next;
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

/**
 * 判定の色 (R-21)。予定どおりは成功の色 (緑)、巻きは情報の色 (青)、遅れは誤りの色。色だけに頼らず、どれも「N 日巻き」などの字を添える。
 * 開始前と予定なしは色を付けない (ステータス行はコードの決まりの色)
 */
export function verdictTone(v: Verdict): 'success' | 'info' | 'error' | null {
  if (v.kind === 'on') return 'success';
  if (v.kind === 'ahead') return 'info';
  if (v.kind === 'behind') return 'error';
  return null;
}

/**
 * ホームの X-Schedule の値。計画を一度も保存していないうちは、巻き・遅れを出さず「204 計画なし」にする
 * (組んでいない予定に遅れを言わない)。保存したあとは計画の画面と同じ数え方で「408 2 日遅れ」のように出す
 */
export function scheduleHeader(p: Progress, now: Date, lessons: readonly Lesson[] = LESSONS): string {
  if (!p.plan) return '204 計画なし';
  const s = buildSchedule({ courses: planOrder(p), start: planStart(p, now), days: p.plan.days }, p, now, lessons);
  return `${scheduleStatus(s).code} ${verdictLabel(s.verdict)}`;
}
