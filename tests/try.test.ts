// 試す画面 (#55 の 9)。送り先は決めた一覧だけ・Cookie と認証を送らない・自動では送らない・読めるヘッダーと失敗の説明。
// 本物の外のサービスには送らない (fetch を差し替える)。ブラウザでの CORS の振る舞いは e2e (scripts/e2e-try.mjs) で page.route を使って見る
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import glossary from '../src/content/glossary.json';
import {
  ENDPOINTS,
  PRESETS,
  bodyText,
  buildRequest,
  explainFailure,
  initialRequest,
  readableHeaders,
  requestText,
  MAX_BODY_CHARS,
} from '../src/lib/tryApi';
import Try, { emptyBodyText } from '../src/screens/Try';
import { TRY_TERMS } from '../src/screens/Glossary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia;
  }
});

describe('要求の組み立て', () => {
  it('どの道・メソッドでも credentials は omit、Referer を送らず、写しを使わない', () => {
    for (const e of ENDPOINTS)
      for (const m of e.methods) {
        const { init, url } = buildRequest({ endpoint: e.id, method: m, code: 404, headers: ['accept', 'custom'] });
        expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', mode: 'cors', method: m });
        expect(url.startsWith('https://httpbin.org/') || url.startsWith('https://api.github.com/')).toBe(true);
        expect(JSON.stringify(init.headers)).not.toMatch(/authorization|cookie/i);
      }
  });

  it('ステータスコードは決めた一覧だけ (外は 200)。道に無いメソッドと知らない道は送らない', () => {
    expect(buildRequest({ endpoint: 'status', method: 'GET', code: 418, headers: [] }).url).toBe('https://httpbin.org/status/418');
    expect(buildRequest({ endpoint: 'status', method: 'GET', code: 302, headers: [] }).url).toBe('https://httpbin.org/status/200');
    expect(() => buildRequest({ endpoint: 'zen', method: 'POST', headers: [] })).toThrow();
    expect(() => buildRequest({ endpoint: 'https://evil.example/', method: 'GET', headers: [] })).toThrow();
  });

  it('safelist に無いヘッダー・JSON の本文・PUT などは preflight になる。GET と Accept だけならならない', () => {
    expect(buildRequest({ endpoint: 'get', method: 'GET', headers: ['accept'] }).preflight).toBe(false);
    expect(buildRequest({ endpoint: 'get', method: 'GET', headers: ['custom'] }).preflight).toBe(true);
    expect(buildRequest({ endpoint: 'anything', method: 'POST', headers: [] }).preflight).toBe(true);
    expect(buildRequest({ endpoint: 'anything', method: 'DELETE', headers: [] }).preflight).toBe(true);
    expect(requestText({ endpoint: 'anything', method: 'PUT', headers: ['accept'] })).toBe('PUT https://httpbin.org/anything\nAccept: application/json\nContent-Type: application/json\n\n{"hello":"gantlo"}');
  });
});

describe('応答の見せ方', () => {
  it('読めたヘッダーを safelist と公開されたものに分ける', () => {
    const h = new Headers({ 'content-type': 'application/json', 'retry-after': '120', etag: 'W/"x"' });
    expect(readableHeaders(h)).toEqual([
      { name: 'content-type', value: 'application/json', why: 'safelist' },
      { name: 'etag', value: 'W/"x"', why: 'exposed' },
      { name: 'retry-after', value: '120', why: 'exposed' },
    ]);
  });
  it('JSON は整え、長い本文は 8 KB で切る', () => {
    expect(bodyText('{"a":1}', 'application/json')).toEqual({ text: '{\n  "a": 1\n}', clipped: false, json: true });
    expect(bodyText('x'.repeat(MAX_BODY_CHARS + 5), 'text/plain')).toMatchObject({ clipped: true, json: false });
    expect(bodyText('{broken', 'application/json')).toMatchObject({ text: '{broken', json: false });
  });
});

describe('失敗の説明', () => {
  const r = { endpoint: 'get', method: 'GET' as const, headers: [] };
  it('オフライン・時間切れ・それ以外 (CORS か届かない。ブラウザは理由を教えない) を分ける', () => {
    expect(explainFailure(r, { online: false, timedOut: false }).kind).toBe('offline');
    expect(explainFailure(r, { online: true, timedOut: true }).kind).toBe('timeout');
    const b = explainFailure(r, { online: true, timedOut: false });
    expect(b.kind).toBe('blocked');
    expect(b.detail.join('')).toContain('どちらの理由かを JS に教えません');
  });
  it('GitHub に X-Gantlo-Try を付けたときは、preflight で弾かれることを書く', () => {
    const f = explainFailure({ endpoint: 'zen', method: 'GET', headers: ['custom'] }, { online: true, timedOut: false });
    expect(f.detail.join('')).toContain('X-Gantlo-Try がありません');
    expect(f.detail.join('')).toContain('preflight');
  });
});

describe('用語集から開くときの選び (?preset=)', () => {
  it('どの選びも、ある道と送れるメソッドで、用語集にある語の id', () => {
    const ids = new Set(glossary.terms.map((t) => t.id));
    for (const [id, r] of Object.entries(PRESETS)) {
      expect(ids.has(id), id).toBe(true);
      expect(() => buildRequest(r), id).not.toThrow();
    }
  });
  it('用語集の「試す」のリンクを付ける語は、始めの選びの鍵と同じ', () => {
    expect([...TRY_TERMS].sort()).toEqual(Object.keys(PRESETS).sort());
  });
  it('知らない値は既定 (GET /get)', () => {
    expect(initialRequest('?preset=404-not-found')).toMatchObject({ endpoint: 'status', code: 404 });
    expect(initialRequest('?preset=__proto__')).toMatchObject({ endpoint: 'get', method: 'GET' });
    expect(initialRequest('')).toMatchObject({ endpoint: 'get' });
  });
});

describe('試す画面', () => {
  let host: HTMLElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  const sendButton = () => [...host.querySelectorAll('button')].find((b) => b.textContent === '送る (外のサービスへ)')!;

  it('開いただけでは送らず、外へ送ることを先に書く。押すと 1 回だけ、credentials: omit で送り、本物のステータスと読めるヘッダーを出す', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 418, headers: { 'content-type': 'application/json', 'retry-after': '5' } }));
    vi.stubGlobal('fetch', fetchMock);
    await act(async () => root.render(createElement(Try)));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="try-notice"]')?.textContent).toContain('この要求は、あなたのブラウザから外のサービス');
    await act(async () => sendButton().click());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://httpbin.org/get');
    expect(init.credentials).toBe('omit');
    const res = host.querySelector('[data-testid="try-result"]')!;
    expect(res.getAttribute('data-status')).toBe('418');
    expect(res.querySelector('.status__reason')?.textContent).toBe("I'm a teapot");
    expect(res.querySelector('[data-header="retry-after"]')?.getAttribute('data-why')).toBe('exposed');
    expect(res.textContent).toContain('"ok": true');
  });

  it('fetch が投げたら、何が起きたかを説明する (ステータス 0 の network error)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await act(async () => root.render(createElement(Try)));
    await act(async () => sendButton().click());
    const f = host.querySelector('[data-testid="try-failure"]')!;
    expect(f.getAttribute('data-kind')).toBe('blocked');
    expect(f.querySelector('.status__code')?.textContent).toBe('0');
    expect(f.textContent).toContain('CORS で弾かれた');
  });
});

describe('空の本文の説明 (R-010) と読み上げの範囲 (R-011)', () => {
  it('本文を持たないと書くのは HEAD・1xx・204・304 だけ。空の 404 などは「相手は本文を返しませんでした」', () => {
    expect(emptyBodyText('GET', 204)).toContain('204 の応答は本文を持たない');
    expect(emptyBodyText('GET', 304)).toContain('304 の応答は本文を持たない');
    expect(emptyBodyText('HEAD', 200)).toContain('HEAD への応答は本文を持たない');
    expect(emptyBodyText('GET', 404)).toBe('相手は本文を返しませんでした (空の本文)。');
    expect(emptyBodyText('POST', 200)).toBe('相手は本文を返しませんでした (空の本文)。');
  });

  it('aria-live は短い要約の行だけで、本文やヘッダーの一覧を包まない', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x'.repeat(5000), { status: 200, headers: { 'content-type': 'text/plain' } })));
    await act(async () => root.render(createElement(Try)));
    await act(async () => [...host.querySelectorAll('button')].find((b) => b.textContent === '送る (外のサービスへ)')!.click());
    expect(host.querySelector('[data-testid="try-summary"]')?.getAttribute('aria-live')).toBe('polite');
    expect(host.querySelector('[data-testid="try-summary"]')?.textContent).toBe('応答を受け取りました: 200 OK');
    // どの aria-live の場所も、結果 (本文・ヘッダー) を包まず、長い本文を持たない (CodeBlock の写しの知らせなど部品の中の小さな場所は残る)
    for (const el of host.querySelectorAll('[aria-live]')) {
      expect(el.contains(host.querySelector('[data-testid="try-result"]'))).toBe(false);
      expect((el.textContent ?? '').length).toBeLessThan(200);
    }
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
});
