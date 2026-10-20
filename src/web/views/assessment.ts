import { CONTROLS } from '../../domain/controls';
import type { Agent } from '../../domain/types';
import type { Ctx } from './dashboard';
import { button, errorList, esc, hidden, layout } from './layout';

/** Per-control help copy. Intentionally empty until the PO supplies wording; the renderer tolerates gaps. */
export const CONTROL_HELP: Partial<Record<string, string>> = {};

/** View-local labels derived from the control id prefixes. */
export const DOMAIN_LABELS: Record<string, string> = {
  AA: 'Accountability',
  PE: 'Permissions',
  LA: 'Least agency',
  RO: 'Robustness',
  MS: 'Memory and storage',
  AE: 'Audit and evidence',
  CA: 'Change',
};

const STATUSES = ['In place', 'Partly in place', 'Missing', 'N/A'] as const;

export function renderAssessment(ctx: Ctx, agent: Agent, values: Record<string, unknown>, errors: string[]): string {
  const domains = [...new Set(CONTROLS.map((c) => c.domain))];
  const groups = domains
    .map((d) => {
      const fields = CONTROLS.filter((c) => c.domain === d)
        .map((c) => {
          const help = CONTROL_HELP[c.id];
          const radios = STATUSES.map(
            (s) =>
              `<label><input type="radio" name="${esc(c.id)}" value="${esc(s)}" required${values[c.id] === s ? ' checked' : ''}> ${esc(s)}</label>`,
          ).join('');
          return `<fieldset class="radios"><legend>${esc(c.id)} · ${esc(c.name)}${c.severity === 'critical' ? ' <span class="muted">(critical)</span>' : ''}</legend>${
            help ? `<p class="muted">${esc(help)}</p>` : ''
          }${radios}</fieldset>`;
        })
        .join('');
      return `<div class="card"><h2>${esc(DOMAIN_LABELS[d] ?? d)}</h2>${fields}</div>`;
    })
    .join('');
  return layout(
    { ...ctx, title: `Readiness assessment · ${agent.name}` },
    `<h1>Readiness assessment · ${esc(agent.name)}</h1>
<form method="post" action="/app/agents/${esc(agent.id)}/assessment">${hidden('_csrf', ctx.csrf ?? '')}${errorList(errors)}${groups}${button('Save assessment')}</form>`,
  );
}
