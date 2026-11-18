import { Text } from '@astryxdesign/core/Text';
import type { Status } from '../lib/status';

/** ステータス行。等幅の数字を主役にし、日本語の説明を必ず添える。200 と 201 は成功の色、4xx と 5xx は誤りの色 */
export default function StatusLine({ status, request }: { status: Status; request: string }) {
  const tone = status.code >= 400 ? 'error' : status.code === 200 || status.code === 201 ? 'success' : 'info';
  return (
    <div className="status">
      <Text type="supporting">
        <code>{request}</code>
      </Text>
      <p className={`status__line status__line--${tone}`}>
        <span className="status__code">{status.code}</span> <span className="status__reason">{status.reason}</span>
      </p>
      <Text type="supporting">{status.ja}</Text>
    </div>
  );
}
