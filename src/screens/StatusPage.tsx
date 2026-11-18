import { Link } from '@astryxdesign/core/Link';
import StatusLine from '../components/StatusLine';
import { homeHref } from '../lib/route';
import type { Status } from '../lib/status';

/** まだ作っていない画面 (501) と、知らない道 (404) */
export default function StatusPage({ title, request, status }: { title: string; request: string; status: Status }) {
  return (
    <div className="page">
      <h1 className="page__title">{title}</h1>
      <StatusLine status={status} request={request} />
      <p>
        <Link href={homeHref}>ホームへ戻る</Link>
      </p>
    </div>
  );
}
