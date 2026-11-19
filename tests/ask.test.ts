import { describe, expect, it } from 'vitest';
import { findLesson } from '../src/content/index';
import type { Question } from '../src/content/types';
import { MAX_PROMPT_LENGTH, aiLinks, questionText } from '../src/lib/askAi';

const sample = findLesson('main-w1-l1')!;

// 正解の文字が問題文やコードに偶然出ないよう、テストの中で作った問題も使う
const made: Question[] = [
  {
    id: 't-cmd',
    kind: 'command',
    tool: 'curl',
    prompt: 'ヘッダーだけを見るオプションは?',
    code: 'curl {{blank}} https://example.com/',
    blanks: [{ answers: ['--head-only-answer'] }],
    output: 'OUTPUT-SECRET',
    explanation: 'EXPLANATION-SECRET',
    sources: ['https://curl.se/docs/manpage.html'],
  },
  {
    id: 't-http',
    kind: 'http',
    format: 'http',
    prompt: '空欄を埋める',
    code: 'HTTP/1.1 200 OK\n{{blank}}: {{blank}}',
    blanks: [{ answers: ['X-Answer-One'], match: 'header-name' }, { answers: ['application/x-answer-two'], match: 'media-type' }],
    explanation: 'EXPLANATION-SECRET',
    sources: ['https://www.rfc-editor.org/rfc/rfc9110'],
  },
  {
    id: 't-choice',
    kind: 'choice',
    prompt: 'どれ?',
    choices: [
      { id: 'a', text: '一つ目' },
      { id: 'b', text: '二つ目', why: 'WHY-SECRET' },
    ],
    answer: 'a',
    explanation: 'EXPLANATION-SECRET',
    sources: ['https://www.rfc-editor.org/rfc/rfc9110'],
  },
  {
    id: 't-lab',
    kind: 'lab',
    prompt: '手元で試す',
    steps: [{ text: '打つ', command: 'curl -v https://example.com/' }],
    expected: 'EXPECTED-SECRET',
    explanation: 'EXPLANATION-SECRET',
    sources: ['https://curl.se/docs/manpage.html'],
  },
];

describe('AI に聞くリンク', () => {
  it('Claude と ChatGPT の入力欄に文を入れて開くリンクで、文は URL エンコードされる', () => {
    const text = '問題: a&b=c?d #e\n2 行目';
    const links = aiLinks(text);
    expect(links.claude.startsWith('https://claude.ai/new?q=')).toBe(true);
    expect(links.chatgpt.startsWith('https://chatgpt.com/?q=')).toBe(true);
    for (const url of [links.claude, links.chatgpt]) {
      const q = url.slice(url.indexOf('?q=') + 3);
      // エンコードされずに残ると、& や # で文が切れる
      expect(q).not.toMatch(/[&#?=\s]/);
      expect(decodeURIComponent(q)).toBe(text);
      expect(new URL(url).searchParams.get('q')).toBe(text);
    }
  });

  it.each(sample.questions.map((q) => [q.kind, q] as const))('見本の %s の問題: 問題文が入り、答える前は解説を含まない', (_, q) => {
    const text = questionText(q);
    expect(text).toContain(q.prompt);
    expect(text).not.toContain(q.explanation);
    expect(new URL(aiLinks(text).claude).searchParams.get('q')).toBe(text);
  });

  it.each(made.map((q) => [q.kind, q] as const))('%s: 答える前は正解・解説・実行結果・見えることを含まない', (_, q) => {
    const text = questionText(q);
    expect(text).toContain(q.prompt);
    for (const secret of ['EXPLANATION-SECRET', 'OUTPUT-SECRET', 'EXPECTED-SECRET', 'WHY-SECRET', '--head-only-answer', 'X-Answer-One', 'application/x-answer-two']) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain('正解');
  });

  it('4 択は答える前に選択肢を出すが、どれが正解かは出さない', () => {
    const text = questionText(made[2]);
    expect(text).toContain('A. 一つ目');
    expect(text).toContain('B. 二つ目');
    expect(text).not.toContain('正解');
  });

  it('並べ替えは答える前に項目を出すが、正しい順では並べない (データが正しい順で書かれていても)', () => {
    const order = sample.questions.find((q) => q.kind === 'order')!;
    if (order.kind !== 'order') throw new Error('見本に並べ替えが無い');
    const lines = questionText(order)
      .split('\n')
      .filter((l) => l.startsWith('- '))
      .map((l) => l.slice(2));
    const right = order.answer.map((id) => order.items.find((it) => it.id === id)!.text);
    expect([...lines].sort()).toEqual([...right].sort());
    expect(lines).not.toEqual(right);
    expect(questionText(order)).not.toContain('正解');
  });

  it('答えたあとは自分の答えと正解を添える', () => {
    const text = questionText(made[1], { picked: 'X-Wrong / text/plain', correct: false });
    expect(text).toContain('X-Wrong / text/plain');
    expect(text).toContain('不正解');
    expect(text).toContain('X-Answer-One / application/x-answer-two');
    const choice = questionText(made[2], { picked: 'b', correct: false });
    expect(choice).toContain('「B. 二つ目」で不正解');
    expect(choice).toContain('正解は「A. 一つ目」');
  });

  it('穴埋めの空欄は ____ にする', () => {
    expect(questionText(made[1])).toContain('____: ____');
    expect(questionText(made[1])).not.toContain('{{blank}}');
  });

  it('長すぎる文は切る', () => {
    const long = { ...made[2], prompt: 'あ'.repeat(MAX_PROMPT_LENGTH * 2) };
    expect(questionText(long).length).toBe(MAX_PROMPT_LENGTH);
  });
});
