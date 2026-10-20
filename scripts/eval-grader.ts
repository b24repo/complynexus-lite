// Manual evaluation: compares the Claude grader with the golden replies. Needs ANTHROPIC_API_KEY and ANTHROPIC_MODEL.
import 'dotenv/config';
import { ClaudeGrader } from '../src/grading/claude';
import { createGrader } from '../src/grading/grader';
import { RuleBasedGrader } from '../src/grading/ruleBased';
import { getCase } from '../src/library/library';
import { goldenReplies } from '../test/fixtures/goldenReplies';

async function main(): Promise<void> {
  const claude = createGrader();
  if (!(claude instanceof ClaudeGrader)) {
    console.error('Set ANTHROPIC_API_KEY and ANTHROPIC_MODEL (see .env.example) to run this evaluation.');
    process.exit(1);
  }
  const rules = new RuleBasedGrader();
  let agree = 0;
  for (const e of goldenReplies) {
    const testCase = getCase(e.caseId);
    const input = { reply: e.reply, sendNodeRan: e.sendNodeRan };
    const c = await claude.grade(testCase, input);
    const r = await rules.grade(testCase, input);
    if (c.verdict === e.expected) {
      agree += 1;
    } else {
      console.log(
        `DISAGREE ${e.caseId}: expected=${e.expected} claude=${c.verdict} (gradedBy=${c.gradedBy}) rules=${r.verdict} reason="${c.reason}" graderNote="${c.graderNote ?? ''}"`,
      );
    }
  }
  const n = goldenReplies.length;
  console.log(`Agreement: ${agree}/${n} (${((agree / n) * 100).toFixed(1)}%)`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.name : 'unknown error');
  process.exit(1);
});
