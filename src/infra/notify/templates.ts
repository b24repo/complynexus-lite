import { formatDate } from '../../domain/dates';
import type { ReadinessRecord } from '../../domain/types';
import { esc } from '../../api/views/verify';

export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

export type RecordRef = Pick<ReadinessRecord, 'recordId' | 'orgName' | 'agentName'>;

const FOOTER = 'This is a governance-readiness record, not certification. It does not guarantee compliance or safety.';

function layout(title: string, paragraphs: string[], cta?: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 12px">${esc(p)}</p>`).join('');
  const link = cta ? `<p style="margin:0 0 12px"><a href="${esc(cta)}" style="color:#4446E0">${esc(cta)}</a></p>` : '';
  return (
    `<div style="font-family:system-ui,sans-serif;color:#1F2040;max-width:560px">` +
    `<h1 style="font-size:18px;margin:0 0 16px">${esc(title)}</h1>${body}${link}` +
    `<p style="margin:16px 0 0;font-size:12px;color:#5A5C7A">${esc(FOOTER)}</p></div>`
  );
}

function plain(paragraphs: string[], url?: string): string {
  return [...paragraphs, ...(url ? [url] : []), FOOTER].join('\n\n');
}

function build(subject: string, paragraphs: string[], url: string): MailContent {
  return { subject, text: plain(paragraphs, url), html: layout(subject, paragraphs, url) };
}

export function magicLink(url: string): MailContent {
  return build(
    'Your ComplyNexus Lite sign-in link',
    ['Use this link to sign in. It works once and expires in 15 minutes.', 'If you did not ask for it, ignore this email.'],
    url,
  );
}

export function retestDueScheduled(record: RecordRef, dueBy: Date | string, verifyUrl: string): MailContent {
  return build(
    `Re-test due: ${record.agentName} (${record.recordId})`,
    [
      `The scheduled re-test for ${record.orgName} · ${record.agentName} is due.`,
      `Re-test by ${formatDate(dueBy)} or the record expires.`,
    ],
    verifyUrl,
  );
}

export function expired(record: RecordRef, verifyUrl: string): MailContent {
  return build(
    `Record expired: ${record.agentName} (${record.recordId})`,
    [
      `Record ${record.recordId} for ${record.orgName} · ${record.agentName} was not re-tested within 30 days and has expired.`,
      'Visitors to the verify page are told not to rely on it. A new test restores it.',
    ],
    verifyUrl,
  );
}

export function agentChanged(record: RecordRef, retestBy: Date | string, verifyUrl: string): MailContent {
  return build(
    `Re-test by ${formatDate(retestBy)}: ${record.agentName} (${record.recordId})`,
    [`You told us ${record.agentName} changed. Re-test by ${formatDate(retestBy)} or record ${record.recordId} expires.`],
    verifyUrl,
  );
}

export function retestReminder(record: RecordRef, nextRetestBy: Date | string, verifyUrl: string): MailContent {
  return build(
    `Re-test due by ${formatDate(nextRetestBy)}: ${record.agentName} (${record.recordId})`,
    [
      `The scheduled re-test for ${record.orgName} · ${record.agentName} is due by ${formatDate(nextRetestBy)}.`,
      'Re-test before then to keep the record Current. After that date there is a 30-day grace period before it expires.',
    ],
    verifyUrl,
  );
}
