import { Link } from '@astryxdesign/core/Link';
import StatusLine from '../components/StatusLine';
import { homeHref } from '../lib/route';
import { NOT_IMPLEMENTED } from '../lib/status';

/** まだ作っていない画面。左のメニューから開けるようにして、何が来るかを先に見せる */
export default function NotImplemented({ title, request }: { title: string; request: string }) {
  return (
    <div className="page">
      <h1 className="page__title">{title}</h1>
      <StatusLine status={NOT_IMPLEMENTED} request={request} />
      <p>
        <Link href={homeHref}>ホームへ戻る</Link>
      </p>
    </div>
  );
}
