import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { Link } from '@astryxdesign/core/Link';
import { VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import type { IntroFigure, LessonIntro as Intro } from '../content/types';
import { sourceLabel } from './AnswerResponse';
import { PrimaryAction } from './QuestionFrame';
import { INTRO_GOALS_HEADING, INTRO_HEADING, INTRO_SOURCES_HEADING, INTRO_START_LABEL, INTRO_SUMMARY, INTRO_TRY_HEADING } from '../lib/intro';


/** 図: flow は矢印でつなぐ箱の並び、table は名前と意味の 2 列 */
function Figure({ figure }: { figure: IntroFigure }) {
  return (
    <figure className="intro-figure" data-testid="intro-figure">
      {figure.kind === 'flow' ? (
        <ol className="intro-flow">
          {figure.items.map((it, i) => (
            <li key={i} className="intro-flow__item">
              <span className="intro-flow__label">{it.label}</span>
              {it.note && <Text type="supporting">{it.note}</Text>}
            </li>
          ))}
        </ol>
      ) : (
        <dl className="intro-table">
          {figure.items.map((it, i) => (
            <div key={i} className="intro-table__row">
              <dt>{it.label}</dt>
              <dd>{it.note}</dd>
            </div>
          ))}
        </dl>
      )}
      <figcaption>
        <Text type="supporting">{figure.caption}</Text>
      </figcaption>
    </figure>
  );
}

/** 要点の中身 (目標・説明・図・試すコマンド・出典)。h は中の見出しの段 */
function IntroBody({ intro, h }: { intro: Intro; h: 'h2' | 'h3' }) {
  const H = h;
  return (
    <VStack gap={4}>
      <section aria-label={INTRO_GOALS_HEADING}>
        <H className="intro__sub">{INTRO_GOALS_HEADING}</H>
        <ul className="intro-goals">
          {intro.goals.map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ul>
      </section>
      {intro.body.map((p, i) => (
        <p key={i} className="intro__p">
          {p}
        </p>
      ))}
      {intro.figure && <Figure figure={intro.figure} />}
      {intro.tryIt && intro.tryIt.length > 0 && (
        <section aria-label={INTRO_TRY_HEADING}>
          <H className="intro__sub">{INTRO_TRY_HEADING}</H>
          <VStack gap={2}>
            {intro.tryIt.map((t, i) => (
              <VStack key={i} gap={1}>
                <CodeBlock code={t.command} language="bash" hasLanguageLabel={false} width="100%" size="sm" />
                <Text type="supporting">{t.expect}</Text>
              </VStack>
            ))}
          </VStack>
        </section>
      )}
      <section aria-label={INTRO_SOURCES_HEADING}>
        <H className="intro__sub">{INTRO_SOURCES_HEADING}</H>
        <ul className="intro-sources">
          {intro.sources.map((s) => (
            <li key={s}>
              <Link href={s} isExternalLink newTabLabel="(新しいタブで開きます)">
                {sourceLabel(s)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </VStack>
  );
}

/** はじめて開いたレッスンの要点。読んでから「問題を始める」 */
export function IntroGate({ intro, total, onStart }: { intro: Intro; total: number; onStart: () => void }) {
  return (
    <section className="intro" data-testid="lesson-intro" aria-labelledby="intro-heading">
      <VStack gap={5}>
        <VStack gap={1.5}>
          <Text type="supporting">はじめに · 問題は全 {total} 問</Text>
          <h2 id="intro-heading" className="q-title">
            {INTRO_HEADING}
          </h2>
        </VStack>
        <IntroBody intro={intro} h="h3" />
        <div className="q-actions">
          <PrimaryAction label={INTRO_START_LABEL} onClick={onStart} />
        </div>
      </VStack>
    </section>
  );
}

/** 問題を解いている間の要点。畳んでおき、開けば読める (済みのレッスンと、始めたあと) */
export function IntroFolded({ intro }: { intro: Intro }) {
  return (
    <details className="intro-folded" data-testid="lesson-intro-folded">
      <summary>{INTRO_SUMMARY}</summary>
      <div className="intro-folded__body">
        <IntroBody intro={intro} h="h3" />
      </div>
    </details>
  );
}
