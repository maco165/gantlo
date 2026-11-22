// 学び続ける仕組みの見せ方 (休みの札・週の目標)。ホームと進捗の画面が使う。記録の変え方は lib/progress.ts
import { MAX_FREEZES, addDays, dayKey, freezeState, pendingFreezes, type Progress } from './progress';

/** YYYY-MM-DD を「11/8」の形にする */
export const shortDay = (day: string): string => {
  const [, m, d] = day.split('-').map(Number);
  return `${m}/${d}`;
};

/** 今週の頭 (月曜。端末の日付) */
export function weekStart(now: Date): string {
  const back = (now.getDay() + 6) % 7; // 月曜 0 … 日曜 6
  return addDays(dayKey(now), -back);
}

/** 今週 (月曜から今日まで) に学んだ日の数。学んだ日は連続日数を進めた日 (lib/progress.ts の studiedDays) */
export function weekStudied(p: Progress, now: Date): number {
  const from = weekStart(now);
  const today = dayKey(now);
  return Object.keys(p.xp.byDay).filter((d) => d >= from && d <= today).length;
}

/** ホームと進捗に出す、今週の学んだ日と目標 (例: 今週 3 / 5 日)。目標を決めていなければ、決める場所を添える */
export function weeklyTargetText(p: Progress, now: Date): string {
  const n = weekStudied(p, now);
  const goal = p.profile?.weeklyGoalDays;
  if (goal === undefined) return `今週 ${n} 日 (週の目標は設定で決めます)`;
  return `今週 ${n} / ${goal} 日${n >= goal ? ' · 達成' : ''}`;
}

/** 休みの札の数 (例: 休みの札 1 / 2) */
export const freezeCountText = (p: Progress): string => `休みの札 ${freezeState(p).count} / ${MAX_FREEZES}`;

/**
 * 休みの札の説明 (使った日と、次に学んだときに使う数)。ホームのヘッダーの値と進捗の画面に出す
 * (例: 休みの札 1 / 2 · 使った日 11/8・11/3)
 */
export function freezeText(p: Progress, now: Date): string {
  const f = freezeState(p);
  const parts = [freezeCountText(p)];
  const pending = pendingFreezes(p, now);
  if (pending > 0) parts.push(`次に学ぶと ${pending} 個使って連続を保ちます`);
  if (f.used.length > 0) parts.push(`使った日 ${f.used.slice(0, 3).map(shortDay).join('・')}`);
  else parts.push(`次の札まで あと ${7 - f.toward} 日`);
  return parts.join(' · ');
}
