import PDFDocument from 'pdfkit';
import { getControl } from '../domain/controls';
import { formatDate } from '../domain/dates';
import type { ReadinessRecord } from '../domain/types';
import { DISCLAIMER } from '../api/views/verify';

export interface RecordPdfInput {
  record: ReadinessRecord;
  facts: [string, string][];
  verifyUrl: string;
  printedAt: Date;
}

const control = (id: string): string => `${id} · ${getControl(id).name}`;
const list = (ids: string[]): string => (ids.length ? ids.map(control).join('; ') : 'none');

/**
 * Uncompressed on purpose: tiny file, and tests read the text straight from the bytes (ADR-0010).
 * Only Latin-1 punctuation. The owner name is deliberately not printed (parity with the public page).
 */
export function renderRecordPdf({ record: r, facts, verifyUrl, printedAt }: RecordPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      compress: false,
      info: { Title: `ComplyNexus Lite record ${r.recordId} v${r.version}`, Author: 'ComplyNexus Lite', CreationDate: printedAt },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(18).text('ComplyNexus Lite · AI agent readiness record');
    doc.moveDown(0.5).font('Helvetica').fontSize(12).text(`${r.orgName} · ${r.agentName}`);
    doc.fontSize(10).fillColor('#5B5E7A').text(`Record ${r.recordId} · version ${r.version}`).fillColor('black');
    doc.moveDown();
    doc.text(`Status at print time: ${r.status}${r.status === 'Current' && r.runMode === 'self_run' ? ' · Evidence: self-reported' : ''}`);
    for (const [k, v] of facts) doc.text(`${k}: ${v}`);
    doc.moveDown();
    doc.font('Helvetica-Bold').text('Readiness').font('Helvetica');
    doc.text(`Score ${r.readinessScore} of 100 · ${r.riskBand}`);
    doc.text(`Open must-fix: ${list(r.openMustFix)}`);
    doc.text(`Open should-fix: ${list(r.openShouldFix)}`);
    doc.moveDown();
    doc.font('Helvetica-Bold').text('Tests').font('Helvetica');
    if (r.testSummary) {
      const t = r.testSummary;
      doc.text(
        `${t.passed} of ${t.run} run cases passed · ${t.notRun} not run · ${t.total} in the ${r.guidedSize ?? ''} set · ${r.runMode === 'self_run' ? 'self-run, self-reported' : (r.runMode ?? '')}`,
      );
      for (const c of t.byCategory) doc.text(`${c.category}: ${c.passed} of ${c.run} passed, ${c.notRun} not run · ${c.verdict}`);
      if (t.failedCaseIds.length) doc.text(`Failed cases: ${t.failedCaseIds.join(', ')}`);
    } else {
      doc.text('Not tested yet');
    }
    doc.moveDown();
    doc.font('Helvetica-Bold').text('Integrity').font('Helvetica');
    doc.font('Courier').text(`SHA-256 ${r.hash}`).font('Helvetica');
    doc.text(`Verify: ${verifyUrl}`, { link: verifyUrl });
    doc.text('The hash is computed from this version of the record (ADR-0004), not from this file. Compare it with the hash on the verify page.');
    doc.moveDown();
    doc.fontSize(9).fillColor('#5B5E7A').text(DISCLAIMER).text(`Printed ${formatDate(printedAt)}`);
    doc.end();
  });
}
