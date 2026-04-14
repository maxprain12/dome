declare module 'turndown' {
  export default class TurndownService {
    constructor(options?: Record<string, unknown>);
    addRule(name: string, rule: Record<string, unknown>): void;
    turndown(html: string): string;
  }
}
