import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useMemo, useState, type ReactNode } from 'react';
import StatusLine from '../components/StatusLine';
import { SORTED, TERMS } from '../content/glossary';
import { findLessonMeta as findLesson } from '../content/catalog';
import { searchTerms, STANDARD_COUNT, type GlossaryTerm } from '../lib/glossary';
import { COURSES, lessonHref, pageHref } from '../lib/route';
import { glossaryStatus } from '../lib/status';

/**
 * 「試す」のリンクを付ける語。試す画面の始めの選び (lib/tryApi.ts の PRESETS) と同じ鍵 (tests/try.test.ts が比べる)。
 * tryApi.ts を読むと、rolldown がそれを用語集と試す画面の共有の小さなチャンクに切り出すので、ここに名前だけを持つ
 */
export const TRY_TERMS: ReadonlySet<string> = new Set(['http', 'https', 'method', 'get', 'head', 'post', 'put', 'delete', 'status-code', 'status-line', '200-ok', '201-created', '202-accepted', '204-no-content', '400-bad-request', '404-not-found', '409-conflict', '415-unsupported-media-type', 'header', 'request-line', 'accept', 'content-type', 'content-length', 'retry-after', 'json', 'rest']);

const courseTitle = (id: string) => COURSES.find((c) => c.id === id)?.title ?? id;

/**
 * 「・」で区切って並べるリンクの 1 つ。区切りを後ろのリンクと同じ箱に入れ、リンクの 1 行目の頭に並べる
 * (狭い画面ではリンクが 44px の箱になるので、区切りだけを裸で置くと 1 行を占める)
 */
function Joined({ first, children }: { first: boolean; children: ReactNode }) {
  return (
    <span className="joined">
      {!first && <span className="joined__sep">・</span>}
      {children}
    </span>
  );
}

/** 語 1 つ。名前・別名・短い説明・出てくるレッスン・出典 */
function Entry({ t }: { t: GlossaryTerm }) {
  const lessons = t.lessons.map((id) => findLesson(id)).filter((l) => l !== undefined);
  return (
    <article className="gloss" id={`term-${t.id}`} data-term={t.id} aria-labelledby={`term-${t.id}-name`}>
      <h3 className="gloss__term" id={`term-${t.id}-name`}>
        {t.term}
      </h3>
      {t.aliases && t.aliases.length > 0 && <Text type="supporting">{t.aliases.join(' · ')}</Text>}
      <p className="gloss__desc">{t.description}</p>
      {lessons.length > 0 && (
        <p className="gloss__meta tap-links">
          <Text type="supporting">出てくるレッスン: </Text>
          {lessons.map((l, i) => (
            <Joined key={l.id} first={i === 0}>
              <Link href={lessonHref(l.id)}>{`${courseTitle(l.course)} ${l.title}`}</Link>
            </Joined>
          ))}
        </p>
      )}
      {TRY_TERMS.has(t.id) && (
        <p className="gloss__meta tap-links">
          <Link href={`${pageHref('try')}?preset=${encodeURIComponent(t.id)}`}>{`試す: ${t.term} を本物の API で`}</Link>
        </p>
      )}
      <p className="gloss__meta tap-links">
        <Text type="supporting">出典: </Text>
        {t.sources.map((s, i) => (
          <Joined key={s.url} first={i === 0}>
            <Link href={s.url} isExternalLink newTabLabel="(新しいタブで開きます)">
              {s.label}
            </Link>
          </Joined>
        ))}
      </p>
    </article>
  );
}

function Group({ id, title, terms, note }: { id: string; title: string; terms: readonly GlossaryTerm[]; note?: string }) {
  if (terms.length === 0) return null;
  return (
    <section className="gloss-group" aria-labelledby={id}>
      <h2 id={id} className="gloss-group__title">
        {title} ({terms.length} 語)
      </h2>
      {note && <Text type="supporting">{note}</Text>}
      <div className="gloss-group__list">
        {terms.map((t) => (
          <Entry key={t.id} t={t} />
        ))}
      </div>
    </section>
  );
}

/**
 * 用語集の画面 (/gantlo/glossary/) = GET /glossary への応答。
 * 11 の規格 (学ぶ順) と、問題に出る用語 (読みの順) を、短い説明・一次情報の出典・出てくるレッスンへのリンク付きで載せる。
 * 探すときは全角・半角・大文字小文字・ひらがなとカタカナの違いをそろえる (lib/glossary.ts の normalizeText)
 */
export default function Glossary() {
  const [query, setQuery] = useState('');
  const hits = useMemo(() => searchTerms(TERMS, query), [query]);
  const searching = query.trim() !== '';
  // 探していないときは 11 の規格を学ぶ順、ほかを読みの順に分ける。探しているときは、当たりのよい順の 1 つの一覧にする
  const request = searching ? `GET /glossary?q=${encodeURIComponent(query.trim())}` : 'GET /glossary';

  return (
    <div className="page">
      <h1 className="page__title">用語集</h1>
      <Text type="supporting">
        {STANDARD_COUNT} の規格と問題に出る用語、合わせて {TERMS.length} 語の短い説明です。出典は RFC などの一次情報で、節まで指しています。全角 (ＨＴＴＰ) や半角カナ (ｸｴﾘ)、ひらがなでも探せます。
      </Text>
      <div role="search" className="gloss-search">
        <TextInput
          type="search"
          label="用語を探す"
          isLabelHidden
          placeholder="用語・別名・説明から探す"
          startIcon={MagnifyingGlassIcon}
          value={query}
          onChange={setQuery}
          hasClear
          width="100%"
        />
      </div>
      <div aria-live="polite">
        <StatusLine status={glossaryStatus(hits.length, query)} request={request} />
      </div>
      {searching ? (
        <Group id="gloss-hits" title="見つかった語" terms={hits} />
      ) : (
        <>
          <Group
            id="gloss-standards"
            title={`${STANDARD_COUNT} の規格`}
            terms={SORTED.standards}
            note="学ぶ順に並べています。10 番の OAuth 2.0 / JWT は 2 語に分けています。"
          />
          <Group id="gloss-terms" title="問題に出る用語" terms={SORTED.others} />
        </>
      )}
    </div>
  );
}
