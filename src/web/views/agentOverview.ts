import { getControl } from '../../domain/controls';
import type { AgentOverview } from '../../usecases/agents';
import type { Ctx } from './dashboard';
import { button, errorList, esc, field, hidden, layout, pill } from './layout';

export function renderAgentOverview(ctx: Ctx, v: AgentOverview, base: string, opts: { changeError?: string } = {}): string {
  const { agent, record, activeRun } = v;
  const id = esc(agent.id);
  const header = `<div class="card"><h1>${esc(agent.orgName)} · ${esc(agent.name)}</h1>
<p>${pill(record?.status ?? 'Not assessed')}</p>
${record ? `<p class="muted">Score ${record.readinessScore} · ${esc(record.riskBand)} · Record ${esc(record.recordId)} v${record.version}</p>` : ''}</div>`;

  const next: string[] = [];
  if (!v.assessment) {
    next.push(`<a class="btn" href="/app/agents/${id}/assessment">Start assessment</a>`);
  } else if (record?.status !== 'Revoked') {
    if (activeRun) {
      const idx = (activeRun.batches.find((b) => !b.savedAt) ?? activeRun.batches[0]).index;
      next.push(
        `<a class="btn" href="/app/runs/${esc(activeRun.id)}/batches/${idx}">Continue test (batch ${idx} of ${activeRun.batches.length})</a>`,
      );
    } else {
      next.push(`<a class="btn" href="/app/agents/${id}/runs/new">Start test</a>`);
    }
    next.push(`<a class="btn ghost" href="/app/agents/${id}/assessment">Re-assess</a>`);
  }
  const steps = next.length ? `<div class="actions">${next.join(' ')}</div>` : '';

  const items = v.openItems.length
    ? `<ul>${v.openItems.map((o) => `<li>${esc(getControl(o.controlId).name)} (${esc(o.controlId)}) · ${esc(o.priority)}</li>`).join('')}</ul>`
    : '<p class="muted">No open items.</p>';

  const verify = record
    ? `<div class="card"><h2>Public record</h2>
<p><code id="verify-url">${esc(`${base}/verify/${record.recordId}`)}</code></p>
<p><button type="button" class="btn ghost" data-copy-target="#verify-url">Copy link</button> <a href="/verify/${esc(record.recordId)}">Open</a></p>
<form method="post" action="/app/agents/${id}/public">${hidden('_csrf', ctx.csrf ?? '')}${hidden('showTestSummary', String(!record.showTestSummary))}${button(
        record.showTestSummary ? 'Hide public test summary' : 'Show public test summary',
        { kind: 'ghost' },
      )}</form></div>`
    : '';

  const change = `<div class="card"><h2>Declare a change</h2>
<form method="post" action="/app/agents/${id}/changes">${hidden('_csrf', ctx.csrf ?? '')}${errorList(opts.changeError ? [opts.changeError] : [])}
${field('What changed?', '<input type="text" name="description" required>')}
${button('Declare a change', { kind: 'ghost' })}</form>
<p class="muted">Declaring a change puts a Current record into Re-test due (30 days).</p></div>`;

  return layout(
    { ...ctx, title: `${agent.name}`, script: true },
    `${header}${steps}<div class="card"><h2>Open items</h2>${items}</div>${verify}${change}
${record ? `<p><a class="btn ghost" href="/api/records/${esc(record.recordId)}/pdf">Download PDF</a></p>` : ''}`,
  );
}
