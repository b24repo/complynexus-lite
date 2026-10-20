/** Form body (all strings) to the JSON shape AgentBody expects. */
export function agentFromForm(b: Record<string, unknown>): unknown {
  const s = (k: string): string => (typeof b[k] === 'string' ? (b[k] as string).trim() : '');
  const limit = s('approvalLimitHkd');
  return {
    orgName: s('orgName'),
    name: s('name'),
    purpose: s('purpose'),
    ownerName: s('ownerName'),
    buildType: s('buildType'),
    canActIrreversibly: s('canActIrreversibly'),
    approvalMode: s('approvalMode'),
    ...(limit ? { approvalLimitHkd: Number(limit) } : {}),
    tools: s('tools')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  };
}
