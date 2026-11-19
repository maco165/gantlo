import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import type { ChoiceQuestion } from '../content/types';
import { XP_PER_CORRECT, gradeChoice } from '../lib/grade';
import { RETRY_AFTER_SECONDS, choiceStatus, type Status } from '../lib/status';
import AnswerResponse, { sourceHeaders } from './AnswerResponse';
import AskAi from './AskAi';
import { ActionArea, PrimaryAction, QuestionHead } from './QuestionFrame';

const letter = (i: number) => String.fromCharCode(65 + i);

/** 4 択。選択肢は渡された並びのまま出す (混ぜるのは呼ぶ側) */
export default function ChoiceQuestionView({
  question,
  head,
  request,
  onChecked,
  nextLabel,
  onNext,
}: {
  question: ChoiceQuestion;
  head: string;
  request: string;
  onChecked: (correct: boolean, status: Status) => void;
  nextLabel: string;
  onNext: () => void;
}) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState<boolean | null>(null);
  const checked = result !== null;
  const answerIndex = question.choices.findIndex((c) => c.id === question.answer);
  const picked = question.choices.find((c) => c.id === value);

  const check = () => {
    if (checked || value === '') return;
    const ok = gradeChoice(question, value);
    setResult(ok);
    onChecked(ok, choiceStatus(ok));
  };

  return (
    <VStack gap={5}>
      <QuestionHead kind={`4 択 · ${head}`} prompt={question.prompt} />

      {question.code && <CodeBlock code={question.code.text} language={question.code.format} width="100%" size="sm" hasCopyButton={false} />}

      <RadioList label="選択肢" isLabelHidden value={value} onChange={setValue} isDisabled={checked}>
        {question.choices.map((c, i) => (
          <RadioListItem key={c.id} value={c.id} label={`${letter(i)}. ${c.text}`} />
        ))}
      </RadioList>

      <ActionArea>
        {!checked ? (
          <>
            <PrimaryAction label="POST 答えを送る" onClick={check} isDisabled={value === ''} />
            <AskAi question={question} />
          </>
        ) : (
          <>
            <AnswerResponse
              status={choiceStatus(result)}
              request={request}
              headers={[
                ...(result
                  ? [{ name: 'X-XP', value: `+${XP_PER_CORRECT}`, ja: 'この問題で得た XP' }]
                  : [
                      { name: 'X-Expected', value: `${letter(answerIndex)}. ${question.choices[answerIndex]?.text ?? ''}`, ja: '正しい答え' },
                      { name: 'Retry-After', value: String(RETRY_AFTER_SECONDS), ja: '明日の復習に入ります (1 日 = 86400 秒)' },
                    ]),
                ...sourceHeaders(question.sources),
              ]}
            >
              {!result && picked?.why && <Text>{picked.why}</Text>}
              <Text>{question.explanation}</Text>
            </AnswerResponse>
            <PrimaryAction label={nextLabel} onClick={onNext} />
            <AskAi question={question} answered={{ picked: value, correct: result }} />
          </>
        )}
      </ActionArea>
    </VStack>
  );
}
