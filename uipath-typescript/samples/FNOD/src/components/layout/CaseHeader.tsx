import React from 'react';
import { useCase } from '../../contexts/CaseContext';
import WorkflowBreadcrumb from './WorkflowBreadcrumb';
import { CurrentStatePill } from '../shared/CurrentStatePill';

export const CaseHeader: React.FC = () => {
  const { currentCase, policies, selectedPolicy, selectPolicy, selectedDfRecord, selectedCaseInstanceId, currentState } = useCase();

  if (!currentCase) return null;

  // Calculate actual number of policies for this case from selectedDfRecord
  const policyCount = selectedDfRecord ?
    (policies.filter(p =>
      selectedDfRecord.PolicyNumber &&
      (p.policyNumber.includes(String(selectedDfRecord.PolicyNumber)) ||
       String(selectedDfRecord.PolicyNumber).includes(p.policyNumber))
    ).length || 1) :
    (currentCase.policyCount || policies.length);

  // Get FNOD date from Data Fabric
  const fnodDate = selectedDfRecord?.FNODDate || selectedDfRecord?.fnodDate || currentCase.fnodDateTime || currentCase.dateOfDeath;

  // Case Management embed URL (instance-specific when caseInstanceId available)
  const baseUrl = import.meta.env.VITE_UIPATH_BASE_URL || 'https://staging.uipath.com';
  const orgName = import.meta.env.VITE_UIPATH_ORG_NAME || '82e69757-09ff-4e6d-83e7-d530f2ac4e7b';
  const tenantName = import.meta.env.VITE_UIPATH_TENANT_NAME || 'Playground';
  const caseDefinitionId = import.meta.env.VITE_UIPATH_CASE_DEFINITION_ID || 'f7b40b11-f5e3-4fc6-9bb2-bd9c627306b7';
  const folderKey = import.meta.env.VITE_UIPATH_FOLDER_KEY || 'e23f4bf5-eff2-4d6d-a9ba-ebe82be1df38';
  const caseManagementUrl = selectedCaseInstanceId
    ? `${baseUrl}/${orgName}/${tenantName}/maestro_/cases/${caseDefinitionId}/instances/${selectedCaseInstanceId}?folderKey=${folderKey}`
    : `${baseUrl}/${orgName}/${tenantName}/maestro_/cases/${caseDefinitionId}?folderKey=${folderKey}`;

  // status badge classes were removed to simplify; kept short status helper below

  const getShortStatus = (status: string) => {
    switch (status) {
      case 'In Policy Review':
        return 'In Review';
      case 'Docs Pending':
        return 'Docs Pending';
      case 'Ready to Pay':
        return 'Ready';
      case 'Paid':
        return 'Paid';
      default:
        return status;
    }
  };

  return (
    <div className="bg-[#071829] text-white border-b border-[#102231]">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold">{currentCase.id}</h1>
                <span title={currentCase.status} className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-600 text-white`}>{getShortStatus(currentCase.status)}</span>
                <CurrentStatePill state={currentState} variant="header" title="Current workflow state" />
                {currentCase.priority === 'High' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-400 text-black">High Priority</span>
                )}
              </div>
              <p className="text-sm text-white/75 mt-1">Decedent: <span className="font-medium text-white">{selectedDfRecord?.DecedentName ?? selectedDfRecord?.decedentName ?? currentCase.decedentName}</span></p>
            </div>

            <div className="h-10 w-px bg-white/10" />

            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-white/70">{policyCount} {policyCount === 1 ? 'policy' : 'policies'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white/70">{fnodDate ? (typeof fnodDate === 'string' && !fnodDate.includes('-') ? fnodDate : new Date(fnodDate).toLocaleDateString()) : new Date().toLocaleDateString()} <span className="mx-1">•</span> <span className="text-amber-400">{currentCase.agingDays} days</span></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white/70">{currentCase.assignedAnalyst}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <a
              href={caseManagementUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/20 rounded-md border border-white/20 transition-colors"
              title={selectedCaseInstanceId ? 'View this case in Case Management' : 'Open Case Management'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View in Case Management
            </a>
            <div className="text-sm text-white/70">Active Policy:</div>
            <select className="w-[220px] bg-[#0f3350] border border-[#23415f] text-white rounded-md px-3 py-1" value={selectedPolicy?.id || ''} onChange={(e) => selectPolicy(e.target.value)}>
              <option value="">Select policy</option>
              {policies.map(p => (
                <option key={p.id} value={p.id}>{p.policyNumber} ({p.productType})</option>
              ))}
            </select>
          </div>
        </div>

        {currentCase.flags && Object.entries(currentCase.flags).some(([_, v]) => v) && (
          <div className="flex items-center gap-2 mt-3">
            {currentCase.flags.highAmount && <span className="inline-flex items-center px-3 py-1 rounded-full bg-amber-500 text-black text-xs">High Amount</span>}
            {currentCase.flags.foreignDeath && <span className="inline-flex items-center px-3 py-1 rounded-full bg-slate-700 text-white text-xs">Foreign Death</span>}
            {currentCase.flags.fraudRisk && <span className="inline-flex items-center px-3 py-1 rounded-full bg-rose-500 text-white text-xs">Fraud Risk</span>}
            {currentCase.flags.contestable && <span className="inline-flex items-center px-3 py-1 rounded-full bg-violet-600 text-white text-xs">Contestable</span>}
            {currentCase.flags.suicideClause && <span className="inline-flex items-center px-3 py-1 rounded-full bg-slate-600 text-white text-xs">Suicide Clause</span>}
          </div>
        )}
      </div>
      <WorkflowBreadcrumb />
    </div>
  );
};

export default CaseHeader;
