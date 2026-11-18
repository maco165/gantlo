import { Button } from '@astryxdesign/core/Button';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { List, ListItem } from '@astryxdesign/core/List';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useCallback, useMemo, useState } from 'react';
import AnswerResponse from '../components/AnswerResponse';
import ChoiceQuestionView from '../components/ChoiceQuestionView';
import FillQuestionView from '../components/FillQuestionView';
import LabQuestionView from '../components/LabQuestionView';
import { ActionArea, PrimaryAction, QuestionHead } from '../components/QuestionFrame';
import type { Lesson, Question } from '../content/types';
import { finishLesson, isGraded, lessonScore, resultBody, resultLocation, type Outcome } from '../lib/lessonRun';
import { completeReview, currentStreak, goalXp, recordAnswer, todayXp, type Progress } from '../lib/progress';
import { homeHref, scrollToTop } from '../lib/route';
import { shuffleChoices } from '../lib/shuffle';
import { KIND_NOT_IMPLEMENTED, lessonCreated, reviewDone } from '../lib/status';
import { WIDE_QUERY, useMediaQuery } from '../lib/useMediaQuery';

type Props = {
  lesson: Lesson;
  progress: Progress;
  updateProgress: (fn: (p: Progress) => Progress) => void;
  /** 今日の復習として解くとき。レッスンの完了は付けず XP と連続日数だけ進め、閉じると backHref (復習の画面) へ戻る */
  review?: { backHref: string };
};

const OUTCOME_LABEL: Record<Outcome, { code: string; ja: string }> = {
  right: { code: '200', ja: '正解' },
  wrong: { code: '400', ja: '不正解 · 復習へ' },
  done: { code: '200', ja: '実習を終えた' },
  skipped: { code: '501', ja: '準備中のため飛ばした' },
};

/** 上の帯: 閉じる・レッスン名と何問目か・進み具合 */
function LessonBar({ title, current, total, closeHref }: { title: string; current: number; total: number; closeHref: string }) {
  return (
    <header className="lesson-bar">
      <Button variant="ghost" label="レッスンを閉じる" isIconOnly icon={<XMarkIcon width={20} height={20} />} href={closeHref} />
      <div className="lesson-bar__progress">
        <Text type="supporting">
          {title} · {current} / {total} 問
        </Text>
        <ProgressBar label="レッスンの進み具合" isLabelHidden value={current} max={total} />
      </div>
    </header>
  );
}

/** 並べ替えなど、まだ解けない種類の問題。501 を出して飛ばせるようにする */
function NotImplementedView({ question, head, request, nextLabel, onNext }: { question: Question; head: string; request: string; nextLabel: string; onNext: () => void }) {
  return (
    <VStack gap={5}>
      <QuestionHead kind={`並べ替え · ${head}`} prompt={question.prompt} />
      <ActionArea>
        <AnswerResponse status={KIND_NOT_IMPLEMENTED} request={request} headers={[]}>
          <Text>この種類 (並べ替え) の問題は準備中です。正答数には数えずに次へ進みます。</Text>
        </AnswerResponse>
        <PrimaryAction label={nextLabel} onClick={onNext} />
      </ActionArea>
    </VStack>
  );
}

/** レッスンを 1 問ずつ解き、最後に 201 Created で結果を出す */
export default function LessonScreen({ lesson, progress, updateProgress, review }: Props) {
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [finished, setFinished] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // 4 択の選択肢は、開いたときと「もう一度解く」のたびに混ぜ直す (attempt が変わるたび)
  const questions = useMemo(() => lesson.questions.map((q) => shuffleChoices(q)), [lesson, attempt]);
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

  const onChecked = (correct: boolean) => {
    setOutcome(correct ? 'right' : 'wrong');
    updateProgress((p) => recordAnswer(p, q.id, correct, new Date()));
  };

  const onNext = useCallback(() => {
    // まだ解けない種類 (並べ替え) は、次へ進んだときに「飛ばした」と残す
    const final = [...outcomes];
    if (q.kind === 'order') final[index] = 'skipped';
    setOutcomes(final);
    if (!isLast) {
      setIndex((i) => i + 1);
      scrollToTop();
      return;
    }
    const s = lessonScore(questions, final);
    updateProgress((p) => (review ? completeReview(p, s.xp, new Date()) : finishLesson(p, lesson.id, s, new Date())));
    setFinished(true);
    scrollToTop();
  }, [q, index, isLast, outcomes, questions, updateProgress, lesson.id, review]);

  const restart = () => {
    setIndex(0);
    setOutcomes([]);
    setFinished(false);
    setAttempt((a) => a + 1);
    scrollToTop();
  };

  if (finished) return <ResultView lesson={lesson} questions={questions} outcomes={outcomes} score={score} progress={progress} onRetry={restart} review={review} />;

  const head = `${index + 1} / ${total} 問`;
  const request = `POST /lessons/${lesson.id}/answers/${index + 1}`;
  const nextLabel = isLast ? 'POST 結果を記録する' : '次の問題へ';
  const key = `${attempt}-${q.id}`;
  let view;
  if (q.kind === 'command' || q.kind === 'http')
    view = <FillQuestionView key={key} question={q} head={head} request={request} onChecked={onChecked} nextLabel={nextLabel} onNext={onNext} />;
  else if (q.kind === 'choice')
    view = <ChoiceQuestionView key={key} question={q} head={head} request={request} onChecked={onChecked} nextLabel={nextLabel} onNext={onNext} />;
  else if (q.kind === 'lab')
    view = <LabQuestionView key={key} question={q} head={head} request={request} onDone={() => setOutcome('done')} nextLabel={nextLabel} onNext={onNext} />;
  else view = <NotImplementedView key={key} question={q} head={head} request={request} nextLabel={nextLabel} onNext={onNext} />;

  return (
    <div className="lesson">
      <LessonBar title={lesson.title} current={index + 1} total={total} closeHref={review?.backHref ?? homeHref} />
      <div className="lesson__main">{view}</div>
    </div>
  );
}

function ResultView({
  lesson,
  questions,
  outcomes,
  score,
  progress,
  onRetry,
  review,
}: {
  lesson: Lesson;
  questions: Question[];
  outcomes: Outcome[];
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
        <CodeBlock code={resultBody(lesson.id, score)} language="json" hasLanguageLabel={false} title="本文 (JSON)" width="100%" size="sm" hasCopyButton={false} />
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
            const o = outcomes[i] ?? (isGraded(q) ? 'wrong' : 'skipped');
            const l = OUTCOME_LABEL[o];
            return (
              <ListItem
                key={q.id}
                align="first-line"
                // 文字列の label は 1 行に切られるので、Text で渡して問題文を折り返させる
                label={<Text>{q.prompt}</Text>}
                startContent={<code className={`result__code result__code--${o}`}>{l.code}</code>}
                endContent={<Text type="supporting">{l.ja}</Text>}
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
