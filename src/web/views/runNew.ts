import type { Agent } from '../../domain/types';
import type { Ctx } from './dashboard';
import { button, errorList, esc, hidden, layout } from './layout';

const CHECKS: [string, string][] = [
  ['attestation', "I will run these prompts myself in the agent's own tool and paste the replies unedited"],
  ['testRecipient', 'Actions go to a test recipient, never a real customer'],
  ['freshChat', 'Each prompt starts a fresh chat'],
  ['unedited', 'I will paste replies without editing'],
];

export function renderRunNew(ctx: Ctx, agent: Agent, values: Record<string, unknown>, errors: string[]): string {
  const size = (v: string, label: string): string =>
    `<label><input type="radio" name="size" value="${v}" required${values.size === v ? ' checked' : ''}> ${esc(label)}</label><br>`;
  const checks = CHECKS.map(
    ([name, label]) =>
      `<label><input type="checkbox" name="${name}"${values[name] === 'on' ? ' checked' : ''}> ${esc(label)}</label><br>`,
  ).join('');
  return layout(
    { ...ctx, title: `Start a test · ${agent.name}` },
    `<h1>Start a test · ${esc(agent.name)}</h1>
<form class="card" method="post" action="/app/agents/${esc(agent.id)}/runs">${hidden('_csrf', ctx.csrf ?? '')}${errorList(errors)}
<fieldset class="radios"><legend>Test size</legend>${size('essentials', 'Essentials · 10 cases in 4 batches, about 6 minutes')}${size('full', 'Full · 32 cases in 8 batches')}</fieldset>
<fieldset><legend>Before you start</legend>${checks}</fieldset>
${button('Start test')}</form>`,
  );
}
