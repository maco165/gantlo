import { Card } from '@astryxdesign/core/Card';
import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import { use } from 'react';
import StatusLine from '../components/StatusLine';
import { findLessonMeta } from '../content/catalog';
import { findTopic, loadSections, TOPICS } from '../content/handbook';
import { TERMS } from '../content/glossary';
import { HANDBOOK_HOWTO, HANDBOOK_LEAD, type HandbookSection, type HandbookTopicMeta } from '../lib/handbook';
import { HANDBOOK_TITLE } from '../lib/pageMeta';
import { COURSES, handbookHref, lessonHref, pageHref } from '../lib/route';
import { HANDBOOK_OK, NOT_FOUND } from '../lib/status';
import StatusPage from './StatusPage';

const courseTitle = (id: string) => COURSES.find((c) => c.id === id)?.title ?? id;
const termName = (id: string) => TERMS.find((x) => x.id === id)?.term ?? id;

/** 一覧 (/gantlo/handbook/)。項目ごとに題・要約・節の数 */
function Index() {
  return (
    <div className="page hb">
      <h1 className="page__title">{HANDBOOK_TITLE}</h1>
      <StatusLine status={HANDBOOK_OK} request="GET /handbook" />
      <Text type="body">{HANDBOOK_LEAD}</Text>
      <Text type="supporting">{HANDBOOK_HOWTO}</Text>
      <ul className="hb-list">
        {TOPICS.map((t) => (
          <li key={t.id}>
            <Card padding={4}>
              <article className="hb-card" aria-labelledby={`hb-${t.id}`}>
                <h2 className="hb-card__title" id={`hb-${t.id}`}>
                  <Link href={handbookHref(t.id)}>{t.title}</Link>
                </h2>
                <Text type="supporting">{t.summary}</Text>
              </article>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * コマンドと出力の枠。Astryx の CodeBlock は使わない (この画面で使うと、Rolldown がテーマの処理を入口の JS に引き上げ、
 * 入口が 172 KB の予算を超えるため。色付けとコピーのボタンは無くし、折り返す <pre> にする)
 */
function Code({ title, text }: { title: string; text: string }) {
  return (
    <figure className="hb-code">
      <figcaption className="hb-code__title">{title}</figcaption>
      <pre className="hb-code__body">
        <code>{text}</code>
      </pre>
    </figure>
  );
}

/** 節 1 つ。見出し・段落・試すコマンドと出力の例・添え書き・出典 */
function Section({ s, index }: { s: HandbookSection; index: number }) {
  const id = `s${index + 1}`;
  return (
    <section className="hb-section" id={id} aria-labelledby={`${id}-h`}>
      <h2 className="hb-section__title" id={`${id}-h`}>
        {s.heading}
      </h2>
      {s.text.map((p) => (
        <p key={p} className="hb-section__text">
          {p}
        </p>
      ))}
      {s.code && <Code title={`試すコマンド (${s.code.language})`} text={s.code.text} />}
      {s.output && <Code title="出力の例" text={s.output} />}
      {s.note && <Text type="supporting">{s.note}</Text>}
      <p className="hb-section__sources tap-links">
        <Text type="supporting">出典: </Text>
        {s.sources.map((src, i) => (
          <span key={src.url} className="joined">
            {i > 0 && <span className="joined__sep">・</span>}
            <Link href={src.url} isExternalLink newTabLabel="(新しいタブで開きます)">
              {src.label}
            </Link>
          </span>
        ))}
      </p>
    </section>
  );
}

/** 項目の本文 (/gantlo/handbook/<id>/)。本文は開いたときに読む (読む間は App の Suspense が待つ) */
function Topic({ t }: { t: HandbookTopicMeta }) {
  const sections = use(loadSections(t.id)) ?? [];
  const lessons = t.lessons.map((id) => findLessonMeta(id)).filter((l) => l !== undefined);
  return (
    <div className="page hb">
      <h1 className="page__title">{t.title}</h1>
      <StatusLine status={HANDBOOK_OK} request={`GET /handbook/${t.id}`} />
      <Text type="body">{t.summary}</Text>
      <nav className="hb-toc" aria-labelledby="hb-toc-h">
        <h2 className="hb-toc__title" id="hb-toc-h">
          この項目の節
        </h2>
        <ol>
          {sections.map((s, i) => (
            <li key={s.heading}>
              <a href={`#s${i + 1}`}>{s.heading}</a>
            </li>
          ))}
        </ol>
      </nav>
      {sections.map((s, i) => (
        <Section key={s.heading} s={s} index={i} />
      ))}
      <section className="hb-section" aria-labelledby="hb-related">
        <h2 className="hb-section__title" id="hb-related">
          関係するレッスンと用語
        </h2>
        {lessons.length > 0 && (
          <ul className="hb-links">
            {lessons.map((l) => (
              <li key={l.id}>
                <Link href={lessonHref(l.id)}>{`${courseTitle(l.course)} ${l.title}`}</Link>
              </li>
            ))}
          </ul>
        )}
        <p className="tap-links">
          <Text type="supporting">用語集: </Text>
          {t.terms.map((id, i) => (
            <span key={id} className="joined">
              {i > 0 && <span className="joined__sep">・</span>}
              <Link href={`${pageHref('glossary')}#term-${id}`}>{termName(id)}</Link>
            </span>
          ))}
        </p>
      </section>
    </div>
  );
}

/** ハンドブックの画面。topic が無ければ一覧、知らない項目は 404 */
export default function Handbook({ topic }: { topic?: string }) {
  if (topic === undefined) return <Index />;
  const t = findTopic(topic);
  if (!t) return <StatusPage title="ページが見つかりません" request={`GET /handbook/${topic}`} status={NOT_FOUND} />;
  return <Topic key={t.id} t={t} />;
}
