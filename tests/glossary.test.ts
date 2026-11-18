// 用語集 (R-14)。データの検査 (id と用語の重なり・https の出典・RFC の節・実在するレッスン・11 の規格) と、
// 全角・半角カナ・大文字小文字・ひらがなをそろえた検索、画面と書き出しの中身を確かめる。
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import glossary from '../src/content/glossary.json';
import { SORTED, TERMS } from '../src/content/glossary';
import { LESSONS } from '../src/content/index';
import { normalizeText, searchTerms, STANDARD_COUNT, validateGlossary, type GlossaryTerm } from '../src/lib/glossary';
import { glossaryStatus } from '../src/lib/status';
import { sitePages } from '../src/prerender/pages';
import Glossary from '../src/screens/Glossary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lessonIds = new Set(LESSONS.map((l) => l.id));

describe('用語集のデータ (src/content/glossary.json)', () => {
  it('検査を通る (id と用語の重なり・https でない出典・節を指さない RFC・無いレッスン・11 の規格の欠けが無い)', () => {
    expect(validateGlossary(glossary, lessonIds)).toEqual([]);
  });

  it('11 の規格 (HTTP・URI・JSON・MIME・UTF-8・REST・DNS・TCP/IP・TLS・OAuth 2.0 / JWT・OpenAPI) を学ぶ順に載せる', () => {
    expect(SORTED.standards.map((t) => t.term)).toEqual(['HTTP', 'URI', 'JSON', 'MIME タイプ', 'UTF-8', 'REST', 'DNS', 'TCP/IP', 'TLS', 'OAuth 2.0', 'JWT', 'OpenAPI']);
    expect(new Set(SORTED.standards.map((t) => t.standard)).size).toBe(STANDARD_COUNT);
  });

  it('main の問題に出る語 (HEAD・Content-Type・201 Created など) は、そのレッスンへのリンクを持つ', () => {
    const lessonsOf = (id: string) => TERMS.find((t) => t.id === id)?.lessons;
    for (const id of ['head', 'content-type', 'json', '201-created', 'dns', 'tls', 'curl']) expect(lessonsOf(id), id).toContain('main-w1-l1');
  });

  it('id と、用語・別名 (検索の形にそろえたもの) が語どうしで重ならない', () => {
    const ids = TERMS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = TERMS.flatMap((t) => [...new Set([t.term, ...(t.aliases ?? [])].map(normalizeText))].map((n) => `${n}`));
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  it('出典はすべて https で、RFC は節まで指す', () => {
    for (const t of TERMS) {
      expect(t.sources.length, t.id).toBeGreaterThan(0);
      for (const s of t.sources) {
        expect(new URL(s.url).protocol, `${t.id} ${s.url}`).toBe('https:');
        if (s.url.includes('rfc-editor.org')) expect(s.url, t.id).toMatch(/#section-\d/);
      }
    }
  });

  it('書いたレッスンはすべて実在する', () => {
    for (const t of TERMS) for (const l of t.lessons) expect(lessonIds.has(l), `${t.id} → ${l}`).toBe(true);
  });
});

describe('validateGlossary', () => {
  const ok: GlossaryTerm = { id: 'get', term: 'GET', description: '説明', sources: [{ label: 'RFC 9110 9.3.1', url: 'https://www.rfc-editor.org/rfc/rfc9110#section-9.3.1' }], lessons: ['l1'] };
  const standards = Array.from({ length: STANDARD_COUNT }, (_, i): GlossaryTerm => ({ ...ok, id: `s${i + 1}`, term: `規格 ${i + 1}`, standard: i + 1 }));
  const check = (extra: unknown[]) => validateGlossary({ terms: [...standards, ...extra] }, new Set(['l1']));
  it('正しい形は通る (レッスンは空でもよい)', () => {
    expect(check([ok])).toEqual([]);
    expect(check([{ ...ok, lessons: [] }])).toEqual([]);
  });
  it('壊れた形を見つける', () => {
    expect(check([ok, ok]).join()).toMatch(/id が重複/);
    expect(check([ok, { ...ok, id: 'get2', term: 'ｇｅｔ' }]).join()).toMatch(/「ｇｅｔ」は get と重なって/);
    expect(check([ok, { ...ok, id: 'x', term: 'X', aliases: ['Get'] }]).join()).toMatch(/「Get」は get と重なって/);
    expect(check([{ ...ok, sources: [{ label: 'x', url: 'http://example.com/' }] }]).join()).toMatch(/https/);
    expect(check([{ ...ok, sources: [] }]).join()).toMatch(/sources が空/);
    expect(check([{ ...ok, sources: [{ label: 'RFC 9110', url: 'https://www.rfc-editor.org/rfc/rfc9110' }] }]).join()).toMatch(/節まで/);
    expect(check([{ ...ok, lessons: ['no-such'] }]).join()).toMatch(/no-such というレッスンはありません/);
    expect(check([{ ...ok, lessons: ['l1', 'l1'] }]).join()).toMatch(/同じレッスン/);
    expect(check([{ ...ok, lessons: undefined }]).join()).toMatch(/lessons は配列/);
    expect(check([{ ...ok, description: '' }]).join()).toMatch(/description/);
    expect(check([{ ...ok, id: 'Bad_Id' }]).join()).toMatch(/id は英小文字/);
    expect(check([{ ...ok, alias: ['x'] }]).join()).toMatch(/alias という欄/);
    expect(check([{ ...ok, standard: 12 }]).join()).toMatch(/standard は 1〜11/);
    expect(check([null]).join()).toMatch(/オブジェクト/);
    expect(validateGlossary({ terms: [ok] }, new Set(['l1'])).join()).toMatch(/11 の規格の 1 番/);
    expect(validateGlossary({}, new Set())).toEqual(['terms の配列がありません']);
  });
});

describe('searchTerms (全角で探せる)', () => {
  const ids = (q: string) => searchTerms(TERMS, q).map((t) => t.id);
  it('全角英数の「ＨＴＴＰ」で HTTP が先頭に見つかる', () => expect(ids('ＨＴＴＰ')[0]).toBe('http'));
  it('大文字と小文字を区別しない (http・Http・hTTp)', () => {
    for (const q of ['http', 'Http', 'hTTp']) expect(ids(q)[0], q).toBe('http');
  });
  it('半角カナの「ﾘｿｰｽ」とひらがなの「りそーす」でリソースが見つかる', () => {
    expect(ids('ﾘｿｰｽ')[0]).toBe('resource');
    expect(ids('りそーす')[0]).toBe('resource');
  });
  it('全角の記号と数字 (「２０１」「ｃｏｎｔｅｎｔ－ｔｙｐｅ」) でも見つかる', () => {
    expect(ids('２０１')[0]).toBe('201-created');
    expect(ids('ｃｏｎｔｅｎｔ－ｔｙｐｅ')[0]).toBe('content-type');
  });
  it('別名 (URL・JSON Web Token) でも、説明の語でも探せる', () => {
    expect(ids('url')[0]).toBe('uri');
    expect(ids('json web token')[0]).toBe('jwt');
    expect(ids('ネームサーバー')).toContain('dns');
  });
  it('用語に当たるものを、説明だけに当たるものより先に出す', () => {
    const r = ids('tls');
    expect(r[0]).toBe('tls');
    expect(r).toContain('https');
    expect(r.indexOf('tls-handshake')).toBeLessThan(r.indexOf('https'));
  });
  it('空白で区切った語はすべて含むものだけ。空なら全部', () => {
    expect(ids('ヘッダー メディアタイプ').every((id) => ['content-type', 'accept', 'media-type'].includes(id))).toBe(true);
    expect(ids('   ')).toHaveLength(TERMS.length);
    expect(ids('zzzz-nothing')).toEqual([]);
  });
  it('探した結果のステータス: 当たれば 200、無ければ 204', () => {
    expect(glossaryStatus(3, 'http').code).toBe(200);
    expect(glossaryStatus(0, 'zzzz').code).toBe(204);
  });
});

describe('用語集の画面と書き出し', () => {
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
  });

  it('全部の語を、説明・出典・出てくるレッスンへのリンク付きで出す', async () => {
    await act(async () => root.render(createElement(Glossary)));
    const entries = [...host.querySelectorAll('article.gloss')];
    expect(entries).toHaveLength(TERMS.length);
    const head = host.querySelector('article[data-term="head"]')!;
    expect(head.textContent).toContain(TERMS.find((t) => t.id === 'head')!.description);
    expect(head.querySelector('a[href="https://www.rfc-editor.org/rfc/rfc9110#section-9.3.2"]')).not.toBeNull();
    expect(head.querySelector('a[href="/gantlo/lesson/main-w1-l1/"]')).not.toBeNull();
    // 出てくるレッスンが無い語は、レッスンの行を出さない
    expect(host.querySelector('article[data-term="utf-8"]')!.textContent).not.toContain('出てくるレッスン');
  });

  it('書き出す用語集のページは、全部の語と出典を本文に持つ (検索に載せる)', () => {
    const page = sitePages().find((p) => p.path === 'glossary/')!;
    expect(page.noindex).toBeFalsy();
    for (const t of TERMS) expect(page.body, t.id).toContain(`id="term-${t.id}"`);
    expect(page.body).toContain('https://www.rfc-editor.org/rfc/rfc9110#section-9.3.2');
  });
});
