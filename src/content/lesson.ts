// レッスンの画面 (/lesson/<id>/) が読む問題データ。全部のデータ (content/index.ts) ではなく、そのレッスンを持つファイルだけを読む
// (どのファイルかは目録の LESSON_FILE で引く)。1 つのファイルは 1 回だけ読み、同じ Promise を返す (React の use で待つため)
import { LESSON_FILE } from './catalog';
import type { Lesson, LessonFile } from './types';

const LOADERS = import.meta.glob<LessonFile>('./courses/*/*.json', { import: 'default' });
const cache = new Map<string, Promise<Lesson | undefined>>();

/** レッスン 1 つを読む。目録に無い id は undefined */
export function loadLesson(lessonId: string): Promise<Lesson | undefined> {
  let p = cache.get(lessonId);
  if (!p) {
    const file = LESSON_FILE.get(lessonId);
    const load = file ? LOADERS[file] : undefined;
    p = load ? load().then((f) => f.lessons.find((l) => l.id === lessonId)) : Promise.resolve(undefined);
    cache.set(lessonId, p);
  }
  return p;
}
