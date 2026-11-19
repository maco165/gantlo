// テスト用の見本のレッスン。本物の問題データ (src/content/courses) は書き直されるので、採点や並べ替えのテストはこれを使う。
// 中身は check-content-sample.json (問題データの検査の見本) と同じで、command・http・order (4 項目)・choice・lab を 1 問ずつ持つ
import type { Lesson, LessonFile } from '../../src/content/types';
import sample from './check-content-sample.json';

export const sampleLesson: Lesson = (sample as unknown as LessonFile).lessons[0];
