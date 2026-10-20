import { PILLS, esc } from '../../web/views/layout';
import { formatDate } from '../../domain/dates';
import type { EvidenceLevel, GuidedSize, RecordStatus, RunMode, TestSummary } from '../../domain/types';

export const DISCLAIMER =
  'This is a governance-readiness record, not certification. It does not guarantee compliance or safety. Prompts, replies and personal data are not shown here.';

export interface PublicRecordView {
  recordId: string;
  version: number;
  orgName: string;
  agentName: string;
  status: RecordStatus;
  assessedAt: string;
  lastTestedAt: string | null;
  retestBy: string | null;
  nextRetestBy: string | null;
  retestReason: 'agent_change' | 'scheduled' | null;
  changedAt: string | null;
  expiredAt: string | null;
  revokedAt: string | null;
  runMode: RunMode | null;
  evidenceLevel: EvidenceLevel | null;
  guidedSize: GuidedSize | null;
  hash: string;
  previousHashes: string[];
  showTestSummary: boolean;
  testSummary: TestSummary | null;
  openMustFixCount: number;
  badge: { eligible: boolean };
  disclaimer: string;
}

export { esc };

const D = (iso: string | null): string => (iso ? formatDate(iso) : '');

function paragraph(v: PublicRecordView): string {
  const selfRun = v.runMode === 'self_run';
  switch (v.status) {
    case 'Assessed':
      return `The company profiled this agent and completed a readiness assessment on ${D(v.assessedAt)}. No adversarial tests have been run yet. This snapshot becomes a full record once the agent is tested.`;
    case 'Current':
      if (selfRun) {
        const counts = v.testSummary ? ` (${v.testSummary.run} of ${v.testSummary.total} cases; ${v.testSummary.notRun} not tested on this path)` : '';
        return `Tests self-run by the founder on ${D(v.lastTestedAt)}${counts}. Next scheduled re-test by ${D(v.nextRetestBy)}. Self-run means the founder ran the test prompts in the agent's own tool and pasted the replies; ComplyNexus graded them but did not operate the agent.`;
      }
      return `Tested on ${D(v.lastTestedAt)}. Next scheduled re-test by ${D(v.nextRetestBy)}.`;
    case 'Re-test due':
      return v.retestReason === 'scheduled'
        ? `The scheduled re-test was due on ${D(v.nextRetestBy)}. The company must re-test by ${D(v.retestBy)} or this record expires.`
        : `The agent changed on ${D(v.changedAt)}. The company must re-test by ${D(v.retestBy)} or this record expires.`;
    case 'Expired':
      return v.retestReason === 'scheduled'
        ? `Record from ${D(v.assessedAt)}. The scheduled re-test was missed and it was not re-tested within 30 days, so it expired on ${D(v.expiredAt)}.`
        : `Record from ${D(v.assessedAt)}. The agent changed on ${D(v.changedAt)} and was not re-tested within 30 days, so it expired on ${D(v.expiredAt)}.`;
    case 'Revoked':
      return `Revoked by ComplyNexus on ${D(v.revokedAt)}. The company has been told the reason and can appeal.`;
  }
}

const box = (text: string): string =>
  `<div style="margin-top:16px;padding:12px 14px;background:#F7F7FC;border:1px solid #E4E5F5;border-radius:8px;font-size:14px;color:#1F2040">${esc(text)}</div>`;

function boxes(v: PublicRecordView): string {
  const out: string[] = [];
  const mustFix = v.openMustFixCount === 0 ? 'no must-fix items open' : `${v.openMustFixCount} must-fix items open`;
  if (v.status === 'Assessed') {
    out.push(box(`Tests: Not tested yet · ${v.openMustFixCount} must-fix items open from the assessment`));
  } else if (v.status === 'Revoked') {
    out.push(box('A revoked record cannot be restored. A new assessment and test are needed.'));
  } else {
    if (v.status === 'Expired') out.push(box('Do not rely on this record. Ask the company for a current one.'));
    if (v.showTestSummary && v.testSummary) {
      const mode = v.runMode === 'self_run' ? ' (self-run)' : '';
      out.push(box(`Last test: ${v.testSummary.passed} of ${v.testSummary.run} run cases passed${mode} · ${mustFix}`));
    }
  }
  return out.join('');
}

export function facts(v: PublicRecordView): [string, string][] {
  const assessed: [string, string] = ['Assessed', D(v.assessedAt)];
  switch (v.status) {
    case 'Assessed':
      return [assessed, ['Last tested', 'Not yet'], ['Next step', 'Safe test · about 6 min']];
    case 'Current':
      return [assessed, ['Last tested', `${D(v.lastTestedAt)}${v.runMode === 'self_run' ? ' · Self-run' : ''}`], ['Next re-test by', D(v.nextRetestBy)]];
    case 'Re-test due':
      return [assessed, ['Last tested', D(v.lastTestedAt)], ['Re-test by', D(v.retestBy)]];
    case 'Expired':
      return [assessed, ['Last tested', D(v.lastTestedAt)], ['Expired on', D(v.expiredAt)]];
    case 'Revoked':
      return [assessed, ['Last tested', v.lastTestedAt ? D(v.lastTestedAt) : 'Not yet'], ['Revoked on', D(v.revokedAt)]];
  }
}

function earlier(hashes: string[]): string {
  if (!hashes.length) return '';
  return `<details style="font-size:12px;color:#5B5E7A"><summary style="cursor:pointer">Earlier versions: ${hashes.length}</summary><ul style="padding-left:18px;word-break:break-all">${hashes.map((h) => `<li>SHA-256 ${esc(h)}</li>`).join('')}</ul></details>`;
}

export function renderVerifyHtml(v: PublicRecordView, publicHost = 'verify.complynexus.com'): string {
  const pill = PILLS[v.status];
  const header = v.status === 'Assessed' ? `Record ${v.recordId} · snapshot` : `Record ${v.recordId} · v${v.version}`;
  const evidence =
    v.status === 'Current' && v.runMode === 'self_run'
      ? `<span style="display:inline-block;margin-left:8px;padding:4px 10px;font-size:12px;border-radius:999px;background:#FEF3C7;color:#92400E">Evidence: self-reported</span>`
      : '';
  const dl = facts(v)
    .map(
      ([k, val]) =>
        `<div><dt style="font-size:12px;color:#5B5E7A">${esc(k)}</dt><dd style="margin:2px 0 0;font-size:14px;font-weight:600">${esc(val)}</dd></div>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(v.agentName)} · ComplyNexus Lite record</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600&display=swap" rel="stylesheet">
<style>body{margin:0;background:#F7F7FC;font-family:'Lexend',system-ui,sans-serif;color:#1F2040}a{color:#4446E0}a:hover{color:#2E30B8}</style>
</head>
<body>
<header style="background:#fff;border-bottom:1px solid #E4E5F5;padding:14px 20px;display:flex;align-items:center;gap:10px">
<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#595BFF"/></svg>
<strong>ComplyNexus</strong> <span style="color:#5B5E7A;font-size:13px">${esc(publicHost)}</span>
</header>
<main style="max-width:640px;margin:24px auto;padding:0 16px">
<div style="background:#fff;border:1px solid #E4E5F5;border-radius:12px;padding:24px">
<div style="font-size:13px;color:#5B5E7A">${esc(header)}</div>
<h1 style="font-size:22px;margin:6px 0 12px">${esc(v.orgName)} · ${esc(v.agentName)}</h1>
<div><span style="display:inline-block;padding:4px 12px;font-size:14px;font-weight:600;border-radius:999px;background:${pill.bg};color:${pill.fg};border:2px solid ${pill.fg}">${esc(pill.label)}</span>${evidence}</div>
<p style="font-size:14px;line-height:1.6">${esc(paragraph(v))}</p>
${boxes(v)}
<dl style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:20px 0 0">${dl}</dl>
<p style="font-size:12px;color:#5B5E7A;word-break:break-all;margin-top:20px">SHA-256 ${esc(v.hash)} · compare with the hash printed on the PDF (version ${v.version})</p>
${earlier(v.previousHashes)}
${box(DISCLAIMER)}
<details style="margin-top:16px;font-size:14px"><summary style="cursor:pointer;color:#4446E0">What does this record mean?</summary>
<p style="line-height:1.6">The company described its AI agent, answered a readiness assessment and had the agent tested by ComplyNexus Lite. Statuses: Assessed (scored, not yet tested) → Current (latest test on record) → Re-test due (after a change or every 3 months) → Expired (30 days without a re-test). Revoked is withdrawn by ComplyNexus.</p></details>
</div>
</main>
</body>
</html>
`;
}
