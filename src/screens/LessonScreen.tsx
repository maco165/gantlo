import { QuestionHeadingLevel } from '../components/QuestionFrame';
import { Button } from '@astryxdesign/core/Button';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { List, ListItem } from '@astryxdesign/core/List';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { HStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useCallback, useMemo, useState } from 'react';
import AnswerResponse from '../components/AnswerResponse';
import ChoiceQuestionView from '../components/ChoiceQuestionView';
import FillQuestionView from '../components/FillQuestionView';
import LabQuestionView from '../components/LabQuestionView';
import { IntroFolded, IntroGate } from '../components/LessonIntro';
import OrderQuestionView from '../components/OrderQuestionView';
import type { Lesson, Question } from '../content/types';
import { answerRequest, finishLesson, lessonScore, resultCode, resultBody, resultLocation, reviewResultBody, type Outcome } from '../lib/lessonRun';
import { completeReview, currentStreak, goalXp, recordAnswer, todayXp, type Progress } from '../lib/progress';
import { homeHref, scrollToTop } from '../lib/route';
import { shuffleItems } from '../lib/order';
import { shuffleChoices } from '../lib/shuffle';
import { lessonCreated, reviewDone, type Status } from '../lib/status';
import { WIDE_QUERY, useMediaQuery } from '../lib/useMediaQuery';

type Props = {
  lesson: Lesson;
  progress: Progress;
  updateProgress: (fn: (p: Progress) => Progress) => void;
  /** 今日の復習として解くとき。レッスンの完了は付けず XP と連続日数だけ進め、閉じると backHref (復習の画面) へ戻る */
  review?: { backHref: string };
};

const OUTCOME_LABEL: Record<Outcome, string> = {
  right: '正解',
  wrong: '不正解 · 復習へ',
  done: '実習を終えた',
};

/** 上の帯: 閉じる・レッスン名と何問目か・進み具合 */
function LessonBar({ title, current, total, closeHref }: { title: string; current: number; total: number; closeHref: string }) {
  // 要点を読んでいる間 (current が 0) は「要点」と出す
  return (
    <header className="lesson-bar">
      <Button variant="ghost" label="レッスンを閉じる" isIconOnly icon={<XMarkIcon width={20} height={20} />} href={closeHref} />
      <div className="lesson-bar__progress">
        {/* レッスン名がこの画面の h1 (書き出す HTML の h1 と同じ)。見た目は補足の字のまま */}
        <div className="lesson-bar__label">
          <h1 className="lesson-bar__title">{title}</h1> · {current === 0 ? `要点 · 全 ${total} 問` : `${current} / ${total} 問`}
        </div>
        <ProgressBar label="レッスンの進み具合" isLabelHidden value={current} max={total} />
      </div>
    </header>
  );
}

/** レッスンを 1 問ずつ解き、最後に 201 Created で結果を出す */
export default function LessonScreen({ lesson, progress, updateProgress, review }: Props) {
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  // 答えの画面に出したステータスのコード (完了画面の一覧に同じコードを出す)
  const [codes, setCodes] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // 要点 (intro) は、はじめて解くレッスンでだけ問題の前に出す。済みのレッスン (開いた時点で 1 回だけ見る) と復習では飛ばし、
  // 問題の上に畳んで置く。「もう一度解く」では要点に戻さない
  const [started, setStarted] = useState(() => review !== undefined || !lesson.intro || progress.lessons[lesson.id]?.done === true);
  // 4 択の選択肢と並べ替えの項目は、開いたときと「もう一度解く」のたびに混ぜ直す (attempt が変わるたび)
  const questions = useMemo(() => lesson.questions.map((q) => (q.kind === 'order' ? shuffleItems(q) : shuffleChoices(q))), [lesson, attempt]);
  const total = questions.length;
  const q = questions[index];
  const isLast = index === total - 1;
  const score = lessonScore(questions, outcomes);

  const setOutcome = (outcome: Outcome) =>
    setOutcomes((o) => {
      const next = [...o];
      next[index] = outcome;
      return next;
    });

  const onChecked = (correct: boolean, status: Status) => {
    setOutcome(correct ? 'right' : 'wrong');
    setCodes((c) => {
      const next = [...c];
      next[index] = status.code;
      return next;
    });
    updateProgress((p) => recordAnswer(p, q.id, correct, new Date()));
  };

  const onNext = useCallback(() => {
    if (!isLast) {
      setIndex((i) => i + 1);
      scrollToTop();
      return;
    }
    const s = lessonScore(questions, outcomes);
    updateProgress((p) => (review ? completeReview(p, s.xp, new Date()) : finishLesson(p, lesson.id, s, new Date())));
    setFinished(true);
    scrollToTop();
  }, [isLast, outcomes, questions, updateProgress, lesson.id, review]);

  const restart = () => {
    setIndex(0);
    setOutcomes([]);
    setCodes([]);
    setFinished(false);
    setAttempt((a) => a + 1);
    scrollToTop();
  };

  if (finished) return <ResultView lesson={lesson} questions={questions} outcomes={outcomes} codes={codes} score={score} progress={progress} onRetry={restart} review={review} />;

  const closeHref = review?.backHref ?? homeHref;
  if (!started && lesson.intro)
    return (
      <div className="lesson">
        <LessonBar title={lesson.title} current={0} total={total} closeHref={closeHref} />
        <div className="lesson__main">
          <IntroGate
            intro={lesson.intro}
            total={total}
            onStart={() => {
              setStarted(true);
              scrollToTop();
            }}
          />
        </div>
      </div>
    );

  const head = `${index + 1} / ${total} 問`;
  const request = answerRequest(lesson.id, index, review !== undefined);
  const nextLabel = isLast ? 'POST 結果を記録する' : '次の問題へ';
  const key = `${attempt}-${q.id}`;
  let view;
  if (q.kind === 'command' || q.kind === 'http')
    view = <FillQuestionView key={key} question={q} head={head} request={request} onChecked={onChecked} nextLabel={nextLabel} onNext={onNext} />;
  else if (q.kind === 'choice')
    view = <ChoiceQuestionView key={key} question={q} head={head} request={request} onChecked={onChecked} nextLabel={nextLabel} onNext={onNext} />;
  else if (q.kind === 'order')
    view = <OrderQuestionView key={key} question={q} head={head} request={request} onChecked={onChecked} nextLabel={nextLabel} onNext={onNext} />;
  else view = <LabQuestionView key={key} question={q} head={head} request={request} onDone={() => setOutcome('done')} nextLabel={nextLabel} onNext={onNext} />;

  return (
    <div className="lesson">
      <LessonBar title={lesson.title} current={index + 1} total={total} closeHref={closeHref} />
      <div className="lesson__main">
        {/* 復習では要点を出さない (問題は別々のレッスンから集めるため) */}
        {!review && lesson.intro && <IntroFolded key={`intro-${attempt}-${index}`} intro={lesson.intro} />}
        <QuestionHeadingLevel.Provider value={2}>{view}</QuestionHeadingLevel.Provider>
      </div>
    </div>
  );
}

function ResultView({
  lesson,
  questions,
  outcomes,
  codes,
  score,
  progress,
  onRetry,
  review,
}: {
  lesson: Lesson;
  questions: Question[];
  outcomes: Outcome[];
  codes: number[];
  score: ReturnType<typeof lessonScore>;
  progress: Progress;
  onRetry: () => void;
  review?: { backHref: string };
}) {
  const isWide = useMediaQuery(WIDE_QUERY);
  const now = new Date();
  const today = todayXp(progress, now);
  const goal = goalXp(progress);
  return (
    <div className="page result">
      <h1 className="page__title">{review ? '復習完了' : `レッスン完了 · ${lesson.title}`}</h1>
      <AnswerResponse
        status={review ? reviewDone(score.correct, score.total) : lessonCreated(score.correct, score.total)}
        request={review ? 'POST /me/reviews' : 'POST /me/lessons'}
        headers={
          review
            ? [{ name: 'X-XP', value: `+${score.xp}`, ja: 'この復習で得た XP' }]
            : [
                { name: 'Location', value: resultLocation(lesson.id), ja: '作った記録の置き場所 (このブラウザの中)' },
                { name: 'X-XP', value: `+${score.xp}`, ja: 'このレッスンで得た XP' },
              ]
        }
      >
        <CodeBlock code={review ? reviewResultBody(score) : resultBody(lesson.id, score)} language="json" hasLanguageLabel={false} title="本文 (JSON)" width="100%" size="sm" hasCopyButton={false} />
      </AnswerResponse>

      <dl className="stats">
        <div className="stats__item">
          <dt>
            <Text type="supporting">正答</Text>
          </dt>
          <dd>
            {score.correct} / {score.total}
          </dd>
        </div>
        <div className="stats__item">
          <dt>
            <Text type="supporting">獲得</Text>
          </dt>
          <dd>+{score.xp} XP</dd>
        </div>
        <div className="stats__item">
          <dt>
            <Text type="supporting">連続</Text>
          </dt>
          <dd>{currentStreak(progress, now)} 日</dd>
        </div>
      </dl>

      <ProgressBar
        label={today >= goal ? '今日の目標を達成' : '今日の目標'}
        value={Math.min(today, goal)}
        max={goal}
        hasValueLabel
        formatValueLabel={() => `${today} / ${goal} XP`}
      />

      <section aria-labelledby="result-rows">
        <h2 id="result-rows" className="result__sub">
          問題ごとの結果
        </h2>
        <List hasDividers>
          {questions.map((q, i) => {
            // どの問題も答えるまで次へ進めないので、結果の欠けは起きない。念のため欠けは不正解として出す
            const o = outcomes[i] ?? 'wrong';
            const code = resultCode(o, codes[i]);
            return (
              <ListItem
                key={q.id}
                align="first-line"
                // 文字列の label は 1 行に切られるので、Text で渡して問題文を折り返させる
                label={<Text>{q.prompt}</Text>}
                startContent={<code className={`result__code result__code--${o}`}>{code}</code>}
                endContent={<Text type="supporting">{OUTCOME_LABEL[o]}</Text>}
              />
            );
          })}
        </List>
      </section>

      <HStack gap={2} justify={isWide ? 'end' : 'start'} wrap="wrap">
        {!review && <Button label="もう一度解く" onClick={onRetry} width={isWide ? undefined : '100%'} size={isWide ? 'md' : 'lg'} />}
        <Button
          variant="primary"
          label={review ? '復習の画面へ戻る' : 'ホームへ戻る'}
          href={review?.backHref ?? homeHref}
          width={isWide ? undefined : '100%'}
          size={isWide ? 'md' : 'lg'}
        />
      </HStack>
    </div>
  );
}
