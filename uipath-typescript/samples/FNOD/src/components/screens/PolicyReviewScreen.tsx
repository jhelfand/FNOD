import React, { useState } from 'react';
import { useCase } from '../../contexts/CaseContext';
import { useUiPathSdk } from '../../hooks/useUiPathSdk';
import { useToast } from '../../hooks/use-toast';
import { useAuth } from '../../hooks/useAuth';
import { getDfFieldString, updateSingleDfRecord } from '../../utils/data-fabric';

type EligibilityDecision = 'Eligible' | 'Conditionally Eligible' | 'Not Eligible';

interface PolicyReviewScreenProps {
  onNavigate?: (tab: string) => void;
}

export const PolicyReviewScreen: React.FC<PolicyReviewScreenProps> = ({ onNavigate }) => {
  const { currentCase, selectedPolicy, refreshCase, selectedDfRecord, dfRecords, completeStep, moveToNextStep, refreshDfRecords } = useCase();
  const { services } = useUiPathSdk();
  const { toast } = useToast();
  const { sdk } = useAuth();

  const [analystDecision, setAnalystDecision] = useState<EligibilityDecision | ''>('');
  const [reasonCode, setReasonCode] = useState('');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [requiresFollowUp, setRequiresFollowUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dfData, setDfData] = useState<any>(null);
  const [causeOfDeathApproval, setCauseOfDeathApproval] = useState<string>('');

  // Clear dfData when selected policy or DF record changes
  React.useEffect(() => {
    setDfData(null);
  }, [selectedPolicy?.id, selectedDfRecord?.Id, selectedDfRecord?.id]);

  // Query DF for policy data - lineage: only use records that match the selected case
  React.useEffect(() => {
    const loadPolicyDfData = async () => {
      if (!sdk) return;

      // selectedDfRecord is the case-linked record from Case Selector - use it as primary source
      if (selectedDfRecord) {
        const dfPolicyNumber = selectedDfRecord?.PolicyNumber || selectedDfRecord?.policyNumber;
        const selectedPolicyNumber = selectedPolicy?.policyNumber?.replace(/^TL-/, '');
        const policyNumeric = dfPolicyNumber || selectedPolicyNumber;
        const selectedMatchesPolicy =
          policyNumeric &&
          (String(selectedDfRecord.PolicyNumber || selectedDfRecord.policyNumber || '').includes(policyNumeric) ||
            policyNumeric.includes(String(selectedDfRecord.PolicyNumber || selectedDfRecord.policyNumber || '')));
        if (selectedMatchesPolicy) {
          setDfData(selectedDfRecord);
          return;
        }
      }

      const dfPolicyNumber = selectedDfRecord?.PolicyNumber || selectedDfRecord?.policyNumber;
      const selectedPolicyNumber = selectedPolicy?.policyNumber?.replace(/^TL-/, '');
      const policyNumeric = dfPolicyNumber || selectedPolicyNumber;
      if (!policyNumeric) return;

      const caseInstanceId = String(selectedDfRecord?.CaseInstanceId ?? selectedDfRecord?.caseInstanceId ?? selectedDfRecord?.CaseNumber ?? selectedDfRecord?.caseNumber ?? '');

      // Only consider records that match the selected case (lineage)
      const matchesCase = (item: any) => {
        if (!caseInstanceId) return true;
        const itemCase = String(item.CaseInstanceId ?? item.caseInstanceId ?? item.CaseNumber ?? item.caseNumber ?? '');
        return itemCase === caseInstanceId || itemCase.includes(caseInstanceId) || caseInstanceId.includes(itemCase);
      };
      const findMatch = (items: any[]) =>
        items.find(
          (item) =>
            matchesCase(item) &&
            (() => {
              const itemPolicyNum = String(item.PolicyNumber || item.policyNumber || item.PolicyNumberBeneficiary || '');
              return itemPolicyNum === policyNumeric || itemPolicyNum.includes(policyNumeric) || policyNumeric.includes(itemPolicyNum);
            })()
        );

      // First try: use pre-loaded dfRecords from CaseContext, filtered by case
      const fromContext = findMatch(dfRecords || []);
      if (fromContext) {
        setDfData(fromContext);
        return;
      }

      try {
        const entityId = import.meta.env.VITE_UIPATH_ENTITY_ID;
        if (!entityId) return;

        // Query filtered by case when we have selectedDfRecord (lineage)
        let items: any[] = [];
        if (caseInstanceId) {
          try {
            const res: any = await sdk.entities.getRecordsById(entityId as string, {
              filter: `CaseInstanceId eq '${caseInstanceId}' or CaseNumber eq '${caseInstanceId}'`,
              pageSize: 100,
            });
            if (Array.isArray(res)) items = res;
            else if (res?.items) items = res.items;
            else if (res?.data) items = res.data;
          } catch {
            /* filter may fail */
          }
        }
        if (items.length === 0) {
          const res: any = await sdk.entities.getRecordsById(entityId as string, { pageSize: 200 });
          items = Array.isArray(res) ? res : res?.items ?? res?.data ?? [];
        }
        const match = findMatch(items);
        if (match) setDfData(match);
      } catch (error) {
        console.error('[PolicyReviewScreen] Failed to load DF data:', error);
      }
    };

    loadPolicyDfData();
  }, [selectedPolicy, selectedDfRecord, dfRecords, sdk]);

  // Debug: Log DF record fields and Data Fabric values
  React.useEffect(() => {
    const record = dfData || selectedDfRecord;
    if (record) {
      console.debug('[PolicyReviewScreen] Active DF Record:', record);
      console.debug('[PolicyReviewScreen] All DF keys:', Object.keys(record));
      console.debug('[PolicyReviewScreen] ProductType:', record.ProductType ?? record.productType);
      console.debug('[PolicyReviewScreen] LivingBenefitsRider:', record.LivingBenefitsRider ?? record.livingBenefitRiders);
      console.debug('[PolicyReviewScreen] PhoneNumber:', record.PhoneNumber ?? record.Phone ?? record.FNODPhone);
    }
  }, [dfData, selectedDfRecord]);

  if (!currentCase || !selectedPolicy) return null;

  const dfRecord = dfData || selectedDfRecord;
  // For case-level fields (Phone, ProductType, LivingBenefits), fall back to selectedDfRecord when
  // dfData is policy-specific and lacks them — Summary uses selectedDfRecord directly and gets the data.
  const dfForCaseFields = selectedDfRecord ?? dfRecord;
  const policyStatus = getDfFieldString(dfRecord, 'status', '') || selectedPolicy.status;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);
  };

  const handleSendToBeneficiaryResearch = async () => {
    setIsLoading(true);
    try {
      // Update backend policy
      await services.updatePolicy(selectedPolicy.id, { analystDecision: analystDecision || undefined, decisionReasonCode: reasonCode, decisionNotes, requiresFollowUp });
      
      // Complete workflow and navigate immediately so user gets instant feedback
      completeStep('policy-review');
      moveToNextStep();
      toast({ title: 'Policy Review Complete', description: 'Moving to Beneficiary Research.' });
      onNavigate?.('beneficiaries');
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to update policy. Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }

    // Update Data Fabric - use selectedDfRecord (case-linked from Case Selector) so we update the correct case.
    // dfData is policy-number-based and can return a different record (e.g. beneficiary row) when multiple records share the same policy.
    const dfRecordToUpdate = selectedDfRecord;
    const recordId = dfRecordToUpdate?.Id ?? dfRecordToUpdate?.id;
    const entityId = import.meta.env.VITE_UIPATH_ENTITY_ID;
    if (sdk && dfRecordToUpdate && recordId && entityId) {
      const updateData = {
        id: String(recordId),
        Id: recordId,
        EligibilityReviewed: 'yes',
      };
      console.log('[PolicyReviewScreen] Data Fabric update - entityId:', entityId, 'recordId:', recordId, 'payload:', updateData);
      updateSingleDfRecord(
        sdk as any,
        entityId,
        String(recordId),
        updateData
      )
        .then((result) => {
          console.log('[PolicyReviewScreen] Data Fabric update success:', result);
          return refreshDfRecords();
        })
        .catch((dfError) => {
          console.error('[PolicyReviewScreen] Data Fabric update failed:', dfError);
          toast({ title: 'Warning', description: 'Data Fabric sync failed. Case progressed but DF was not updated.', variant: 'destructive' });
        });
    } else {
      console.warn('[PolicyReviewScreen] Skipping Data Fabric update - missing:', { sdk: !!sdk, dfRecord: !!dfRecordToUpdate, recordId, entityId: !!entityId });
    }
  };

  const handleMarkComplete = async () => {
    setIsLoading(true);
    try {
      await services.updatePolicy(selectedPolicy.id, { status: 'Ready to Pay', analystDecision: analystDecision || undefined, decisionReasonCode: reasonCode, decisionNotes });
      // Mark workflow step as complete and move to next
      completeStep('policy-review');
      moveToNextStep();
      toast({ title: 'Policy Review Marked Complete', description: 'The policy review stage has been completed.' });
      await refreshCase();
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to mark complete. Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Agentic Output Section */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-base font-semibold">Agentic Output</span>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Left column: Policy Eligibility Decision */}
          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-sm text-gray-700 font-semibold flex items-center gap-2">
                Policy Eligibility Decision
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800 border border-green-200">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1" fill="none" />
                    <path d="M8 12.5l2 2 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                  <span>Pass</span>
                </span>
              </h4>
            </div>

            <div className="mt-3 text-sm text-gray-600">
              Policy meets all eligibility criteria based on automated analysis. No red flags detected in documentation review. All eligibility checks passed successfully with high confidence scores.
            </div>

            <p className="mt-4 text-sm text-gray-600 mb-2 font-semibold">Recommended Actions</p>
            <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
              <li>verify_coverage: Confirm policy was in force on date of death</li>
              <li>check_exclusions: Review cause of death against policy exclusions</li>
            </ol>
          </div>

          {/* Right column: Rationale */}
          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-sm text-gray-700 font-semibold">Rationale</h4>
            </div>

            <div className="mt-3 text-sm text-gray-600">
              The policy has been verified as active with no lapses. All premium payments are current. Death certificate shows natural causes which are covered under the policy terms. No contestability period or suicide clause concerns identified. Face value and beneficiary designations are properly documented. Policy is cleared for standard processing to beneficiary research stage.
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-5 bg-white rounded-lg shadow p-4">
          <div className="text-base font-medium mb-2">FNOD Context</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="data-label">Decedent</p>
              <div className="text-base">{(selectedDfRecord || dfData)?.DecedentName ?? (selectedDfRecord || dfData)?.decedentName ?? currentCase.decedentName}</div>
            </div>
            <div>
              <p className="data-label">Date of Death</p>
              <div className="text-base">{new Date((dfData || selectedDfRecord)?.DateOfDeath || (dfData || selectedDfRecord)?.dateOfDeath || currentCase.dateOfDeath).toLocaleDateString()}</div>
            </div>
            <div>
              <p className="data-label">Location</p>
              <div className="text-base">{(dfData || selectedDfRecord)?.deathlocation || (dfData || selectedDfRecord)?.LocationOfDeath || (dfData || selectedDfRecord)?.locationOfDeath || currentCase.locationOfDeath}</div>
            </div>
            <div>
              <p className="data-label">Caller</p>
              <div className="text-base">{(dfData || selectedDfRecord)?.FNODCaller || (dfData || selectedDfRecord)?.CallerName || (dfData || selectedDfRecord)?.callerName || currentCase.caller.name}</div>
            </div>
            <div>
              <p className="data-label">Phone</p>
              <div className="text-base">{getDfFieldString(dfRecord, 'callerPhone') || getDfFieldString(dfForCaseFields, 'callerPhone') || (dfRecord as any)?.PhoneNumber || (dfForCaseFields as any)?.PhoneNumber || <span className="text-muted-foreground italic">— Data Fabric</span>}</div>
            </div>
            <div>
              <p className="data-label">Relationship</p>
              <div className="text-base">{(dfData || selectedDfRecord)?.RelationshipDoc || (dfData || selectedDfRecord)?.CallerRelationship || (dfData || selectedDfRecord)?.callerRelationship || currentCase.caller.relationship}</div>
            </div>
            <div>
              <p className="data-label">Cause of Death</p>
              <div className="text-base">{(dfData || selectedDfRecord)?.CauseOfDeath || (dfData || selectedDfRecord)?.causeOfDeath || currentCase.causeOfDeath || '—'}</div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-7 bg-white rounded-lg shadow p-4">
          <div className="text-base font-medium mb-2">Policy Details</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="data-label">Policy Number</p>
              <div className="text-base font-mono">{(selectedDfRecord || dfData)?.PolicyNumber ?? (selectedDfRecord || dfData)?.policyNumber ?? '-'}</div>
            </div>
            <div>
              <p className="data-label">Product Type</p>
              <div className="text-base">{getDfFieldString(dfRecord, 'policyType') || getDfFieldString(dfForCaseFields, 'policyType') || (dfRecord as any)?.ProductType || (dfForCaseFields as any)?.ProductType || <span className="text-muted-foreground italic">— Data Fabric</span>}</div>
            </div>
            <div>
              <p className="data-label">Status</p>
              <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${policyStatus === 'In Policy Review' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
                {policyStatus || '—'}
              </div>
            </div>
            <div>
              <p className="data-label">Face Value</p>
              <div className="text-base">{formatCurrency((dfData || selectedDfRecord)?.PolicyValues || (dfData || selectedDfRecord)?.policyvalue1 || (dfData || selectedDfRecord)?.PolicyValue || (dfData || selectedDfRecord)?.FaceValue || (dfData || selectedDfRecord)?.faceValue || selectedPolicy.faceValue)}</div>
            </div>
            <div>
              <p className="data-label">Living Benefit Riders</p>
              <div className="text-base">{getDfFieldString(dfRecord, 'livingBenefitRiders') || getDfFieldString(dfForCaseFields, 'livingBenefitRiders') || (dfRecord as any)?.LivingBenefitsRider || (dfForCaseFields as any)?.LivingBenefitsRider || <span className="text-muted-foreground italic">— Data Fabric</span>}</div>
            </div>
            <div>
              <p className="data-label">Required Claim Proof</p>
              <div className="text-base">
                {(() => {
                  const raw = (dfRecord as any)?.RequiredClaimProof ?? (dfRecord as any)?.requiredClaimProof;
                  if (Array.isArray(raw) && raw.length > 0) return raw.join(', ');
                  if (raw && typeof raw === 'string') return raw;
                  const policyProof = selectedPolicy.requiredClaimProof;
                  if (Array.isArray(policyProof) && policyProof.length > 0) return policyProof.join(', ');
                  return '—';
                })()}
              </div>
            </div>
            {selectedPolicy.accountValue && (
              <div>
                <p className="data-label">Account Value</p>
                <div className="text-base">{formatCurrency(selectedPolicy.accountValue)}</div>
              </div>
            )}
            <div>
              <p className="data-label">Claim Effective Date</p>
              <div className="text-base">{(selectedDfRecord || dfData)?.FNODDate ?? '-'}</div>
            </div>
          </div>

          {(selectedPolicy.hasLoans || selectedPolicy.hasWithdrawals) && (
            <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-100">
              <p className="text-sm font-medium text-yellow-700">Outstanding Obligations</p>
              <div className="flex gap-6 mt-2">
                {selectedPolicy.hasLoans && (
                  <div>
                    <p className="data-label">Loan Balance</p>
                    <div className="text-base">{formatCurrency(selectedPolicy.loanAmount || 0)}</div>
                  </div>
                )}
                {selectedPolicy.hasWithdrawals && (
                  <div>
                    <p className="data-label">Prior Withdrawals</p>
                    <div className="text-base">{formatCurrency(selectedPolicy.withdrawalAmount || 0)}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {(() => {
        // Check if CauseofDeathCheck is "Yes" from Data Fabric
        const causeOfDeathCheck = (dfData || selectedDfRecord)?.CauseofDeathCheck || (dfData || selectedDfRecord)?.CauseOfDeathCheck;
        const showCauseOfDeathReview = causeOfDeathCheck === 'Yes' || causeOfDeathCheck === 'yes' || causeOfDeathCheck === true || causeOfDeathCheck === 'True';
        
        return showCauseOfDeathReview && (
          <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-4">
            <div className="font-semibold mb-2">AI Review Needed for Cause of Death</div>
            <p className="text-sm text-gray-600 mb-4">The cause of death requires manual review and approval.</p>
            <div className="p-4 bg-white rounded-lg border">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Cause of Death Approval</div>
                  <div className="text-sm text-gray-500">Review and approve the cause of death</div>
                </div>
                <div className="flex items-center gap-2">
                  <select 
                    className="h-10 px-3 text-sm border rounded min-w-[200px]" 
                    value={causeOfDeathApproval} 
                    onChange={(e) => setCauseOfDeathApproval(e.target.value)}
                  >
                    <option value="">Select approval status</option>
                    <option value="Approved">✓ Approved</option>
                    <option value="Rejected">✗ Rejected</option>
                    <option value="Needs Further Review">⚠ Needs Further Review</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-4 space-y-4">
            <div>
              <label className="block text-sm text-gray-600">Decision</label>
              <select className="w-full h-10 mt-2" value={analystDecision} onChange={(e) => setAnalystDecision(e.target.value as EligibilityDecision)}>
                <option value="">Select decision</option>
                <option value="Eligible">Eligible</option>
                <option value="Conditionally Eligible">Conditionally Eligible</option>
                <option value="Not Eligible">Not Eligible</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600">Reason Code</label>
              <select className="w-full h-10 mt-2" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                <option value="">Select reason</option>
                <option value="all_checks_passed">All Checks Passed</option>
                <option value="manual_review_approved">Manual Review Approved</option>
                <option value="docs_pending">Documentation Pending</option>
                <option value="policy_lapsed">Policy Lapsed</option>
                <option value="exclusion_applies">Exclusion Applies</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input id="followup" type="checkbox" checked={requiresFollowUp} onChange={(e) => setRequiresFollowUp(e.target.checked)} />
              <label htmlFor="followup" className="text-sm">Requires follow-up?</label>
            </div>
          </div>
          <div className="col-span-12 lg:col-span-8 space-y-2">
            <label className="block text-sm text-gray-600">Notes</label>
            <textarea className="w-full p-2 border rounded" placeholder="Add decision notes..." value={decisionNotes} onChange={(e) => setDecisionNotes(e.target.value)} rows={5} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t">
          <button className="px-4 py-2 border rounded text-sm font-medium hover:bg-gray-50" disabled={isLoading}>Create Maestro Task</button>
          <button 
            className="px-6 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed" 
            onClick={handleSendToBeneficiaryResearch} 
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : 'Complete & Continue to Beneficiary Research'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PolicyReviewScreen;
