#!/usr/bin/env node
/**
 * Smoke: @langchain/mcp-adapters must load (requires @langchain/core/utils/uuid v6).
 * Regression: langgraph-checkpoint@1.1.1 imports v6; core <1.1.48 only exports v1/v4/v5/v7.
 */
import assert from 'node:assert/strict';

const uuid = await import('@langchain/core/utils/uuid');
assert.ok(typeof uuid.v6 === 'function', '@langchain/core/utils/uuid must export v6');

const mcp = await import('@langchain/mcp-adapters');
assert.ok(typeof mcp.MultiServerMCPClient === 'function', 'MultiServerMCPClient missing');

console.log('[smoke-mcp-adapters] OK — uuid.v6 + MultiServerMCPClient');
