// 結果の共有 (#55 の 7)。共有する文は点数とページの URL だけで、Web Share API が無い端末は X の投稿とリンクのコピーにする。
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ShareButtons from '../src/components/ShareButtons';
import { examShare, lessonShare, xPostUrl } from '../src/lib/share';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  // jsdom には matchMedia が無い。狭い画面として描く
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia;
  }
});

describe('共有する文と URL', () => {
  it('レッスンは点数とそのレッスンのページの URL だけ', () => {
    expect(lessonShare('main-w1-l1', 4, 5)).toEqual({ text: 'gantlo のレッスンで 5 問中 4 問正解しました', url: 'https://maco165.github.io/gantlo/lesson/main-w1-l1/' });
  });
  it('模擬試験は点数と割合と模擬試験のページの URL だけ', () => {
    expect(examShare(30, 40)).toEqual({ text: 'gantlo の模擬試験で 40 問中 30 問正解しました (75%)', url: 'https://maco165.github.io/gantlo/exam/' });
  });
  it('X の投稿の URL は文と URL を別の引数で、エンコードして渡す', () => {
    const u = new URL(xPostUrl(examShare(30, 40)));
    expect(u.origin + u.pathname).toBe('https://x.com/intent/post');
    expect(u.searchParams.get('text')).toBe('gantlo の模擬試験で 40 問中 30 問正解しました (75%)');
    expect(u.searchParams.get('url')).toBe('https://maco165.github.io/gantlo/exam/');
    expect([...u.searchParams.keys()]).toEqual(['text', 'url']);
  });
});

describe('共有のボタン', () => {
  let host: HTMLElement;
  let root: Root;
  const data = lessonShare('main-w1-l1', 4, 5);
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    delete (navigator as { share?: unknown }).share;
  });

  it('Web Share API が無い端末は、X に投稿 (新しいタブ) とリンクのコピー', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await act(async () => root.render(createElement(ShareButtons, { data })));
    const x = host.querySelector('a[href^="https://x.com/intent/post"]');
    expect(x?.getAttribute('href')).toBe(xPostUrl(data));
    expect(x?.getAttribute('target')).toBe('_blank');
    const copy = [...host.querySelectorAll('button')].find((b) => b.textContent === 'リンクをコピー')!;
    await act(async () => copy.click());
    expect(writeText).toHaveBeenCalledWith(data.url);
    expect(host.textContent).toContain('ページの URL をコピーしました');
  });

  it('Web Share API がある端末は「共有する」1 つで、文と URL だけを渡す', async () => {
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    await act(async () => root.render(createElement(ShareButtons, { data })));
    expect(host.querySelector('a[href^="https://x.com"]')).toBeNull();
    const btn = [...host.querySelectorAll('button')].find((b) => b.textContent === '共有する')!;
    await act(async () => btn.click());
    expect(share).toHaveBeenCalledWith({ text: data.text, url: data.url });
  });
});
