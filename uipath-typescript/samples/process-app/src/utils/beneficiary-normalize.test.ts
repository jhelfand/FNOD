import { describe, it, expect } from 'vitest';
import { mergeBeneficiaries } from './beneficiary-normalize';

describe('mergeBeneficiaries', () => {
  it('returns raw when df empty', () => {
    const raw = [{ id: 'a', name: 'Alice' }];
    const merged = mergeBeneficiaries(raw, []);
    expect(merged).toEqual(raw);
  });

  it('returns df when raw empty', () => {
    const df = [{ id: 'd1', policySystemData: { name: 'DF Name' } }];
    const merged = mergeBeneficiaries([], df as any);
    expect(merged).toEqual(df);
  });

  it('merges by id and prefers df policySystemData', () => {
    const raw = [{ id: '1', name: 'Raw Name', policySystemData: { name: 'Raw' } }];
    const df = [{ Id: '1', policySystemData: { name: 'DF Name', phone: '555' } }];
    const merged = mergeBeneficiaries(raw as any, df as any);
    expect(merged[0].policySystemData.name).toBe('DF Name');
    expect(merged[0].policySystemData.phone).toBe('555');
  });

  it('appends df entries not matched', () => {
    const raw = [{ id: '1', name: 'Raw Name' }];
    const df = [{ Id: '2', policySystemData: { name: 'DF2' } }];
    const merged = mergeBeneficiaries(raw as any, df as any);
    expect(merged.length).toBe(2);
    expect(merged[1].policySystemData.name).toBe('DF2');
  });
});
