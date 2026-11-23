// 検索に届く形 (R-7)。ページごとに書き出す HTML の題・説明・canonical・本文の見出しと、sitemap.xml を確かめる。
// 前半は書き出しと同じ関数で、ページを手元で組み立てて見る (npm test だけで走る)。
// 後半は npm run build のあとの dist を見る (dist が無ければ飛ばす。CI は build のあとに npm test を走らせる)。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LESSONS } from '../src/content/index';
import type { Lesson } from '../src/content/types';
import { PASS_MARK_NOTE } from '../src/lib/exam';
import { documentTitle, PAGE_TITLES, TITLE_MAX, titleOf } from '../src/lib/pageMeta';
import { BASE, COURSES, lessonHref, parseRoute } from '../src/lib/route';
import { LESSON_LIST_HEADING } from '../src/lib/courses';
import { SITE_NAME, SITE_TAGLINE } from '../src/lib/site';
import { renderPage, sitemapXml } from '../src/prerender/html';
import { hasOwnOgImage, ogCard, ogCards } from '../src/prerender/og';
import { SORTED } from '../src/content/glossary';
import { NOT_FOUND_PAGE, ORIGIN, sitePages, type SitePage } from '../src/prerender/pages';

/** 検索に載せない、一人ひとりの記録の画面 (R-7 の「全ページ」は検索に載せる全ページと読む) */
const PERSONAL = ['plan/', 'review/', 'progress/', 'settings/'];

const SITE_URL = `${ORIGIN}${BASE}`;
const template = readFileSync(join(__dirname, '../index.html'), 'utf8');
const pages = sitePages();

type Head = { title: string; description: string; canonical: string | null; ogUrl: string | null; robots: string | null; h1: string; rootText: string };
function readHead(html: string): Head {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const attr = (sel: string, name: string) => doc.querySelector(sel)?.getAttribute(name) ?? null;
  return {
    title: doc.title,
    description: attr('meta[name="description"]', 'content') ?? '',
    canonical: attr('link[rel="canonical"]', 'href'),
    ogUrl: attr('meta[property="og:url"]', 'content'),
    robots: attr('meta[name="robots"]', 'content'),
    h1: doc.querySelector('#root h1')?.textContent ?? '',
    rootText: doc.querySelector('#root')?.textContent ?? '',
  };
}

/** コースのページの一覧 (#root の ol) のリンクの順 */
const courseLessonLinks = (html: string) => [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('#root main > ol a')].map((a) => a.getAttribute('href'));
/** 本文の h2 の文字 */
const courseHeadings = (html: string) => [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('#root h2')].map((h) => h.textContent);

/** 本文の見出し。ホームは画面と同じ「gantlo — API と HTTP の基礎」、ほかは画面の題 (レッスンは題。画面の h1 は 1 問目の問題文) */
const expectedH1 = (p: SitePage) => (p.path === '' ? `${SITE_NAME} — ${SITE_TAGLINE}` : titleOf(parseRoute(`${BASE}${p.path}`)));

const expectUnique = (values: string[], label: string) => {
  const dup = values.filter((v, i) => values.indexOf(v) !== i);
  expect(dup, `${label} が重なっている`).toEqual([]);
};

describe('共有したときのカードの画像 (og:image)', () => {
  const OG_URL = `${SITE_URL}og.png`;
  it('全ページの head に、公開の URL の og:image (1200×630・代替文)・twitter:image と summary_large_image がある', () => {
    for (const p of [...pages, NOT_FOUND_PAGE]) {
      const doc = new DOMParser().parseFromString(renderPage(template, p), 'text/html');
      const og = (k: string) => doc.querySelector(`meta[property="og:${k}"]`)?.getAttribute('content');
      // 検索に載るページ (ホームを除く) はそのページの画像、ホーム・記録の画面・404 はサイト共通の画像
      const want = hasOwnOgImage(p) ? `${SITE_URL}${p.path}og.png` : OG_URL;
      expect([og('image'), og('image:width'), og('image:height')], p.path).toEqual([want, '1200', '630']);
      expect(doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content'), p.path).toBe(want);
      expect(og('image:alt'), p.path).toBeTruthy();
      expect(doc.querySelector('meta[name="twitter:card"]')?.getAttribute('content'), p.path).toBe('summary_large_image');
    }
  });

  it('自分の画像を持つのは、検索に載るページのうちホームを除く全部。代替文にページの題', () => {
    const own = pages.filter(hasOwnOgImage);
    expect(own.map((p) => p.path).sort()).toEqual(pages.filter((p) => !p.noindex && p.path !== '').map((p) => p.path).sort());
    expect(hasOwnOgImage(NOT_FOUND_PAGE)).toBe(false);
    const lesson = own.find((p) => p.path.startsWith('lesson/'))!;
    const doc = new DOMParser().parseFromString(renderPage(template, lesson), 'text/html');
    expect(doc.querySelector('meta[property="og:image:alt"]')?.getAttribute('content')).toBe(`gantlo: ${ogCard(lesson).title} (レッスン)`);
  });

  it('カードの中身は題・種類・要求の行・URL (<title> からサイト名を外した題)', () => {
    const course = pages.find((p) => p.path === 'course/main/')!;
    expect(ogCard(course)).toEqual({ path: 'course/main/', title: '本編 4 週', kind: 'コース', request: 'GET /course/main', url: 'maco165.github.io/gantlo/course/main/' });
    expect(ogCards(pages).length).toBe(pages.filter(hasOwnOgImage).length);
  });

  it('サイト共通の画像は public/og.png にあり、PNG で 1200×630 (head に書いた大きさと同じ)', () => {
    const png = readFileSync(join(__dirname, '../public/og.png'));
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });

  it.skipIf(!existsSync(join(__dirname, '../dist/index.html')))('組み立てた dist では、自分の画像を持つページごとに <道>/og.png が 1200×630 の PNG である (npm run build のあと)', () => {
    const missing: string[] = [];
    for (const p of pages.filter(hasOwnOgImage)) {
      const file = join(__dirname, '../dist', p.path, 'og.png');
      if (!existsSync(file)) {
        missing.push(p.path);
        continue;
      }
      const png = readFileSync(file);
      expect(png.subarray(1, 4).toString('ascii'), p.path).toBe('PNG');
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], p.path).toEqual([1200, 630]);
    }
    expect(missing).toEqual([]);
    // 書き出した HTML も、そのページの画像を指す
    const html = readFileSync(join(__dirname, '../dist/glossary/index.html'), 'utf8');
    expect(html).toContain(`<meta property="og:image" content="${SITE_URL}glossary/og.png"`);
  });
});

describe('iOS のホーム画面の画像 (apple-touch-icon)', { timeout: 30_000 }, () => {
  it('全ページの head に /gantlo/apple-touch-icon.png への link がある', () => {
    for (const p of [...pages, NOT_FOUND_PAGE]) {
      const doc = new DOMParser().parseFromString(renderPage(template, p), 'text/html');
      expect(doc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'), p.path).toBe(`${BASE}apple-touch-icon.png`);
    }
  });

  it('画像は public/apple-touch-icon.png にあり、PNG で 180×180', () => {
    const png = readFileSync(join(__dirname, '../public/apple-touch-icon.png'));
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180]);
  });
});

describe('書き出すページの一覧', () => {
  it('ホーム・メニューの画面・全コース・全レッスンがそろう', () => {
    const expected = ['', ...Object.keys(PAGE_TITLES).map((p) => `${p}/`), ...COURSES.map((c) => `course/${c.id}/`), ...LESSONS.map((l) => `lesson/${l.id}/`)];
    expect(pages.map((p) => p.path).sort()).toEqual([...expected].sort());
  });
});

describe('ページごとの HTML (手元で組み立てる)', () => {
  const heads = pages.map((p) => ({ page: p, head: readHead(renderPage(template, p)) }));

  it('title・description・canonical がページごとに重ならない', () => {
    expectUnique(heads.map((h) => h.head.title), 'title');
    expectUnique(heads.map((h) => h.head.description), 'description');
    expectUnique(heads.map((h) => h.head.canonical ?? ''), 'canonical');
  });

  it('canonical と og:url は # の無い公開の URL で、末尾が /', () => {
    for (const { page, head } of heads) {
      expect(head.canonical).toBe(`${SITE_URL}${page.path}`);
      expect(head.ogUrl).toBe(head.canonical);
      expect(head.canonical).toMatch(/^https:\/\/maco165\.github\.io\/gantlo\/(?:[a-z0-9-]+\/)*$/);
    }
  });

  it('title は画面のタブ (documentTitle) と同じで、description は 50〜120 字', () => {
    for (const { page, head } of heads) {
      expect(head.title).toBe(page.title);
      expect(head.title, page.path).toBe(documentTitle(parseRoute(`${BASE}${page.path}`)));
      expect(head.description.length, page.path).toBeGreaterThanOrEqual(50);
      expect(head.description.length, page.path).toBeLessThanOrEqual(120);
    }
  });

  it(`title は全ページ (404.html も) ${TITLE_MAX} 字以内で、og:title も同じ題`, { timeout: 30_000 }, () => {
    for (const p of [...pages, NOT_FOUND_PAGE]) {
      const doc = new DOMParser().parseFromString(renderPage(template, p), 'text/html');
      expect(doc.title.length, `${p.path} ${doc.title}`).toBeLessThanOrEqual(TITLE_MAX);
      expect(doc.querySelector('meta[property="og:title"]')?.getAttribute('content'), p.path).toBe(doc.title);
    }
  });

  it('一人ひとりの記録の画面 (plan・review・progress・settings) だけ noindex で、ほかは検索に載せる', () => {
    for (const { page, head } of heads) expect(head.robots, page.path).toBe(PERSONAL.includes(page.path) ? 'noindex' : null);
    expect(heads.filter((h) => h.head.robots === 'noindex').map((h) => h.page.path).sort()).toEqual([...PERSONAL].sort());
  });

  it('本文の見出し (h1) が JS なしの HTML にあり、画面の見出しと同じ (レッスンは題)', () => {
    for (const { page, head } of heads) expect(head.h1, page.path).toBe(expectedH1(page));
  });

  it('コースのページは、画面と同じ一覧の見出し (Network) の下に、そのコースのレッスンへのリンクを画面と同じ順に持つ', () => {
    for (const c of COURSES) {
      const page = pages.find((p) => p.path === `course/${c.id}/`)!;
      expect(courseLessonLinks(renderPage(template, page)), c.id).toEqual(LESSONS.filter((l) => l.course === c.id).map((l) => lessonHref(l.id)));
      expect(courseHeadings(renderPage(template, page)), c.id).toEqual([LESSON_LIST_HEADING]);
    }
  });

  it('レッスンのページは問題文を持ち、答えの解説は持たない (画面でも答えるまで出さない)', () => {
    for (const l of LESSONS) {
      const { head } = heads.find((h) => h.page.path === `lesson/${l.id}/`)!;
      for (const q of l.questions) {
        expect(head.rootText).toContain(q.prompt);
        expect(head.rootText).not.toContain(q.explanation);
        // 4 択の選択肢ごとの解説 (why) と、実習で観察できること (expected) も答えたあとに出すもの
        if (q.kind === 'choice') for (const c of q.choices) if (c.why) expect(head.rootText, q.id).not.toContain(c.why);
        if (q.kind === 'lab') expect(head.rootText, q.id).not.toContain(q.expected);
      }
    }
  });

  it('レッスンのページは、問題の前に要点 (分かるようになること・説明・図・試すコマンド・出典) を持ち、誤答の説明は持たない', () => {
    for (const l of LESSONS) {
      const doc = new DOMParser().parseFromString(renderPage(template, pages.find((p) => p.path === `lesson/${l.id}/`)!), 'text/html');
      const section = doc.querySelector('#root main > section#intro');
      expect(section, l.id).not.toBeNull();
      const text = section!.textContent ?? '';
      const intro = l.intro!;
      for (const g of intro.goals) expect(text, l.id).toContain(g);
      for (const p of intro.body) expect(text, l.id).toContain(p);
      if (intro.figure) expect(text, l.id).toContain(intro.figure.caption);
      for (const t of intro.tryIt ?? []) expect(text, l.id).toContain(t.command);
      expect([...section!.querySelectorAll('a')].map((a) => a.getAttribute('href')), l.id).toEqual(intro.sources);
      // 要点は問題の一覧 (h2 問題) より前
      const h2s = [...doc.querySelectorAll('#root main h2')].map((h) => h.textContent);
      expect(h2s.indexOf('要点'), l.id).toBeLessThan(h2s.indexOf('問題'));
      const root = doc.querySelector('#root')!.textContent ?? '';
      for (const q of l.questions) if (q.kind === 'command' || q.kind === 'http') for (const b of q.blanks) for (const w of b.wrong ?? []) expect(root, q.id).not.toContain(w.why);
    }
  });

  it('穴埋めのコードは空欄を伏せ字 (____) にして空欄の数だけ持ち、{{blank}} も実行結果の例 (output) も書かない', () => {
    let fills = 0;
    for (const l of LESSONS) {
      const doc = new DOMParser().parseFromString(renderPage(template, pages.find((p) => p.path === `lesson/${l.id}/`)!), 'text/html');
      const items = [...doc.querySelectorAll('#root main > ol > li')];
      l.questions.forEach((q, i) => {
        const text = items[i].textContent ?? '';
        expect(text, q.id).not.toContain('{{blank}}');
        if (q.kind === 'command' || q.kind === 'http') {
          fills++;
          const pre = items[i].querySelector(':scope > pre')?.textContent ?? '';
          expect(pre.split('____').length - 1, q.id).toBe(q.blanks.length);
          if (q.kind === 'command' && q.output) expect(text, q.id).not.toContain(q.output.trim());
        }
      });
    }
    expect(fills).toBeGreaterThan(0);
  });

  it('並べ替えの項目は正しい順と違う並びに、4 択の選択肢はデータの順 (正解の位置) ではなく文字の順に書く (位置を決めた 4 択は除く)', () => {
    const byText = (xs: string[]) => [...xs].sort((x, y) => x.localeCompare(y, 'ja'));
    let orders = 0;
    for (const l of LESSONS) {
      const doc = new DOMParser().parseFromString(renderPage(template, pages.find((p) => p.path === `lesson/${l.id}/`)!), 'text/html');
      const items = [...doc.querySelectorAll('#root main > ol > li')];
      expect(items.length, l.id).toBe(l.questions.length);
      l.questions.forEach((q, i) => {
        const listed = [...items[i].querySelectorAll(':scope > ul > li')].map((li) => li.textContent ?? '');
        if (q.kind === 'order') {
          orders++;
          // 項目はそろっていて、並びは正しい順と違う (文字の順がたまたま正しい順と同じ問題もあるため)
          expect(byText(listed), q.id).toEqual(byText(q.items.map((x) => x.text)));
          const answerText = q.answer.map((id) => q.items.find((x) => x.id === id)!.text);
          if (q.items.length >= 2) expect(listed, `${q.id} が正しい順のまま`).not.toEqual(answerText);
        }
        if (q.kind === 'choice') expect(listed, q.id).toEqual(q.fixedOrder ? q.choices.map((c) => c.text) : byText(q.choices.map((c) => c.text)));
      });
    }
    expect(orders).toBeGreaterThan(0);
  });

  it('索引に載せる全ページで、JS なしの本文 (#root の文字。空白を除く) が 400 字以上', () => {
    for (const { page, head } of heads.filter((h) => !h.page.noindex)) {
      expect(head.rootText.replace(/\s/g, '').length, page.path).toBeGreaterThanOrEqual(400);
    }
  });

  it('模擬試験のページは形式 (40 問・60 分・合格の目安 75%・各週 10 問) と、範囲の本編のレッスンへのリンクを持つ', () => {
    const html = renderPage(template, pages.find((p) => p.path === 'exam/')!);
    const { rootText } = readHead(html);
    for (const s of ['40 問', '60 分', '75%', '各週 10 問']) expect(rootText).toContain(s);
    // 合格の線は一次情報の無いこのサイトの目安なので、目安と書き、断り書きを添える (出典の無い断定をしない)
    expect(rootText).toContain('合格の目安');
    expect(rootText).toContain(PASS_MARK_NOTE);
    expect(rootText).not.toMatch(/合格: 正答率/);
    const exam = pages.find((p) => p.path === 'exam/')!;
    expect(exam.description).toContain('目安');
    const links = [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('#root main > ul a')].map((x) => x.getAttribute('href'));
    expect(links).toEqual(LESSONS.filter((l) => l.course === 'main').map((l) => lessonHref(l.id)));
  });

  it('レッスンの題と問題文の < > & を、本文 (h1・コースの一覧・問題の一覧) でも文字として書く', () => {
    const odd = { id: 'x-l1', title: '<b>A & B</b>', course: 'main', questions: [{ id: 'x-q1', kind: 'choice', prompt: '<img src=x onerror=alert(1)> & 1 < 2', explanation: 'e', sources: [], choices: [], answer: '' }] } as unknown as Lesson;
    const all = sitePages([odd]);
    const lessonHtml = renderPage(template, all.find((p) => p.path === 'lesson/x-l1/')!);
    const courseHtml = renderPage(template, all.find((p) => p.path === 'course/main/')!);
    expect(lessonHtml).toContain('<h1>&lt;b&gt;A &amp; B&lt;/b&gt;</h1>');
    expect(lessonHtml).toContain('<p>&lt;img src=x onerror=alert(1)&gt; &amp; 1 &lt; 2 (4 択)</p>');
    expect(courseHtml).toContain('>&lt;b&gt;A &amp; B&lt;/b&gt;</a>');
    for (const html of [lessonHtml, courseHtml]) {
      expect(html).not.toContain('<b>A');
      expect(html).not.toContain('<img src=x');
    }
    expect(readHead(lessonHtml).h1).toBe('<b>A & B</b>');
  });

  it('404.html は検索に載せず、canonical を持たない', () => {
    const head = readHead(renderPage(template, NOT_FOUND_PAGE));
    expect(head.robots).toBe('noindex');
    expect(head.canonical).toBeNull();
    expect(head.ogUrl).toBeNull();
    expect(head.h1).toBe('ページが見つかりません');
  });

  it('< " & と $1 $& を、そのままの文字として書く (置き換えの記号として読まない)', () => {
    const html = renderPage(template, { path: 'x/', title: 'a<b>"c"&', description: 'price $1 and $& and $$', body: '<pre>echo $1 $&</pre>' });
    expect(html).toContain('<title>a&lt;b&gt;&quot;c&quot;&amp;</title>');
    // 説明・og:description・canonical の場所ごとに見る (どれか 1 つに文字が残るだけで通らないように)
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('price $1 and $& and $$');
    expect(doc.querySelector('meta[property="og:description"]')?.getAttribute('content')).toBe('price $1 and $& and $$');
    expect(doc.querySelectorAll('meta[name="description"]').length).toBe(1);
    expect(html).toContain('<pre>echo $1 $&</pre>');
  });

  it('型 (index.html) の形が変わって置き換える場所が無ければ止める (黙って全ページの canonical がホームのまま公開しない)', () => {
    const broken = template.replace('<link rel="canonical"', '<link data-x rel="canonical"');
    expect(() => renderPage(broken, pages[1])).toThrow(/canonical/);
  });
});

/** 同じ HTML を何度も読まない (64 ページを検査ごとに読み直すと、混んだ機械で時間切れになる) */
const parsed = new Map<string, Document>();
const parse = (html: string) => parsed.get(html) ?? parsed.set(html, new DOMParser().parseFromString(html, 'text/html')).get(html)!;

/** head の JSON-LD (1 つの script の @graph) を読む。無ければ null */
function readLd(html: string): { count: number; graph: Record<string, any>[] | null; raw: string } {
  const doc = parse(html);
  const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  if (scripts.length === 0) return { count: 0, graph: null, raw: '' };
  const raw = scripts[0].textContent ?? '';
  const data = JSON.parse(raw);
  expect(data['@context']).toBe('https://schema.org');
  expect(scripts[0].closest('head'), 'JSON-LD は head に置く').not.toBeNull();
  return { count: scripts.length, graph: data['@graph'], raw };
}
const ofType = (graph: Record<string, any>[], type: string) => graph.filter((n) => n['@type'] === type);

/** 本文のパンくず (nav.crumbs) の [名前, 絶対 URL]。最後の項目 (今のページ) はリンクではないので canonical を当てる */
function readCrumbs(html: string, canonical: string): [string, string][] | null {
  const nav = parse(html).querySelector('#root nav.crumbs');
  if (!nav) return null;
  return [...nav.querySelectorAll('li')].map((li) => {
    const link = li.querySelector('a');
    return [li.textContent ?? '', link ? `${ORIGIN}${link.getAttribute('href')}` : canonical];
  });
}

// 全ページを組み立てて読むので、混んだ機械でも落ちないよう 1 件 30 秒まで待つ
describe('構造化データ (JSON-LD) とパンくず', { timeout: 30_000 }, () => {
  const rendered = pages.map((p) => ({ page: p, html: renderPage(template, p), canonical: `${SITE_URL}${p.path}` }));

  it('全ページの head に JSON-LD が 1 つあり、JSON として読める。404.html には無い', () => {
    for (const { page, html } of rendered) expect(readLd(html).count, page.path).toBe(1);
    expect(readLd(renderPage(template, NOT_FOUND_PAGE)).count).toBe(0);
  });

  it('トップは WebSite で、url が canonical。パンくずは出さない', () => {
    const top = rendered.find((r) => r.page.path === '')!;
    const { graph } = readLd(top.html);
    expect(ofType(graph!, 'WebSite').map((n) => n.url)).toEqual([top.canonical]);
    expect(ofType(graph!, 'BreadcrumbList')).toEqual([]);
    expect(readCrumbs(top.html, top.canonical)).toBeNull();
  });

  it('トップ以外は BreadcrumbList を持ち、ホームから始まって canonical で終わり、本文の見えるパンくずと同じ並び', () => {
    for (const { page, html, canonical } of rendered.filter((r) => r.page.path !== '')) {
      const [list] = ofType(readLd(html).graph!, 'BreadcrumbList');
      expect(list, page.path).toBeTruthy();
      const items: [string, string][] = list.itemListElement.map((x: any, i: number) => {
        expect(x.position, page.path).toBe(i + 1);
        return [x.name, x.item];
      });
      expect(items[0][1], page.path).toBe(SITE_URL);
      expect(items.at(-1)![1], page.path).toBe(canonical);
      expect(readCrumbs(html, canonical), page.path).toEqual(items);
    }
  });

  it('レッスンのパンくずは ホーム › コース › レッスン で、コースは ホーム › コース', () => {
    for (const l of LESSONS) {
      const r = rendered.find((x) => x.page.path === `lesson/${l.id}/`)!;
      const course = COURSES.find((c) => c.id === l.course)!;
      expect(readCrumbs(r.html, r.canonical)!.map(([n]) => n), l.id).toEqual(['ホーム', course.title, l.title]);
    }
    for (const c of COURSES) {
      const r = rendered.find((x) => x.page.path === `course/${c.id}/`)!;
      expect(readCrumbs(r.html, r.canonical)!.map(([n]) => n), c.id).toEqual(['ホーム', c.title]);
    }
  });

  it('コースは Course (url が canonical・説明・提供者・レッスンの一覧)', () => {
    for (const c of COURSES) {
      const r = rendered.find((x) => x.page.path === `course/${c.id}/`)!;
      const [course, ...rest] = ofType(readLd(r.html).graph!, 'Course');
      expect(rest, c.id).toEqual([]);
      expect(course.url, c.id).toBe(r.canonical);
      expect(course.name, c.id).toBe(c.title);
      expect(course.description, c.id).toBeTruthy();
      expect(course.provider?.name, c.id).toBe(SITE_NAME);
      expect(course.hasPart.map((x: any) => x.url), c.id).toEqual(LESSONS.filter((l) => l.course === c.id).map((l) => `${ORIGIN}${lessonHref(l.id)}`));
    }
  });

  it('レッスンは LearningResource (url が canonical、isPartOf がパンくずのコース)', () => {
    for (const l of LESSONS) {
      const r = rendered.find((x) => x.page.path === `lesson/${l.id}/`)!;
      const { graph } = readLd(r.html);
      const [lr, ...rest] = ofType(graph!, 'LearningResource');
      expect(rest, l.id).toEqual([]);
      expect(lr.url, l.id).toBe(r.canonical);
      expect(lr.name, l.id).toBe(l.title);
      expect(lr.isPartOf.url, l.id).toBe(ofType(graph!, 'BreadcrumbList')[0].itemListElement[1].item);
    }
  });

  it('用語集は DefinedTermSet で、全部の語が DefinedTerm として本文の語の id (#term-) を指す', () => {
    const r = rendered.find((x) => x.page.path === 'glossary/')!;
    const [set] = ofType(readLd(r.html).graph!, 'DefinedTermSet');
    expect(set.url).toBe(r.canonical);
    const terms = [...SORTED.standards, ...SORTED.others];
    expect(set.hasDefinedTerm.map((t: any) => t.name)).toEqual(terms.map((t) => t.term));
    const doc = new DOMParser().parseFromString(r.html, 'text/html');
    for (const t of set.hasDefinedTerm) {
      expect(t['@type']).toBe('DefinedTerm');
      expect(t.inDefinedTermSet).toBe(r.canonical);
      expect(t.url.startsWith(`${r.canonical}#term-`), t.url).toBe(true);
      expect(doc.getElementById(t.url.split('#')[1]), t.url).not.toBeNull();
    }
  });

  it('題の < > & は JSON-LD の中で \\u003c などになり、script を閉じない (読むと元の文字)', () => {
    const odd = { id: 'x-l1', title: '</script><b>A & B</b>', course: 'main', questions: [{ id: 'x-q1', kind: 'choice', prompt: 'p', explanation: 'e', sources: [], choices: [], answer: '' }] } as unknown as Lesson;
    const html = renderPage(template, sitePages([odd]).find((p) => p.path === 'lesson/x-l1/')!);
    const { raw, graph } = readLd(html);
    expect(raw).not.toMatch(/[<>&]/);
    expect(ofType(graph!, 'LearningResource')[0].name).toBe('</script><b>A & B</b>');
    expect(html).not.toContain('</script><b>');
  });

  it('型に </head> が無ければ止める (構造化データを黙って落とさない)', () => {
    expect(() => renderPage(template.replace('</head>', ''), pages[0])).toThrow(/head/);
  });
});

describe('sitemap.xml', () => {
  const xml = sitemapXml(pages);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  it('検索に載せる全ページの # の無い URL を 1 回ずつ持ち、lastmod を付けない', () => {
    expect(locs).toEqual(pages.filter((p) => !PERSONAL.includes(p.path)).map((p) => `${SITE_URL}${p.path}`));
    for (const p of PERSONAL) expect(locs).not.toContain(`${SITE_URL}${p}`);
    // このサイトについての画面は検索に載せる
    expect(locs).toContain(`${SITE_URL}about/`);
    expectUnique(locs, 'sitemap の URL');
    for (const loc of locs) expect(loc).not.toContain('#');
    expect(xml).not.toContain('lastmod');
    expect(xml).not.toContain('404');
  });
});

const DIST = join(__dirname, '../dist');
describe.skipIf(!existsSync(join(DIST, 'sitemap.xml')))('npm run build のあとの dist', () => {
  const read = (p: string) => readFileSync(join(DIST, p), 'utf8');

  it('ページごとに dist/<道>/index.html があり、題・説明・canonical・見出し・noindex がそのページのもの', () => {
    for (const page of pages) {
      const file = join(page.path, 'index.html');
      expect(existsSync(join(DIST, file)), file).toBe(true);
      const head = readHead(read(file));
      expect(head.title, file).toBe(page.title);
      expect(head.description, file).toBe(page.description);
      expect(head.canonical, file).toBe(`${SITE_URL}${page.path}`);
      expect(head.h1, file).toBe(expectedH1(page));
      expect(head.robots, file).toBe(PERSONAL.includes(page.path) ? 'noindex' : null);
      // 画面の JS を読む (書き出した HTML から SPA が立ち上がる)
      expect(read(file), file).toMatch(/<script type="module" crossorigin src="\/gantlo\/assets\/index-[^"]+\.js"><\/script>/);
    }
  });

  it('コースのページ (dist/course/<id>/index.html) にも、そのコースのレッスンの一覧が順に入る', () => {
    for (const c of COURSES) {
      const want = LESSONS.filter((l) => l.course === c.id).map((l) => lessonHref(l.id));
      expect(want.length, c.id).toBeGreaterThan(0);
      expect(courseLessonLinks(read(`course/${c.id}/index.html`)), c.id).toEqual(want);
    }
  });

  it('入口の JS (index.html の script。ほかの JS より先に読み終えて動かす) は gzip -9 で 172 KB 以下', () => {
    // 新しい画面が共有の部品の一部だけを読むと、rolldown が共有のチャンクを切り直し、progress.ts や status.ts を入口へ移す。
    // 合計は変わらなくても入口が重くなり、レッスンのページの LCP が落ちた (#60 で 169 KB → 174 KB、Lighthouse で 81 → 79)
    const top = read('index.html');
    const entry = /<script type="module"[^>]*src="\/gantlo\/(assets\/[^"]+\.js)"/.exec(top)?.[1];
    expect(entry).toBeDefined();
    const size = gzipSync(readFileSync(join(DIST, entry!)), { level: 9 }).length;
    expect(size, `${entry} が ${size} bytes`).toBeLessThanOrEqual(172_000);
  });

  it('トップが最初に読む JS (script と modulepreload を gzip -9 した合計) が 300 KB 以下で、問題の本文を含まない', () => {
    const top = read('index.html');
    const files = [...new Set([...top.matchAll(/<(?:script type="module"[^>]*src|link rel="modulepreload"[^>]*href)="\/gantlo\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]))];
    expect(files.length).toBeGreaterThan(0);
    const total = files.reduce((n, f) => n + gzipSync(readFileSync(join(DIST, f)), { level: 9 }).length, 0);
    expect(total, `${files.length} 個で ${total} bytes`).toBeLessThanOrEqual(300_000);
    // 問題の本文 (解説) はレッスンなどの画面と一緒に読む。最初の JS に入っていない
    // (束ねたあとの書き方で見つからないだけ、にならないよう、ほかの JS には同じ書き方で見つかることも確かめる)
    const sample = LESSONS[0].questions[0].explanation.slice(0, 30);
    const has = (f: string) => readFileSync(join(DIST, f), 'utf8').includes(sample);
    expect(files.filter(has), '最初に読む JS に解説がある').toEqual([]);
    const rest = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js')).map((f) => `assets/${f}`).filter((f) => !files.includes(f));
    expect(rest.filter(has).length, 'あとで読む JS に解説がある').toBeGreaterThan(0);
  });

  it('sitemap.xml は検索に載せる全ページを持ち、robots.txt が sitemap を指し、404.html は検索に載せない', () => {
    expect(read('sitemap.xml')).toBe(sitemapXml(pages));
    expect(read('robots.txt')).toContain(`Sitemap: ${SITE_URL}sitemap.xml`);
    const nf = readHead(read('404.html'));
    expect(nf.robots).toBe('noindex');
    expect(nf.canonical).toBeNull();
  });
});

// 画面にあるページどうしのつながりを、JS なしの HTML にも書く (検索エンジンがリンクをたどれるように)
describe('JS なしの HTML のページどうしのリンク', () => {
  const docOf = (p: SitePage) => new DOMParser().parseFromString(renderPage(template, p), 'text/html');
  const docs = pages.map((p) => ({ page: p, doc: docOf(p) }));
  const inner = (root: ParentNode, prefix = '') =>
    [...root.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')!).filter((h) => h.startsWith(`${BASE}${prefix}`)).map((h) => h.slice(BASE.length));
  const glossary = docs.find(({ page }) => page.path === 'glossary/')!.doc;
  it('サイトの中へのリンクは、どれも書き出すページを指す (用語集の語は一覧の # を指す)', () => {
    const paths = new Set(pages.map((p) => p.path));
    const termIds = new Set([...glossary.querySelectorAll('dt[id]')].map((d) => d.id));
    const broken = docs.flatMap(({ page, doc }) =>
      inner(doc.querySelector('#root')!)
        .filter((h) => {
          const [p, hash] = h.split('#');
          return !paths.has(p) || (p === 'glossary/' && hash !== undefined && !termIds.has(hash));
        })
        .map((h) => `${page.path} → ${h}`),
    );
    expect(broken).toEqual([]);
  });
  it('用語集の語とレッスンは両向きにつながる (語 → 出てくるレッスン、レッスン → 出てくる用語)', () => {
    const pairs = [...glossary.querySelectorAll('dt[id]')].flatMap((dt) => inner(dt.nextElementSibling!, 'lesson/').map((l) => [dt.id, l] as const));
    const expected = [...SORTED.standards, ...SORTED.others].reduce((n, t) => n + t.lessons.filter((id) => LESSONS.some((l) => l.id === id)).length, 0);
    expect(pairs.length).toBe(expected);
    expect(pairs.length).toBeGreaterThan(0);
    const lessonDoc = (path: string) => docs.find(({ page }) => page.path === path)!.doc;
    const missing = pairs.filter(([term, lesson]) => !inner(lessonDoc(lesson).querySelector('#root')!, 'glossary/').includes(`glossary/#${term}`));
    expect(missing).toEqual([]);
  });
});
