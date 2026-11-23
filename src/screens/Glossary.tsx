import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ChevronDownIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import StatusLine from '../components/StatusLine';
import { findLessonMeta as findLesson } from '../content/catalog';
import { SORTED, TERMS } from '../content/glossary';
import { TOPICS } from '../content/handbook';
import { searchTerms, STANDARD_COUNT, type GlossaryTerm } from '../lib/glossary';
import { topicsForTerm } from '../lib/handbook';
import { COURSES, handbookHref, lessonHref, pageHref, scrollToHash } from '../lib/route';
import { glossaryStatus } from '../lib/status';
import { useMediaQuery, WIDE_QUERY } from '../lib/useMediaQuery';

/**
 * 「試す」のリンクを付ける語。試す画面の始めの選び (lib/tryApi.ts の PRESETS) と同じ鍵 (tests/try.test.ts が比べる)。
 * tryApi.ts を読むと、rolldown がそれを用語集と試す画面の共有の小さなチャンクに切り出すので、ここに名前だけを持つ
 */
export const TRY_TERMS: ReadonlySet<string> = new Set(['http', 'https', 'method', 'get', 'head', 'post', 'put', 'delete', 'status-code', 'status-line', '200-ok', '201-created', '202-accepted', '204-no-content', '400-bad-request', '404-not-found', '409-conflict', '415-unsupported-media-type', 'header', 'request-line', 'accept', 'content-type', 'content-length', 'retry-after', 'json', 'rest']);

/** 分類の札。すべて・11 の規格・問題に出る語 */
type Filter = 'all' | 'standards' | 'others';
const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'standards', label: `${STANDARD_COUNT} の規格` },
  { id: 'others', label: '問題に出る語' },
];

const courseTitle = (id: string) => COURSES.find((c) => c.id === id)?.title ?? id;

/** URL の #term-<id> が指す語の id (知らない語なら null) */
function termFromHash(): string | null {
  const m = /^#term-(.+)$/.exec(window.location.hash);
  if (!m) return null;
  let id: string;
  try {
    id = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  return TERMS.some((t) => t.id === id) ? id : null;
}

/** 札の並び 1 つ (見出しとリンクの札)。札は折り返して並べ、区切りの字は使わない */
function Chips({ label, level, children }: { label: string; level: 3 | 4; children: ReactNode }) {
  const H = level === 3 ? 'h3' : 'h4';
  return (
    <div className="gloss-detail__block">
      <H className="gloss-detail__label">{label}</H>
      <ul className="gloss-chips">{children}</ul>
    </div>
  );
}

/** 語の説明。短い説明・出てくるレッスン・ハンドブック・試す・出典。PC は右の枠に (名前と別名も)、スマホは開いた行の中に出す */
function Detail({ t, heading }: { t: GlossaryTerm; heading: boolean }) {
  const lessons = t.lessons.map((id) => findLesson(id)).filter((l) => l !== undefined);
  const topics = topicsForTerm(TOPICS, t.id);
  // 見出しの格: PC は枠の語が h2 なので h3、スマホは行の語が h3 なので h4
  const level = heading ? 3 : 4;
  return (
    <article className="gloss" data-term={t.id} aria-label={heading ? undefined : `${t.term} の説明`} aria-labelledby={heading ? 'gloss-pane-term' : undefined}>
      {heading && (
        <h2 className="gloss__term" id="gloss-pane-term">
          {t.term}
        </h2>
      )}
      {heading && t.aliases && t.aliases.length > 0 && <Text type="supporting">{t.aliases.join(' · ')}</Text>}
      <p className="gloss__desc">{t.description}</p>
      {lessons.length > 0 && (
        <Chips label="出てくるレッスン" level={level}>
          {lessons.map((l) => (
            <li key={l.id}>
              <Link href={lessonHref(l.id)}>{`${courseTitle(l.course)} ${l.title}`}</Link>
            </li>
          ))}
        </Chips>
      )}
      {topics.length > 0 && (
        <Chips label="ハンドブックで読む" level={level}>
          {topics.map((x) => (
            <li key={x.id}>
              <Link href={handbookHref(x.id)}>{x.title}</Link>
            </li>
          ))}
        </Chips>
      )}
      {TRY_TERMS.has(t.id) && (
        <Chips label="試す" level={level}>
          <li>
            <Link href={`${pageHref('try')}?preset=${encodeURIComponent(t.id)}`}>{`${t.term} を本物の API で`}</Link>
          </li>
        </Chips>
      )}
      <Chips label="出典" level={level}>
        {t.sources.map((s) => (
          <li key={s.url}>
            <Link href={s.url} isExternalLink newTabLabel="(新しいタブで開きます)">
              {s.label}
            </Link>
          </li>
        ))}
      </Chips>
    </article>
  );
}

/** 一覧のまとまり (11 の規格・問題に出る語・見つかった語)。見出しと語の数 */
type Group = { id: string; title: string; terms: readonly GlossaryTerm[]; note?: string };

function GroupHead({ g }: { g: Group }) {
  return (
    <>
      <h2 id={g.id} className="gloss-group__title">
        {g.title} ({g.terms.length} 語)
      </h2>
      {g.note && <Text type="supporting">{g.note}</Text>}
    </>
  );
}

/** PC の形: 左に語の一覧、右に選んだ語の説明の枠 (一覧をスクロールしても上に留まる) */
function DeskList({ groups, picked, onPick }: { groups: Group[]; picked: GlossaryTerm | null; onPick: (id: string) => void }) {
  // 一覧は Tab で止まるのを選んだ語の 1 つだけにし、上下の矢印 (と Home・End) で語を移る。次の Tab で右の枠へ出られる
  const ids = groups.flatMap((g) => g.terms.map((t) => t.id));
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const i = picked ? ids.indexOf(picked.id) : -1;
    const next = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : null;
    if (next === null || next < 0 || next >= ids.length) return;
    e.preventDefault();
    onPick(ids[next]);
    document.querySelector<HTMLButtonElement>(`#term-${CSS.escape(ids[next])} button`)?.focus();
  };
  return (
    <div className="gloss-desk">
      <nav className="gloss-index" aria-label="用語の一覧 (上下の矢印で移る)" onKeyDown={onKeyDown}>
        {groups.map((g) => (
          <section key={g.id} className="gloss-group" aria-labelledby={g.id}>
            <GroupHead g={g} />
            <ul className="gloss-index__list">
              {g.terms.map((t) => (
                <li key={t.id} className="gloss-item" id={`term-${t.id}`} data-term={t.id}>
                  <button type="button" className="gloss-index__item" tabIndex={picked?.id === t.id ? 0 : -1} aria-current={picked?.id === t.id ? 'true' : undefined} aria-controls="gloss-pane" onClick={() => onPick(t.id)}>
                    <span className="gloss-index__term">{t.term}</span>
                    {t.aliases?.[0] && <span className="gloss-index__alias">{t.aliases[0]}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
      <div className="gloss-pane" id="gloss-pane">
        {picked && <Detail key={picked.id} t={picked} heading />}
      </div>
    </div>
  );
}

/** スマホの形: 語の行を押すと、その行の下に説明が開く (もう一度押すと閉じる。開くのは 1 つだけ) */
function PhoneList({ groups, open, onToggle }: { groups: Group[]; open: string | null; onToggle: (id: string) => void }) {
  return (
    <>
      {groups.map((g) => (
        <section key={g.id} className="gloss-group" aria-labelledby={g.id}>
          <GroupHead g={g} />
          <ul className="gloss-rows">
            {g.terms.map((t) => {
              const isOpen = open === t.id;
              return (
                <li key={t.id} className="gloss-item gloss-row" id={`term-${t.id}`} data-term={t.id}>
                  <h3 className="gloss-row__h">
                    <button type="button" className="gloss-row__head" aria-expanded={isOpen} aria-controls={isOpen ? `gloss-body-${t.id}` : undefined} onClick={() => onToggle(t.id)}>
                      <span className="gloss-row__text">
                        <span className="gloss-row__term">{t.term}</span>
                        {t.aliases?.[0] && <span className="gloss-row__alias">{t.aliases[0]}</span>}
                      </span>
                      <ChevronDownIcon width={18} height={18} aria-hidden="true" className={isOpen ? 'gloss-row__chev gloss-row__chev--open' : 'gloss-row__chev'} />
                    </button>
                  </h3>
                  {isOpen && (
                    <div className="gloss-row__body" id={`gloss-body-${t.id}`}>
                      {t.aliases && t.aliases.length > 1 && <Text type="supporting">{t.aliases.join(' · ')}</Text>}
                      <Detail t={t} heading={false} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

/**
 * 用語集の画面 (/gantlo/glossary/) = GET /glossary への応答。
 * 11 の規格 (学ぶ順) と、問題に出る用語 (読みの順) を、短い説明・一次情報の出典・出てくるレッスンへのリンク付きで載せる。
 * PC (768px 以上) は左の一覧で語を選ぶと右の枠に説明が出る。スマホは一覧の行を押すと開く。分類の札で一覧を絞れる。
 * URL の #term-<id> で開くと、その語を選ぶ (スマホは開く)。位置へ送るのは経路 (lib/route.ts の scrollToHash)。
 * 探すときは全角・半角・大文字小文字・ひらがなとカタカナの違いをそろえる (lib/glossary.ts の normalizeText)
 */
export default function Glossary() {
  const isWide = useMediaQuery(WIDE_QUERY);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [picked, setPicked] = useState<string | null>(() => termFromHash());
  const hits = useMemo(() => searchTerms(TERMS, query), [query]);
  const searching = query.trim() !== '';
  // 探していないときは 11 の規格を学ぶ順、ほかを読みの順に分ける。探しているときは、当たりのよい順の 1 つの一覧にする
  const request = searching ? `GET /glossary?q=${encodeURIComponent(query.trim())}` : 'GET /glossary';

  // 同じ画面の中で #term-<id> へ移ったとき (戻る・進む、# だけのリンク) も、その語を選び、札と探す語で隠れていれば戻す
  useEffect(() => {
    const onHash = () => {
      const id = termFromHash();
      if (!id) return;
      setPicked(id);
      setFilter('all');
      setQuery('');
      // 札や探す語で隠れていた語は、描き直すまで位置が無い。出るのを待ってその位置へ送る
      scrollToHash(window.location.hash);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const pool = searching ? hits : TERMS;
  const inFilter = (t: GlossaryTerm) => filter === 'all' || (filter === 'standards') === (t.standard !== undefined);
  const groups: Group[] = (
    searching
      ? [{ id: 'gloss-hits', title: '見つかった語', terms: hits.filter(inFilter) }]
      : [
          { id: 'gloss-standards', title: `${STANDARD_COUNT} の規格`, terms: SORTED.standards.filter(inFilter), note: '学ぶ順に並べています。10 番の OAuth 2.0 / JWT は 2 語に分けています。' },
          { id: 'gloss-terms', title: '問題に出る用語', terms: SORTED.others.filter(inFilter) },
        ]
  ).filter((g) => g.terms.length > 0);
  const shown = groups.flatMap((g) => g.terms);
  const counts: Record<Filter, number> = {
    all: pool.length,
    standards: pool.filter((t) => t.standard !== undefined).length,
    others: pool.filter((t) => t.standard === undefined).length,
  };
  // 札や探す語で選んだ語が一覧から消えたら、選んだ状態を外す (戻したときに、押していない語が選ばれて開かないように)
  const shownKey = shown.map((t) => t.id).join(',');
  useEffect(() => {
    if (picked && !shownKey.split(',').includes(picked)) setPicked(null);
  }, [shownKey, picked]);
  // PC の右の枠は、選んだ語が一覧に見えていればその語、無ければ一覧の先頭
  const deskPicked = shown.find((t) => t.id === picked) ?? shown[0] ?? null;

  return (
    <div className="page gloss-page">
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
      <div role="group" aria-label="分類で絞る" className="gloss-filters">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className="gloss-filter" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label} <span className="gloss-filter__count">{counts[f.id]}</span>
          </button>
        ))}
      </div>
      <div aria-live="polite">
        <StatusLine status={glossaryStatus(shown.length, query)} request={request} />
      </div>
      {groups.length > 0 &&
        (isWide ? (
          <DeskList groups={groups} picked={deskPicked} onPick={setPicked} />
        ) : (
          <PhoneList groups={groups} open={picked} onToggle={(id) => setPicked((p) => (p === id ? null : id))} />
        ))}
    </div>
  );
}
