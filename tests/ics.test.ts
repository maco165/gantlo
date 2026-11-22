import { describe, expect, it } from 'vitest';
import { escapeText, firstDay, foldLine, offsetMinutes, studyPlanIcs, transitions, vtimezoneLines } from '../src/lib/ics';

const now = new Date(2026, 10, 23, 12, 0); // 2026-11-23 (月) 12:00 端末の時刻
const unfold = (ics: string) => ics.replace(/\r\n /g, '');
const bytes = (s: string) => new TextEncoder().encode(s).length;

describe('学ぶ予定の .ics (RFC 5545)', () => {
  const ics = studyPlanIcs({ time: '20:30', days: [0, 1, 2, 3, 4, 5, 6], now, timeZone: 'Asia/Tokyo', uid: 'fixed' });

  it('行は CRLF で区切り、素の LF を持たない。最後も CRLF', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('どの行も 75 octet 以内', () => {
    for (const line of ics.split('\r\n')) expect(bytes(line), line).toBeLessThanOrEqual(75);
  });

  it('VCALENDAR・VTIMEZONE・VEVENT の必須の欄がそろう', () => {
    const u = unfold(ics);
    for (const l of ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//gantlo//study plan//JA', 'BEGIN:VTIMEZONE', 'TZID:Asia/Tokyo', 'BEGIN:VEVENT', 'UID:fixed@maco165.github.io', 'DTSTART;TZID=Asia/Tokyo:20261123T203000', 'RRULE:FREQ=DAILY', 'END:VEVENT', 'END:VCALENDAR'])
      expect(u.split('\r\n'), l).toContain(l);
    expect(u).toMatch(/\r\nDTSTAMP:20261123T\d{6}Z\r\n/);
    // 時差の無い時刻帯は STANDARD 1 つで +0900
    expect(u).toContain('TZOFFSETFROM:+0900\r\nTZOFFSETTO:+0900');
  });

  it('中身はサイトの URL と短い文だけ (記録の数や答えを入れない)', () => {
    const u = unfold(ics);
    expect(u).toContain('URL:https://maco165.github.io/gantlo/');
    expect(u).not.toMatch(/XP|連続|正解|streak|answers/);
  });

  it('曜日を選ぶと WEEKLY と BYDAY。最初の予定の日は選んだ曜日', () => {
    const u = unfold(studyPlanIcs({ time: '07:00', days: [3, 5], now, timeZone: 'Asia/Tokyo', uid: 'x' }));
    expect(u).toContain('RRULE:FREQ=WEEKLY;BYDAY=WE,FR');
    // 11-23 は月曜なので、最初は 11-25 (水)
    expect(u).toContain('DTSTART;TZID=Asia/Tokyo:20261125T070000');
  });

  it('今日の時刻を過ぎていれば、次の日から', () => {
    expect(firstDay(now, '11:00', [1, 2])).toEqual({ y: 2026, m: 11, d: 24 });
    expect(firstDay(now, '13:00', [1, 2])).toEqual({ y: 2026, m: 11, d: 23 });
  });

  it('形の違う時刻と、曜日が空のときは作らない', () => {
    expect(() => studyPlanIcs({ time: '25:00', days: [1], now })).toThrow();
    expect(() => studyPlanIcs({ time: '20:00', days: [], now })).toThrow();
  });
});

describe('折り返しと escape', () => {
  it('日本語の 1 文字 (3 octet) の途中で切らず、続きは空白で始まる', () => {
    const line = `DESCRIPTION:${'あ'.repeat(60)}`;
    const folded = foldLine(line).split('\r\n');
    expect(folded.length).toBeGreaterThan(1);
    for (const l of folded) expect(bytes(l)).toBeLessThanOrEqual(75);
    for (const l of folded.slice(1)) expect(l.startsWith(' ')).toBe(true);
    // 継ぎ目を外すと元に戻る (文字が壊れていない)
    expect(folded.join('\r\n').replace(/\r\n /g, '')).toBe(line);
  });

  it('\\ ; , と改行を escape する', () => {
    expect(escapeText('a\\b;c,d\ne')).toBe('a\\\\b\;c\\,d\\ne');
  });
});

describe('時刻帯 (VTIMEZONE)', () => {
  it('ロサンゼルスは夏時間の切り替わりを分まで見つける (2027-03-14 2:00 と 2027-11-07 2:00 の壁時計)', () => {
    const from = Date.UTC(2027, 0, 1);
    const to = Date.UTC(2027, 11, 31);
    const ts = transitions('America/Los_Angeles', from, to);
    expect(ts).toEqual([
      { at: Date.UTC(2027, 2, 14, 10), from: -480, to: -420 },
      { at: Date.UTC(2027, 10, 7, 9), from: -420, to: -480 },
    ]);
    const lines = vtimezoneLines('America/Los_Angeles', from, to);
    expect(lines.join('\n')).toContain('BEGIN:DAYLIGHT\nDTSTART:20270314T020000\nTZOFFSETFROM:-0800\nTZOFFSETTO:-0700\nEND:DAYLIGHT');
    expect(lines.join('\n')).toContain('BEGIN:STANDARD\nDTSTART:20271107T020000\nTZOFFSETFROM:-0700\nTZOFFSETTO:-0800\nEND:STANDARD');
  });

  it('何年分かは RDATE に並べる', () => {
    const lines = vtimezoneLines('America/Los_Angeles', Date.UTC(2026, 0, 1), Date.UTC(2029, 0, 1));
    expect(lines.find((l) => l.startsWith('RDATE:'))).toBeDefined();
  });

  it('offsetMinutes は東京で +540、ロサンゼルスの冬で -480', () => {
    expect(offsetMinutes('Asia/Tokyo', Date.UTC(2026, 0, 1))).toBe(540);
    expect(offsetMinutes('America/Los_Angeles', Date.UTC(2026, 0, 1))).toBe(-480);
  });
});

describe('VTIMEZONE を全部の時刻帯で Intl と突き合わせる', () => {
  /** VTIMEZONE の行から、切り替わり (UTC の時刻と、そのあとのずれ) を読み直す */
  const parse = (lines: string[]) => {
    const toMin = (o: string) => (o[0] === '-' ? -1 : 1) * (Number(o.slice(1, 3)) * 60 + Number(o.slice(3, 5)));
    const out: { at: number; to: number; from: number }[] = [];
    let cur: { starts: string[]; from?: number; to?: number } | null = null;
    for (const l of lines) {
      if (l === 'BEGIN:STANDARD' || l === 'BEGIN:DAYLIGHT') cur = { starts: [] };
      else if (cur && (l.startsWith('DTSTART:') || l.startsWith('RDATE:'))) cur.starts.push(...l.slice(l.indexOf(':') + 1).split(','));
      else if (cur && l.startsWith('TZOFFSETFROM:')) cur.from = toMin(l.slice(13));
      else if (cur && l.startsWith('TZOFFSETTO:')) cur.to = toMin(l.slice(11));
      else if (cur && (l === 'END:STANDARD' || l === 'END:DAYLIGHT')) {
        for (const s of cur.starts) {
          const local = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13), +s.slice(13, 15));
          // 壁時計の時刻は切り替わる前のずれで書いてある
          out.push({ at: local - cur.from! * 60_000, to: cur.to!, from: cur.from! });
        }
        cur = null;
      }
    }
    return out.sort((a, b) => a.at - b.at);
  };

  it('去年から 5 年先まで、3 日おきの正午 (UTC) のずれが Intl と同じ (Node の全時刻帯)', () => {
    const zones = Intl.supportedValuesOf('timeZone');
    expect(zones.length).toBeGreaterThan(300);
    const from = Date.UTC(2025, 10, 23);
    const to = Date.UTC(2031, 10, 23);
    const bad: string[] = [];
    for (const tz of zones) {
      const ts = parse(vtimezoneLines(tz, from, to));
      // 3 日おき (切り替わりの間が 3 日より短い時刻帯は無い。ラマダンの間の切り替えも数週間)
      for (let t = from + 12 * 3_600_000; t < to; t += 3 * 86_400_000) {
        const before = ts.filter((x) => x.at <= t);
        const want = before.length > 0 ? before[before.length - 1].to : ts.length > 0 ? ts[0].from : offsetMinutes(tz, from);
        if (want !== offsetMinutes(tz, t)) {
          bad.push(`${tz} ${new Date(t).toISOString().slice(0, 10)}`);
          break;
        }
      }
    }
    expect(bad).toEqual([]);
  }, 120_000);
});
