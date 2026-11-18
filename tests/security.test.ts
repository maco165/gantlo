import { describe, expect, it } from 'vitest';
import { lessonsOf } from '../src/content/index';

// 要件 R-12: セキュリティのコースは、各レッスンと実習に「試すのは自分で用意したラボの中だけ」の注意を書く
const PHRASES = ['自分で用意したラボの中だけ', '不正アクセス禁止法'];

describe('セキュリティのコースの注意', () => {
  const lessons = lessonsOf('security');

  it('コースのレッスンが 1 つ以上ある', () => {
    expect(lessons.length).toBeGreaterThan(0);
  });

  it('各レッスンの最初の問題の prompt に注意がある', () => {
    for (const lesson of lessons) {
      const first = lesson.questions[0];
      for (const phrase of PHRASES) expect(first.prompt, `${first.id}: ${phrase}`).toContain(phrase);
    }
  });

  it('すべての実習 (lab) の prompt に注意がある', () => {
    const labs = lessons.flatMap((l) => l.questions).filter((q) => q.kind === 'lab');
    expect(labs.length).toBeGreaterThan(0);
    for (const q of labs) {
      for (const phrase of PHRASES) expect(q.prompt, `${q.id}: ${phrase}`).toContain(phrase);
    }
  });
});
