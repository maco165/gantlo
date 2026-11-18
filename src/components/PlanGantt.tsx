import { Text } from '@astryxdesign/core/Text';
import { currentLesson, planBars } from '../lib/plan';
import type { Progress } from '../lib/progress';
import { lessonHref, type CourseId } from '../lib/route';

/**
 * 計画のガントチャート。横の軸はレッスンの数 (日付ではない)。
 * 帯の長さはコースのレッスンの数に比例し、済んだ数だけ塗る。「今ここ」は計画の順で最初の未完了のレッスンに縦の印を引く
 */
export default function PlanGantt({ courses, progress }: { courses: readonly CourseId[]; progress: Progress }) {
  const bars = planBars(courses, progress);
  const here = currentLesson(courses, progress);
  const total = bars.reduce((s, b) => s + b.count, 0);
  return (
    <section className="gantt" aria-labelledby="gantt-title">
      <header className="wf__head">
        <h2 id="gantt-title" className="display">
          Gantt
        </h2>
        <Text type="supporting">横の長さはレッスンの数 (全 {total} レッスン)。期限は持ちません</Text>
      </header>
      {bars.length === 0 ? (
        <Text type="supporting">コースを選ぶと、ここに帯を引きます。</Text>
      ) : (
        <>
          <ol className="gantt__rows">
            {bars.map((b) => (
              <li key={b.course} className="gantt__row" data-course={b.course} data-count={b.count} data-done={b.done}>
                <span className="gantt__name">{b.title}</span>
                <span className="gantt__count">
                  <Text type="supporting">{b.count === 0 ? '準備中 (0 レッスン)' : `${b.done}/${b.count} 済み`}</Text>
                </span>
                <span className="gantt__track" aria-hidden="true">
                  <span className="gantt__bar" style={{ left: `${b.left}%`, width: `${b.width}%` }} />
                  <span className="gantt__done" style={{ left: `${b.left}%`, width: `${b.doneWidth}%` }} />
                  {here && <span className="gantt__here" style={{ left: `${here.left}%` }} />}
                </span>
              </li>
            ))}
          </ol>
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
