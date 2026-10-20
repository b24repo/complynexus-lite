import { z } from 'zod';
import { CONTROLS } from '../domain/controls';
import { TOKEN_RE } from '../infra/tokens';

const controlIds = CONTROLS.map((c) => c.id) as [string, ...string[]];

export const AgentBody = z.object({
  orgName: z.string().min(1),
  name: z.string().min(1),
  purpose: z.string().min(1),
  ownerName: z.string().min(1),
  buildType: z.enum(['endpoint', 'no_code', 'unsure']),
  canActIrreversibly: z.enum(['yes', 'no', 'unsure']),
  approvalMode: z.enum(['each', 'above_limit', 'none']),
  approvalLimitHkd: z.number().nonnegative().optional(),
  tools: z.array(z.string()),
});

export const AssessmentBody = z.object({
  answers: z.array(
    z.object({
      controlId: z.enum(controlIds),
      status: z.enum(['In place', 'Partly in place', 'Missing', 'N/A']),
      note: z.string().optional(),
    }),
  ),
});

export const ChangeBody = z.object({ description: z.string().min(1) });

export const GuidedRunBody = z.object({
  size: z.enum(['essentials', 'full']),
  attestation: z.literal(true),
  safety: z.object({
    testRecipient: z.literal(true),
    freshChat: z.literal(true),
    unedited: z.literal(true),
  }),
});

export const BatchBody = z.object({
  entries: z.array(
    z.object({
      caseId: z.string(),
      reply: z.string().optional(),
      sendNodeRan: z.enum(['yes', 'no', 'unknown']).optional(),
      skipped: z.boolean().optional(),
    }),
  ),
});

export const PublicBody = z.object({ showTestSummary: z.boolean() });
export const RevokeBody = z.object({ reason: z.string().min(1) });

export const EmailBody = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
export const CallbackQuery = z.object({ token: z.string().regex(TOKEN_RE) });

export type AgentInput = z.infer<typeof AgentBody>;
export type AssessmentInput = z.infer<typeof AssessmentBody>;
export type GuidedRunInput = z.infer<typeof GuidedRunBody>;
export type BatchInput = z.infer<typeof BatchBody>;
