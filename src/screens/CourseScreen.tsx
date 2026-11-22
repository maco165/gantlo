import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import LessonNetwork from '../components/LessonNetwork';
import LessonStartLink from '../components/LessonStartLink';
import StatusLine from '../components/StatusLine';
import { CATALOG, type LessonMeta } from '../content/catalog';
import { COURSE_EMPTY, COURSE_LEADS } from '../lib/courses';
import { currentLesson, isDone } from '../lib/plan';
import type { Progress } from '../lib/progress';
import { COURSES, pageHref, type CourseId } from '../lib/route';
import { courseStatus } from '../lib/status';

/**
 * コースの画面 = GET /course/<id> への応答。そのコースのレッスンを Network の表に順に並べ、済んだ行は 200 完了、
 * 最初の未完了の行を「次」にする。ステータスはホームと同じ決まり (まだ 202・途中 206・全部済み 200。レッスンが無ければ 204)。
 * 見出し・紹介・一覧の順は書き出す HTML (src/prerender/pages.ts) と同じ
 */
export default function CourseScreen({ course, progress, lessons = CATALOG }: { course: CourseId; progress: Progress; lessons?: readonly LessonMeta[] }) {
  const title = COURSES.find((c) => c.id === course)?.title ?? course;
  const own = lessons.filter((l) => l.course === course);
  const done = own.filter((l) => isDone(progress, l.id)).length;
  const here = currentLesson([course], progress, lessons);
  return (
    <div className="page" data-course={course}>
      <h1 className="page__title">{title}</h1>
      <StatusLine status={courseStatus(done, own.length)} request={`GET /course/${course}`} />
      <Text>{COURSE_LEADS[course]}</Text>
      {here ? (
        <p className="home__next">
          <Text type="supporting">次のレッスン「{here.lesson.title}」</Text>
          <LessonStartLink lessonId={here.lesson.id} isFirst={done === 0} />
        </p>
      ) : own.length > 0 ? (
        <Text type="supporting">このコースのレッスンを全部済ませました。</Text>
      ) : null}
      <LessonNetwork courses={[course]} progress={progress} lessons={lessons} empty={COURSE_EMPTY} />
      <Text type="supporting">
        学ぶコースと順は <Link href={pageHref('plan')}>計画 (Gantt)</Link> で組みます。
      </Text>
    </div>
  );
}
