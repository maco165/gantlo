// GitHub Pages は知らない道 (/gantlo/plan/ など) に 404.html を返す。
// 画面ごとの HTML の書き出し (R-7) ができるまでは、index.html を 404.html にも写して、
// どの道から開いても画面が出るようにする。
import { copyFile } from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'dist');
await copyFile(path.join(DIST, 'index.html'), path.join(DIST, '404.html'));
console.log('dist/404.html を書きました');
