// コースの紹介の正本。画面 (src/screens/CourseScreen.tsx) と書き出し (src/prerender/pages.ts) が同じ文を使う。
import type { CourseId } from './route';

/** コースごとの紹介。コースの画面の頭と、書き出す HTML のコースのページの説明・本文の頭が同じ文を使う */
export const COURSE_LEADS: Record<CourseId, string> = {
  main: 'ブラウザに URL を打ってから画面が出るまでの「リクエストの旅」に沿って、第 1 週 HTTP・URI・JSON・MIME・UTF-8、第 2 週 DNS・TCP/IP・TLS、第 3 週 REST と OpenAPI、第 4 週 OAuth 2.0 と JWT を学ぶ本編。',
  spring: 'Spring Boot のアプリが起動する流れと、リクエストを受けて応答を返す流れを、Spring の公式文書に沿って学ぶ追加のコース。',
  'tech-history': 'インターネットと Web の技術が、どんな困りごとに答えて生まれ、今どう使われているかを「困りごと → 答え → 今」の型でたどる追加のコース。',
  'mgmt-history': 'ガントチャートを軸に、それより前と後の計画と管理の方法を「困りごと → 答え → 今」の型でたどる追加のコース。',
  security: '暗号の基本と、Web の攻撃と対策を学ぶ追加のコース。試すのは自分で用意したラボの中だけにします。',
};

/**
 * レッスンの一覧の見出し (開発者ツールの Network タブの見立て)。ホームとコースの画面の表 (components/LessonNetwork.tsx) と、
 * 書き出す HTML のコースのページの見出しが同じものを使う (JS の画面と書き出しで見出しが食い違わないように)
 */
export const LESSON_LIST_HEADING = 'Network';

/** レッスンがまだ無いコースの文 (画面と書き出しで同じ) */
export const COURSE_EMPTY = 'このコースのレッスンは、これから足します。';
