import { Button } from '@astryxdesign/core/Button';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { Link } from '@astryxdesign/core/Link';
import { List, ListItem } from '@astryxdesign/core/List';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { HStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useRef, useState } from 'react';
import AnswerResponse from '../components/AnswerResponse';
import ChoiceQuestionView from '../components/ChoiceQuestionView';
import FillQuestionView from '../components/FillQuestionView';
import OrderQuestionView from '../components/OrderQuestionView';
import StatusLine from '../components/StatusLine';
import {
  EXAM_MINUTES,
  EXAM_PER_WEEK,
  EXAM_TOTAL,
  EXAM_WEEKS,
  PASS_MARK,
  PASS_MARK_NOTE,
  expectedText,
  formatClock,
  gradeExam,
  isPassed,
  lessonsToReread,
  examRandom,
  examBank,
  isRecordedRun,
  loadExamRun,
  pickExam,
  recordExam,
  recordExpiredRun,
  toSavedExam,
  type ExamAnswer,
  type ExamItem,
  type ExamResult,
  type RestoredExam,
} from '../lib/exam';
import { clearExamRun, newRunId, saveExamRun, savedRunId } from '../lib/examSave';
import { XP_PER_CORRECT } from '../lib/grade';
import { loadProgress, type Progress } from '../lib/progress';
import { lessonHref, scrollToTop } from '../lib/route';
import { examDone, examIntroStatus, examResumeStatus, type Status } from '../lib/status';
import { WIDE_QUERY, useMediaQuery } from '../lib/useMediaQuery';

type Props = { progress: Progress; updateProgress: (fn: (p: Progress) => Progress) => void };

const pct = (rate: number) => `${Math.round(rate * 100)}%`;
const LIMIT_MS = EXAM_MINUTES * 60_000;
/** 並べ替えの問題を出してから答えを受け付けるまでの間 (2 度押しで次の問題を送らないため) */
const ORDER_GUARD_MS = 400;

/** 解いている回。runId は回の id (保存と記録で同じ回を見分ける)。shownAt は今の問題を出した時刻 (並べ替えの 2 度押しの止めに使う) */
type Run = { runId: string; items: ExamItem[]; answers: (ExamAnswer | undefined)[]; index: number; deadline: number; shownAt: number };
type Done = { items: ExamItem[]; answers: (ExamAnswer | undefined)[]; result: ExamResult };

/** 残した途中の回 (lib/exam.ts の loadExamRun が読み直したもの) */
type Saved = RestoredExam;

/**
 * 模擬試験の画面 (/gantlo/exam/)。本編 4 週から週ごとに 10 問ずつ選んで 60 分で解き、最後にまとめて採点する。
 * 解いている間は正誤を見せない。時間が切れたら、答えていない問題を不正解として採点する。
 * 解いている途中の回 (回の id・出題・答え・期限) は localStorage の別のキー (gantlo.exam.v1) に残し、読み直したり閉じて開き直したりすると
 * 「続きから解く / やめて最初から」を出す。期限 (始めてから 60 分) は閉じている間も進み、過ぎていれば時間切れとして採点する
 * (開いたとき・案内を出している間に期限が来たとき・案内から新しく始めるとき)。採点した回は id を記録に残し、同じ回を 2 回記録しない。
 * 終えた・やめたときは残した回を消す。やめた回は記録しない
 */
export default function Exam({ progress, updateProgress }: Props) {
  const [run, setRun] = useState<Run | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  // 開いたときに残っていた途中の回 (もう記録した回は捨てる)。期限の前なら続けるかを聞き、過ぎていれば時間切れとして採点する
  const [saved, setSaved] = useState<Saved | null>(() => loadExamRun(examBank(), undefined, progress));

  const finish = useCallback(
    (r: Pick<Run, 'runId' | 'items' | 'answers'>, timeUp: boolean) => {
      // 残っているのがこの回のときだけ消す (別のタブが始めた新しい回は消さない)
      if (savedRunId() === r.runId) clearExamRun();
      const result = gradeExam(r.items, r.answers, timeUp);
      // 別のタブがこの回をもう採点していれば (ブラウザの記録に id がある)、記録しない
      if (!isRecordedRun(loadProgress(), r.runId)) updateProgress((p) => recordExam(p, r.items, r.answers, result, new Date(), r.runId));
      setRun(null);
      setSaved(null);
      setDone({ items: r.items, answers: r.answers, result });
      scrollToTop();
    },
    [updateProgress],
  );

  // 期限を過ぎた回は、開いたときに 1 回だけ時間切れとして採点する。
  // 採点の前に localStorage にまだ残っているかを読み直す。記録は回の id で 1 回だけ (lib/exam.ts の recordExam)
  useEffect(() => {
    if (!saved || Date.now() < saved.deadline) return;
    const still = loadExamRun(examBank(), undefined, loadProgress());
    if (!still || still.runId !== saved.runId) return;
    finish(still, true);
  }, [saved, finish]);

  // 解いている間は、答えるたびに出題・答え・期限を残す。残っている回がこの回でなければ (別のタブが採点した・新しく始めた) 残し直さない
  useEffect(() => {
    if (run) saveExamRun(toSavedExam(run.items, run.answers, run.deadline, run.runId), undefined, { onlyIfSame: true });
  }, [run]);

  const start = () => {
    // 続きの案内の回が期限を過ぎていれば、新しく始める前に時間切れとして 1 回だけ記録する
    const now = Date.now();
    if (saved && now >= saved.deadline) updateProgress((p) => recordExpiredRun(p, saved, new Date(now)).progress);
    clearExamRun();
    setSaved(null);
    setDone(null);
    const next: Run = { runId: newRunId(), items: pickExam(undefined, examRandom(window.location.search)), answers: [], index: 0, deadline: now + LIMIT_MS, shownAt: now };
    saveExamRun(toSavedExam(next.items, next.answers, next.deadline, next.runId));
    setRun(next);
    scrollToTop();
  };

  const resume = (s: Saved) => {
    setSaved(null);
    setRun({ runId: s.runId, items: s.items, answers: s.answers, index: s.answers.length, deadline: s.deadline, shownAt: Date.now() });
    scrollToTop();
  };

  const quit = () => {
    if (run && savedRunId() === run.runId) clearExamRun();
    setRun(null);
  };

  if (run) return <Running run={run} setRun={setRun} onFinish={finish} onQuit={quit} />;
  if (done) return <ResultView done={done} onRetry={start} />;
  if (saved && Date.now() < saved.deadline) return <ResumePrompt saved={saved} onResume={() => resume(saved)} onRestart={start} onExpire={() => finish(saved, true)} />;
  return <Intro progress={progress} onStart={start} />;
}

/**
 * 途中の回が残っているときの画面。続きから解くか、その回をやめて最初から始めるかを選ぶ (期限の前にやめた回は記録しない)。
 * 案内を出している間に期限が来たら、時間切れとして採点する (onExpire)
 */
function ResumePrompt({ saved, onResume, onRestart, onExpire }: { saved: Saved; onResume: () => void; onRestart: () => void; onExpire: () => void }) {
  const isWide = useMediaQuery(WIDE_QUERY);
  useEffect(() => {
    const id = window.setTimeout(onExpire, Math.max(0, saved.deadline - Date.now()));
    return () => window.clearTimeout(id);
  }, [saved, onExpire]);
  const width = isWide ? undefined : '100%';
  const answered = saved.answers.length;
  return (
    <div className="page" data-testid="exam-resume">
      <h1 className="page__title">模擬試験の続き</h1>
      <StatusLine status={examResumeStatus(answered, saved.items.length)} request="GET /me/exams/current" />
      <Text>
        途中の回があります。{saved.items.length} 問のうち {answered} 問に答え、残り時間は {formatClock(saved.deadline - Date.now())} です (時間は閉じている間も進みます)。
      </Text>
      <Text type="supporting">「やめて最初から」を選ぶと、この回は記録せずに消し、問題を選び直して始めます。</Text>
      <HStack gap={2} wrap="wrap">
        <Button variant="primary" label="続きから解く" onClick={onResume} width={width} size="lg" />
        <Button variant="secondary" label="やめて最初から" onClick={onRestart} width={width} size="lg" />
      </HStack>
    </div>
  );
}

function Intro({ progress, onStart }: { progress: Progress; onStart: () => void }) {
  const isWide = useMediaQuery(WIDE_QUERY);
  const exams = progress.exams ?? [];
  return (
    <div className="page">
      <h1 className="page__title">模擬試験</h1>
      <Text type="supporting">
        本編 4 週の総まとめです。各週から {EXAM_PER_WEEK} 問ずつ、合わせて {EXAM_TOTAL} 問を開くたびに選び直します。解いている間は正誤を出さず、最後にまとめて採点します。{PASS_MARK_NOTE}
      </Text>
      <StatusLine status={examIntroStatus(EXAM_TOTAL, EXAM_MINUTES)} request="GET /exam" />
      <dl className="stats">
        <div className="stats__item">
          <dt>
            <Text type="supporting">問題</Text>
          </dt>
          <dd>{EXAM_TOTAL} 問</dd>
        </div>
        <div className="stats__item">
          <dt>
            <Text type="supporting">制限時間</Text>
          </dt>
          <dd>{EXAM_MINUTES} 分</dd>
        </div>
        <div className="stats__item">
          <dt>
            <Text type="supporting">合格の目安</Text>
          </dt>
          <dd>{pct(PASS_MARK)} 以上</dd>
        </div>
      </dl>
      <section aria-labelledby="exam-scope">
        <h2 id="exam-scope" className="result__sub">
          出題の範囲
        </h2>
        <List hasDividers>
          {EXAM_WEEKS.map((w) => (
            <ListItem key={w.week} label={<Text>{`第 ${w.week} 週 · ${w.title}`}</Text>} endContent={<Text type="supporting">{EXAM_PER_WEEK} 問</Text>} />
          ))}
        </List>
        <Text type="supporting">
          実習は出しません。間違えた問題と、時間内に答えられなかった問題は、翌日の復習に入ります。正解 1 問ごとに {XP_PER_CORRECT} XP です。途中で閉じても、このブラウザに途中の回が残り、開き直すと続きから解けます (時間は閉じている間も進みます)。やめるボタンでやめた回は記録しません。
        </Text>
      </section>
      <p>
        <Button variant="primary" label="模擬試験を始める" onClick={onStart} width={isWide ? undefined : '100%'} size="lg" />
      </p>
      <section aria-labelledby="exam-history">
        <h2 id="exam-history" className="result__sub">
          これまでの回
        </h2>
        {exams.length > 0 ? (
          <List hasDividers>
            {exams.map((e, i) => (
              <ListItem
                key={`${e.at}-${i}`}
                label={<Text>{`${new Date(e.at).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })} · ${e.correct} / ${e.total} 問 (${pct(e.correct / e.total)})`}</Text>}
                endContent={<Text type="supporting">{isPassed(e) ? '合格' : '不合格'}{e.timeUp ? ' · 時間切れ' : ''}</Text>}
              />
            ))}
          </List>
        ) : (
          <Text type="supporting">まだ受けていません。</Text>
        )}
      </section>
    </div>
  );
}

function Running({
  run,
  setRun,
  onFinish,
  onQuit,
}: {
  run: Run;
  setRun: (r: Run) => void;
  onFinish: (r: Run, timeUp: boolean) => void;
  onQuit: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  // 時間切れは 1 回だけ採点する (時計の刻みと最後の答えが重なっても 2 回記録しない)
  const ended = useRef(false);
  const end = useCallback(
    (r: Run, timeUp: boolean) => {
      if (ended.current) return;
      ended.current = true;
      onFinish(r, timeUp);
    },
    [onFinish],
  );

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const left = run.deadline - now;
  useEffect(() => {
    if (left <= 0) end(run, true);
  }, [left, run, end]);

  const total = run.items.length;
  const item = run.items[run.index];
  const isLast = run.index === total - 1;
  const onChecked = (correct: boolean, status: Status) => {
    // 並べ替えの送るボタンは並べ方によらず押せるので、続けて 2 度押すと 2 回目が次の問題に当たる。
    // 並べ替えだけ、出してから ORDER_GUARD_MS の間に来た答えは捨てる (ほかの種類は答えを入れるまで送るボタンが押せない)
    if (item.question.kind === 'order' && Date.now() - run.shownAt < ORDER_GUARD_MS) return;
    if (Date.now() >= run.deadline) {
      end(run, true);
      return;
    }
    const answers = [...run.answers];
    answers[run.index] = { correct, code: status.code };
    const next = { ...run, answers, index: run.index + 1, shownAt: Date.now() };
    if (isLast) end(next, false);
    else {
      setRun(next);
      scrollToTop();
    }
  };

  const head = `${run.index + 1} / ${total} 問`;
  const request = `POST /me/exams/answers/${run.index + 1}`;
  const q = item.question;
  const key = `${run.index}-${q.id}`;
  const props = { head, request, onChecked, nextLabel: '', onNext: () => {}, isExam: true };
  let view;
  if (q.kind === 'command' || q.kind === 'http') view = <FillQuestionView key={key} {...props} question={q} />;
  else if (q.kind === 'choice') view = <ChoiceQuestionView key={key} {...props} question={q} />;
  else if (q.kind === 'order') view = <OrderQuestionView key={key} {...props} question={q} />;
  // 実習は出題しない (examBank が外す)
  else view = null;

  const lowTime = left <= 5 * 60_000;
  return (
    <div className="lesson" data-testid="exam-run" data-question={q.id}>
      <header className="lesson-bar">
        <Button variant="ghost" label="模擬試験をやめる (記録しません)" isIconOnly icon={<XMarkIcon width={20} height={20} />} onClick={onQuit} />
        <div className="lesson-bar__progress">
          <Text type="supporting">
            模擬試験 · {run.index + 1} / {total} 問 ·{' '}
            <span className={lowTime ? 'exam-clock exam-clock--low' : 'exam-clock'} data-testid="exam-clock" aria-label={`残り時間 ${formatClock(left)}`}>
              残り {formatClock(left)}
            </span>
          </Text>
          <ProgressBar label="模擬試験の進み具合" isLabelHidden value={run.index + 1} max={total} />
        </div>
      </header>
      <div className="lesson__main">{view}</div>
    </div>
  );
}

function ResultView({ done, onRetry }: { done: Done; onRetry: () => void }) {
  const isWide = useMediaQuery(WIDE_QUERY);
  const { items, answers, result } = done;
  const status = examDone(result.correct, result.total, result.passed, result.timeUp);
  const reread = result.weakest ? lessonsToReread(items, answers, result.weakest.week) : [];
  const body = JSON.stringify(
    {
      correct: result.correct,
      total: result.total,
      rate: Math.round(result.rate * 100) / 100,
      passed: result.passed,
      byWeek: result.byWeek.map((w) => ({ week: w.week, correct: w.correct, total: w.total })),
    },
    null,
    2,
  );
  return (
    <div className="page result">
      <h1 className="page__title">模擬試験の結果 · {result.passed ? '合格' : '不合格'}</h1>
      <AnswerResponse
        status={status}
        request="POST /me/exams"
        headers={[
          { name: 'X-Result', value: result.passed ? 'pass' : 'fail', ja: `合否 (このサイトの目安で、${pct(PASS_MARK)} 以上を合格とします)` },
          { name: 'X-XP', value: `+${result.correct * XP_PER_CORRECT}`, ja: 'この回で得た XP' },
          ...(result.unanswered > 0 ? [{ name: 'X-Unanswered', value: String(result.unanswered), ja: '時間内に答えられなかった問題の数 (不正解として数えました)' }] : []),
        ]}
      >
        <CodeBlock code={body} language="json" hasLanguageLabel={false} title="本文 (JSON)" width="100%" size="sm" hasCopyButton={false} />
      </AnswerResponse>

      <dl className="stats">
        <div className="stats__item">
          <dt>
            <Text type="supporting">正答</Text>
          </dt>
          <dd>
            {result.correct} / {result.total}
          </dd>
        </div>
        <div className="stats__item">
          <dt>
            <Text type="supporting">正答率</Text>
          </dt>
          <dd>{pct(result.rate)}</dd>
        </div>
        <div className="stats__item">
          <dt>
            <Text type="supporting">合否</Text>
          </dt>
          <dd>{result.passed ? '合格' : '不合格'}</dd>
        </div>
      </dl>

      <section aria-labelledby="exam-weeks">
        <h2 id="exam-weeks" className="result__sub">
          週ごとの正答率
        </h2>
        <List hasDividers>
          {result.byWeek.map((w) => (
            <ListItem
              key={w.week}
              label={<Text>{`第 ${w.week} 週 · ${w.title}`}</Text>}
              endContent={
                <Text type="supporting">
                  {w.correct} / {w.total} ({pct(w.rate)})
                </Text>
              }
            />
          ))}
        </List>
        {result.weakest ? (
          <>
            <Text>
              いちばん低いのは第 {result.weakest.week} 週 ({result.weakest.title}) の {pct(result.weakest.rate)} です。間違えた問題のあるレッスンを読み直しましょう。
            </Text>
            <ul className="exam-reread">
              {reread.map((l) => (
                <li key={l.id}>
                  <Link href={lessonHref(l.id)}>{l.title}</Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <Text>全部の週が満点です。</Text>
        )}
      </section>

      <section aria-labelledby="exam-rows">
        <h2 id="exam-rows" className="result__sub">
          問題ごとの結果
        </h2>
        <List hasDividers>
          {items.map((it, i) => {
            const a = answers[i];
            const o = a?.correct ? 'right' : 'wrong';
            const code = a ? String(a.code) : '408';
            return (
              <ListItem
                key={`${i}-${it.question.id}`}
                align="first-line"
                label={<Text>{it.question.prompt}</Text>}
                description={<Text type="supporting">{a?.correct ? `第 ${it.week} 週 · ${it.lesson.title}` : `正しい答え: ${expectedText(it.question)}。${it.question.explanation}`}</Text>}
                startContent={<code className={`result__code result__code--${o}`}>{code}</code>}
                endContent={<Text type="supporting">{a ? (a.correct ? '正解' : '不正解 · 復習へ') : '未回答 · 復習へ'}</Text>}
              />
            );
          })}
        </List>
      </section>

      <HStack gap={2} justify={isWide ? 'end' : 'start'} wrap="wrap">
        <Button variant="primary" label="もう一度受ける" onClick={onRetry} width={isWide ? undefined : '100%'} size={isWide ? 'md' : 'lg'} />
      </HStack>
    </div>
  );
}
