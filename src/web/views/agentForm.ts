import type { Ctx } from './dashboard';
import { button, errorList, esc, field, hidden, layout } from './layout';

type Values = Record<string, unknown>;

export function renderAgentForm(ctx: Ctx, values: Values, errors: string[]): string {
  const v = (k: string): string => (typeof values[k] === 'string' ? (values[k] as string) : '');
  const text = (name: string, label: string): string => field(label, `<input type="text" name="${name}" value="${esc(v(name))}" required>`);
  const select = (name: string, opts: [string, string][]): string =>
    `<select name="${name}">${opts.map(([val, lab]) => `<option value="${val}"${v(name) === val ? ' selected' : ''}>${esc(lab)}</option>`).join('')}</select>`;
  const radios = (name: string, legend: string, opts: [string, string][]): string =>
    `<fieldset class="radios"><legend>${esc(legend)}</legend>${opts
      .map(
        ([val, lab]) =>
          `<label><input type="radio" name="${name}" value="${val}"${v(name) === val ? ' checked' : ''} required> ${esc(lab)}</label>`,
      )
      .join('')}</fieldset>`;
  return layout(
    { ...ctx, title: 'New agent' },
    `<div class="card"><h1>New agent</h1>
<form method="post" action="/app/agents">
${hidden('_csrf', ctx.csrf ?? '')}
${errorList(errors)}
${text('orgName', 'Organisation')}
${text('name', 'Agent name')}
${field('What does it do?', `<textarea name="purpose" rows="3" required>${esc(v('purpose'))}</textarea>`)}
${text('ownerName', 'Owner (who is accountable)')}
${field(
  'How is it built?',
  select('buildType', [
    ['endpoint', 'API endpoint'],
    ['no_code', 'No-code tool (Zapier, Make, n8n…)'],
    ['unsure', 'Not sure'],
  ]),
)}
${radios('canActIrreversibly', 'Can it send, pay, delete or book on its own?', [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['unsure', 'Not sure'],
])}
${radios('approvalMode', 'A human approves…', [
  ['each', 'every action'],
  ['above_limit', 'actions above a limit'],
  ['none', 'nothing'],
])}
${field('Approval limit (HKD), if above a limit', `<input type="number" name="approvalLimitHkd" min="0" step="1" value="${esc(v('approvalLimitHkd'))}">`)}
${field('Tools, comma separated, e.g. gmail, calendar', `<input type="text" name="tools" value="${esc(v('tools'))}">`)}
${button('Create agent')}
</form></div>`,
  );
}
