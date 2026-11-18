/**
 * リクエストの旅の 8 段。ブラウザに URL を打ってから画面が出るまでに、規格が登場する順。
 * ホームのウォーターフォールは、この順に帯を階段に並べる。
 * weight は帯の長さの比で、合計で 100 にする (tests/stages.test.ts が確かめる)。
 */
export type Stage = {
  id: string;
  /** 段の役目 (日本語) */
  step: string;
  /** 帯に出す名前 */
  name: string;
  /** 主な公式文書 */
  spec: string;
  /** 本編の何週目で学ぶか */
  week: 1 | 2 | 3 | 4;
  weight: number;
};

export const STAGES: readonly Stage[] = [
  { id: 'uri', step: '住所を書く', name: 'URI', spec: 'RFC 3986', week: 1, weight: 10 },
  { id: 'dns', step: '名前を引く', name: 'DNS', spec: 'RFC 1034 / 1035', week: 2, weight: 12 },
  { id: 'tcp', step: '接続する', name: 'TCP', spec: 'RFC 9293', week: 2, weight: 10 },
  { id: 'tls', step: '暗号化する', name: 'TLS', spec: 'RFC 8446', week: 2, weight: 14 },
  { id: 'http', step: '要求を送る', name: 'HTTP', spec: 'RFC 9110', week: 1, weight: 12 },
  { id: 'oauth', step: '誰かを示す', name: 'OAuth', spec: 'RFC 6749 / 7519', week: 4, weight: 14 },
  { id: 'mime', step: '形式を伝える', name: 'MIME', spec: 'RFC 8259 ほか', week: 1, weight: 12 },
  { id: 'rest', step: '設計して残す', name: 'REST', spec: 'Fielding 論文 / OpenAPI', week: 3, weight: 16 },
];

export type StageBar = Stage & { left: number; width: number };

/** 各段の帯の左端と幅 (%)。前の段が終わったところから次の段が始まる */
export function stageBars(stages: readonly Stage[] = STAGES): StageBar[] {
  const total = stages.reduce((s, x) => s + x.weight, 0);
  let acc = 0;
  return stages.map((s) => {
    const bar = { ...s, left: (acc / total) * 100, width: (s.weight / total) * 100 };
    acc += s.weight;
    return bar;
  });
}
