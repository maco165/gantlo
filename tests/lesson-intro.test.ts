// レッスンの要点 (intro) と、穴埋めの誤答ごとの説明の画面。はじめてのレッスンは要点を読んでから始め、済みのレッスンと復習では要点を飛ばす
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Lesson } from '../src/content/types';
import { INTRO_START_LABEL, INTRO_SUMMARY } from '../src/lib/intro';
import { completeLesson, emptyProgress, type Progress } from '../src/lib/progress';
import LessonScreen from '../src/screens/LessonScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
beforeEach(() => {
  window.matchMedia ??= ((query: string) =>
    ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList) as typeof window.matchMedia;
  window.scrollTo = () => {};
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const lesson: Lesson = {
  id: 'main-w1-l1',
  title: 'メソッド',
  course: 'main',
  stage: 'http',
  intro: {
    goals: ['メソッドを区別できる', 'ステータスを読む', 'curl で確かめる'],
    body: ['要求はメソッドで何をしたいかを伝えます。'],
    figure: { kind: 'flow', caption: '流れの図', items: [{ label: '要求' }, { label: '応答', note: 'ステータス' }] },
    tryIt: [{ command: 'curl -sI https://example.com/', expect: 'ステータス行が出ます。' }],
    sources: ['https://www.rfc-editor.org/rfc/rfc9110#section-9.2.1'],
  },
  questions: [
    {
      id: 'main-w1-l1-q1',
      kind: 'command',
      tool: 'curl',
      prompt: 'メソッドを DELETE に変えるオプションを埋めてください。',
      code: 'curl {{blank}} DELETE https://example.com/',
      blanks: [{ answers: ['-X'], wrong: [{ answer: '-d', why: '-d は本文のデータを送るオプションです。' }, { answer: '-H', why: '-H はヘッダーを足すオプションです。' }] }],
      explanation: '全体の解説。',
      sources: ['https://curl.se/docs/manpage.html'],
    },
  ],
};

function Probe({ initial, review }: { initial: Progress; review?: { backHref: string } }) {
  const [p, setP] = useState(initial);
  return createElement(LessonScreen, { lesson, progress: p, updateProgress: (fn: (x: Progress) => Progress) => setP(fn), review });
}

const render = (p: Progress, review?: { backHref: string }) => act(async () => root.render(createElement(Probe, { initial: p, review })));
const button = (name: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(name));
const click = (el: Element | undefined) => act(async () => (el as HTMLElement).click());

/** 空欄に打って答えを送る (React の制御された入力なので、値の setter を通して input を起こす) */
async function answer(value: string) {
  const input = host.querySelector('[data-testid="fill-code"] input') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(button('POST 答えを送る'));
}

describe('レッスンの要点', () => {
  it('はじめてのレッスンは、問題の前に要点 (分かるようになること・説明・図・試すコマンド・出典) を出し、「問題を始める」で 1 問目へ進む', async () => {
    await render(emptyProgress());
    const intro = host.querySelector('[data-testid="lesson-intro"]');
    expect(intro).not.toBeNull();
    const t = intro!.textContent ?? '';
    for (const s of ['メソッドを区別できる', '要求はメソッドで何をしたいかを伝えます。', '流れの図', 'curl -sI https://example.com/', 'www.rfc-editor.org/rfc/rfc9110#section-9.2.1']) expect(t).toContain(s);
    expect(host.querySelector('[data-testid="fill-code"]')).toBeNull();
    expect(host.querySelector('.lesson-bar__label')?.textContent).toContain('要点 · 全 1 問');
    await click(button(INTRO_START_LABEL));
    expect(host.querySelector('[data-testid="lesson-intro"]')).toBeNull();
    expect(host.querySelector('[data-testid="fill-code"]')).not.toBeNull();
    // 始めたあとも、要点は畳んで問題の上に置く
    const folded = host.querySelector('details[data-testid="lesson-intro-folded"]') as HTMLDetailsElement;
    expect(folded.open).toBe(false);
    expect(folded.querySelector('summary')?.textContent).toBe(INTRO_SUMMARY);
  });

  it('済みのレッスンは要点を飛ばして 1 問目を出し、要点は畳んで開けるようにする', async () => {
    const done = completeLesson(emptyProgress(), lesson.id, { correct: 1, total: 1 }, 10, new Date('2026-11-23T09:00:00'));
    await render(done);
    expect(host.querySelector('[data-testid="lesson-intro"]')).toBeNull();
    expect(host.querySelector('[data-testid="fill-code"]')).not.toBeNull();
    const folded = host.querySelector('details[data-testid="lesson-intro-folded"]') as HTMLDetailsElement;
    expect(folded.open).toBe(false);
    expect(folded.textContent).toContain('メソッドを区別できる');
    // 畳んだ要点の見出しは h2 (レッスン名の h1 のすぐ下。問題文の h2 と同じ段で、h1 → h3 と段を飛ばさない)
    expect(folded.querySelectorAll('h3, h4, h5, h6')).toHaveLength(0);
    expect(folded.querySelectorAll('h2').length).toBeGreaterThan(0);
  });

  it('復習では要点を出さない (畳んだものも)', async () => {
    await render(emptyProgress(), { backHref: '/gantlo/review/' });
    expect(host.querySelector('[data-testid="lesson-intro"]')).toBeNull();
    expect(host.querySelector('[data-testid="lesson-intro-folded"]')).toBeNull();
    expect(host.querySelector('[data-testid="fill-code"]')).not.toBeNull();
  });
});

describe('穴埋めの誤答ごとの説明', () => {
  it('自分の答えがよくある誤答に当たれば、その答えと「なぜ違うか」を全体の解説の前に出す', async () => {
    await render(emptyProgress(), { backHref: '/gantlo/review/' });
    await answer(' -d ');
    const notes = [...host.querySelectorAll('[data-testid="wrong-note"]')];
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toContain('-d が違う理由');
    expect(notes[0].textContent).toContain('-d は本文のデータを送るオプションです。');
    expect(notes[0].textContent).not.toContain('-H はヘッダー');
    expect(host.querySelector('.response__body')?.textContent).toContain('全体の解説。');
  });

  it('誤答の登録に当たらない誤りと、正解には出さない (今まで通り、正しい答えと解説だけ)', async () => {
    await render(emptyProgress(), { backHref: '/gantlo/review/' });
    await answer('-z');
    expect(host.querySelector('[data-testid="wrong-note"]')).toBeNull();
    expect(host.textContent).toContain('全体の解説。');
    await act(async () => root.unmount());
    root = createRoot(host);
    await render(emptyProgress(), { backHref: '/gantlo/review/' });
    await answer('-X');
    expect(host.querySelector('[data-testid="wrong-note"]')).toBeNull();
  });
});
