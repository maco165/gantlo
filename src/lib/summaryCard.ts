// 学習のまとめのカード (1080×1350 の PNG)。中身の数を集め (summaryOf)、canvas に描く (drawSummary)。
// 個人を特定する情報 (名前・端末・答えの中身・日付と時刻の細かい記録) は入れない。入れるのは期間・数・連続日数・コースごとの到達だけ
import type { Lesson } from '../content/types';
import { courseMastery, MASTERY_LABELS, MASTERY_ORDER, share, type MasteryCounts } from './mastery';
import { currentStreak, dayKey, rangeDays, studiedDays, type Progress } from './progress';
import { SITE_NAME, SITE_TAGLINE } from './site';

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

export type Summary = {
  /** 学んだ期間 (最初に学んだ日から今日まで、両端を含む日数)。まだ学んでいなければ 0 */
  spanDays: number;
  /** 学んだ日の数 */
  studied: number;
  /** 解いた問題の数 (問題データにある採点する問題のうち、一度でも答えたことのある問題の数。答えた回数ではない) */
  answered: number;
  streak: number;
  courses: { title: string; counts: MasteryCounts }[];
};

export function summaryOf(p: Progress, now: Date, lessons: readonly Lesson[]): Summary {
  const days = studiedDays(p);
  const spanDays = days.length > 0 ? rangeDays(days[0], dayKey(now)) : 0;
  return {
    spanDays,
    studied: days.length,
    answered: lessons.flatMap((l) => l.questions).filter((q) => q.kind !== 'lab' && (p.answers[q.id]?.right ?? 0) + (p.answers[q.id]?.wrong ?? 0) > 0).length,
    streak: currentStreak(p, now),
    courses: courseMastery(p, lessons)
      .filter((c) => c.counts.total > 0)
      .map((c) => ({ title: c.title, counts: c.counts })),
  };
}

/** カードの色と書体 (画面のテーマのトークンから読む。canvas は CSS の変数を読めないので、描く前に値にする) */
export type CardTheme = { body: string; surface: string; border: string; text: string; sub: string; success: string; info: string; error: string; muted: string; font: string; code: string; display: string };

/** 到達の 4 つの色 (まだ・間違えた・1 回・2 回続けて) */
const masteryColor = (t: CardTheme) => ({ new: t.muted, wrong: t.error, once: t.info, twice: t.success });

/** canvas に描く。ctx は 2D の文脈 (テストでは描いた字を拾う偽物を渡す) */
export function drawSummary(ctx: CanvasRenderingContext2D, s: Summary, t: CardTheme): void {
  const W = CARD_WIDTH;
  const pad = 80;
  ctx.fillStyle = t.body;
  ctx.fillRect(0, 0, W, CARD_HEIGHT);
  ctx.textBaseline = 'alphabetic';

  // 題: サイト名 (題字の書体) と副題
  ctx.fillStyle = t.text;
  ctx.font = `120px ${t.display}`;
  ctx.fillText(SITE_NAME, pad, 200);
  ctx.fillStyle = t.sub;
  ctx.font = `40px ${t.font}`;
  ctx.fillText(`${SITE_TAGLINE} · 学習のまとめ`, pad, 270);

  // 応答の行の形 (このサイトの見せ方)
  ctx.font = `36px ${t.code}`;
  ctx.fillText('GET /me/stats', pad, 360);
  ctx.fillStyle = t.success;
  ctx.font = `600 52px ${t.code}`;
  ctx.fillText('200 OK', pad, 430);

  // 数の 4 つ (2 列 × 2 行)
  const stats: [string, string][] = [
    ['学んだ期間', `${s.spanDays} 日`],
    ['学んだ日', `${s.studied} 日`],
    ['解いた問題', `${s.answered} 問`],
    ['連続', `${s.streak} 日`],
  ];
  const boxW = (W - pad * 2 - 40) / 2;
  stats.forEach(([k, v], i) => {
    const x = pad + (i % 2) * (boxW + 40);
    const y = 490 + Math.floor(i / 2) * 170;
    ctx.fillStyle = t.surface;
    ctx.fillRect(x, y, boxW, 140);
    ctx.strokeStyle = t.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, boxW - 2, 138);
    ctx.fillStyle = t.sub;
    ctx.font = `32px ${t.font}`;
    ctx.fillText(k, x + 28, y + 50);
    ctx.fillStyle = t.text;
    ctx.font = `600 56px ${t.code}`;
    ctx.fillText(v, x + 28, y + 115);
  });

  // コースごとの到達 (帯と数)
  ctx.fillStyle = t.text;
  ctx.font = `600 38px ${t.font}`;
  ctx.fillText('問題ごとの到達', pad, 880);
  const colors = masteryColor(t);
  // 920〜1170 に収める (コースが増えたら行を詰める)
  const rowH = Math.min(80, 250 / Math.max(1, s.courses.length));
  s.courses.forEach((c, i) => {
    const y = 910 + i * rowH;
    ctx.fillStyle = t.sub;
    ctx.font = `30px ${t.font}`;
    ctx.fillText(c.title, pad, y + 26);
    ctx.font = `28px ${t.code}`;
    const label = `2 回続けて ${c.counts.twice} / ${c.counts.total} (${share(c.counts.twice, c.counts.total)}%)`;
    ctx.fillText(label, W - pad - ctx.measureText(label).width, y + 26);
    let x = pad;
    const barW = W - pad * 2;
    for (const m of MASTERY_ORDER) {
      const w = c.counts.total > 0 ? (c.counts[m] / c.counts.total) * barW : 0;
      ctx.fillStyle = colors[m];
      ctx.fillRect(x, y + 36, w, 10);
      x += w;
    }
  });

  // 凡例 (2 列 × 2 行) と URL
  ctx.font = `26px ${t.font}`;
  MASTERY_ORDER.forEach((m, i) => {
    const lx = pad + (i % 2) * 460;
    const ly = CARD_HEIGHT - 160 + Math.floor(i / 2) * 44;
    ctx.fillStyle = colors[m];
    ctx.fillRect(lx, ly - 20, 22, 22);
    ctx.fillStyle = t.sub;
    ctx.fillText(MASTERY_LABELS[m], lx + 34, ly);
  });
  ctx.fillStyle = t.sub;
  ctx.font = `28px ${t.code}`;
  ctx.fillText('maco165.github.io/gantlo/', pad, CARD_HEIGHT - 50);
}

/** 書き出す PNG の名前 */
export const cardFileName = (now: Date): string => `gantlo-summary-${dayKey(now)}.png`;
