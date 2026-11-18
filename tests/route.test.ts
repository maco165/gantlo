import { describe, expect, it } from 'vitest';
import { BASE, COURSES, courseHref, pageHref, parseRoute } from '../src/lib/route';

describe('経路 (# の無い URL)', () => {
  it('置き場所は /gantlo/', () => {
    expect(BASE).toBe('/gantlo/');
  });
  it('トップはホーム', () => {
    expect(parseRoute('/gantlo/')).toEqual({ name: 'home' });
    expect(parseRoute('/gantlo')).toEqual({ name: 'home' });
  });
  it('メニューの画面を開ける (末尾の / はあってもなくてもよい)', () => {
    expect(parseRoute('/gantlo/plan/')).toEqual({ name: 'page', page: 'plan' });
    expect(parseRoute('/gantlo/settings')).toEqual({ name: 'page', page: 'settings' });
  });
  it('全コースを開ける', () => {
    for (const c of COURSES) expect(parseRoute(courseHref(c.id))).toEqual({ name: 'course', course: c.id });
  });
  it('知らない道は 404 にし、ホームの中身を別の URL で出さない', () => {
    expect(parseRoute('/gantlo/nope/')).toEqual({ name: 'notFound' });
    expect(parseRoute('/gantlo/course/nope/')).toEqual({ name: 'notFound' });
    expect(parseRoute('/gantlo/plan/extra/')).toEqual({ name: 'notFound' });
  });
  it('作るリンクに # を使わない', () => {
    expect(pageHref('plan')).toBe('/gantlo/plan/');
    expect(courseHref('mgmt-history')).not.toContain('#');
  });
});
