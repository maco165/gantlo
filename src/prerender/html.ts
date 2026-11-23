// 組み立てた index.html (dist/index.html) を型にして、1 ページ分の HTML と sitemap.xml を作る。
import { ogImageAlt, ogImageUrl } from './og';
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
  ogImage: /(<meta property="og:image" content=")[^"]*(")/,
  ogImageAlt: /(<meta property="og:image:alt" content=")[^"]*(")/,
  twitterImage: /(<meta name="twitter:image" content=")[^"]*(")/,
  root: /<div id="root">[\s\S]*?<\/div>(?=\s*(?:<script|<\/body>))/,
} as const;

/** JS を動かさない読み手向けの本文の箱。CSS を読む前でも読めるよう、色と幅は index.html の頃と同じものを直に書く */
const MAIN_OPEN = '<main style="max-width: 720px; margin: 0 auto; padding: 24px 16px; line-height: 1.7; color: #e8f1f6; background: #101314">';

/** 置き換えは関数で渡す (説明や本文の $1・$& を、置き換えの記号として読ませない) */
export function renderPage(template: string, page: SitePage): string {
  const url = pageUrl(page.path);
  const attr = (v: string) => (_: string, head: string, tail: string) => `${head}${v}${tail}`;
  const set: Record<keyof typeof SLOTS, (...m: string[]) => string> = {
    title: () => `<title>${esc(page.title)}</title>`,
    description: attr(esc(page.description)),
    canonical: attr(url),
    ogUrl: attr(url),
    ogTitle: attr(esc(page.title)),
    ogDescription: attr(esc(page.description)),
    // 検索に載るページ (ホームを除く) は、そのページの題を入れた画像 (dist/<道>/og.png)。ほかはサイト共通の画像のまま (src/prerender/og.ts)
    ogImage: attr(ogImageUrl(page)),
    ogImageAlt: (m: string, head: string, tail: string) => {
      const alt = ogImageAlt(page);
      return alt === null ? m : `${head}${esc(alt)}${tail}`;
    },
    twitterImage: attr(ogImageUrl(page)),
    root: () => `<div id="root">\n      ${MAIN_OPEN}\n${page.body}\n      </main>\n    </div>`,
  };
  let html = template;
  for (const key of Object.keys(SLOTS) as (keyof typeof SLOTS)[]) {
    const re = SLOTS[key];
    if (!re.test(html)) throw new Error(`prerender: index.html に ${key} の場所が見つかりません (index.html の形を変えたら src/prerender/html.ts の SLOTS を直す)`);
    html = html.replace(re, set[key] as (m: string, ...rest: string[]) => string);
  }
  if (page.canonical === false) html = html.replace(/\s*<link rel="canonical"[^>]*>/, '').replace(/\s*<meta property="og:url"[^>]*>/, '');
  if (page.noindex) html = html.replace('</title>', () => '</title>\n    <meta name="robots" content="noindex" />');
  if (page.jsonLd?.length) {
    if (!html.includes('</head>')) throw new Error('prerender: index.html に </head> が見つかりません (構造化データを入れる場所)');
    html = html.replace('</head>', () => `  <script type="application/ld+json">${jsonLdText(page.jsonLd!)}</script>\n  </head>`);
  }
  return html;
}

/**
 * 構造化データ (schema.org) の JSON。< > & は \u003c などで書き、データの文字で script が閉じないようにする
 * (JSON としては同じ値に読める)
 */
export function jsonLdText(graph: readonly Record<string, unknown>[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/** 検索に載せるページだけを載せる。lastmod は付けない (作るたびの日付では正しくなく、Google は正しいと分かるときだけ使うため) */
export function sitemapXml(pages: readonly SitePage[]): string {
  const urls = pages.filter((p) => !p.noindex).map((p) => `  <url><loc>${esc(pageUrl(p.path))}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
