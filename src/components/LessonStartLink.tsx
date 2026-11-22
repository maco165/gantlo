import { lessonHref } from '../lib/route';

/** 始めるボタンの日本語。まだ 1 つも済ませていなければ「最初のレッスンを始める」、ほかは「次のレッスンを始める」 */
export function startLabel(isFirst: boolean): string {
  return isFirst ? '最初のレッスンを始める' : '次のレッスンを始める';
}

/**
 * レッスンを開くボタンの形のリンク (ホーム・コース・計画)。何をするボタンかを日本語で書き、
 * その下に HTTP のリクエストの形 (GET /lesson/<id>) を添える (HTTP で見せるサイトの特徴は残す)
 */
export default function LessonStartLink({ lessonId, isFirst }: { lessonId: string; isFirst: boolean }) {
  return (
    <a className="btn btn--primary btn--start" href={lessonHref(lessonId)}>
      <span className="btn__label">{startLabel(isFirst)}</span>
      <code className="btn__request">GET /lesson/{lessonId}</code>
    </a>
  );
}
