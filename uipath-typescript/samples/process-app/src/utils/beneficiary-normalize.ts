export type AnyBeneficiary = Record<string, any>;

export function normalizeName(s?: string) {
  return (s || '').toString().replace(/\s+/g, ' ').trim().toLowerCase();
}

export function mergeBeneficiaries(raw: AnyBeneficiary[], df: AnyBeneficiary[]): AnyBeneficiary[] {
  if (!df || df.length === 0) return raw || [];
  if (!raw || raw.length === 0) return df || [];

  const dfById = new Map<string, AnyBeneficiary>();
  const dfByName = new Map<string, AnyBeneficiary>();

  df.forEach((d: AnyBeneficiary) => {
    if (d.id) dfById.set(String(d.id), d);
    if (d.Id) dfById.set(String(d.Id), d);
    const name = normalizeName(d.policySystemData?.name || d.name || d.BeneficiaryFirstName && `${d.BeneficiaryFirstName} ${d.BeneficiaryLastName}`);
    if (name) dfByName.set(name, d);
  });

  console.log('\n=== mergeBeneficiaries: dfById map ===', Object.fromEntries(dfById));
  console.log('=== mergeBeneficiaries: dfByName map ===', Object.fromEntries(dfByName));

  const usedDf = new Set<AnyBeneficiary>();

  const merged = (raw || []).map((r: AnyBeneficiary) => {
    const rid = String(r.id ?? r.Id ?? '');
    let match = dfById.get(rid);
    if (!match) {
      const rname = normalizeName(r.policySystemData?.name || r.name);
      console.log(`mergeBeneficiaries: trying name match for "${rname}"`);
      match = dfByName.get(rname);
    }

    if (match) {
      console.log(`mergeBeneficiaries: matched raw beneficiary "${r.name}" with DF beneficiary`, {
        rawId: r.id,
        rawName: r.name,
        matchName: match.name,
        rawPolicyData: r.policySystemData,
        dfPolicyData: match.policySystemData
      });
      usedDf.add(match);
      return {
        ...r,
        // merge policySystemData such that DF fields take precedence for policySystemData
        policySystemData: {
          ...(r.policySystemData || {}),
          ...(match.policySystemData || {})
        },
        // ensure display name exists
        name: r.name || match.policySystemData?.name || match.name || r.name,
        // attach any DF-provided fields to top-level if missing
        onbaseData: r.onbaseData || {},
      };
    }

    console.log(`mergeBeneficiaries: no match found for raw beneficiary "${r.name}" (id: ${r.id})`);
    return r;
  });

  // append any DF entries that weren't matched
  df.forEach((d) => {
    if (!usedDf.has(d)) {
      merged.push(d);
    }
  });

  return merged;
}

export default mergeBeneficiaries;
