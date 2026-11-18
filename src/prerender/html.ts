// 組み立てた index.html (dist/index.html) を型にして、1 ページ分の HTML と sitemap.xml を作る。
import { esc, pageUrl, type SitePage } from './pages';

/**
 * 型の中の置き換える場所。1 つでも見つからなければ書き出しを止める
 * (index.html の形が変わったのに、全ページの canonical がホームのまま公開される、といったことを防ぐ)
 */
const SLOTS = {
  title: /<title>[^<]*<\/title>/,
  description: /(<meta name="description" content=")[^"]*(")/,
  canonical: /(<link rel="canonical" href=")[^"]*(")/,
  ogUrl: /(<meta property="og:url" content=")[^"]*(")/,
  ogTitle: /(<meta property="og:title" content=")[^"]*(")/,
  ogDescription: /(<meta property="og:description" content=")[^"]*(")/,
  root: /<div id="root">[\s\S]*?<\/div>(?=\s*(?:<script|<\/body>))/,
} as const;

/** JS を動かさない読み手向けの本文の箱。CSS を読む前でも読めるよう、色と幅は index.html の頃と同じものを直に書く */
const MAIN_OPEN = '<main style="max-width: 720px; margin: 0 auto; padding: 24px 16px; line-height: 1.7; color: #e8f1f6; background: #101314">';

export type RenderOptions = {
  /** 検索に載せない (404.html)。canonical と og:url も外す */
  noindex?: boolean;
};

/** 置き換えは関数で渡す (説明や本文の $1・$& を、置き換えの記号として読ませない) */
export function renderPage(template: string, page: SitePage, { noindex = false }: RenderOptions = {}): string {
  const url = pageUrl(page.path);
  const attr = (v: string) => (_: string, head: string, tail: string) => `${head}${v}${tail}`;
  const set: Record<keyof typeof SLOTS, (...m: string[]) => string> = {
    title: () => `<title>${esc(page.title)}</title>`,
    description: attr(esc(page.description)),
    canonical: attr(url),
    ogUrl: attr(url),
    ogTitle: attr(esc(page.title)),
    ogDescription: attr(esc(page.description)),
    root: () => `<div id="root">\n      ${MAIN_OPEN}\n${page.body}\n      </main>\n    </div>`,
  };
  let html = template;
  for (const key of Object.keys(SLOTS) as (keyof typeof SLOTS)[]) {
    const re = SLOTS[key];
    if (!re.test(html)) throw new Error(`prerender: index.html に ${key} の場所が見つかりません (index.html の形を変えたら src/prerender/html.ts の SLOTS を直す)`);
    html = html.replace(re, set[key] as (m: string, ...rest: string[]) => string);
  }
  if (noindex) {
    html = html.replace(/\s*<link rel="canonical"[^>]*>/, '').replace(/\s*<meta property="og:url"[^>]*>/, '');
    html = html.replace('</title>', () => '</title>\n    <meta name="robots" content="noindex" />');
  }
  return html;
}

/** lastmod は付けない (作るたびの日付では正しくなく、Google は正しいと分かるときだけ使うため) */
export function sitemapXml(pages: readonly SitePage[]): string {
  const urls = pages.map((p) => `  <url><loc>${esc(pageUrl(p.path))}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
