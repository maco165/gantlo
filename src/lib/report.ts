// 問題ごとの「誤りを報告」のリンク。GitHub の新しい Issue を、題と本文を入れた状態で開く (サイトからは何も送らない)。
// 入れるのは問題の id・レッスン・ページの URL だけで、自分の答えや記録 (個人の情報) は入れない
import { CATALOG, type LessonMeta } from '../content/catalog';
import { COURSES, lessonHref } from './route';
import { NEW_ISSUE_URL, ORIGIN } from './site';

/** 問題の id から、その問題を持つレッスン (目録) を引く。問題データに無ければ undefined */
export function lessonOfQuestion(questionId: string, lessons: readonly LessonMeta[] = CATALOG): LessonMeta | undefined {
  return lessons.find((l) => l.questions.some((q) => q.id === questionId));
}

/**
 * 誤りを報告する Issue の URL。題は「問題の誤り: <問題の id>」、本文は問題の id・レッスン・レッスンのページの URL と、書いてほしいことの欄。
 * 題と本文は URL の ?title= と ?body= に encodeURIComponent で入れる
 */
export function reportIssueUrl(questionId: string, lessons: readonly LessonMeta[] = CATALOG): string {
  const lesson = lessonOfQuestion(questionId, lessons);
  const course = lesson ? (COURSES.find((c) => c.id === lesson.course)?.title ?? lesson.course) : undefined;
  const title = lesson ? `問題の誤り: ${questionId} (${lesson.title})` : `問題の誤り: ${questionId}`;
  const body = [
    '## 問題',
    `- 問題の id: ${questionId}`,
    ...(lesson ? [`- レッスン: ${course} / ${lesson.title} (${lesson.id})`, `- ページ: ${ORIGIN}${lessonHref(lesson.id)}`] : []),
    '',
    '## 誤りと思うところ',
    '(どこが、なぜ誤りか。根拠の一次情報 (RFC など) があれば URL も)',
    '',
    '<!-- 自分の答えや名前・メールアドレスなどの個人の情報は書かないでください -->',
  ].join('\n');
  return `${NEW_ISSUE_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
