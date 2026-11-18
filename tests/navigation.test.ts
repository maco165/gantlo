import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isInternalClick, scrollToTop, useRoute } from '../src/lib/route';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** リンクを置き、クリックの判定の結果を返す */
function judge(href: string, init: MouseEventInit = {}, attrs: Record<string, string> = {}) {
  const a = document.createElement('a');
  a.href = href;
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  const span = document.createElement('span');
  a.appendChild(span);
  document.body.appendChild(a);
  let result: HTMLAnchorElement | null | undefined;
  const listener = (e: Event) => {
    result = isInternalClick(e as MouseEvent);
    e.preventDefault();
  };
  document.addEventListener('click', listener);
  span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
  document.removeEventListener('click', listener);
  a.remove();
  return { result, a };
}

describe('クリックを奪うかどうか (isInternalClick)', () => {
  it('同じサイトの置き場所の中のリンクは奪う (中の要素を押しても a を返す)', () => {
    const { result, a } = judge('/gantlo/plan/');
    expect(result).toBe(a);
  });
  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
    ['中ボタン', { button: 1 }],
  ])('%s 付きのクリックは奪わない', (_, init) => {
    expect(judge('/gantlo/plan/', init).result).toBeNull();
  });
  it('新しいタブで開くリンクと保存のリンクは奪わない', () => {
    expect(judge('/gantlo/plan/', {}, { target: '_blank' }).result).toBeNull();
    expect(judge('/gantlo/plan/', {}, { download: '' }).result).toBeNull();
  });
  it('別のサイトと、置き場所の外は奪わない', () => {
    expect(judge('https://github.com/maco165/gantlo').result).toBeNull();
    expect(judge('/other/').result).toBeNull();
  });
});

describe('画面を移ったら先頭へ戻す (scrollToTop)', () => {
  it('AppShell の main の箱をスクロールさせる (window ではない)', () => {
    const main = document.createElement('div');
    main.id = 'astryx-app-shell-main';
    const spy = vi.fn();
    main.scrollTo = spy as unknown as typeof main.scrollTo;
    document.body.appendChild(main);
    scrollToTop();
    expect(spy).toHaveBeenCalledWith(0, 0);
    main.remove();
  });
});

describe('画面を移る操作の回数 (useRoute の nav)', () => {
  let host: HTMLDivElement;
  let seen: { name: string; nav: number }[];
  function Probe() {
    const { route, nav } = useRoute();
    seen.push({ name: route.name, nav });
    return createElement('a', { href: '/gantlo/plan/', id: 'to-plan' }, 'plan');
  }
  beforeEach(() => {
    window.history.replaceState(null, '', '/gantlo/');
    host = document.createElement('div');
    document.body.appendChild(host);
    seen = [];
  });
  afterEach(() => host.remove());

  it('同じ画面のリンクを押しても増え、戻るでも増える (スマホのメニューを閉じる合図)', async () => {
    const root = createRoot(host);
    await act(async () => root.render(createElement(Probe)));
    const link = () => host.querySelector('#to-plan') as HTMLAnchorElement;
    await act(async () => link().click());
    expect(window.location.pathname).toBe('/gantlo/plan/');
    expect(seen.at(-1)).toEqual({ name: 'page', nav: 1 });
    await act(async () => link().click());
    expect(seen.at(-1)).toEqual({ name: 'page', nav: 2 });
    await act(async () => {
      window.history.replaceState(null, '', '/gantlo/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(seen.at(-1)).toEqual({ name: 'home', nav: 3 });
    await act(async () => root.unmount());
  });
});
