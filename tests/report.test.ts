import { describe, expect, it } from 'vitest';
import { CATALOG } from '../src/content/catalog';
import { lessonOfQuestion, reportIssueUrl } from '../src/lib/report';
import { NEW_ISSUE_URL } from '../src/lib/site';

// 問題ごとの「誤りを報告」(A6)。GitHub の新しい Issue を、題と本文を入れた状態で開く
describe('誤りを報告のリンク', () => {
  const lesson = CATALOG.find((l) => l.questions.length > 0)!;
  const qid = lesson.questions[0].id;
  const url = new URL(reportIssueUrl(qid));
  const title = url.searchParams.get('title') ?? '';
  const body = url.searchParams.get('body') ?? '';

  it('GitHub の新しい Issue (about と同じ NEW_ISSUE_URL) を開き、?title= と ?body= だけを付ける', () => {
    expect(`${url.origin}${url.pathname}`).toBe(NEW_ISSUE_URL);
    expect([...url.searchParams.keys()]).toEqual(['title', 'body']);
  });

  it('題と本文に問題の id・レッスン・レッスンのページの URL が入る', () => {
    expect(title).toContain(qid);
    expect(title).toContain(lesson.title);
    expect(body).toContain(`問題の id: ${qid}`);
    expect(body).toContain(`(${lesson.id})`);
    expect(body).toContain(`https://maco165.github.io/gantlo/lesson/${lesson.id}/`);
  });

  it('すべての問題で、問題の id からレッスンを引ける (目録だけを使い、問題の本文は読まない)', () => {
    for (const l of CATALOG) for (const q of l.questions) expect(lessonOfQuestion(q.id)?.id, q.id).toBe(l.id);
  });

  it('記号を含む題も URL の値として壊れない (encodeURIComponent)。知らない id でも開ける', () => {
    const odd = new URL(reportIssueUrl('a&b=c#d'));
    expect(odd.searchParams.get('title')).toBe('問題の誤り: a&b=c#d');
    expect(odd.hash).toBe('');
    expect(odd.searchParams.get('body')).not.toContain('レッスン:');
  });

  it('個人の情報 (記録・自分の答え) を入れない: 中身は問題の id とデータだけから決まる', () => {
    localStorage.setItem('gantlo.v1', JSON.stringify({ secret: 'my-private-note' }));
    expect(reportIssueUrl(qid)).toBe(url.toString());
    expect(reportIssueUrl(qid)).not.toContain('my-private-note');
    localStorage.clear();
  });
});
