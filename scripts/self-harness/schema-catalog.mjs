const object = (required, properties) => ({ type: 'object', additionalProperties: true, required, properties });
const string = { type: 'string' };
const integer = { type: 'integer' };

export const SELF_HARNESS_SCHEMAS = Object.freeze({
  schemaVersion: 1,
  ExperimentManifest: object(
    ['schemaVersion', 'id', 'provider', 'model', 'baseSha', 'evaluatorVersion', 'splits', 'limits', 'manifestHash'],
    {
      schemaVersion: integer, id: string, provider: string, model: string, baseSha: string,
      evaluatorVersion: string, splits: object(['heldIn', 'heldOut'], {
        heldIn: { type: 'array', items: string }, heldOut: { type: 'array', items: string },
      }), limits: { type: 'object' }, manifestHash: string,
    },
  ),
  HarnessLineage: object(['round', 'proposalId', 'patch', 'patchHash', 'targetMechanism', 'decision'], {
    round: integer, proposalId: string, patch: string, patchHash: string, targetMechanism: string, decision: { type: 'object' },
  }),
  TraceRecord: object(['caseId', 'outcome', 'chunks'], {
    caseId: string, outcome: string, chunks: { type: 'array' }, finalText: string, validation: { type: 'object' },
  }),
  FailureSignature: object(['terminalCause', 'causalStatus', 'agentMechanism'], {
    terminalCause: string, causalStatus: string, agentMechanism: string,
  }),
  EvidenceBundle: object(['schemaVersion', 'totalRecords', 'failedRecords', 'patterns', 'passingBehaviors', 'previousProposals'], {
    schemaVersion: integer, totalRecords: integer, failedRecords: integer, patterns: { type: 'array' },
    passingBehaviors: { type: 'array' }, previousProposals: { type: 'array' },
  }),
  HarnessProposal: object(['id', 'targetMechanism', 'summary', 'expectedEffect', 'regressionRisks', 'expectedTests', 'patch'], {
    id: string, targetMechanism: string, summary: string, expectedEffect: string,
    regressionRisks: { type: 'array', items: string }, expectedTests: { type: 'array', items: string }, patch: string,
  }),
  CandidateEvaluation: object(['id', 'status', 'reason', 'policy'], {
    id: string, status: { enum: ['accepted', 'rejected'] }, reason: string, policy: { type: 'object' },
    gates: { type: 'array' }, metrics: { type: 'object' }, decision: { type: 'object' },
  }),
  PromotionDecision: object(['schemaVersion', 'round', 'winner', 'accepted', 'reason'], {
    schemaVersion: integer, round: integer, winner: { type: ['string', 'null'] },
    accepted: { type: 'array', items: string }, reason: string,
  }),
});
