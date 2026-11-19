import { describe, expect, it } from 'vitest';
import { BASE, COURSES, courseHref, lessonHref, pageHref, parseRoute } from '../src/lib/route';

describe('経路 (# の無い URL)', () => {
  it('置き場所は /gantlo/', () => {
    expect(BASE).toBe('/gantlo/');
  });
  it('トップはホーム', () => {
    expect(parseRoute('/gantlo/')).toEqual({ name: 'home' });
    expect(parseRoute('/gantlo')).toEqual({ name: 'home' });
    expect(parseRoute('/gantlo/index.html')).toEqual({ name: 'home' });
  });
  it('末尾に index.html が付いた画面も開ける', () => {
    expect(parseRoute('/gantlo/plan/index.html')).toEqual({ name: 'page', page: 'plan' });
  });
  it('メニューの画面を開ける (末尾の / はあってもなくてもよい)', () => {
    expect(parseRoute('/gantlo/plan/')).toEqual({ name: 'page', page: 'plan' });
    expect(parseRoute('/gantlo/settings')).toEqual({ name: 'page', page: 'settings' });
    expect(parseRoute('/gantlo/about/')).toEqual({ name: 'page', page: 'about' });
  });
  it('全コースを開ける', () => {
    for (const c of COURSES) expect(parseRoute(courseHref(c.id))).toEqual({ name: 'course', course: c.id });
  });
  it('知らない道は 404 にし、ホームの中身を別の URL で出さない', () => {
    expect(parseRoute('/gantlo/nope/')).toEqual({ name: 'notFound' });
    expect(parseRoute('/gantlo/course/nope/')).toEqual({ name: 'notFound' });
    expect(parseRoute('/gantlo/plan/extra/')).toEqual({ name: 'notFound' });
  });
  it('レッスンは /gantlo/lesson/<id>/ で開ける。id があるかは画面の側で見る', () => {
    expect(lessonHref('main-w1-l1')).toBe('/gantlo/lesson/main-w1-l1/');
    expect(parseRoute(lessonHref('main-w1-l1'))).toEqual({ name: 'lesson', lessonId: 'main-w1-l1' });
    expect(parseRoute('/gantlo/lesson/main-w1-l1')).toEqual({ name: 'lesson', lessonId: 'main-w1-l1' });
    expect(parseRoute('/gantlo/lesson/nope/')).toEqual({ name: 'lesson', lessonId: 'nope' });
  });
  it('レッスンの道に余分な段があるか、壊れた %xx は 404', () => {
    expect(parseRoute('/gantlo/lesson/')).toEqual({ name: 'notFound' });
    expect(parseRoute('/gantlo/lesson/a/b/')).toEqual({ name: 'notFound' });
    expect(parseRoute('/gantlo/lesson/%E0/')).toEqual({ name: 'notFound' });
  });
  it('作るリンクに # を使わない', () => {
    expect(pageHref('plan')).toBe('/gantlo/plan/');
    expect(courseHref('mgmt-history')).not.toContain('#');
  });
});
