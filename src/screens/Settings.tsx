import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Button } from '@astryxdesign/core/Button';
import { FileInput } from '@astryxdesign/core/FileInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import StatusLine from '../components/StatusLine';
import { downloadProgress } from '../lib/download';
import {
  GOAL_CHOICES,
  MAX_IMPORT_BYTES,
  goalXp,
  parseImport,
  progressSummary,
  replaceWithImported,
  resetProgress,
  saveProgress,
  setProfile,
  type Progress,
} from '../lib/progress';
import { IMPORT_DONE, IMPORT_INVALID, IMPORT_TOO_LARGE, RESET_DONE, SAVE_FAILED, goalSaved, type Status } from '../lib/status';
import { WIDE_QUERY, useMediaQuery } from '../lib/useMediaQuery';

type Props = { progress: Progress; updateProgress: (fn: (p: Progress) => Progress) => void };

/** 操作の結果。ステータス行と、読めなかったときの理由 */
type Outcome = { status: Status; request: string; reason?: string };

/**
 * 設定の画面 (/gantlo/settings/)。1 日の目標・記録の書き出しと読み込み・記録を消す。
 * 記録はこのブラウザ (localStorage) にだけあり、書き出しも読み込みも画面の中で済ませる (どこにも送らない)
 */
export default function Settings({ progress, updateProgress }: Props) {
  const isWide = useMediaQuery(WIDE_QUERY);
  const [file, setFile] = useState<File | null>(null);
  const [loaded, setLoaded] = useState<Progress | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const width = isWide ? undefined : '100%';
  const size = isWide ? 'md' : 'lg';

  const onFile = async (f: File | File[] | null) => {
    const one = Array.isArray(f) ? (f[0] ?? null) : f;
    setFile(one);
    setLoaded(null);
    setOutcome(null);
    if (!one) return;
    // 1 MB を超えるファイルは中身を読まずに断る
    let text = '';
    if (one.size <= MAX_IMPORT_BYTES) {
      try {
        text = await one.text();
      } catch {
        setOutcome({ status: IMPORT_INVALID, request: 'PUT /me', reason: 'ファイルを読めませんでした。' });
        return;
      }
    }
    const r = parseImport(text, one.size);
    if (!r.ok) {
      setOutcome({ status: r.code === 413 ? IMPORT_TOO_LARGE : IMPORT_INVALID, request: 'PUT /me', reason: r.reason });
      return;
    }
    setLoaded(r.progress);
  };

  const replace = () => {
    if (!loaded) return;
    const next = replaceWithImported(progress, loaded);
    // 保存できない環境では置き換えない (画面だけ変わって、読み直すと消える、を避ける)
    if (!saveProgress(next)) {
      setOutcome({ status: SAVE_FAILED, request: 'PUT /me' });
      setLoaded(null);
      return;
    }
    updateProgress(() => next);
    setFile(null);
    setLoaded(null);
    setOutcome({ status: IMPORT_DONE, request: 'PUT /me' });
  };

  return (
    <div className="page settings">
      <h1 className="page__title">設定</h1>

      <section className="settings__section" aria-labelledby="settings-goal">
        <h2 id="settings-goal" className="settings__title">
          1 日の目標
        </h2>
        <SegmentedControl
          label="1 日の目標 XP"
          layout="fill"
          value={String(goalXp(progress))}
          onChange={(v) => {
            updateProgress((p) => setProfile(p, { dailyGoalXp: Number(v) }));
            setOutcome({ status: goalSaved(Number(v)), request: 'PATCH /me/profile' });
          }}
        >
          {GOAL_CHOICES.map((g) => (
            <SegmentedControlItem key={g} value={String(g)} label={`${g} XP`} />
          ))}
        </SegmentedControl>
        <Text type="supporting">ホームの X-Today-XP に、今日の XP と目標が出ます。1 問正解で 3 XP、実習で 10 XP です。</Text>
      </section>

      <section className="settings__section" aria-labelledby="settings-records">
        <h2 id="settings-records" className="settings__title">
          記録
        </h2>
        <Text type="supporting">{progressSummary(progress)}</Text>
        <Text type="supporting">
          記録はこのブラウザ (localStorage) にだけあります。端末を変えるときは、書き出したファイルを新しい端末で読み込みます。
        </Text>
        <p className="settings__row">
          <Button label="GET 記録を書き出す (JSON)" onClick={() => downloadProgress(progress, new Date())} width={width} size={size} />
        </p>
        <FileInput
          label="記録を読み込む"
          description="gantlo で書き出した JSON のファイル (1 MB まで)。読み込む前に中身を確かめます"
          mode="input"
          value={file}
          onChange={onFile}
          accept=".json,application/json"
          width="100%"
        />
        {loaded && (
          <div className="settings__confirm" role="group" aria-labelledby="settings-confirm-title">
            <p id="settings-confirm-title" className="settings__confirm-title">
              今の記録を、読み込んだ記録で置き換えますか?
            </p>
            <Text type="supporting">読み込んだ記録: {progressSummary(loaded)}</Text>
            <p className="settings__row">
              <Button label="やめる" onClick={() => onFile(null)} width={width} size={size} />
              <Button variant="primary" label="PUT 置き換える" onClick={replace} width={width} size={size} />
            </p>
          </div>
        )}
        <p className="settings__row">
          <Button variant="destructive" label="DELETE 記録を消す" onClick={() => setConfirmReset(true)} width={width} size={size} />
        </p>
      </section>

      <div aria-live="polite">
        {outcome && (
          <div className="settings__outcome" data-status={outcome.status.code}>
            <StatusLine status={outcome.status} request={outcome.request} />
            {outcome.reason && <Text>{outcome.reason}</Text>}
          </div>
        )}
      </div>

      <AlertDialog
        isOpen={confirmReset}
        onOpenChange={setConfirmReset}
        title="記録を消しますか?"
        description="完了したレッスン・XP・連続日数・問題ごとの正誤と復習の予定を消します。1 日の目標と計画は残ります。消す前に書き出しておくと、あとで読み込んで戻せます。"
        actionLabel="消す"
        actionVariant="destructive"
        cancelLabel="やめる"
        onAction={() => {
          updateProgress((p) => resetProgress(p));
          setConfirmReset(false);
          setOutcome({ status: RESET_DONE, request: 'DELETE /me' });
        }}
      />
    </div>
  );
}
