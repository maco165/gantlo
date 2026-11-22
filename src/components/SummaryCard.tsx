import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { useEffect, useRef, useState } from 'react';
import type { Lesson } from '../content/types';
import { downloadBlob } from '../lib/download';
import type { Progress } from '../lib/progress';
import { CARD_HEIGHT, CARD_WIDTH, cardFileName, drawSummary, summaryOf, type CardTheme } from '../lib/summaryCard';
import { WIDE_QUERY, useMediaQuery } from '../lib/useMediaQuery';
import StatusLine from './StatusLine';
import type { Status } from '../lib/status';

/** 画面のテーマのトークンを、canvas に渡せる値にする (el の場所で読む。Theme が変数を置く箱の内側であること) */
function readTheme(el: Element): CardTheme {
  const cs = getComputedStyle(el);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    body: v('--color-background-body'),
    surface: v('--color-background-surface'),
    border: v('--color-border'),
    text: v('--color-text-primary'),
    sub: v('--color-text-secondary'),
    success: v('--color-text-success'),
    info: v('--color-text-info'),
    error: v('--color-text-error'),
    muted: v('--color-border-emphasized'),
    font: v('--font-family-body') || 'sans-serif',
    code: v('--font-family-code') || 'monospace',
    display: v('--font-family-display') || 'serif',
  };
}

/** 書体を読み終えてから描く (canvas は書体の読み込みを待たないので、先に読ませる。日本語は端末の書体) */
async function loadFonts(t: CardTheme): Promise<void> {
  if (!document.fonts?.load) return;
  await Promise.all([document.fonts.load(`120px ${t.display}`, 'gantlo'), document.fonts.load(`40px ${t.font}`, '学習のまとめ 0'), document.fonts.load(`600 56px ${t.code}`, '200 OK 0')]).catch(() => undefined);
}

/** カードを描いて PNG にする */
async function renderCard(el: Element, progress: Progress, now: Date, lessons: readonly Lesson[]): Promise<Blob> {
  const theme = readTheme(el);
  await loadFonts(theme);
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas を使えません');
  drawSummary(ctx, summaryOf(progress, now, lessons), theme);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG を作れません'))), 'image/png'));
}

const SAVED: Status = { code: 200, reason: 'OK', ja: 'まとめのカード (PNG) を保存しました' };
const SHARED: Status = { code: 200, reason: 'OK', ja: 'まとめのカードを共有に渡しました' };
const FAILED: Status = { code: 500, reason: 'Internal Server Error', ja: 'このブラウザではカードの画像を作れませんでした' };

/**
 * 学習のまとめのカード (1080×1350 の PNG)。押したときに描き、保存と、端末が画像の共有に対応していれば共有を出す
 * (navigator.share の files。無ければ保存だけ)。中身は期間・数・連続日数・コースごとの到達だけ (lib/summaryCard.ts)
 */
export default function SummaryCard({ progress, now, lessons }: { progress: Progress; now: Date; lessons: readonly Lesson[] }) {
  const isWide = useMediaQuery(WIDE_QUERY);
  const ref = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [outcome, setOutcome] = useState<{ status: Status; request: string } | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const width = isWide ? undefined : '100%';
  const size = isWide ? 'md' : 'lg';

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
    downloadBlob(blob, cardFileName(now));
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
        <Button label="GET まとめのカードを保存 (PNG)" onClick={save} width={width} size={size} />
        {canShareFiles && <Button label="共有する" onClick={shareCard} width={width} size={size} />}
      </p>
      {preview && <img className="summary-card__preview" src={preview.url} width={CARD_WIDTH} height={CARD_HEIGHT} alt="学習のまとめのカード (学んだ期間・学んだ日・解いた問題・連続日数・コースごとの到達)" />}
      <div aria-live="polite">{outcome && <StatusLine status={outcome.status} request={outcome.request} />}</div>
    </div>
  );
}
