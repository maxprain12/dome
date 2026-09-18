import { describe, expect, it } from 'vitest';
import {
  parseUseTheseSkillsLine,
  skillChipsFromUserTurn,
  stripSkillInvocationText,
} from './userTurnContext';

describe('userTurnContext', () => {
  it('strips the Use these skills log line from the visible bubble', () => {
    const raw =
      'Usa la skill de ppt y genera un informe\n\nUse these skills: pptx, advo-identity.';
    expect(stripSkillInvocationText(raw)).toBe('Usa la skill de ppt y genera un informe');
    expect(parseUseTheseSkillsLine(raw)).toEqual(['pptx', 'advo-identity']);
  });

  it('strips slash skill tokens while keeping the rest of the prompt', () => {
    expect(stripSkillInvocationText('/pptx /advo-identity genera un informe')).toBe(
      'genera un informe',
    );
  });

  it('builds chips from stored skills and leftover invocation text', () => {
    const chips = skillChipsFromUserTurn('Use these skills: pptx.', [
      { id: 'advo-identity', name: 'advo-identity' },
    ]);
    expect(chips.map((chip) => chip.name)).toEqual(['advo-identity', 'pptx']);
  });
});
