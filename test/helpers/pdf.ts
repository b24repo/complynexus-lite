import type { Client } from '../api/helpers';

/** Recovers the text of an uncompressed pdfkit file from its `[<hex> ...] TJ` operators. */
export function pdfText(buf: Buffer): string {
  const raw = buf.toString('latin1');
  const lines: string[] = [];
  for (const m of raw.matchAll(/\[((?:<[0-9a-fA-F]*>|-?[\d.]+|\s)+)\]\s*TJ/g)) {
    const hex = [...m[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => h[1]).join('');
    lines.push(Buffer.from(hex, 'hex').toString('latin1'));
  }
  return lines.join('\n');
}

const binary = (res: NodeJS.ReadableStream, cb: (err: Error | null, body: Buffer) => void): void => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

export const getPdf = (client: Client, recordId: string) => client.get(`/api/records/${recordId}/pdf`).buffer(true).parse(binary);
