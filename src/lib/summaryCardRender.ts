// まとめのカードを canvas に描いて PNG にする (ブラウザの中だけ。押したときに動く)。数と描き方は lib/summaryCard.ts
import type { LessonMeta } from '../content/catalog';
import type { Progress } from './progress';
import { CARD_HEIGHT, CARD_WIDTH, drawSummary, summaryOf, type CardTheme } from './summaryCard';

/**
 * PNG を保存させる (lib/download.ts の downloadBlob と同じ手順)。download.ts を設定の画面と分け合うと、
 * rolldown がそれを小さな別のチャンクに切り出し、設定の画面で読む JS の本数が増えるので、ここに写して持つ
 */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 画面のテーマのトークンを、canvas に渡せる値にする (el の場所で読む。Theme が変数を置く箱の内側であること) */
export function readTheme(el: Element): CardTheme {
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
export async function renderCard(el: Element, progress: Progress, now: Date, lessons: readonly LessonMeta[]): Promise<Blob> {
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
