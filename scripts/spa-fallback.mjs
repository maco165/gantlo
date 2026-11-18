// GitHub Pages は知らない道 (/gantlo/plan/ など) に 404.html を返す。
// 画面ごとの HTML の書き出し (R-7) ができるまでは、index.html を 404.html にも写して、
// どの道から開いても画面が出るようにする。
import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath を使う (URL の pathname のままだと、空白や日本語を含む場所で %20 などが残って開けない)
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
await copyFile(path.join(DIST, 'index.html'), path.join(DIST, '404.html'));
console.log('dist/404.html を書きました');
