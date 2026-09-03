import { describe, expect, it } from 'vitest';
import {
  humanizePersonStatus,
  normalizePersonStatus,
  parseCustomStatuses,
  personStatusLabel,
  slugifyPersonStatusLabel,
} from './personStatuses';

describe('personStatuses', () => {
  it('normalizes slugs and rejects reserved or opaque ids', () => {
    expect(normalizePersonStatus('Partner')).toBe('partner');
    expect(normalizePersonStatus('  VIP Club  ')).toBe('vip_club');
    expect(normalizePersonStatus('all')).toBeNull();
    expect(normalizePersonStatus('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')).toBeNull();
    expect(normalizePersonStatus('!!!')).toBeNull();
    expect(slugifyPersonStatusLabel('Inversor ángel')).toBe('inversor_angel');
  });

  it('parses custom statuses and drops builtins / bad labels', () => {
    expect(
      parseCustomStatuses(
        JSON.stringify([
          { id: 'vip', label: 'VIP' },
          { id: 'lead', label: 'Nope' },
          { id: 'sp-ab12cd34ef', label: 'Post' },
        ]),
      ),
    ).toEqual([{ id: 'vip', label: 'VIP' }]);
  });

  it('labels builtins via i18n and customs via stored name', () => {
    const t = (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key;
    expect(personStatusLabel('customer', t, [])).toBe('people.lead_status_customer');
    expect(personStatusLabel('vip', t, [{ id: 'vip', label: 'Prioritario' }])).toBe('Prioritario');
    expect(personStatusLabel('warm_lead', t, [])).toBe('Warm Lead');
    expect(humanizePersonStatus('warm_lead')).toBe('Warm Lead');
  });
});
