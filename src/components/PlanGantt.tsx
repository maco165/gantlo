import { Text } from '@astryxdesign/core/Text';
import StatusLine from './StatusLine';
import { currentLesson } from '../lib/plan';
import { dayKey, type Progress } from '../lib/progress';
import { lessonHref } from '../lib/route';
import { buildSchedule, scheduleStatus, verdictLabel, type ScheduleInput } from '../lib/schedule';

/** 12-05 の形 (年は開始日と予定の終わりに出す) */
const md = (day: string) => day.slice(5);

/**
 * 計画のガントチャート。横の軸は日付で、開始日から学ぶ順にコースの目安の日数をつないだ予定の帯を引く。
 * 済んだレッスンの割合だけ帯を塗り、今日に縦の線、今ここ (最初の未完了のレッスン) の予定の位置に印を引く。
 * 済んだ量を今日の予定と比べた巻き・遅れを、ステータス行 (200 / 408) で見せる
 */
export default function PlanGantt({ plan, progress, now }: { plan: ScheduleInput; progress: Progress; now: Date }) {
  const s = buildSchedule(plan, progress, now);
  const here = currentLesson(plan.courses, progress);
  const total = s.bars.reduce((sum, b) => sum + b.count, 0);
  return (
    <section className="gantt" aria-labelledby="gantt-title" data-verdict={s.verdict.kind} data-verdict-days={s.verdict.days}>
      <header className="wf__head">
        <h2 id="gantt-title" className="display">
          Gantt
        </h2>
        <Text type="supporting">
          横の軸は日付。帯の長さはコースの目安の日数 (全 {total} レッスン・{s.totalDays} 日)。予定は目安で、期限は持ちません
        </Text>
      </header>
      {s.bars.length === 0 ? (
        <Text type="supporting">コースを選ぶと、ここに帯を引きます。</Text>
      ) : (
        <>
          <div className="gantt__verdict" aria-live="polite">
            <StatusLine status={scheduleStatus(s)} request="GET /plan/schedule" />
          </div>
          <Text type="supporting">
            開始 {s.start}
            {s.end && ` → 予定の終わり ${s.end}`}・今日 {md(dayKey(now))}・{verdictLabel(s.verdict)}
          </Text>
          <ol className="gantt__rows">
            {s.bars.map((b) => (
              <li
                key={b.course}
                className="gantt__row"
                data-course={b.course}
                data-count={b.count}
                data-done={b.done}
                data-days={b.days}
                data-first={b.first ?? ''}
                data-last={b.last ?? ''}
              >
                <span className="gantt__name">{b.title}</span>
                <span className="gantt__count">
                  <Text type="supporting">
                    {b.first && b.last ? `${b.done}/${b.count} 済み・${b.days} 日 (${md(b.first)}〜${md(b.last)})` : '準備中 (0 レッスン)'}
                  </Text>
                </span>
                <span className="gantt__track" aria-hidden="true">
                  <span className="gantt__bar" style={{ left: `${b.left}%`, width: `${b.width}%` }} />
                  <span className="gantt__done" style={{ left: `${b.left}%`, width: `${b.doneWidth}%` }} />
                  {s.hereLeft !== null && <span className="gantt__here" style={{ left: `${s.hereLeft}%` }} />}
                  <span className="gantt__today" style={{ left: `${s.todayLeft}%` }} />
                </span>
              </li>
            ))}
          </ol>
          <p className="gantt__legend">
            <span className="gantt__key gantt__key--today">今日</span>
            <span className="gantt__key gantt__key--here">今ここ</span>
            <span className="gantt__key gantt__key--done">済み</span>
          </p>
          {here ? (
            <p className="gantt__next">
              <span className="gantt__here-label">今ここ</span> {here.index + 1} / {here.total} 番目「{here.lesson.title}」{' '}
              <a className="btn btn--primary" href={lessonHref(here.lesson.id)}>
                <code>GET /lesson/{here.lesson.id}</code>
              </a>
            </p>
          ) : total > 0 ? (
            <Text type="supporting">計画のレッスンを全部済ませました。</Text>
          ) : null}
        </>
      )}
    </section>
  );
}
