import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import LessonNetwork from '../components/LessonNetwork';
import LessonStartLink from '../components/LessonStartLink';
import StatusLine from '../components/StatusLine';
import Waterfall from '../components/Waterfall';
import { CATALOG, dueReviewCount, type LessonMeta } from '../content/catalog';
import { STAGES } from '../content/stages';
import { stageStates } from '../lib/journey';
import { currentLesson, planLessons, planOrder } from '../lib/plan';
import { currentStreak, goalXp, todayXp, type Progress } from '../lib/progress';
import { COURSES, pageHref } from '../lib/route';
import { freezeText, weeklyTargetText } from '../lib/habits';
import { scheduleHeader } from '../lib/schedule';
import { SITE_NAME, SITE_TAGLINE } from '../lib/site';
import { progressStatus } from '../lib/status';

/**
 * ホーム = GET /me への応答。進み具合はステータス、記録はレスポンスヘッダーの形で読む。
 * 学ぶ順は保存した計画の順で、計画が無ければ全コースを既定の順 (本編 → 追加のコース) で見せる
 */
export default function Home({ progress, now = new Date(), lessons = CATALOG }: { progress: Progress; now?: Date; lessons?: readonly LessonMeta[] }) {
  const states = stageStates(progress, lessons);
  const learned = states.filter((s) => s.learned).length;
  const status = progressStatus(learned, STAGES.length);
  const order = planOrder(progress);
  const here = currentLesson(order, progress, lessons);
  const hasLessons = planLessons(order, lessons).length > 0;
  const extra = COURSES.filter((c) => c.id !== 'main');
  const headers: [string, string][] = [
    ['X-Today-XP', `${todayXp(progress, now)} / ${goalXp(progress)}`],
    ['X-Streak', `${currentStreak(progress, now)} 日連続`],
    // 休みの札 (1 日休んでも連続を切らない札) と、今週 (月曜から) 学んだ日と週の目標
    ['X-Streak-Freeze', freezeText(progress, now)],
    ['X-Weekly-Target', weeklyTargetText(progress, now)],
    // 計画の予定と比べた巻き・遅れ (計画の画面と同じ数え方)。計画を保存する前は「204 計画なし」。取り戻し方は出さず、一言だけ
    ['X-Schedule', scheduleHeader(progress, now, lessons)],
    ['Retry-After', `今日の復習 ${dueReviewCount(progress, now)} 問`],
    ['Link', `追加のコース ${extra.length} つ (${extra.map((c) => `${c.title} ${lessons.filter((l) => l.course === c.id).length}`).join('・')} レッスン)`],
  ];
  return (
    <div className="page">
      <h1 className="page__title">
        {SITE_NAME} — {SITE_TAGLINE}
      </h1>
      <StatusLine status={status} request="GET /me" />
      {here ? (
        <p className="home__next">
          <Text type="supporting">次のレッスン「{here.lesson.title}」</Text>
          <LessonStartLink lessonId={here.lesson.id} isFirst={Object.values(progress.lessons).every((l) => !l.done)} />
        </p>
      ) : hasLessons ? (
        <Text type="supporting">学ぶ順のレッスンを全部済ませました。</Text>
      ) : (
        <p className="home__next">
          <Text type="supporting">学ぶ順のコースにまだレッスンがありません。</Text>
          <Link href={pageHref('plan')}>計画 (Gantt) で組み直す</Link>
        </p>
      )}
      <Waterfall states={states} />
      <section className="headers" aria-labelledby="headers-title">
        <h2 id="headers-title" className="display">
          Response Headers
        </h2>
        <dl className="headers__list">
          {headers.map(([k, v]) => (
            <div key={k} className="headers__row" data-header={k}>
              <dt>
                <code>{k}</code>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <Text type="supporting">記録はこのブラウザ (localStorage) にだけ残します。目標は設定の画面で変えられます。</Text>
      </section>
      <LessonNetwork courses={order} progress={progress} lessons={lessons} />
      <Text type="supporting">
        {progress.plan ? '学ぶ順は保存した計画の順です。' : '計画が無いので、全コースを既定の順 (本編 → 追加のコース) で並べています。'}{' '}
        <Link href={pageHref('plan')}>計画 (Gantt) で組み直す</Link>
      </Text>
    </div>
  );
}
