// 学ぶ予定をカレンダーに入れるファイル (.ics、RFC 5545) を作る。設定の画面から書き出す。
// 中身はサイトの URL と短い文だけで、記録 (XP・連続日数・答え) は入れない。
// 時刻は端末の時刻帯 (Intl の timeZone) の壁時計で書き、TZID に対応する VTIMEZONE を、端末の時刻帯の規則から作って添える。
import { ORIGIN } from './site';

/** 曜日 (Date#getDay の 0 = 日 … 6 = 土) と RFC 5545 の BYDAY の名前 */
export const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

export type StudyPlanIcs = {
  /** 学ぶ時刻 (HH:MM、端末の時刻帯の壁時計) */
  time: string;
  /** 学ぶ曜日 (0 = 日 … 6 = 土)。7 つ全部なら毎日 */
  days: readonly number[];
  /** 作った時刻 (DTSTAMP と、最初の予定の日を決めるのに使う) */
  now: Date;
  /** IANA の時刻帯 (例: Asia/Tokyo)。既定は端末の時刻帯 */
  timeZone?: string;
  /** 予定の id (UID)。既定は乱数 */
  uid?: string;
  /** サイトの URL (既定は公開の場所) */
  url?: string;
  /** VTIMEZONE に書く年数 (既定 10 年。端末の時刻帯の規則で、今の 1 年前から数える) */
  years?: number;
};

export const isTime = (v: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** TEXT の値の escape (RFC 5545 3.3.11)。\ ; , と改行 */
export const escapeText = (s: string): string => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/**
 * 1 行を 75 octet ごとに折り返す (RFC 5545 3.1)。続きの行は空白 1 つで始め、その空白も 75 octet に数える。
 * UTF-8 の 1 文字 (日本語は 3 octet) の途中では切らない
 */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (curBytes + n > limit) {
      out.push(cur);
      cur = ' ';
      curBytes = 1;
      limit = 75;
    }
    cur += ch;
    curBytes += n;
  }
  out.push(cur);
  return out.join('\r\n');
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** 日時の値 (YYYYMMDDTHHMMSS)。fields は壁時計の年月日時分秒 */
const stamp = (y: number, mo: number, d: number, h: number, mi: number, s = 0) => `${pad(y, 4)}${pad(mo)}${pad(d)}T${pad(h)}${pad(mi)}${pad(s)}`;

/** UTC の時刻 (DTSTAMP の形 YYYYMMDDTHHMMSSZ) */
export const utcStamp = (d: Date): string => `${stamp(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds())}Z`;

/** 時刻帯の UTC からのずれ (分)。その時刻帯の壁時計の値を UTC と見たときとの差 */
export function offsetMinutes(timeZone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs));
  const v = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60_000);
}

/** ずれの書き方 (+0900 / -0700) */
const offsetText = (min: number) => `${min < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(min) / 60))}${pad(Math.abs(min) % 60)}`;

/** 壁時計の値 (ずれ offset の時刻帯で、utcMs の時刻) */
function localStamp(utcMs: number, offset: number): string {
  const d = new Date(utcMs + offset * 60_000);
  return stamp(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}

export type Transition = { at: number; from: number; to: number };

/** from から to (UTC のミリ秒) の間に、時刻帯のずれが変わる時刻 (分の単位まで詰める) */
export function transitions(timeZone: string, from: number, to: number): Transition[] {
  const DAY = 86_400_000;
  const out: Transition[] = [];
  let prevMs = from;
  let prev = offsetMinutes(timeZone, from);
  for (let t = from + DAY; t <= to; t += DAY) {
    const off = offsetMinutes(timeZone, t);
    if (off !== prev) {
      // 変わった日の中を分の単位まで二分で詰める
      let lo = prevMs;
      let hi = t;
      while (hi - lo > 60_000) {
        const mid = lo + Math.floor((hi - lo) / 120_000) * 60_000;
        if (offsetMinutes(timeZone, mid) === prev) lo = mid;
        else hi = mid;
      }
      out.push({ at: hi, from: prev, to: off });
      prev = off;
    }
    prevMs = t;
  }
  return out;
}

/** VTIMEZONE の行。ずれが変わらない時刻帯は STANDARD を 1 つ。変わる時刻帯は、ずれの組ごとに STANDARD / DAYLIGHT と RDATE */
export function vtimezoneLines(timeZone: string, fromMs: number, toMs: number): string[] {
  const list = transitions(timeZone, fromMs, toMs);
  const lines = ['BEGIN:VTIMEZONE', `TZID:${timeZone}`];
  if (list.length === 0) {
    const off = offsetMinutes(timeZone, fromMs);
    lines.push('BEGIN:STANDARD', 'DTSTART:19700101T000000', `TZOFFSETFROM:${offsetText(off)}`, `TZOFFSETTO:${offsetText(off)}`, 'END:STANDARD');
  } else {
    const groups = new Map<string, Transition[]>();
    for (const t of list) {
      const k = `${t.from}/${t.to}`;
      groups.set(k, [...(groups.get(k) ?? []), t]);
    }
    for (const ts of groups.values()) {
      // ずれが大きくなる側を夏時間 (DAYLIGHT) とする
      const kind = ts[0].to > ts[0].from ? 'DAYLIGHT' : 'STANDARD';
      // DTSTART と RDATE は、切り替わる前のずれでの壁時計の時刻 (RFC 5545 3.6.5 の例と同じ)
      const local = ts.map((t) => localStamp(t.at, t.from));
      lines.push(`BEGIN:${kind}`, `DTSTART:${local[0]}`);
      if (local.length > 1) lines.push(`RDATE:${local.slice(1).join(',')}`);
      lines.push(`TZOFFSETFROM:${offsetText(ts[0].from)}`, `TZOFFSETTO:${offsetText(ts[0].to)}`, `END:${kind}`);
    }
  }
  lines.push('END:VTIMEZONE');
  return lines;
}

/** 最初の予定の日 (今日を含め、選んだ曜日で、まだ時刻を過ぎていない最初の日)。壁時計の年月日を返す */
export function firstDay(now: Date, time: string, days: readonly number[]): { y: number; m: number; d: number } {
  const [h, mi] = time.split(':').map(Number);
  for (let i = 0; i < 8; i++) {
    const c = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, h, mi);
    if (days.includes(c.getDay()) && c.getTime() > now.getTime()) return { y: c.getFullYear(), m: c.getMonth() + 1, d: c.getDate() };
  }
  throw new Error('ics: 曜日を 1 つ以上選んでください');
}

const newUid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** 学ぶ予定の .ics の中身 (行の区切りは CRLF、1 行は 75 octet まで) */
export function studyPlanIcs({ time, days, now, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', uid = newUid(), url = `${ORIGIN}/gantlo/`, years = 10 }: StudyPlanIcs): string {
  if (!isTime(time)) throw new Error(`ics: 時刻の形が違います (${time})`);
  const picked = [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (picked.length === 0) throw new Error('ics: 曜日を 1 つ以上選んでください');
  const [h, mi] = time.split(':').map(Number);
  const first = firstDay(now, time, picked);
  // 毎日なら DAILY、曜日を選べば WEEKLY と BYDAY (最初の予定の日は BYDAY に合う日なので、余分な 1 回は出ない)
  const rrule = picked.length === 7 ? 'RRULE:FREQ=DAILY' : `RRULE:FREQ=WEEKLY;BYDAY=${picked.map((d) => WEEKDAY_CODES[d]).join(',')}`;
  const year = 365 * 86_400_000;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//gantlo//study plan//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...vtimezoneLines(timeZone, now.getTime() - year, now.getTime() + years * year),
    'BEGIN:VEVENT',
    `UID:${uid}@maco165.github.io`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;TZID=${timeZone}:${stamp(first.y, first.m, first.d, h, mi)}`,
    'DURATION:PT15M',
    rrule,
    `SUMMARY:${escapeText('gantlo で学ぶ')}`,
    `DESCRIPTION:${escapeText(`API と HTTP の基礎を 1 レッスン学ぶ時間です。${url}`)}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText('gantlo で学ぶ時間です')}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** 書き出すファイルの名前 */
export const icsFileName = 'gantlo-study.ics';
