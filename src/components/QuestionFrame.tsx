import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import type { ReactNode } from 'react';
import { WIDE_QUERY, useMediaQuery } from '../lib/useMediaQuery';

/** 問題の見出し (種類 · 何問目) と問題文 */
export function QuestionHead({ kind, prompt }: { kind: string; prompt: string }) {
  return (
    <VStack gap={1.5}>
      <Text type="supporting">{kind}</Text>
      <h1 className="q-title">{prompt}</h1>
    </VStack>
  );
}

/** 答えを送る・次へのボタン。スマホは全幅、PC は右寄せ */
export function PrimaryAction({ label, onClick, isDisabled }: { label: string; onClick: () => void; isDisabled?: boolean }) {
  const isWide = useMediaQuery(WIDE_QUERY);
  if (!isWide) return <Button variant="primary" size="lg" width="100%" label={label} onClick={onClick} isDisabled={isDisabled} />;
  return (
    <HStack gap={3} justify="end">
      <Button variant="primary" label={label} onClick={onClick} isDisabled={isDisabled} />
    </HStack>
  );
}

/** 問題の下の操作の帯 */
export function ActionArea({ children }: { children: ReactNode }) {
  return (
    <div className="q-actions">
      <VStack gap={3}>{children}</VStack>
    </div>
  );
}
