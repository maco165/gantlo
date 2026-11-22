// ページごとの共有のカードの画像 (OG 画像、1200×630 の PNG)。検索に載るページ (ホームを除く) は、そのページの題を入れた画像を
// dist/<道>/og.png に書き、og:image と twitter:image がそれを指す (src/prerender/html.ts)。ホーム・記録の画面・404 は、
// サイト共通の画像 (public/og.png) のまま。画像は scripts/og-images.mjs が build の最後に Playwright の Chromium で撮る。
import { SITE_NAME } from '../lib/site';
import { pageUrl, type SitePage } from './pages';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
/** サイト共通の画像の URL (ホーム・記録の画面・404) */
export const SITE_OG_IMAGE = pageUrl('og.png');
/** ページの画像の、そのページの道の中での名前 */
export const OG_FILE = 'og.png';

/** そのページだけの画像を持つか。検索に載るページ (noindex でなく canonical を持つ) で、ホームでないもの */
export const hasOwnOgImage = (page: Pick<SitePage, 'path' | 'noindex' | 'canonical'>): boolean => page.path !== '' && !page.noindex && page.canonical !== false;

/** ページの og:image の URL */
export const ogImageUrl = (page: Pick<SitePage, 'path' | 'noindex' | 'canonical'>): string => (hasOwnOgImage(page) ? `${pageUrl(page.path)}${OG_FILE}` : SITE_OG_IMAGE);

/** 道の頭から、カードの上に出すページの種類 */
const KINDS: Record<string, string> = { lesson: 'レッスン', course: 'コース', glossary: '用語集', exam: '模擬試験', about: 'このサイトについて' };

export type OgCard = {
  /** 道 (BASE からの相対。dist/<path>og.png に書く) */
  path: string;
  /** 大きく出す題 (<title> からサイト名を外したもの。長いレッスンは短い題) */
  title: string;
  /** ページの種類 (レッスン・コース など) */
  kind: string;
  /** このサイトの見せ方の要求の行 (例: GET /lesson/main-w1-l1) */
  request: string;
  /** 下に出す URL (https を外した形) */
  url: string;
};

/** <title> から「 | gantlo」を外す */
export const cardTitle = (title: string): string => title.replace(new RegExp(` \\| ${SITE_NAME}$`), '');

export function ogCard(page: SitePage): OgCard {
  const head = page.path.split('/')[0];
  return {
    path: page.path,
    title: cardTitle(page.title),
    kind: KINDS[head] ?? 'ページ',
    request: `GET /${page.path.replace(/\/$/, '')}`,
    url: pageUrl(page.path).replace(/^https:\/\//, ''),
  };
}

/** 画像を作るページ (検索に載るページのうち、ホームを除く) */
export const ogCards = (pages: readonly SitePage[]): OgCard[] => pages.filter(hasOwnOgImage).map(ogCard);

/** og:image の代替文 */
export const ogImageAlt = (page: SitePage): string | null => (hasOwnOgImage(page) ? `${SITE_NAME}: ${cardTitle(page.title)} (${KINDS[page.path.split('/')[0]] ?? 'ページ'})` : null);
