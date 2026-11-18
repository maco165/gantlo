import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isInternalClick, scrollToTop, useRoute } from '../src/lib/route';
import { useMobileNav } from '../src/lib/useMobileNav';

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
  it('今と同じ道で # だけが違うリンク (本文へ飛ぶリンクなど) は奪わない', () => {
    window.history.replaceState(null, '', '/gantlo/lesson/main-w1-l1/');
    expect(judge('#astryx-app-shell-main').result).toBeNull();
    expect(judge('/gantlo/lesson/main-w1-l1/#top').result).toBeNull();
    // 別の道なら # が付いていても奪う
    const other = judge('/gantlo/plan/#top');
    expect(other.result).toBe(other.a);
    // # の無い同じ道のリンクは、これまでどおり奪う (nav を増やす)
    const same = judge('/gantlo/lesson/main-w1-l1/');
    expect(same.result).toBe(same.a);
    window.history.replaceState(null, '', '/gantlo/');
  });
  it('新しいタブで開くリンクと保存のリンクは奪わない', () => {
    expect(judge('/gantlo/plan/', {}, { target: '_blank' }).result).toBeNull();
    expect(judge('/gantlo/plan/', {}, { download: '' }).result).toBeNull();
  });
  it('別のサイトは、道が置き場所と同じ形でも奪わない', () => {
    expect(judge('https://example.com/gantlo/plan/').result).toBeNull();
  });
  it('同じサイトでも置き場所の外は奪わない', () => {
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

describe('スマホのメニューの開閉 (useMobileNav)', () => {
  it('開いたあと、close (useRoute の移動の操作の回数) が変わったら閉じる', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let state: [boolean, (o: boolean) => void] = [false, () => {}];
    function Probe({ close }: { close: number }) {
      state = useMobileNav(close);
      return null;
    }
    const root = createRoot(host);
    await act(async () => root.render(createElement(Probe, { close: 0 })));
    await act(async () => state[1](true));
    expect(state[0]).toBe(true);
    await act(async () => root.render(createElement(Probe, { close: 1 })));
    expect(state[0]).toBe(false);
    await act(async () => root.unmount());
    host.remove();
  });
});

describe('画面を移る操作の回数 (useRoute の nav)', () => {
  let host: HTMLDivElement;
  let seen: { name: string; nav: number }[];
  let lastClose = -1;
  function Probe() {
    const { route, nav, close } = useRoute();
    seen.push({ name: route.name, nav });
    lastClose = close;
    return createElement('a', { href: '/gantlo/plan/', id: 'to-plan' }, 'plan');
  }
  beforeEach(() => {
    window.history.replaceState(null, '', '/gantlo/');
    host = document.createElement('div');
    document.body.appendChild(host);
    seen = [];
  });
  afterEach(() => host.remove());

  it('同じ画面のリンクを押しても増え、戻るでも増える (画面をやり直す合図)', async () => {
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
    // 画面を移る操作では、メニューを閉じる合図 (close) も同じだけ増える
    expect(lastClose).toBe(3);
    await act(async () => root.unmount());
  });

  it('# だけが違うリンクと、# だけが変わる戻る・進むでは増えない (例外)', async () => {
    window.history.replaceState(null, '', '/gantlo/plan/');
    let close = -1;
    function HashProbe() {
      const { route, nav, close: c } = useRoute();
      seen.push({ name: route.name, nav });
      close = c;
      return createElement('a', { href: '#main', id: 'skip' }, 'skip');
    }
    const root = createRoot(host);
    await act(async () => root.render(createElement(HashProbe)));
    const skip = host.querySelector('#skip') as HTMLAnchorElement;
    let prevented: boolean | undefined;
    const spy = (e: Event) => (prevented = e.defaultPrevented);
    window.addEventListener('click', spy);
    await act(async () => skip.click());
    window.removeEventListener('click', spy);
    expect(prevented).toBe(false);
    expect(window.location.hash).toBe('#main');
    // jsdom は # の移動の popstate を後から送るので、それを受けてから数える
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    const closeBefore = close;
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(seen.at(-1)).toEqual({ name: 'page', nav: 0 });
    // 画面はやり直さないが、スマホのメニューを閉じる合図 (close) は増える
    expect(close).toBe(closeBefore + 1);
    await act(async () => root.unmount());
  });
});
