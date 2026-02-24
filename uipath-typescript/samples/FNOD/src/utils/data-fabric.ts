/**
 * Centralized Data Fabric field name registry and accessor.
 * Replaces scattered record.X || record.y || record.Z patterns across the codebase.
 *
 * When using a new entity (e.g. 3f9e08f7-ee0c-f111-a69a-000d3a234247), run the app
 * and check the browser console for "[CaseContext] Entity record field names" and
 * "[CaseContext] Entity schema fields" - add your entity's field names to the
 * arrays below for each logical field.
 */

export const DF_FIELDS = {
  id: ['Id', 'id', 'recordId'],
  caseId: ['CaseNumber', 'caseId', 'CaseId', 'Id', 'id'],
  caseInstanceId: ['CaseInstanceId', 'caseInstanceId', 'InstanceId', 'instanceId'],
  policyNumber: ['PolicyNumber', 'policyNumber', 'Policy_Number', 'Policy_No', 'Policy'],
  policyNumberBeneficiary: ['PolicyNumberBeneficiary'],
  decedentName: ['DecedentName', 'decedentName', 'Decedent_Name', 'decedent_name'],
  dateOfDeath: ['DateOfDeath', 'dateOfDeath', 'DateofDeath'],
  locationOfDeath: ['LocationOfDeath', 'locationOfDeath', 'deathlocation'],
  causeOfDeath: ['CauseOfDeath', 'causeOfDeath'],
  causeOfDeathCheck: ['CauseofDeathCheck', 'CauseOfDeathCheck'],
  causeOfDeathApproval: ['CauseofDeathApproval'],
  callerName: ['FNODCaller', 'CallerName', 'callerName', 'Caller_Name', 'Caller', 'ContactName'],
  callerPhone: ['PhoneNumber', 'phonenumber', 'FNODPhone', 'CallerPhone', 'Caller_Phone', 'Phone', 'callerPhone'],
  callerAddress: ['StreetAddressPAS', 'CallerAddress', 'callerAddress'],
  callerRelationship: ['RelationshipDoc', 'CallerRelationship', 'callerRelationship'],
  status: ['Status', 'status', 'PolicyStatus'],
  caseStage: ['CaseStage', 'caseStage', 'ClaimStage', 'claimStage', 'Stage', 'stage', 'WorkflowStatus', 'workflowStatus'],
  agingDays: ['AgingDays', 'agingDays'],
  priority: ['Priority', 'priority'],
  assignedAnalyst: ['AssignedAnalyst', 'assignedAnalyst'],
  queue: ['Queue', 'queue'],
  policyType: ['ProductType', 'PolicyType', 'productType', 'Product_Type', 'Policy_Type', 'policy_type', 'ProductTypeName'],
  policyValue: ['PolicyValues', 'policyvalue1', 'PolicyValue', 'FaceValue', 'faceValue', 'Amount', 'Face_Value'],
  fnodDate: ['FNODDate', 'fnodDate', 'ClaimEffectiveDate', 'EffectiveDate', 'Effective_Date'],
  claimNumber: ['ClaimNumber'],
  beneficiaryFirstName: ['BeneficiaryFirstName', 'FirstName', 'First_Name'],
  beneficiaryLastName: ['BeneficiaryLastName', 'LastName', 'Last_Name'],
  beneficiaryMiddleInitial: ['BeneficiaryMiddleInitial', 'MiddleInitial', 'Middle_Initial'],
  beneficiaryReconStatus: ['BeneficiaryReconStatus', 'Beneficiary_Recon_Status', 'ReconStatus', 'BeneficiaryRecon'],
  tloValidationStatus: ['TLOValidationStatus', 'TLO_Validation_Status', 'TLOStatus'],
  policyEligibilityDecision: ['PolicyEligibilityDecision'],
  policyReviewNotes: ['PolicyReviewNotes'],
  livingBenefitRiders: ['LivingBenefitsRider', 'livingbenefitsrider', 'LivingBenefitRiders', 'livingBenefitRiders', 'LivingBenefitRider', 'livingBenefitRider', 'Riders', 'riders', 'LivingBenefit_Riders'],
  requiredClaimProof: ['RequiredClaimProof', 'requiredClaimProof'],
  beneficiaryBase: ['BeneficiaryBase'],
  beneficiaryTotal: ['BeneficiaryTotal'],
  interestCredit: ['InterestCredit'],
  federalWithholding: ['FederalWithholding'],
  stateWithholding: ['StateWithholding'],
  outstandingDeductions: ['OutstandingDeductions'],
  currentState: ['CurrentState', 'currentState', 'current_state', 'CaseStage', 'caseStage'],
  beneficiaryReviewed: ['BeneficiaryReviewed', 'beneficiaryReviewed', 'beneficiary_reviewed'],
  eligibilityReviewed: ['EligibilityReviewed', 'eligibilityReviewed', 'eligibility_reviewed'],
  qaReviewed: ['QAReviewed', 'qaReviewed', 'qa_reviewed'],
} as const;

export type DfFieldKey = keyof typeof DF_FIELDS;

/**
 * Get a field value from a Data Fabric record, trying multiple possible field names.
 * Returns the first non-null, non-undefined value found.
 */
export function getDfField(
  record: Record<string, unknown> | null | undefined,
  field: DfFieldKey
): string | number | undefined {
  if (!record) return undefined;
  const keys = DF_FIELDS[field];
  for (const key of keys) {
    const val = record[key];
    if (val !== undefined && val !== null) {
      return typeof val === 'number' ? val : String(val);
    }
  }
  return undefined;
}

/**
 * Determine if a DF record represents a completed claim.
 * Uses CaseStage/ClaimStage if present; otherwise infers from Status.
 */
export function isClaimCompleted(record: Record<string, unknown> | null | undefined): boolean {
  if (!record) return false;
  const stage = getDfField(record, 'caseStage');
  const status = getDfField(record, 'status');
  const stageStr = stage !== undefined ? String(stage).toLowerCase() : '';
  const statusStr = status !== undefined ? String(status).toLowerCase() : '';
  // Explicit stage values
  if (stageStr && ['completed', 'closed', 'paid', 'settled', 'done', 'finished'].some(s => stageStr.includes(s))) return true;
  if (stageStr && ['in progress', 'inprogress', 'pending', 'open', 'active'].some(s => stageStr.includes(s))) return false;
  // Infer from status
  if (statusStr && ['completed', 'closed', 'paid', 'settled', 'ready to pay', 'approved'].some(s => statusStr.includes(s))) return true;
  return false;
}

/**
 * Get a field value as string, with optional fallback.
 */
export function getDfFieldString(
  record: Record<string, unknown> | null | undefined,
  field: DfFieldKey,
  fallback = ''
): string {
  const val = getDfField(record, field);
  return val !== undefined ? String(val) : fallback;
}

type UiPathLike = {
  getToken?: () => string | undefined;
  config?: { baseUrl?: string; orgName?: string; tenantName?: string };
};

/**
 * Update exactly one Data Fabric record using the single-record endpoint path:
 * POST .../datafabric_/api/EntityService/entity/{entityId}/update/{recordId}
 */
export async function updateSingleDfRecord(
  sdk: UiPathLike,
  entityId: string,
  recordId: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  const token = sdk?.getToken?.();
  if (!token) throw new Error('No auth token available for Data Fabric update.');

  const envBaseUrl = import.meta.env.VITE_UIPATH_BASE_URL as string | undefined;
  const envOrg = import.meta.env.VITE_UIPATH_ORG_NAME as string | undefined;
  const envTenant = import.meta.env.VITE_UIPATH_TENANT_NAME as string | undefined;

  const baseUrl = (envBaseUrl || sdk?.config?.baseUrl || '').replace(/\/+$/, '');
  const orgName = envOrg || sdk?.config?.orgName || '';
  const tenantName = envTenant || sdk?.config?.tenantName || '';

  if (!baseUrl || !orgName || !tenantName) {
    throw new Error('Missing baseUrl/orgName/tenantName for Data Fabric single-record update.');
  }

  const url =
    `${baseUrl}/${encodeURIComponent(orgName)}/${encodeURIComponent(tenantName)}` +
    `/datafabric_/api/EntityService/entity/${encodeURIComponent(entityId)}/update/${encodeURIComponent(recordId)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    credentials: 'include',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`DF single-record update failed (${response.status}): ${text || response.statusText}`);
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}
