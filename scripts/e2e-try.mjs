// 試す画面 (#55 の 9) の、ブラウザでの通しの検査。scripts/e2e.mjs (npm run e2e) から呼ぶ。外のサービスには頼らず、
// httpbin.org と api.github.com への要求は page.route で応答を差し替える (CORS の応答ヘッダーも差し替えの中で決める)。
// 390 幅と 1280 幅で次を確かめる:
//   1. /gantlo/try/ が 200 で、外へ送ることの断りが出て、開いただけでは外へ何も送らない
//   2. /status/418 を送ると、本物 (差し替え) の 418 と I'm a teapot、読めるヘッダー (safelist の content-type と、公開された retry-after) が出て、
//      公開されていない server は出ない。送った要求に Cookie と Authorization が無い (相手の Cookie を置いても送らない)・Referer が無い
//   3. PUT と X-Gantlo-Try で送ると、本文 (JSON) とメソッドが返る
//   4. 応答を読めない (CORS で弾かれる・届かない。JS からはどちらも同じ TypeError) と、ステータス 0 の network error と CORS の説明。
//      GitHub に X-Gantlo-Try を付けたときは、preflight で弾かれることを書く
//   5. オフラインでは、オフラインと書く
//   6. 用語集の語の「試す」から、その語に合った選び (404) で開く
//   7. 横にはみ出さず、390 幅で選ぶ所と送るボタンが 44px 以上。サイトの外へは差し替えた 2 つの送り先のほか何も送らない。ページのエラーが無い
const MIN_TARGET = 44;
const ALLOWED_OUTSIDE = ['https://httpbin.org', 'https://api.github.com'];

export async function runTry(browser, { base, check, noHorizontalOverflow }) {
  const origin = new URL(base).origin;
  for (const [name, width, height] of [
    ['phone', 390, 844],
    ['pc', 1280, 860],
  ]) {
    const tag = `[${name} 試す]`;
    const phone = width < 768;
    const context = await browser.newContext({ viewport: { width, height } });
    // 相手のサイトの Cookie を置いておく (credentials: omit なら送られない)
    await context.addCookies([{ name: 'secret', value: 'do-not-send', domain: 'httpbin.org', path: '/', secure: true, sameSite: 'None' }]);
    const page = await context.newPage();
    const errors = [];
    const outside = [];
    const seen = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.origin === origin || url.protocol === 'data:' || url.protocol === 'blob:') return;
      if (!ALLOWED_OUTSIDE.includes(url.origin)) outside.push(`${req.method()} ${req.url()}`);
    });
    // 差し替えの決まり: mode で CORS の許し方を変える
    let mode = 'cors';
    const cors = (req) => ({ 'access-control-allow-origin': origin, 'access-control-expose-headers': 'Retry-After, RateLimit', vary: 'Origin' });
    await page.route(/^https:\/\/(httpbin\.org|api\.github\.com)\//, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      seen.push({ method: req.method(), url: req.url(), headers: await req.allHeaders() });
      // 弾かれる・届かない: JS からはどちらも同じ TypeError (network error) になる。Playwright の fulfill は CORS の許しを足すので、
      // 弾かれる形は、つながらない失敗 (abort) で作る
      if (mode === 'blocked') return route.abort('failed');
      // オフライン: 差し替えは setOffline でも呼ばれるので、つながらない失敗にする (navigator.onLine は false になる)
      if (mode === 'offline') return route.abort('internetdisconnected');
      if (req.method() === 'OPTIONS') {
        const allow = mode === 'cors' ? { 'access-control-allow-headers': req.headers()['access-control-request-headers'] ?? '', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE' } : {};
        return route.fulfill({ status: 204, headers: { ...(mode === 'cors' ? cors(req) : {}), ...allow } });
      }
      const base = mode === 'cors' ? cors(req) : {};
      if (url.pathname.startsWith('/status/')) {
        const code = Number(url.pathname.split('/')[2]);
        return route.fulfill({ status: code, headers: { ...base, 'content-type': 'text/plain', 'retry-after': '5', server: 'gunicorn' }, body: code === 204 ? '' : 'teapot' });
      }
      if (url.pathname === '/anything') {
        return route.fulfill({ status: 200, headers: { ...base, 'content-type': 'application/json' }, body: JSON.stringify({ method: req.method(), data: req.postData() ?? '' }) });
      }
      return route.fulfill({ status: 200, headers: { ...base, 'content-type': 'application/json', server: 'gunicorn' }, body: JSON.stringify({ url: req.url() }) });
    });
    const target = async (locator, label) => {
      if (!phone) return;
      const boxes = [];
      for (const el of await locator.all()) boxes.push(await el.boundingBox());
      const small = boxes.filter((b) => b === null || b.height < MIN_TARGET - 0.5);
      check(boxes.length > 0 && small.length === 0, `${tag} ${label}: 押せる高さが ${MIN_TARGET}px 以上 (${boxes.length} 個${small.length ? `、届かない ${small.map((b) => (b ? Math.round(b.height) : '見えない')).join(' ')}` : ''})`);
    };

    // 1. 開いただけでは送らない
    const res = await page.goto(`${base}try/`);
    check(res?.status() === 200, `${tag} /gantlo/try/ が 200 (${res?.status()})`);
    await page.getByTestId('try-notice').waitFor();
    check((await page.getByTestId('try-notice').innerText()).includes('この要求は、あなたのブラウザから外のサービス'), `${tag} 送る前に、外のサービスに送られることを書く`);
    await page.waitForTimeout(300);
    check(seen.length === 0, `${tag} 開いただけでは外へ何も送らない (${seen.length} 件)`);
    await target(page.locator('.try__opt'), '選ぶ所 (道・メソッド・ヘッダー)');
    await target(page.getByRole('button', { name: '送る (外のサービスへ)' }), '送るボタン');
    await noHorizontalOverflow(page, width, `${tag} 送る前`);

    // 2. /status/418
    await page.getByRole('radio', { name: /httpbin\.org\/status/ }).check();
    await page.locator('#try-code').selectOption('418');
    await page.getByRole('button', { name: '送る (外のサービスへ)' }).click();
    const result = page.getByTestId('try-result');
    await result.waitFor();
    check((await result.getAttribute('data-status')) === '418' && (await result.locator('.status__reason').innerText()) === "I'm a teapot", `${tag} 本物 (差し替え) のステータス 418 I'm a teapot が出る`);
    const names = await result.locator('.headers__row').evaluateAll((rows) => rows.map((r) => `${r.getAttribute('data-header')}:${r.getAttribute('data-why')}`));
    check(names.includes('content-type:safelist') && names.includes('retry-after:exposed') && !names.some((n) => n.startsWith('server')), `${tag} 読めるヘッダーは safelist と公開されたものだけで、server は出ない (${names.join(' ')})`);
    const sent = seen.find((s) => s.method === 'GET' && s.url.endsWith('/status/418'));
    check(sent && !('cookie' in sent.headers) && !('authorization' in sent.headers) && !('referer' in sent.headers), `${tag} 送った要求に Cookie・Authorization・Referer が無い (${sent ? Object.keys(sent.headers).join(',') : '送っていない'})`);
    check(seen.filter((s) => s.method !== 'OPTIONS').length === 1, `${tag} 押した 1 回だけ送る`);
    await noHorizontalOverflow(page, width, `${tag} 応答`);

    // 3. PUT と X-Gantlo-Try
    await page.getByRole('radio', { name: /httpbin\.org\/anything/ }).check();
    await page.getByRole('radio', { name: 'PUT', exact: true }).check();
    await page.getByRole('checkbox', { name: /X-Gantlo-Try/ }).check();
    await page.getByRole('button', { name: '送る (外のサービスへ)' }).click();
    await result.waitFor();
    const body = await result.locator('pre').last().innerText();
    check(body.includes('"method": "PUT"') && body.includes('gantlo'), `${tag} PUT で送った本文とメソッドが返る`);
    const put = seen.find((s) => s.method === 'PUT');
    check(put?.headers['x-gantlo-try'] === '1' && put.headers['content-type'] === 'application/json', `${tag} PUT に X-Gantlo-Try と Content-Type: application/json が付く`);

    // 4. 応答を読めない (CORS で弾かれる・届かない。JS からはどちらも同じ TypeError で、差し替えは abort で作る)
    mode = 'blocked';
    await page.getByRole('radio', { name: /api\.github\.com\/zen/ }).check();
    await page.getByRole('button', { name: '送る (外のサービスへ)' }).click();
    const fail = page.getByTestId('try-failure');
    await fail.waitFor();
    const failText = await fail.innerText();
    check((await fail.getAttribute('data-kind')) === 'blocked' && (await fail.locator('.status__code').innerText()) === '0', `${tag} CORS で弾かれると、ステータス 0 の network error`);
    check(failText.includes('CORS で弾かれた') && failText.includes('X-Gantlo-Try がありません'), `${tag} CORS の説明と、GitHub の preflight が X-Gantlo-Try を許さないこと`);
    await noHorizontalOverflow(page, width, `${tag} 失敗の説明`);
    mode = 'cors';

    // 5. オフライン
    await context.setOffline(true);
    mode = 'offline';
    await page.getByRole('button', { name: '送る (外のサービスへ)' }).click();
    await page.locator('[data-testid="try-failure"][data-kind="offline"]').waitFor();
    check((await page.getByTestId('try-failure').innerText()).includes('オフラインです'), `${tag} オフラインでは、オフラインと書く`);
    await context.setOffline(false);
    mode = 'cors';

    // 6. 用語集から開く
    await page.goto(`${base}glossary/`);
    const link = page.locator('#term-404-not-found').getByRole('link', { name: /^試す/ });
    await link.waitFor();
    await target(link, '用語集の「試す」のリンク');
    await link.click();
    await page.getByTestId('try-notice').waitFor();
    check(page.url().endsWith('/gantlo/try/?preset=404-not-found') && (await page.locator('#try-code').inputValue()) === '404', `${tag} 用語集の「試す」から、404 を選んだ状態で開く (${page.url()})`);

    check(outside.length === 0, `${tag} 差し替えた 2 つの送り先のほか、外へ何も送らない ${outside.join(' ')}`);
    check(errors.length === 0, `${tag} ページのエラーが無い ${errors.join(' / ')}`);
    await context.close();
  }
}
