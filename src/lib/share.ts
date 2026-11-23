// 結果の共有 (レッスン完了・模擬試験の結果)。共有する文は点数とページの URL だけで、記録 (XP・連続日数・答え) や個人の情報は入れない。
import { lessonHref, pageHref } from './route';
import { ORIGIN, SITE_NAME } from './site';

export type ShareData = { text: string; url: string };

/** レッスンを終えたときの共有 (そのレッスンのページの URL) */
export const lessonShare = (lessonId: string, correct: number, total: number): ShareData => ({
  text: `${SITE_NAME} のレッスンで ${total} 問中 ${correct} 問正解しました`,
  url: `${ORIGIN}${lessonHref(lessonId)}`,
});

/** 模擬試験を終えたときの共有 (模擬試験のページの URL) */
export const examShare = (correct: number, total: number): ShareData => ({
  text: `${SITE_NAME} の模擬試験で ${total} 問中 ${correct} 問正解しました (${total > 0 ? Math.round((correct / total) * 100) : 0}%)`,
  url: `${ORIGIN}${pageHref('exam')}`,
});

/** Web Share API の無い端末で開く、X の投稿の画面の URL (文と URL を別の引数で渡す) */
export const xPostUrl = (d: ShareData): string => `https://x.com/intent/post?${new URLSearchParams({ text: d.text, url: d.url })}`;
