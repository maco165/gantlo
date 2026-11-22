import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import StatusLine from './StatusLine';
import { currentLesson } from '../lib/plan';
import { MAX_RANGE_DAYS, addDays, dayKey, rangeProblem, type GanttView, type Progress } from '../lib/progress';
import LessonStartLink from './LessonStartLink';
import { buildSchedule, labelTicks, scheduleStatus, verdictLabel, verdictTone, type ScheduleInput } from '../lib/schedule';
import { WIDE_QUERY, useMediaQuery } from '../lib/useMediaQuery';

/** 12-05 の形 (年は開始日と予定の終わりに出す) */
const md = (day: string) => day.slice(5);

const VIEWS: readonly { kind: GanttView['kind']; label: string }[] = [
  { kind: 'all', label: '全体' },
  { kind: '2w', label: '2 週' },
  { kind: '1m', label: '1 か月' },
  { kind: 'range', label: '指定' },
];

/**
 * 目盛りの字と字の間 (軸の幅に対する %)。狭い画面は軸が 360px ほどなので 18% (約 64px)、広い画面は 12% 空ける。
 * 「2027年1月」がおよそ 60px なので、これで字が重ならない
 */
const TICK_GAP = { narrow: 18, wide: 12 };

/** 指定の期間の誤りごとの補助の文 */
const RANGE_HELP = {
  empty: '始まりと終わりの日付を入れてください。',
  order: '終わりの日は始まりの日と同じかあとにしてください。',
  long: `期間は 2 年 (${MAX_RANGE_DAYS} 日) までにしてください。`,
} as const;

const minDay = (a: string, b: string) => (a < b ? a : b);

type Props = { plan: ScheduleInput; progress: Progress; now: Date; view: GanttView; onView: (v: GanttView) => void };

/**
 * 計画のガントチャート。横の軸は日付で、開始日から学ぶ順にコースの目安の日数をつないだ予定の帯を引く。
 * 表示する期間 (全体・今日から 2 週・1 か月・日付の指定) を選べ、帯の上に週の頭と月の境の目盛りを出す。期間の外の帯は端で切る。
 * 済んだレッスンの割合だけ帯を塗り、今日に縦の線、今ここ (最初の未完了のレッスン) の予定の位置に印を引く。
 * 済んだ量を今日の予定と比べた巻き・遅れを、ステータス行と色で見せる (予定どおりは緑・巻きは青・遅れは赤。字でも書く)
 */
export default function PlanGantt({ plan, progress, now, view, onView }: Props) {
  const wide = useMediaQuery(WIDE_QUERY);
  const s = buildSchedule(plan, progress, now, undefined, view);
  const here = currentLesson(plan.courses, progress);
  const total = s.bars.reduce((sum, b) => sum + b.count, 0);
  const tone = verdictTone(s.verdict);
  const gap = wide ? TICK_GAP.wide : TICK_GAP.narrow;
  const ticks = labelTicks(s.ticks, gap);
  // 日付の指定の入力の途中 (空・終わりが始まりより前・2 年を超えるなど) は、ここに持って知らせ、軸は変えない
  const [range, setRange] = useState(() => (view.kind === 'range' ? { from: view.from, to: view.to } : null));
  const rangeFrom = range?.from ?? s.start;
  // 初めて指定を選んだときは開始日から予定の終わりまで。ただし 2 年を超えるなら 2 年まで
  const rangeTo = range?.to ?? minDay(s.end ?? addDays(s.start, 13), addDays(s.start, MAX_RANGE_DAYS - 1));
  const problem = rangeProblem(rangeFrom, rangeTo);
  const rangeInvalid = problem !== null;
  const changeRange = (from: string, to: string) => {
    setRange({ from, to });
    if (rangeProblem(from, to) === null) onView({ kind: 'range', from, to });
  };
  const choose = (kind: string) => {
    if (kind === 'range') changeRange(rangeFrom, rangeTo);
    else onView({ kind: kind as 'all' | '2w' | '1m' });
  };

  return (
    <section
      className={`gantt${tone ? ` gantt--${tone}` : ''}`}
      aria-labelledby="gantt-title"
      data-verdict={s.verdict.kind}
      data-verdict-days={s.verdict.days}
      data-view={view.kind}
      data-axis-start={s.axisStart}
      data-axis-end={s.axisEnd}
    >
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
            <StatusLine status={scheduleStatus(s)} request="GET /plan/schedule" tone={tone} />
          </div>
          <Text type="supporting">
            開始 {s.start}
            {s.end && ` → 予定の終わり ${s.end}`}・今日 {md(dayKey(now))}・{verdictLabel(s.verdict)}
          </Text>
          <div className="gantt__view">
            <SegmentedControl label="表示する期間" layout="fill" value={view.kind} onChange={choose}>
              {VIEWS.map((v) => (
                <SegmentedControlItem key={v.kind} value={v.kind} label={v.label} />
              ))}
            </SegmentedControl>
            {view.kind === 'range' && (
              <p className="plan__field gantt__range">
                <span className="gantt__range-pair">
                  <input
                    id="gantt-from"
                    type="date"
                    value={rangeFrom}
                    onChange={(e) => changeRange(e.target.value, rangeTo)}
                    aria-invalid={rangeInvalid ? 'true' : undefined}
                    aria-describedby={rangeInvalid ? 'gantt-range-error' : undefined}
                  />
                  <label htmlFor="gantt-from">から</label>
                </span>
                <span className="gantt__range-pair">
                  <input
                    id="gantt-to"
                    type="date"
                    value={rangeTo}
                    onChange={(e) => changeRange(rangeFrom, e.target.value)}
                    aria-invalid={rangeInvalid ? 'true' : undefined}
                    aria-describedby={rangeInvalid ? 'gantt-range-error' : undefined}
                  />
                  <label htmlFor="gantt-to">まで</label>
                </span>
                {rangeInvalid && (
                  <span id="gantt-range-error" className="plan__error">
                    {RANGE_HELP[problem!]}今は {s.axisStart}〜{s.axisEnd} を出しています
                  </span>
                )}
              </p>
            )}
            <Text type="supporting">
              表示 {s.axisStart}〜{s.axisEnd} ({s.axisDays} 日)
            </Text>
          </div>
          <div className="gantt__axis" aria-hidden="true">
            <span className="gantt__ticks">
              {ticks.map((t) => (
                <span
                  key={t.day}
                  className={`gantt__tick gantt__tick--${t.kind}${t.left > 100 - gap ? ' gantt__tick--end' : ''}`}
                  style={{ left: `${t.left}%` }}
                  data-day={t.day}
                >
                  {t.label && <span className="gantt__tick-label">{t.label}</span>}
                </span>
              ))}
            </span>
          </div>
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
                    {b.days > 0 && b.width === 0 && '・表示の外'}
                  </Text>
                </span>
                <span className="gantt__track" aria-hidden="true">
                  {ticks.map((t) => (
                    <span key={t.day} className={`gantt__grid gantt__grid--${t.kind}`} style={{ left: `${t.left}%` }} />
                  ))}
                  <span
                    className={`gantt__bar${b.cutStart ? ' gantt__bar--cut-start' : ''}${b.cutEnd ? ' gantt__bar--cut-end' : ''}`}
                    style={{ left: `${b.left}%`, width: `${b.width}%` }}
                  />
                  <span
                    className={`gantt__done${b.cutStart ? ' gantt__bar--cut-start' : ''}`}
                    style={{ left: `${b.left}%`, width: `${b.doneWidth}%` }}
                  />
                  {s.hereLeft !== null && <span className="gantt__here" style={{ left: `${s.hereLeft}%` }} />}
                  {s.todayLeft !== null && <span className="gantt__today" style={{ left: `${s.todayLeft}%` }} />}
                </span>
              </li>
            ))}
          </ol>
          <p className="gantt__legend">
            <span className="gantt__key gantt__key--today">今日</span>
            <span className="gantt__key gantt__key--here">今ここ</span>
            <span className="gantt__key gantt__key--done">済み ({verdictLabel(s.verdict)})</span>
          </p>
          {here ? (
            <p className="gantt__next">
              <span className="gantt__here-label">今ここ</span> {here.index + 1} / {here.total} 番目「{here.lesson.title}」{' '}
              <LessonStartLink lessonId={here.lesson.id} isFirst={here.index === 0} />
            </p>
          ) : total > 0 ? (
            <Text type="supporting">計画のレッスンを全部済ませました。</Text>
          ) : null}
        </>
      )}
    </section>
  );
}
