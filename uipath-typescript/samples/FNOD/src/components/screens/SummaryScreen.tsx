import React, { useEffect, useMemo, useState } from 'react';
import { useCase } from '../../contexts/CaseContext';
import { useAuth } from '../../hooks/useAuth';
import { useDataFabricCase } from '../../hooks/useDataFabricCase';
import { Button } from '../ui/button';
import { useToast } from '../../hooks/use-toast';
import IndividualPoliciesModal from './IndividualPoliciesModal';
import { CurrentStatePill } from '../shared/CurrentStatePill';

interface SummaryScreenProps {
  onNavigate?: (tab: string) => void;
  /** When false, agent is rendered by parent (for preload). Default true for backwards compat. */
  includeAgent?: boolean;
}

export const SummaryScreen: React.FC<SummaryScreenProps> = ({ onNavigate, includeAgent = true }) => {
  const { currentCase, policies, selectPolicy, selectedDfRecord, selectedCaseInstanceId, completeStep, moveToNextStep, currentState } = useCase();
  const { sdk } = useAuth();
  const { caseFromDF, dfRecord: dfRecordFromHook, loading: dfLoading, error: dfError, getFieldSource, placeholderNote } = useDataFabricCase(
    currentCase?.id,
    selectedCaseInstanceId ?? undefined,
    sdk
  );

  /** Merged case: currentCase with Data Fabric overrides where present */
  const mergedCase = useMemo(() => {
    if (!currentCase) return null;
    if (!caseFromDF) return currentCase;
    const base = { ...currentCase };
    if (caseFromDF.decedentName != null) base.decedentName = caseFromDF.decedentName;
    if (caseFromDF.dateOfDeath != null) base.dateOfDeath = caseFromDF.dateOfDeath;
    if (caseFromDF.locationOfDeath != null) base.locationOfDeath = caseFromDF.locationOfDeath;
    if (caseFromDF.causeOfDeath != null) base.causeOfDeath = caseFromDF.causeOfDeath;
    if (caseFromDF.status != null) base.status = caseFromDF.status;
    if (caseFromDF.agingDays != null) base.agingDays = caseFromDF.agingDays;
    if (caseFromDF.priority != null) base.priority = caseFromDF.priority;
    if (caseFromDF.assignedAnalyst != null) base.assignedAnalyst = caseFromDF.assignedAnalyst;
    if (caseFromDF.queue != null) base.queue = caseFromDF.queue;
    if (caseFromDF.caller) base.caller = { ...base.caller, ...caseFromDF.caller };
    return base;
  }, [currentCase, caseFromDF]);
  const { toast } = useToast();
  const [dfCaseId, setDfCaseId] = useState<string | null>(null);
  const [dfCallerName, setDfCallerName] = useState<string | null>(null);
  const [dfCallerPhone, setDfCallerPhone] = useState<string | null>(null);
  const [dfDecedentName, setDfDecedentName] = useState<string | null>(null);
  const [dfPolicyNumber, setDfPolicyNumber] = useState<string | null>(null);
  const [dfPolicyType, setDfPolicyType] = useState<string | null>(null);
  const [dfPolicyValue, setDfPolicyValue] = useState<number | null>(null);
  const [policiesModalOpen, setPoliciesModalOpen] = useState(false);
  const [selectedIndividual, setSelectedIndividual] = useState<{ name: string; type: 'decedent' | 'caller' } | null>(null);

  if (!currentCase || !mergedCase) return null;
  const displayCase = mergedCase;

  useEffect(() => {
    const getField = (obj: any, keys: string[]) => {
      for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null) return obj[k];
      }
      return null;
    };
    // Lineage: use case-linked record - selectedDfRecord or dfRecordFromHook (both filtered by case)
    const record = selectedDfRecord ?? (dfRecordFromHook as any);
    if (record) {
      setDfCaseId(record.Id ?? record.id ?? record.CaseNumber ?? record.caseId ?? '#placeholder');
      setDfDecedentName(record?.DecedentName ?? record?.decedentName ?? '#placeholder');
      setDfCallerName(getField(record, ['FNODCaller', 'CallerName', 'Caller', 'callerName']) ?? '#placeholder');
      setDfCallerPhone(getField(record, ['phonenumber', 'PhoneNumber', 'FNODPhone', 'CallerPhone', 'Caller_Phone', 'Phone', 'callerPhone']) ?? '#placeholder');
      setDfPolicyNumber(record?.PolicyNumber ?? record?.policyNumber ?? '#placeholder');
      setDfPolicyType(getField(record, ['PolicyType', 'ProductType', 'productType']) ?? '#placeholder');
      const faceValue = getField(record, ['PolicyValues', 'policyvalue1', 'PolicyValue', 'FaceValue', 'faceValue', 'Amount']);
      setDfPolicyValue(faceValue ? Number(faceValue) : null);
    } else {
      setDfCaseId(null);
      setDfDecedentName(null);
      setDfCallerName(null);
      setDfCallerPhone(null);
      setDfPolicyNumber(null);
      setDfPolicyType(null);
      setDfPolicyValue(null);
    }
  }, [selectedDfRecord, dfRecordFromHook]);

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'In Policy Review': return 'status-badge status-badge-review';
      case 'Docs Pending': return 'status-badge status-badge-pending';
      case 'Ready to Pay': return 'status-badge status-badge-ready';
      case 'Pending Payment': return 'status-badge bg-warning/15 text-warning';
      case 'Paid': return 'status-badge status-badge-paid';
      default: return 'status-badge status-badge-review';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getShortStatus = (status: string) => {
    switch (status) {
      case 'In Policy Review':
        return 'In Review';
      case 'Docs Pending':
        return 'Docs Pending';
      case 'Ready to Pay':
        return 'Ready';
      case 'Pending Payment':
        return 'Pending Payment';
      case 'Paid':
        return 'Paid';
      default:
        return status;
    }
  };

  return (
    <div className="grid grid-cols-12 gap-6 animate-slide-up">
      {/* Data Fabric status banners */}
      {selectedCaseInstanceId && (
        <>
          {dfLoading && (
            <div className="col-span-12 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              Loading Data Fabric record for this case…
            </div>
          )}
          {!dfLoading && dfError && (
            <div className="col-span-12 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              Data Fabric: could not load record ({dfError}). Update Data Fabric / VITE_UIPATH_ENTITY_ID to populate case data.
            </div>
          )}
          {!dfLoading && !dfError && !caseFromDF && selectedCaseInstanceId && (
            <div className="col-span-12 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              Data Fabric: no record found for this case. Update Data Fabric to add a record matching this case ID / instance ID.
            </div>
          )}
        </>
      )}
      <div className="col-span-12 lg:col-span-5 space-y-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">FNOD Call</div>
          </div>
          <div>
            <p className="data-label">Caller</p>
            <button
              onClick={() => {
                const callerName = dfCallerName || displayCase.caller.name;
                setSelectedIndividual({ name: callerName, type: 'caller' });
                setPoliciesModalOpen(true);
              }}
              className="font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
            >
              {dfCallerName || displayCase.caller.name}
            </button>
            <p className="text-sm text-gray-500">{displayCase.caller.relationship}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <p className="data-label">Phone</p>
              <p className="font-medium">{dfCallerPhone || displayCase.caller.phone}</p>
            </div>
            <div>
              <p className="data-label">Channel</p>
              <p className="font-medium">{displayCase.channel}</p>
            </div>
          </div>

          <div className="border-t border-gray-100 my-4 pt-4">
            <p className="data-label">Decedent</p>
            <button
              onClick={() => {
                const decedentName = (dfDecedentName && dfDecedentName !== '#placeholder') ? dfDecedentName : displayCase.decedentName;
                setSelectedIndividual({ name: decedentName, type: 'decedent' });
                setPoliciesModalOpen(true);
              }}
              className="text-lg font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
            >
              {(dfDecedentName && dfDecedentName !== '#placeholder') ? dfDecedentName : displayCase.decedentName}
            </button>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <p className="data-label">Date of Death</p>
                <p className="font-medium">{new Date(displayCase.dateOfDeath).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="data-label">Location</p>
                <p className="font-medium">{displayCase.locationOfDeath}</p>
              </div>
            </div>
            <div className="mt-3">
              <p className="data-label">Cause of Death</p>
              <p className="font-medium">{displayCase.causeOfDeath}</p>
            </div>

            {/* Primary Policy moved to Policies panel */}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="font-semibold mb-2">Case Snapshot</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="data-label">Case ID</p>
              <p className="font-medium">{dfCaseId || displayCase.id}</p>
            </div>
            <div>
              <p className="data-label">Status</p>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                displayCase.status === 'In Policy Review' ? 'bg-primary text-primary-foreground' : 
                displayCase.status === 'Pending Payment' ? 'bg-warning text-warning-foreground' : 
                displayCase.status === 'Paid' ? 'bg-success text-success-foreground' :
                'bg-muted text-muted-foreground'
              }`}>{displayCase.status}</span>
            </div>
            <div>
              <p className="data-label">Current State</p>
              <CurrentStatePill state={currentState} />
            </div>
            <div>
              <p className="data-label">Aging</p>
              <p className="text-warning font-medium">{displayCase.agingDays} days</p>
            </div>
            <div>
              <p className="data-label">Priority</p>
              <p className="font-medium">{displayCase.priority}</p>
            </div>
            <div>
              <p className="data-label">Assigned To</p>
              <p className="font-medium">{displayCase.assignedAnalyst || '—'}</p>
              {selectedCaseInstanceId && getFieldSource('assignedAnalyst') === null && !displayCase.assignedAnalyst && (
                <p className="text-xs text-amber-600 mt-0.5" title={placeholderNote}>{placeholderNote}</p>
              )}
            </div>
            <div>
              <p className="data-label">Queue</p>
              <p className="font-medium">{displayCase.queue}</p>
            </div>
          </div>
        </div>
      </div>

      <div className={`col-span-12 flex flex-col gap-4 min-h-[420px] ${includeAgent ? 'lg:col-span-4' : 'lg:col-span-7'}`}>
        <div className="bg-white rounded-lg shadow p-4 flex-1">
          {(() => {
            // Calculate displayPolicies first to get the count
            let displayPolicies: any[] = [];
            
            if (dfPolicyNumber && dfPolicyNumber !== '#placeholder') {
              // Find matching policy from the policies list
              const matchingPolicy = policies.find(p => 
                p.policyNumber.includes(String(dfPolicyNumber)) || 
                String(dfPolicyNumber).includes(p.policyNumber)
              );
              
              if (matchingPolicy) {
                // Override with DF data
                displayPolicies.push({
                  ...matchingPolicy,
                  policyNumber: dfPolicyNumber,
                  productType: dfPolicyType || matchingPolicy.productType,
                  faceValue: dfPolicyValue || matchingPolicy.faceValue
                });
              }
            } else if (policies && policies.length) {
              // Fallback: show all policies if no DF record selected
              displayPolicies.push(...policies);
            }

            // Deduplicate by policy number (in case multiple DF rows exist for same policy due to multiple beneficiaries)
            const seenPolicyNumbers = new Set<string>();
            displayPolicies = displayPolicies.filter(policy => {
              if (seenPolicyNumbers.has(policy.policyNumber)) {
                return false;
              }
              seenPolicyNumbers.add(policy.policyNumber);
              return true;
            });

            return (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold">Policies in Force ({displayPolicies.length})</div>
                </div>
                {/* Unified policies table - uses Data Fabric overrides for the first policy when available
                    Modular: renders multiple rows when multiple policies exist, or a single row built
                    from Data Fabric fields if no policies are present. */}
                <div className="overflow-hidden rounded-md border border-gray-100">
                  <div className="bg-white">
                    <div className="grid grid-cols-12 gap-4 text-sm text-gray-500 pb-2 px-4 pt-3 border-b border-gray-100">
                      <div className="col-span-3">Policy #</div>
                      <div className="col-span-3">Type</div>
                      <div className="col-span-3 text-right">Value</div>
                      <div className="col-span-3 text-right">Status</div>
                    </div>

                    {(() => {
                      if (!displayPolicies.length) {
                        return (
                          <div className="py-4 px-4 text-sm text-gray-600">No policies found for this case.</div>
                        );
                      }

                      return displayPolicies.map((policy) => (
                        <div
                          key={policy.id}
                          className="grid grid-cols-12 gap-4 items-center py-3 px-4 hover:bg-gray-50 cursor-pointer"
                          onClick={() => { typeof policy.id === 'string' && policy.id.startsWith('df') ? null : (selectPolicy(policy.id), onNavigate?.('policy-review')); }}
                        >
                          <div className="col-span-3 text-sm font-medium text-gray-900">{policy.policyNumber}</div>
                          <div className="col-span-3 text-sm text-gray-600">{policy.productType}</div>
                          <div className="col-span-3 text-right font-medium">{formatCurrency(policy.faceValue)}</div>
                          <div className="col-span-3 flex justify-end">
                            <span 
                              title={policy.status} 
                              className={`status-badge ${
                                policy.status === 'In Policy Review' ? 'status-badge-review' :
                                policy.status === 'Pending Payment' ? 'bg-warning/15 text-warning' :
                                policy.status === 'Paid' ? 'status-badge-paid' :
                                'bg-muted text-muted-foreground'
                              }`}
                            >
                              {getShortStatus(policy.status)}
                            </span>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        <div className="bg-white rounded-lg shadow p-4 flex-1">
          <div className="font-semibold mb-2">FNOD Processes</div>
          <div className="space-y-3">
            <button
              className="w-full text-left bg-gray-50 p-3 rounded flex items-center gap-3 hover:bg-gray-100"
              onClick={() => onNavigate?.('policy-review')}
              aria-label="Go to Policy Review"
            >
              <span className="h-7 w-7 flex items-center justify-center rounded-md bg-blue-50 text-blue-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7 7h10M7 17h10" />
                </svg>
              </span>
              <span className="text-sm">Go to Policy Review</span>
            </button>

            <button
              className="w-full text-left bg-gray-50 p-3 rounded flex items-center gap-3 hover:bg-gray-100"
              onClick={() => onNavigate?.('beneficiaries')}
              aria-label="Go to Beneficiary Research"
            >
              <span className="h-7 w-7 flex items-center justify-center rounded-md bg-blue-50 text-blue-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-4-4h-1" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20H4v-2a4 4 0 014-4h1" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11a4 4 0 100-8 4 4 0 000 8z" />
                </svg>
              </span>
              <span className="text-sm">Go to Beneficiary Research</span>
            </button>

            <button
              className="w-full text-left bg-gray-50 p-3 rounded flex items-center gap-3 hover:bg-gray-100"
              onClick={() => onNavigate?.('doc-validation')}
              aria-label="Go to Document Validation"
            >
              <span className="h-7 w-7 flex items-center justify-center rounded-md bg-blue-50 text-blue-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6M9 16h6M12 3v8" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7" />
                </svg>
              </span>
              <span className="text-sm">Go to Document Validation</span>
            </button>

            <button
              className="w-full text-left bg-gray-50 p-3 rounded flex items-center gap-3 hover:bg-gray-100"
              onClick={() => onNavigate?.('payout')}
              aria-label="Go to Payout Calculator"
            >
              <span className="h-7 w-7 flex items-center justify-center rounded-md bg-blue-50 text-blue-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v3m0 12v3" />
                </svg>
              </span>
              <span className="text-sm">Go to Payout Calculator</span>
            </button>
          </div>
        </div>
      </div>

      {includeAgent && (
        <div className="col-span-12 lg:col-span-3 flex flex-col">
          <div className="bg-white rounded-lg shadow p-4 flex-1">
            <div className="font-semibold mb-2">AI Assistant</div>
            <div className="h-full rounded overflow-hidden">
              <iframe
                src="https://staging.uipath.com/uipathlabs/Playground/autopilotforeveryone_/conversational-agents/?agentId=1495241&mode=embedded&title=UiPath Life Conversation Agent&welcomeTitle=Welcome to UiPath Life Conversational Agent. I am able to help research key information for you&welcomeDescription=Talk with your agent to get started."
                className="w-full h-full border-0 rounded"
                title="UiPath Life Conversation Agent"
                allow="microphone"
              />
            </div>
          </div>
        </div>
      )}

      {/* Completion Button */}
      <div className="col-span-12 flex justify-end mt-6">
        <Button
          onClick={() => {
            completeStep('summary');
            moveToNextStep();
            toast({
              title: 'Summary Complete',
              description: 'Moving to Policy Review.',
            });
            onNavigate?.('policy-review');
          }}
          className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-2"
        >
          Complete Summary & Continue
        </Button>
      </div>

      {/* Individual Policies Modal */}
      {selectedIndividual && (
        <IndividualPoliciesModal
          open={policiesModalOpen}
          onClose={() => {
            setPoliciesModalOpen(false);
            setSelectedIndividual(null);
          }}
          individualName={selectedIndividual.name}
          individualType={selectedIndividual.type}
        />
      )}
    </div>
  );
};

export default SummaryScreen;
