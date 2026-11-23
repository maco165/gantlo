import { Button } from '@astryxdesign/core/Button';
import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import { xPostUrl, type ShareData } from '../lib/share';
import type { Status } from '../lib/status';
import { WIDE_QUERY, useMediaQuery } from '../lib/useMediaQuery';
import StatusLine from './StatusLine';

const COPIED: Status = { code: 200, reason: 'OK', ja: 'ページの URL をコピーしました' };
const COPY_FAILED: Status = { code: 500, reason: 'Internal Server Error', ja: 'このブラウザではコピーできませんでした。アドレスバーの URL を使ってください' };
const SHARED: Status = { code: 200, reason: 'OK', ja: '共有の画面に渡しました' };

/**
 * 結果を共有するボタン。Web Share API (navigator.share) があれば「共有する」1 つ、
 * 無い端末は X の投稿の画面 (新しいタブ) とリンクのコピー。共有するのは点数の文とページの URL だけ (lib/share.ts)
 */
export default function ShareButtons({ data }: { data: ShareData }) {
  const isWide = useMediaQuery(WIDE_QUERY);
  const [outcome, setOutcome] = useState<Status | null>(null);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const width = isWide ? undefined : '100%';
  const size = isWide ? 'md' : 'lg';

  const share = async () => {
    try {
      await navigator.share({ text: data.text, url: data.url });
      setOutcome(SHARED);
    } catch {
      // 共有の画面を閉じた (AbortError) ときは何も出さない
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.url);
      setOutcome(COPIED);
    } catch {
      setOutcome(COPY_FAILED);
    }
  };

  return (
    <section className="share" aria-labelledby="share-title" data-testid="share">
      <h2 id="share-title" className="result__sub">
        結果を共有する
      </h2>
      <Text type="supporting">共有するのは「{data.text}」とページの URL だけです。記録や答えは入れません。</Text>
      <p className="share__row tap-links">
        {canShare ? (
          <Button label="共有する" onClick={share} width={width} size={size} />
        ) : (
          <>
            <Link href={xPostUrl(data)} isExternalLink newTabLabel="(新しいタブで開きます)">
              X に投稿する
            </Link>
            <Button label="リンクをコピー" onClick={copy} width={width} size={size} />
          </>
        )}
      </p>
      <div aria-live="polite">{outcome && <StatusLine status={outcome} request={outcome === SHARED ? 'POST /share' : 'PUT /clipboard'} />}</div>
    </section>
  );
}
