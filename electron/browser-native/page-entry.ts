import { createPageAgent } from '../../extensions/browser/src/lib/page-agent';

Object.assign(globalThis, { __domePageAgent: createPageAgent(document, true) });
