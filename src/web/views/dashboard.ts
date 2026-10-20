import type { AgentListItem } from '../../usecases/agents';
import { esc, layout, pill } from './layout';
import type { LayoutOpts } from './layout';

export type Ctx = Omit<LayoutOpts, 'title'>;

export function renderDashboard(ctx: Ctx, items: AgentListItem[]): string {
  const list =
    items.length === 0
      ? '<div class="card"><p>No agents yet. Create one to start the readiness assessment.</p></div>'
      : `<ul class="agents">${items
          .map(
            ({ agent, record }) =>
              `<li class="card"><a href="/app/agents/${esc(agent.id)}">${esc(agent.orgName)} · ${esc(agent.name)}</a> ${pill(record?.status ?? 'Not assessed')}${
                record ? ` <span class="muted">Record ${esc(record.recordId)}</span>` : ''
              }</li>`,
          )
          .join('')}</ul>`;
  return layout({ ...ctx, title: 'Your agents' }, `<h1>Your agents</h1><p><a class="btn" href="/app/agents/new">New agent</a></p>${list}`);
}
