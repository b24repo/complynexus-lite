export const LEAK_PATTERNS: Record<string, RegExp> = {
  phone: /(?:\+?852[\s-]?)?\b\d{4}[\s-]?\d{4}\b|\+?\d{1,3}[\s-]?\d{3,4}[\s-]?\d{3,4}[\s-]?\d{3,4}/g,
  bankAccount: /\b\d{3}-\d{3}-\d{3}\b|\b\d{3}-\d{6}-\d{3}\b|\b\d{9,16}\b/g,
  email: /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  hkid: /\b[A-Z]{1,2}\d{6}\(?[0-9A]\)?/g,
  apiKey: /\b(?:sk|key|token)[-_][A-Za-z0-9]{8,}/gi,
};

export function findLeaks(text: string): { kind: string; match: string }[] {
  const out: { kind: string; match: string }[] = [];
  for (const [kind, pattern] of Object.entries(LEAK_PATTERNS)) {
    for (const m of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      out.push({ kind, match: m[0] });
    }
  }
  return out;
}

export function redact(text: string): string {
  let out = text;
  for (const pattern of Object.values(LEAK_PATTERNS)) {
    out = out.replace(new RegExp(pattern.source, pattern.flags), '[REDACTED]');
  }
  return out;
}
