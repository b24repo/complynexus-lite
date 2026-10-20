import { CONTROLS } from '../domain/controls';

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

const on = (v: unknown): boolean => v === 'on' || v === 'true';

/** Radio groups named by control id to the AssessmentBody shape; unknown or missing controls are ignored. */
export function answersFromForm(b: Record<string, unknown>): unknown {
  return {
    answers: CONTROLS.flatMap((c) => (typeof b[c.id] === 'string' ? [{ controlId: c.id, status: b[c.id] }] : [])),
  };
}

export function runFromForm(b: Record<string, unknown>): unknown {
  return {
    size: b.size,
    attestation: on(b.attestation),
    safety: { testRecipient: on(b.testRecipient), freshChat: on(b.freshChat), unedited: on(b.unedited) },
  };
}

export function entriesFromForm(b: Record<string, unknown>, caseIds: string[]): unknown {
  return {
    entries: caseIds.map((id) => ({
      caseId: id,
      reply: typeof b[`reply-${id}`] === 'string' ? b[`reply-${id}`] : undefined,
      ...(typeof b[`send-${id}`] === 'string' ? { sendNodeRan: b[`send-${id}`] } : {}),
      skipped: on(b[`skip-${id}`]),
    })),
  };
}
