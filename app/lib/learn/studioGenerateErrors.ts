export type StudioGenerateErrorCode =
  | 'EMPTY_SOURCES'
  | 'BUDGET_EXCEEDED'
  | 'MODEL_UNAVAILABLE'
  | 'TIMEOUT'
  | 'GENERATION_FAILED';

export class StudioGenerateError extends Error {
  readonly code: StudioGenerateErrorCode;

  constructor(code: StudioGenerateErrorCode, message: string) {
    super(message);
    this.name = 'StudioGenerateError';
    this.code = code;
  }
}

export function studioGenerateErrorI18nKey(code: StudioGenerateErrorCode): string {
  switch (code) {
    case 'EMPTY_SOURCES':
      return 'learn.error_empty_sources';
    case 'BUDGET_EXCEEDED':
      return 'learn.error_budget_exceeded';
    case 'MODEL_UNAVAILABLE':
      return 'learn.error_model_unavailable';
    case 'TIMEOUT':
      return 'learn.error_timeout';
    default:
      return 'learn.error_generation_failed';
  }
}
