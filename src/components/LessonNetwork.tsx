import { Text } from '@astryxdesign/core/Text';
import { LESSONS } from '../content/index';
import { STAGES } from '../content/stages';
import type { Lesson } from '../content/types';
import { LESSON_LIST_HEADING } from '../lib/courses';
import { currentLesson, isDone, planLessons } from '../lib/plan';
import type { Progress } from '../lib/progress';
import { COURSES, lessonHref, type CourseId } from '../lib/route';

/**
 * 開発者ツールの Network タブの見立て。レッスン 1 つが 1 行 (Name・Status・形・Waterfall) で、
 * 学ぶ順に並べると Waterfall の列が 1 本のガントチャートになる。済んだ行は 200、今ここの行は「次」
 */
export default function LessonNetwork({
  courses,
  progress,
  lessons = LESSONS,
  empty = '学ぶ順のコースに、まだレッスンがありません。',
}: {
  courses: readonly CourseId[];
  progress: Progress;
  lessons?: readonly Lesson[];
  /** レッスンが 1 つも無いときの文 */
  empty?: string;
}) {
  const rows = planLessons(courses, lessons);
  const here = currentLesson(courses, progress, lessons);
  const doneCount = rows.filter((l) => isDone(progress, l.id)).length;
  return (
    <section className="net" aria-labelledby="net-title">
      <header className="wf__head">
        <h2 id="net-title" className="display">
          {LESSON_LIST_HEADING}
        </h2>
        <Text type="supporting">
          {rows.length} レッスンのうち {doneCount} 済み
        </Text>
      </header>
      {rows.length === 0 ? (
        <Text type="supporting">{empty}</Text>
      ) : (
        <table className="net__table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Status</th>
              <th scope="col" className="net__type">
                形
              </th>
              <th scope="col">Waterfall</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l, i) => {
              const done = isDone(progress, l.id);
              const next = here?.lesson.id === l.id;
              const state = done ? 'done' : next ? 'next' : 'todo';
              const type = STAGES.find((s) => s.id === l.stage)?.name ?? COURSES.find((c) => c.id === l.course)?.title ?? l.course;
              return (
                <tr key={l.id} className={`net__row net__row--${state}`} data-lesson={l.id} data-state={state}>
                  <td className="net__name">
                    <a href={lessonHref(l.id)}>{l.title}</a>
                  </td>
                  <td className={`net__status net__status--${state}`}>
                    {done ? (
                      <>
                        <code>200</code> 完了
                      </>
                    ) : next ? (
                      '次'
                    ) : (
                      <span aria-label="未学習">—</span>
                    )}
                  </td>
                  <td className="net__type">{type}</td>
                  <td className="net__wf" aria-hidden="true">
                    <span className="net__track">
                      <span className={`net__bar net__bar--${state}`} style={{ left: `${(i / rows.length) * 100}%`, width: `${100 / rows.length}%` }} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
