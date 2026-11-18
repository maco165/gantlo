import { Button } from '@astryxdesign/core/Button';
import { List, ListItem } from '@astryxdesign/core/List';
import { Text } from '@astryxdesign/core/Text';
import { useMemo, useState } from 'react';
import StatusLine from '../components/StatusLine';
import { dueQuestions, isKnownQuestion, type QuestionRef } from '../content/index';
import type { Lesson } from '../content/types';
import { XP_PER_CORRECT } from '../lib/grade';
import { upcomingReview, type Progress } from '../lib/progress';
import { COURSES, pageHref } from '../lib/route';
import { reviewListStatus } from '../lib/status';
import { WIDE_QUERY, useMediaQuery } from '../lib/useMediaQuery';
import LessonScreen from './LessonScreen';

type Props = { progress: Progress; updateProgress: (fn: (p: Progress) => Progress) => void; now?: Date };

const reviewHref = pageHref('review');

/** 予定の日 (YYYY-MM-DD) を「11/24」の形にする */
function formatDay(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${m}/${d}`;
}

const courseTitle = (r: QuestionRef) => COURSES.find((c) => c.id === r.lesson.course)?.title ?? r.lesson.course;

/**
 * 復習の画面 (/gantlo/review/) = GET /me/reviews への応答。
 * 間違えた問題を翌日に出し、予定の日以降に正解するたびに 3 日後・7 日後と間を空ける。7 日後も正解したら卒業。
 * 始めたときの今日の問題を、レッスンの画面 (LessonScreen) で 1 問ずつ解く
 */
export default function Review({ progress, updateProgress, now = new Date() }: Props) {
  const isWide = useMediaQuery(WIDE_QUERY);
  // 解き始めた時点の問題を持つ (答えるたびに今日の一覧から外れても、最後まで同じ問題で解く)
  const [running, setRunning] = useState<QuestionRef[] | null>(null);
  const due = dueQuestions(progress, now);
  const runLesson = useMemo<Lesson | null>(
    () => (running && running.length > 0 ? { id: 'review', title: '今日の復習', course: running[0].lesson.course, questions: running.map((r) => r.question) } : null),
    [running],
  );

  if (runLesson) return <LessonScreen lesson={runLesson} progress={progress} updateProgress={updateProgress} review={{ backHref: reviewHref }} />;

  const upcoming = upcomingReview(progress, now, isKnownQuestion);
  return (
    <div className="page">
      <h1 className="page__title">復習</h1>
      <Text type="supporting">
        間違えた問題を翌日に出し、予定の日に正解するたびに 3 日後・7 日後と間を空けます。7 日後の復習も正解したら卒業です。予定の日より前に正解しても、予定は動きません。
      </Text>
      <StatusLine status={reviewListStatus(due.length)} request="GET /me/reviews?due=today" />
      <section className="review" aria-labelledby="review-today">
        <h2 id="review-today" className="review__title">
          今日の復習 {due.length} 問
        </h2>
        {due.length > 0 ? (
          <>
            <Text type="supporting">1 問正解で {XP_PER_CORRECT} XP。終えると連続日数も進みます。</Text>
            <List hasDividers>
              {due.map((r) => (
                <ListItem key={r.question.id} align="first-line" label={<Text>{r.question.prompt}</Text>} description={`${courseTitle(r)} · ${r.lesson.title}`} />
              ))}
            </List>
            <p>
              <Button variant="primary" label="復習を始める" onClick={() => setRunning(due)} width={isWide ? undefined : '100%'} size="lg" />
            </p>
          </>
        ) : (
          <Text type="supporting">
            {upcoming ? `今日の復習はありません。次は ${formatDay(upcoming.day)} に ${upcoming.count} 問です。` : '復習する問題はまだありません。レッスンで間違えた問題がここに来ます。'}
          </Text>
        )}
      </section>
    </div>
  );
}
