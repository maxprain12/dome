/**
 * Shell execution tool for Many.
 * Shows a native confirmation dialog before running any command.
 * Main-process execution goes through LangGraph → executeToolInMain → aiToolsHandler.shellExec.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam } from './common';

export function createShellExecTool(): AnyAgentTool {
  return {
    label: 'Run Command',
    name: 'shell_exec',
    description:
      'Execute a shell command. A native confirmation dialog will appear showing the exact command before it runs — the user must approve it. ' +
      'Returns stdout, stderr, and exit code. Use for running scripts, build tools, CLI utilities, git commands, etc.',
    parameters: Type.Object({
      command: Type.String({ description: 'Shell command to execute (e.g. "npm run build", "git log --oneline -10").' }),
      cwd: Type.Optional(Type.String({ description: 'Working directory for the command. Defaults to the current working directory.' })),
    }),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const command = readStringParam(params, 'command', { required: true });
      const cwd = readStringParam(params, 'cwd');
      try {
        const result = await window.electron.shell.exec(command, cwd);
        if (!result?.success) return jsonResult({ status: 'error', error: result?.error ?? 'Execution failed' });
        if (result.cancelled) return jsonResult({ status: 'cancelled', message: 'User cancelled command execution' });
        return jsonResult({
          status: 'success',
          command,
          cwd: cwd ?? null,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        });
      } catch (err) {
        return jsonResult({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}

export function createShellTools(): AnyAgentTool[] {
  return [createShellExecTool()];
}
