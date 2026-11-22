import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import { reportIssueUrl } from '../lib/report';

/**
 * 答えたあとの解説の近くに置く「誤りを報告」。題と本文を入れた GitHub の新しい Issue を新しいタブで開く。
 * 模擬試験の途中は解説を出さないので、答えたあとの画面にだけ置く (各問題の画面の答えたあとの側)
 */
export default function ReportIssue({ questionId }: { questionId: string }) {
  return (
    <p className="report-issue tap-links">
      <Text type="supporting">問題や解説がおかしいと思ったら </Text>
      <Link href={reportIssueUrl(questionId)} isExternalLink newTabLabel="(新しいタブで開きます)">
        誤りを報告 (GitHub)
      </Link>
    </p>
  );
}
