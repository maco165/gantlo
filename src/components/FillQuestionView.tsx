import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Fragment, useState } from 'react';
import type { CommandQuestion, HttpQuestion } from '../content/types';
import { XP_PER_CORRECT, gradeFill, normalizeAnswer } from '../lib/grade';
import { RETRY_AFTER_SECONDS, fillStatus } from '../lib/status';
import AnswerResponse, { sourceHeaders } from './AnswerResponse';
import AskAi from './AskAi';
import { ActionArea, PrimaryAction, QuestionHead } from './QuestionFrame';

const KIND_LABEL = { command: 'コマンドの穴埋め', http: 'HTTP の穴埋め', json: 'JSON の穴埋め' } as const;

/** コマンド (command) と HTTP・JSON (http) の穴埋め。空欄は 1〜2 つ */
export default function FillQuestionView({
  question,
  head,
  request,
  onChecked,
  nextLabel,
  onNext,
}: {
  question: CommandQuestion | HttpQuestion;
  /** 見出しに添える「何問目」 */
  head: string;
  request: string;
  onChecked: (correct: boolean) => void;
  nextLabel: string;
  onNext: () => void;
}) {
  const [values, setValues] = useState<string[]>(() => question.blanks.map(() => ''));
  const [results, setResults] = useState<boolean[] | null>(null);
  const checked = results !== null;
  const filled = values.every((v) => normalizeAnswer(v) !== '');
  const kind = question.kind === 'command' ? KIND_LABEL.command : KIND_LABEL[question.format];
  const label = question.kind === 'command' ? question.tool : question.format === 'json' ? 'JSON' : 'HTTP';

  const check = () => {
    if (checked || !filled) return;
    const r = gradeFill(question, values);
    setResults(r.blanks);
    onChecked(r.correct);
  };

  // 空欄は書いてある順に 1 つずつ番号を振る (http は 2 つまで)
  let n = 0;
  const blank = () => {
    const i = n++;
    const b = question.blanks[i];
    const longest = Math.max(6, ...(b?.answers ?? []).map((a) => a.length));
    return (
      <span className="fill-code__blank" style={{ width: `calc(${longest + 2}ch + 3rem)` }}>
        <TextInput
          label={question.blanks.length > 1 ? `空欄 ${i + 1}` : '空欄'}
          isLabelHidden
          size="sm"
          value={values[i] ?? ''}
          onChange={(v) => setValues((vs) => vs.map((x, j) => (j === i ? v : x)))}
          onEnter={check}
          isReadOnly={checked}
          placeholder="____"
          autoCapitalize="off"
          hasAutoCorrect={false}
          hasSpellCheck={false}
          autoComplete="off"
          status={checked ? { type: results[i] ? 'success' : 'error' } : undefined}
          width="100%"
        />
      </span>
    );
  };
  const lines = question.code.split('\n');

  const status = checked ? fillStatus(question.blanks, results) : null;
  const correct = status?.code === 200;

  return (
    <VStack gap={5}>
      <QuestionHead kind={`${kind} · ${head}`} prompt={question.prompt} />

      <div className="fill-code" data-testid="fill-code">
        <div className="fill-code__header">
          <Text type="supporting">{label}</Text>
        </div>
        <div className="fill-code__body">
          {lines.map((line, li) => {
            const parts = line.split('{{blank}}');
            return (
              <div key={li} className="fill-code__line">
                {question.kind === 'command' && li === 0 && <span className="fill-code__prompt">$ </span>}
                {parts.map((part, pi) => (
                  <Fragment key={pi}>
                    {pi > 0 && blank()}
                    {part}
                  </Fragment>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <ActionArea>
        {!checked ? (
          <>
            <PrimaryAction label="POST 答えを送る" onClick={check} isDisabled={!filled} />
            <AskAi question={question} />
          </>
        ) : (
          <>
            <AnswerResponse
              status={status!}
              request={request}
              headers={[
                ...(correct
                  ? [{ name: 'X-XP', value: `+${XP_PER_CORRECT}`, ja: 'この問題で得た XP' }]
                  : [
                      { name: 'X-Expected', value: question.blanks.map((b) => b.answers[0]).join(' / '), ja: '正しい答え' },
                      { name: 'Retry-After', value: String(RETRY_AFTER_SECONDS), ja: '明日の復習に入ります (1 日 = 86400 秒)' },
                    ]),
                ...sourceHeaders(question.sources),
              ]}
            >
              <Text>{question.explanation}</Text>
              {correct && question.kind === 'command' && question.output && (
                <CodeBlock code={question.output} title="実行結果の例" width="100%" size="sm" hasCopyButton={false} />
              )}
            </AnswerResponse>
            <PrimaryAction label={nextLabel} onClick={onNext} />
            <AskAi question={question} answered={{ picked: values.map(normalizeAnswer).join(' / '), correct }} />
          </>
        )}
      </ActionArea>
    </VStack>
  );
}
