import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getCaseInstances, type CaseInstanceRecord } from '../services/caseManagement';
import { getDfFieldString } from '../utils/data-fabric';
import type { CaseModel, Policy, WorkflowStep } from '../types';

const STEP_TO_STATE: Record<WorkflowStep, string> = {
  'summary': 'Summary',
  'policy-review': 'Policy Review',
  'beneficiaries': 'Beneficiary Research',
  'doc-validation': 'Doc Validation',
  'payout': 'Payout',
};

export type { WorkflowStep };

type UseCase = {
  currentCase: CaseModel | null;
  policies: Policy[];
  selectedPolicy: Policy | null;
  selectPolicy: (id: string) => void;
  refreshCase: () => Promise<void>;
  // Case Management instances (primary source for case selector)
  caseInstances: CaseInstanceRecord[];
  selectedCaseInstance: CaseInstanceRecord | null;
  selectCaseInstance: (instance: CaseInstanceRecord) => void;
  /** Maestro case instance ID (for Case Management embed linkage) */
  selectedCaseInstanceId: string | null;
  // Legacy: Data Fabric records (kept for downstream screens that may still use DF)
  dfRecords: any[];
  selectedDfRecord: any | null;
  // Workflow tracking
  currentStep: WorkflowStep;
  completedSteps: WorkflowStep[];
  setCurrentStep: (step: WorkflowStep) => void;
  completeStep: (step: WorkflowStep) => void;
  moveToNextStep: () => void;
  completeAllSteps: () => void;
  setCaseStatus: (status: string) => void;
  setPolicyStatus: (policyId: string, status: string) => void;
  currentState: string | null;
  setCurrentState: (state: string) => void;
  refreshDfRecords: () => Promise<void>;
  refreshCaseInstances: () => Promise<void>;
  closeCaseInstance: (instanceId: string, comment?: string) => Promise<void>;
};

const CaseContext = createContext<UseCase | undefined>(undefined);

export const CaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [policies, setPolicies] = useState<Policy[]>([
    { id: '1', policyNumber: 'TL-70008000', productType: 'Term Life', faceValue: 500000, status: 'In Policy Review', claimEffectiveDate: '2025-07-01', requiredClaimProof: ['Death Certificate'], riders: ['Waiver of Premium'], eligibilityChecks: [ { id: 'c1', name: 'Age Check', aiStatus: 'Pass', description: 'Decedent age within limits' }, { id: 'c2', name: 'Cause of Death Check', aiStatus: 'Review', description: 'Cause requires human review' } ] },
    { id: '2', policyNumber: 'UL-3829104-B', productType: 'Universal Life', faceValue: 250000, status: 'Docs Pending', claimEffectiveDate: '2025-06-01', requiredClaimProof: ['Death Certificate', 'Policy Contract'], riders: [], eligibilityChecks: [ { id: 'c3', name: 'Policy Lapse Check', aiStatus: 'Pass', description: 'Policy active at time of death' } ] },
  ]);

  const [currentCase, setCurrentCase] = useState<CaseModel>({
    id: 'CASE-2025-0001',
    caller: { name: 'Anna J Anderson', relationship: 'Daughter', phone: '(555) 555-0142', address: '1354 Smith Street NW, Eagle, NM 46661' },
    channel: 'Phone',
    decedentName: 'Susan Anderson',
    dateOfDeath: '2025-07-31',
    locationOfDeath: 'Arizona',
    causeOfDeath: 'Cardiac Arrest',
    status: 'In Policy Review',
    agingDays: 3,
    priority: 'Normal',
    assignedAnalyst: 'J. Smith',
    queue: 'FNOD-Queue',
    policyCount: policies.length,
    fnodDateTime: '2025-07-31T12:34:00Z',
    flags: {
      highAmount: false,
      foreignDeath: false,
      fraudRisk: false,
      contestable: false,
      suicideClause: false,
    }
  });

  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(policies.length ? policies[0].id : null);
  const { sdk, isAuthenticated } = useAuth();

  const [caseInstances, setCaseInstances] = useState<CaseInstanceRecord[]>([]);
  const [selectedCaseInstanceId, setSelectedCaseInstanceId] = useState<string | null>(null);
  const [dfRecords, setDfRecords] = useState<any[]>([]);
  const [selectedDfRecordId, setSelectedDfRecordId] = useState<string | null>(null);
  
  // Workflow step tracking
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('summary');
  const [completedSteps, setCompletedSteps] = useState<WorkflowStep[]>([]);
  const [currentState, setCurrentState] = useState<string | null>(null);

  const caseDefinitionId = import.meta.env.VITE_UIPATH_CASE_DEFINITION_ID || 'f7b40b11-f5e3-4fc6-9bb2-bd9c627306b7';
  const folderKey = import.meta.env.VITE_UIPATH_FOLDER_KEY || 'e23f4bf5-eff2-4d6d-a9ba-ebe82be1df38';
  const processKey = import.meta.env.VITE_UIPATH_PROCESS_KEY?.trim() || undefined;
  // Only filter by version when explicitly set; leave unset to see all cases (avoids excluding cases on other versions)
  const packageVersion = import.meta.env.VITE_UIPATH_CASE_VERSION?.trim() || undefined;

  const loadCases = useCallback(async () => {
    if (!sdk || !isAuthenticated) return;
    try {
      const items = await getCaseInstances(sdk, {
        caseDefinitionId,
        folderKey,
        processKey,
        ...(packageVersion && { packageVersion }),
        pageSize: 200
      });
      setCaseInstances(items || []);
    } catch (e) {
      console.error('[CaseContext] Failed to load Case Management instances:', e);
    }
  }, [sdk, isAuthenticated, caseDefinitionId, folderKey, processKey, packageVersion]);

  // Load case instances from Case Management (primary source for case selector)
  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  const loadDfRecords = useCallback(async () => {
    const entityId = import.meta.env.VITE_UIPATH_ENTITY_ID;
    if (!entityId || !sdk || !isAuthenticated) return;
    try {
      const res: any = await sdk.entities.getRecordsById(entityId as string, { pageSize: 200 });
      let items: any[] = [];
      if (Array.isArray(res)) items = res;
      else if (res?.items) items = res.items;
      else if (res?.data) items = res.data;
      setDfRecords(items || []);
    } catch (e) {
      console.error('[CaseContext] Failed to load Data Fabric records:', e);
    }
  }, [sdk, isAuthenticated]);

  useEffect(() => {
    loadDfRecords();
  }, [loadDfRecords]);

  const selectedCaseInstance = caseInstances.find(c => String(c.instanceId) === String(selectedCaseInstanceId)) ?? null;
  const selectedDfRecord = dfRecords.find(r => String(r.id || r.Id) === String(selectedDfRecordId)) ?? null;

  const selectedPolicy = policies.find(p => p.id === selectedPolicyId) ?? null;

  const selectPolicy = (id: string) => {
    setSelectedPolicyId(id);
  };

  const selectCaseInstance = (instance: CaseInstanceRecord) => {
    setSelectedCaseInstanceId(instance.instanceId);
    const instanceId = String(instance.instanceId ?? '');
    const caseIdTrailing = instanceId.match(/-(\d+)$/)?.[1] ?? (instanceId.match(/^\d+$/) ? instanceId : '');
    const match = dfRecords.find((r: any) => {
      const caseInst = String(r.CaseInstanceId ?? r.caseInstanceId ?? r.InstanceId ?? r.instanceId ?? '');
      const caseIdVal = String(r.CaseID ?? r.CaseId ?? r.caseId ?? r.CaseNumber ?? r.caseNumber ?? r.ClaimNumber ?? r.claimNumber ?? '');
      const dfTrailing = caseIdVal.match(/-(\d+)$/)?.[1] ?? (caseIdVal.match(/^\d+$/) ? caseIdVal : null);
      const exactMatch = caseInst === instanceId || caseIdVal === instanceId || String(r.Id ?? r.id) === instanceId;
      const trailingMatch = dfTrailing && caseIdTrailing && (dfTrailing === caseIdTrailing || dfTrailing === instanceId.match(/-(\d+)$/)?.[1]);
      // GUID partial match: CaseNumber/CaseInstanceId may be truncated in display; match if one contains the other
      const guidPartialMatch = (caseInst && instanceId && (caseInst.includes(instanceId) || instanceId.includes(caseInst))) ||
        (caseIdVal && instanceId && (caseIdVal.includes(instanceId) || instanceId.includes(caseIdVal)));
      return exactMatch || !!trailingMatch || !!guidPartialMatch;
    });
    setSelectedDfRecordId(match ? String(match.Id ?? match.id) : null);
    const status = instance.latestRunStatus || 'In Progress';
    const displayName = instance.instanceDisplayName || instance.caseTitle || instance.instanceId;
    const dfCurrentState = match ? getDfFieldString(match, 'currentState') || getDfFieldString(match, 'caseStage') || null : null;
    setCurrentState(dfCurrentState || null);
    setCurrentCase({
      ...currentCase,
      id: instance.instanceId,
      status,
      currentState: dfCurrentState || undefined,
      decedentName: displayName || currentCase.decedentName || '—',
      caller: { ...currentCase.caller, name: displayName || currentCase.caller?.name || '—' }
    } as CaseModel);
    setSelectedPolicyId(policies.length ? policies[0].id : null);
  };

  const refreshCase = async () => {
    // placeholder for refreshing case/policies from backend
    return Promise.resolve();
  };

  const completeStep = (step: WorkflowStep) => {
    setCompletedSteps(prev => {
      if (!prev.includes(step)) {
        return [...prev, step];
      }
      return prev;
    });
  };

  const moveToNextStep = () => {
    const steps: WorkflowStep[] = ['summary', 'policy-review', 'beneficiaries', 'doc-validation', 'payout'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      // Mark current step as complete
      completeStep(currentStep);
      // Move to next step
      const nextStep = steps[currentIndex + 1];
      setCurrentStep(nextStep);
      setCurrentState(STEP_TO_STATE[nextStep]);
    }
  };

  const completeAllSteps = () => {
    const allSteps: WorkflowStep[] = ['summary', 'policy-review', 'beneficiaries', 'doc-validation', 'payout'];
    setCompletedSteps(allSteps);
    setCurrentState('QA Complete');
  };

  const setCaseStatus = (status: string) => {
    setCurrentCase(prev => prev ? { ...prev, status } : prev);
  };

  const setPolicyStatus = (policyId: string, status: string) => {
    setPolicies(prev => prev.map(p => p.id === policyId ? { ...p, status } : p));
  };

  const refreshDfRecords = useCallback(async () => {
    await loadDfRecords();
  }, [loadDfRecords]);

  const refreshCaseInstances = useCallback(async () => {
    await loadCases();
  }, [loadCases]);

  const closeCaseInstance = useCallback(async (instanceId: string, comment?: string) => {
    if (!sdk?.maestro?.cases?.instances?.close) {
      throw new Error('Case close is not available in this SDK/session.');
    }
    await sdk.maestro.cases.instances.close(instanceId, folderKey, {
      comment: comment ?? 'Closed from FNOD Case Selector',
    });
    if (String(selectedCaseInstanceId) === String(instanceId)) {
      setSelectedCaseInstanceId(null);
      setSelectedDfRecordId(null);
      setCurrentState(null);
    }
    await loadCases();
  }, [sdk, folderKey, selectedCaseInstanceId, loadCases]);

  return (
    <CaseContext.Provider value={{ 
      currentCase, 
      policies, 
      selectedPolicy, 
      selectPolicy, 
      refreshCase, 
      caseInstances,
      selectedCaseInstance,
      selectCaseInstance,
      selectedCaseInstanceId,
      dfRecords, 
      selectedDfRecord,
      currentStep,
      completedSteps,
      setCurrentStep,
      completeStep,
      moveToNextStep,
      completeAllSteps,
      setCaseStatus,
      setPolicyStatus,
      currentState,
      setCurrentState,
      refreshDfRecords,
      refreshCaseInstances,
      closeCaseInstance
    }}>
      {children}
    </CaseContext.Provider>
  );
};

export const useCase = () => {
  const ctx = useContext(CaseContext);
  if (!ctx) throw new Error('useCase must be used within CaseProvider');
  return ctx;
};

export default useCase;
