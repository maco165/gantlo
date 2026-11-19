import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Link } from '@astryxdesign/core/Link';
import { List, ListItem } from '@astryxdesign/core/List';
import { Text } from '@astryxdesign/core/Text';
import { ArrowTopRightOnSquareIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { GitHubMark } from '../components/RepoLink';
import StatusLine from '../components/StatusLine';
import { ABOUT_ISSUE, ABOUT_LEAD, ABOUT_NOTES, ABOUT_SOURCE, LICENSE_NAME } from '../lib/about';
import { pageHref } from '../lib/route';
import { NEW_ISSUE_URL, REPO_URL } from '../lib/site';
import { ABOUT_OK } from '../lib/status';

const external = <ArrowTopRightOnSquareIcon width={16} height={16} />;

/** このサイトについての画面 (/gantlo/about/)。文の正本は src/lib/about.ts */
export default function About() {
  return (
    <div className="page about">
      <h1 className="page__title">このサイトについて</h1>
      <StatusLine status={ABOUT_OK} request="GET /about" />
      {ABOUT_LEAD.map((p) => (
        <Text key={p} type="body">
          {p}
        </Text>
      ))}

      <Card padding={4}>
        <section className="about__section" aria-labelledby="about-source">
          <h2 id="about-source" className="about__title">
            ソースコード
          </h2>
          <Text type="supporting">{ABOUT_SOURCE}</Text>
          <p>
            <Button variant="primary" label="GitHub のリポジトリを開く" icon={<GitHubMark />} endContent={external} href={REPO_URL} target="_blank" rel="noopener noreferrer" />
          </p>
          <Text type="supporting">
            <code>{REPO_URL.replace('https://', '')}</code>
          </Text>
        </section>
      </Card>

      <Card padding={4}>
        <section className="about__section" aria-labelledby="about-issue">
          <h2 id="about-issue" className="about__title">
            問題の誤りを見つけたら
          </h2>
          <Text type="supporting">{ABOUT_ISSUE}</Text>
          <p>
            <Button label="Issue を書く" icon={<ExclamationCircleIcon width={18} height={18} />} endContent={external} href={NEW_ISSUE_URL} target="_blank" rel="noopener noreferrer" />
          </p>
        </section>
      </Card>

      <List hasDividers edge="flush" header={<h2 className="about__title">知っておくこと</h2>}>
        {ABOUT_NOTES.map((n) => (
          <ListItem key={n.label} label={n.label} description={<Text type="supporting">{n.text}</Text>} />
        ))}
        <ListItem
          label="用語集"
          description={
            <Text type="supporting">
              問題に出る語の説明と出典は <Link href={pageHref('glossary')}>用語集</Link> にまとめています。
            </Text>
          }
        />
        <ListItem
          label="ライセンス"
          description={
            <Text type="supporting">
              {LICENSE_NAME} (
              <Link href={`${REPO_URL}/blob/main/LICENSE`} isExternalLink newTabLabel="(新しいタブで開きます)">
                LICENSE
              </Link>
              )
            </Text>
          }
        />
      </List>
    </div>
  );
}
