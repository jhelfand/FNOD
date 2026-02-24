/**
 * Case Management Screen - Embeds the UiPath Maestro Case Management UI
 * Similar to the PC claims workbench / PCFNOL app pattern.
 * When selectedCaseInstanceId is set (from DF record), opens that specific case instance.
 * Otherwise: embed_/org/tenant/maestro_/cases/{caseDefinitionId}?folderKey={folderKey}
 * With instance: embed_/org/tenant/maestro_/cases/{caseDefinitionId}/instances/{caseInstanceId}?folderKey={folderKey}
 */

import { useCase } from '../../contexts/CaseContext';

function CaseManagementScreen() {
  const { selectedCaseInstanceId } = useCase();
  const baseUrl = import.meta.env.VITE_UIPATH_BASE_URL || 'https://staging.uipath.com';
  const orgName = import.meta.env.VITE_UIPATH_ORG_NAME || '82e69757-09ff-4e6d-83e7-d530f2ac4e7b';
  const tenantName = import.meta.env.VITE_UIPATH_TENANT_NAME || 'Playground';
  const caseDefinitionId = import.meta.env.VITE_UIPATH_CASE_DEFINITION_ID || 'f7b40b11-f5e3-4fc6-9bb2-bd9c627306b7';
  const folderKey = import.meta.env.VITE_UIPATH_FOLDER_KEY || 'e23f4bf5-eff2-4d6d-a9ba-ebe82be1df38';

  const embedUrl = selectedCaseInstanceId
    ? `${baseUrl}/embed_/${orgName}/${tenantName}/maestro_/cases/${caseDefinitionId}/instances/${selectedCaseInstanceId}?folderKey=${folderKey}`
    : `${baseUrl}/embed_/${orgName}/${tenantName}/maestro_/cases/${caseDefinitionId}?folderKey=${folderKey}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Case Management</h2>
          <p className="text-sm text-gray-500 mt-1">
            View and manage cases in the embedded Case Management UI
          </p>
        </div>
        <a
          href={embedUrl.replace('/embed_/', '/')}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Open in new tab
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden" style={{ minHeight: 'calc(100vh - 280px)' }}>
        <iframe
          src={embedUrl}
          title="UiPath Case Management"
          className="w-full border-0"
          style={{ height: 'calc(100vh - 280px)', minHeight: '600px' }}
          allow="fullscreen"
        />
      </div>
    </div>
  );
}

export default CaseManagementScreen;
