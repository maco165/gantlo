// 進捗の画面のカレンダー (過去 26 週の学んだ日のマス) と、この先 14 日の復習の件数。画面は結果を描くだけにする
import { addDays, dayKey, type Progress } from './progress';
import { weekStart } from './habits';

/** カレンダーの週の数 (今週を含む) */
export const CALENDAR_WEEKS = 26;
/** 復習の予測の日数 (今日を含む) */
export const FORECAST_DAYS = 14;

/**
 * 濃さの段 (日ごとに答えた問題の数)。0 は学んでいない日。1〜4 の境は、レッスン 1 つ (5 問ほど)・2〜3 つ・模擬試験 (40 問) の量で決める。
 * 問題の数の記録 (answered) ができる前の学んだ日は、数が分からないので 1 にする
 */
export const LEVEL_MIN = [1, 6, 16, 31] as const;

export type CalendarCell = {
  day: string;
  /** その日に答えた問題の数 (記録が無ければ 0) */
  count: number;
  /** 学んだ日 (レッスン・復習・模擬試験を終えた日) か */
  studied: boolean;
  /** 濃さ (0〜4) */
  level: 0 | 1 | 2 | 3 | 4;
  /** 今日より先の日 (今週の残り)。マスは描くが数えない */
  future: boolean;
};

export function levelOf(count: number, studied: boolean): CalendarCell['level'] {
  let level = 0;
  for (let i = 0; i < LEVEL_MIN.length; i++) if (count >= LEVEL_MIN[i]) level = i + 1;
  if (level === 0 && studied) level = 1;
  return level as CalendarCell['level'];
}

/** 過去 26 週のマス。週 (月曜から日曜の 7 日) ごとの列で、古い週から並べる */
export function studyCalendar(p: Progress, now: Date, weeks = CALENDAR_WEEKS): CalendarCell[][] {
  const today = dayKey(now);
  const first = addDays(weekStart(now), -7 * (weeks - 1));
  const out: CalendarCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: CalendarCell[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(first, w * 7 + i);
      const future = day > today;
      const count = future ? 0 : (p.answered?.[day] ?? 0);
      const studied = !future && day in p.xp.byDay;
      col.push({ day, count, studied, level: future ? 0 : levelOf(count, studied), future });
    }
    out.push(col);
  }
  return out;
}

/** カレンダーの範囲で学んだ日の数と、答えた問題の数 */
export function calendarTotals(cells: readonly CalendarCell[][]): { studied: number; answered: number } {
  const flat = cells.flat();
  return { studied: flat.filter((c) => c.studied).length, answered: flat.reduce((s, c) => s + c.count, 0) };
}

/**
 * この先 14 日 (今日を含む) の、日ごとの復習の件数。今日の数には、予定を過ぎた (まだ解いていない) 問題も入れる。
 * isKnown で問題データにある問題だけに絞る (消えた問題の予定は数えない)
 */
export function reviewForecast(p: Progress, now: Date, isKnown: (id: string) => boolean = () => true, days = FORECAST_DAYS): { day: string; count: number }[] {
  const today = dayKey(now);
  const out = Array.from({ length: days }, (_, i) => ({ day: addDays(today, i), count: 0 }));
  for (const [id, a] of Object.entries(p.answers)) {
    if (a.nextReview === undefined || !isKnown(id)) continue;
    const i = a.nextReview <= today ? 0 : out.findIndex((d) => d.day === a.nextReview);
    if (i >= 0) out[i].count++;
  }
  return out;
}
