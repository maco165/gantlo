import { Text } from '@astryxdesign/core/Text';
import { useEffect, useRef, useState } from 'react';
import type { LessonMeta } from '../content/catalog';
import type { Progress } from '../lib/progress';
import { CARD_HEIGHT, CARD_WIDTH, cardFileName } from '../lib/summaryCard';
import { renderCard, saveBlob } from '../lib/summaryCardRender';
import StatusLine from './StatusLine';
import type { Status } from '../lib/status';

const SAVED: Status = { code: 200, reason: 'OK', ja: 'まとめのカード (PNG) を保存しました' };
const SHARED: Status = { code: 200, reason: 'OK', ja: 'まとめのカードを共有に渡しました' };
const FAILED: Status = { code: 500, reason: 'Internal Server Error', ja: 'このブラウザではカードの画像を作れませんでした' };

/**
 * 学習のまとめのカード (1080×1350 の PNG)。押したときに描き、保存と、端末が画像の共有に対応していれば共有を出す
 * (navigator.share の files。無ければ保存だけ)。中身は期間・数・連続日数・コースごとの到達だけ (lib/summaryCard.ts)。
 * 部品は進捗の画面の JS に直に入れる (後から読む import() にすると、rolldown が共有の部品を細かいチャンクに切り直し、
 * どのページも最初に読む JS の本数が増えるため)
 */
export default function SummaryCard({ progress, now, lessons }: { progress: Progress; now: Date; lessons: readonly LessonMeta[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [outcome, setOutcome] = useState<{ status: Status; request: string } | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);

  useEffect(() => {
    try {
      const probe = new File([new Uint8Array(1)], 'probe.png', { type: 'image/png' });
      setCanShareFiles(typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] }));
    } catch {
      setCanShareFiles(false);
    }
  }, []);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const make = async (): Promise<Blob | null> => {
    if (!ref.current) return null;
    try {
      const blob = await renderCard(ref.current, progress, now, lessons);
      setPreview({ url: URL.createObjectURL(blob), blob });
      return blob;
    } catch {
      setOutcome({ status: FAILED, request: 'GET /me/summary.png' });
      return null;
    }
  };

  const save = async () => {
    const blob = await make();
    if (!blob) return;
    saveBlob(blob, cardFileName(now));
    setOutcome({ status: SAVED, request: 'GET /me/summary.png' });
  };

  const shareCard = async () => {
    const blob = await make();
    if (!blob) return;
    try {
      await navigator.share({ files: [new File([blob], cardFileName(now), { type: 'image/png' })], title: 'gantlo の学習のまとめ' });
      setOutcome({ status: SHARED, request: 'POST /me/summary.png/share' });
    } catch {
      // 共有の画面を閉じた (AbortError) ときは何も出さない
    }
  };

  return (
    <div ref={ref} className="summary-card" data-testid="summary-card">
      <Text type="supporting">
        学んだ期間・学んだ日・解いた問題の数・連続日数・コースごとの到達を、1 枚の画像 ({CARD_WIDTH}×{CARD_HEIGHT}) にします。名前や答えの中身など、あなたを特定できる情報は入れません。画像はこのブラウザの中で作ります。
      </Text>
      <p className="settings__row">
        {/* Astryx の Button ではなく自前の .btn (計画の画面と同じ)。進捗の画面の JS が Button を読むと、rolldown が Button を
            別のチャンクに切り出し、どのページも最初に読む JS の本数が 1 本増えるため */}
        <button type="button" className="btn" onClick={save}>
          GET まとめのカードを保存 (PNG)
        </button>
        {canShareFiles && (
          <button type="button" className="btn" onClick={shareCard}>
            共有する
          </button>
        )}
      </p>
      {preview && <img className="summary-card__preview" src={preview.url} width={CARD_WIDTH} height={CARD_HEIGHT} alt="学習のまとめのカード (学んだ期間・学んだ日・解いた問題・連続日数・コースごとの到達)" />}
      <div aria-live="polite">{outcome && <StatusLine status={outcome.status} request={outcome.request} />}</div>
    </div>
  );
}
