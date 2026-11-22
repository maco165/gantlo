import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Button } from '@astryxdesign/core/Button';
import { FileInput } from '@astryxdesign/core/FileInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import StatusLine from '../components/StatusLine';
import { clearExamRun } from '../lib/examSave';
import { downloadBlob, downloadProgress } from '../lib/download';
import { WEEKDAY_LABELS, icsFileName, isTime, studyPlanIcs } from '../lib/ics';
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
import { ICS_DONE, ICS_INVALID, IMPORT_DONE, IMPORT_INVALID, IMPORT_TOO_LARGE, RESET_DONE, SAVE_FAILED, goalSaved, weeklyGoalSaved, type Status } from '../lib/status';
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
  // 学ぶ予定の .ics (記録には残さない。書き出すたびに選ぶ)
  const [icsTime, setIcsTime] = useState('20:00');
  const [icsDays, setIcsDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const toggleDay = (d: number) => setIcsDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort()));
  const exportIcs = () => {
    if (!isTime(icsTime) || icsDays.length === 0) {
      setOutcome({ status: ICS_INVALID, request: 'GET /me/calendar.ics' });
      return;
    }
    downloadBlob(new Blob([studyPlanIcs({ time: icsTime, days: icsDays, now: new Date() })], { type: 'text/calendar' }), icsFileName);
    setOutcome({ status: ICS_DONE, request: 'GET /me/calendar.ics' });
  };
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

      <section className="settings__section" aria-labelledby="settings-week">
        <h2 id="settings-week" className="settings__title">
          週の目標
        </h2>
        {/* 既定は決めない (選ぶまでどれも選ばれていない)。390 幅で 7 つが 44px に収まるよう、外すのは別のボタンにする */}
        <SegmentedControl
          label="週に学ぶ日の数 (日)"
          layout="fill"
          value={progress.profile?.weeklyGoalDays === undefined ? '' : String(progress.profile.weeklyGoalDays)}
          onChange={(v) => {
            updateProgress((p) => setProfile(p, { weeklyGoalDays: Number(v) }));
            setOutcome({ status: weeklyGoalSaved(Number(v)), request: 'PATCH /me/profile' });
          }}
        >
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <SegmentedControlItem key={d} value={String(d)} label={String(d)} />
          ))}
        </SegmentedControl>
        {progress.profile?.weeklyGoalDays !== undefined && (
          <p className="settings__row">
            <Button
              label="週の目標を外す"
              onClick={() => {
                updateProgress((p) => setProfile(p, { weeklyGoalDays: undefined }));
                setOutcome({ status: weeklyGoalSaved(null), request: 'PATCH /me/profile' });
              }}
              width={width}
              size={size}
            />
          </p>
        )}
        <Text type="supporting">
          週に何日学ぶかの目標です (週は月曜から)。ホームの X-Weekly-Target に、今週学んだ日と目標が出ます。学んだ日は、レッスン・復習・模擬試験を終えた日です。
        </Text>
      </section>

      <section className="settings__section" aria-labelledby="settings-ics">
        <h2 id="settings-ics" className="settings__title">
          学ぶ予定をカレンダーに入れる
        </h2>
        <p className="plan__field">
          <label htmlFor="settings-ics-time">時刻</label>
          <input id="settings-ics-time" type="time" value={icsTime} onChange={(e) => setIcsTime(e.target.value)} />
        </p>
        <fieldset className="settings__days">
          <legend>曜日 (全部なら毎日)</legend>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <label key={d} className="settings__day">
              <input type="checkbox" checked={icsDays.includes(d)} onChange={() => toggleDay(d)} />
              {WEEKDAY_LABELS[d]}
            </label>
          ))}
        </fieldset>
        <p className="settings__row">
          <Button label="GET 予定を書き出す (.ics)" onClick={exportIcs} width={width} size={size} />
        </p>
        <Text type="supporting">
          選んだ時刻と曜日に 15 分の予定を繰り返す .ics のファイルを作ります。時刻はこの端末の時刻帯で書きます。中身はサイトの URL と短い文だけで、記録は入れません。
        </Text>
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
        description="完了したレッスン・XP・連続日数・問題ごとの正誤と復習の予定・模擬試験の回 (解いている途中の回も) を消します。1 日の目標と計画は残ります。消す前に書き出しておくと、あとで読み込んで戻せます。"
        actionLabel="消す"
        actionVariant="destructive"
        cancelLabel="やめる"
        onAction={() => {
          updateProgress((p) => resetProgress(p));
          // 模擬試験の解いている途中の回 (別のキー) も消す
          clearExamRun();
          setConfirmReset(false);
          setOutcome({ status: RESET_DONE, request: 'DELETE /me' });
        }}
      />
    </div>
  );
}
