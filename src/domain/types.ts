export type ControlStatus = 'In place' | 'Partly in place' | 'Missing' | 'N/A';
export type Priority = 'Must fix' | 'Should fix' | 'OK';
export type ControlSeverity = 'critical' | 'important'; // critical -> "Must fix" when not In place
export type Category = 'Prompt injection' | 'Data leakage' | 'Excessive agency' | 'Tool misuse';
export type CaseType = 'text' | 'action' | 'intercept';
export type CaseExpectation = 'refusal' | 'no_leak' | 'no_action';
export type RecordStatus = 'Assessed' | 'Current' | 'Re-test due' | 'Expired' | 'Revoked';
export type RunMode = 'sandbox' | 'dry_run' | 'self_run';
export type EvidenceLevel = 'verified_run' | 'self_reported';
export type Verdict = 'pass' | 'fail' | 'not_run';
export type SendNodeAnswer = 'yes' | 'no' | 'unknown';
export type GuidedSize = 'essentials' | 'full';
export type BuildType = 'endpoint' | 'no_code' | 'unsure';
export type RiskBand = 'Low risk' | 'Medium risk' | 'High risk';

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ? `${code}: ${message}` : code);
    this.name = 'DomainError';
  }
}

export interface Control {
  id: string;
  name: string;
  severity: ControlSeverity;
  domain: string;
}
export interface Agent {
  id: string;
  orgName: string;
  name: string;
  purpose: string;
  ownerName: string;
  buildType: BuildType;
  canActIrreversibly: 'yes' | 'no' | 'unsure';
  approvalMode: 'each' | 'above_limit' | 'none';
  approvalLimitHkd?: number;
  tools: string[];
  createdAt: string;
  changedAt?: string;
}
export interface AssessmentAnswer {
  controlId: string;
  status: ControlStatus;
  note?: string;
}
export interface Assessment {
  id: string;
  agentId: string;
  version: number;
  answers: AssessmentAnswer[];
  readinessScore: number;
  riskBand: RiskBand;
  completedAt: string;
}
export interface TestCase {
  id: string;
  name: string;
  category: Category;
  controlId: string;
  severity: Priority;
  type: CaseType;
  expect: CaseExpectation;
  guidedRunnable: boolean;
  essentials: boolean;
  prompt: string;
  failMarkers: string[];
  notRunReason?: string;
}
export interface CaseResult {
  caseId: string;
  verdict: Verdict;
  reason: string;
  redactedReply?: string;
  sendNodeRan?: SendNodeAnswer;
  gradedBy: 'rule' | 'claude' | 'none';
}
export interface GuidedRun {
  id: string;
  agentId: string;
  runNumber: number;
  size: GuidedSize;
  batches: { index: number; category: Category; caseIds: string[]; savedAt?: string }[];
  results: CaseResult[];
  status: 'in_progress' | 'completed';
  startedAt: string;
  completedAt?: string;
}
export interface TestSummary {
  passed: number;
  run: number;
  notRun: number;
  total: number;
  byCategory: {
    category: Category;
    passed: number;
    run: number;
    notRun: number;
    verdict: 'Strong' | 'Needs attention' | 'Weak';
  }[];
  failedCaseIds: string[];
}
export interface OpenItem {
  controlId: string;
  priority: Priority;
  source: ('assessment' | 'test')[];
}
export interface RecordSnapshot {
  // the hashed, immutable-per-version part
  recordId: string;
  version: number;
  orgName: string;
  agentName: string;
  ownerName: string;
  assessedAt: string;
  lastTestedAt: string | null;
  runMode: RunMode | null;
  evidenceLevel: EvidenceLevel | null;
  guidedSize: GuidedSize | null;
  readinessScore: number;
  riskBand: RiskBand;
  openMustFix: string[];
  openShouldFix: string[];
  testSummary: TestSummary | null;
  libraryVersion: string;
  controlSetVersion: string;
}
export interface ReadinessRecord extends RecordSnapshot {
  id: string; // equals recordId; required by Repository<T>
  agentId: string;
  status: RecordStatus;
  hash: string;
  nextRetestBy: string | null; // scheduled: lastTestedAt + 3 months (Current only)
  retestBy: string | null; // grace deadline (Re-test due only)
  retestReason: 'agent_change' | 'scheduled' | null;
  changedAt: string | null;
  expiredAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  showTestSummary: boolean;
  createdAt: string;
  updatedAt: string;
}
