import type { Client } from '../api/helpers';
import { agentBody } from '../fixtures/bookbot';

export const csrfOf = (html: string): string => /name="_csrf" value="([0-9a-f]{64})"/.exec(html)![1];

export const postForm = (client: Client, path: string, body: Record<string, unknown>) => client.post(path).type('form').send(body);

export function agentFormBody(csrf: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...agentBody,
    tools: agentBody.tools.join(', '),
    _csrf: csrf,
    ...overrides,
  };
}

/** Creates an agent through the form; returns its id parsed from the redirect. */
export async function createAgentViaForm(client: Client, overrides: Record<string, unknown> = {}): Promise<string> {
  const form = await client.get('/app/agents/new').expect(200);
  const res = await postForm(client, '/app/agents', agentFormBody(csrfOf(form.text), overrides)).expect(303);
  return /\/app\/agents\/([^/]+)$/.exec(res.headers.location)![1];
}
