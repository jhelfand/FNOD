/**
 * EXACT PCFNOL implementation - useCaseTasks hook for testing in FNOD.
 * Copied from template-processapp---PC_claims_workbench, adapted to use FNOD env vars.
 */

import { useState, useEffect, useCallback } from 'react';
import type { UiPath } from '@uipath/uipath-typescript';

export interface AppTask {
  id: string;
  taskId: string | number;
  caseInstanceId: string;
  type: 'AppTask';
  status: 'Pending' | 'Unassigned' | 'Assigned' | 'Completed' | 'Cancelled';
  createdTime?: string;
  lastAssignedTime?: string;
  title?: string;
  name?: string;
  displayName?: string;
  description?: string;
  folderId?: string | number;
}

interface UseCaseTasksResult {
  tasks: AppTask[];
  activeTask: AppTask | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// FNOD config from env (same pattern as PCFNOL, different values)
const CASE_DEFINITION_ID = import.meta.env.VITE_UIPATH_CASE_DEFINITION_ID || 'f7b40b11-f5e3-4fc6-9bb2-bd9c627306b7';
const FOLDER_KEY = import.meta.env.VITE_UIPATH_FOLDER_KEY || 'e23f4bf5-eff2-4d6d-a9ba-ebe82be1df38';

/**
 * PCFNOL-style: Fetches AppTasks for a specific case instance.
 * Uses maestro.cases.instances.getAll then getActionTasks for each case.
 */
export function useCaseTasksPCFNOL(
  caseInstanceId: string | undefined,
  sdk?: UiPath | null,
  caseId?: string
): UseCaseTasksResult {
  const [tasks, setTasks] = useState<AppTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!sdk) {
      setTasks([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const maestro = (sdk as any).maestro;

      if (!maestro?.cases?.instances) {
        console.log('[useCaseTasksPCFNOL] Maestro service not available');
        setTasks([]);
        setIsLoading(false);
        return;
      }

      // PCFNOL: Fetch cases first (getAll then getActionTasks for each)
      console.log(`[useCaseTasksPCFNOL] Fetching cases for case definition: ${CASE_DEFINITION_ID}, folderKey: ${FOLDER_KEY}`);
      let casesResult: any;
      try {
        // PCFNOL uses getAll - SDK takes options: { folderKey, caseDefinitionId?, pageSize? }
        casesResult = await maestro.cases.instances.getAll({
          folderKey: FOLDER_KEY,
          caseDefinitionId: CASE_DEFINITION_ID,
          pageSize: 200,
        });
      } catch (e) {
        console.warn('[useCaseTasksPCFNOL] getAll failed:', e);
        setError((e as Error)?.message || 'Failed to fetch cases');
        setTasks([]);
        setIsLoading(false);
        return;
      }

      const cases = Array.isArray(casesResult) ? casesResult : casesResult?.items || casesResult?.value || casesResult?.data || [];
      console.log(`[useCaseTasksPCFNOL] Found ${cases.length} total cases`);

      // PCFNOL: Filter to process key; if none match, use all cases
      let filteredCases = cases.filter((c: any) => {
        const caseProcessKey = String(c.processKey || c.caseDefinitionId || c.processId || '').toLowerCase();
        const defId = CASE_DEFINITION_ID.toLowerCase();
        return caseProcessKey.includes(defId) || defId.includes(caseProcessKey) || caseProcessKey.includes('fnod');
      });
      if (filteredCases.length === 0 && cases.length > 0) {
        console.log(`[useCaseTasksPCFNOL] No cases matched process key, using all ${cases.length} cases`);
        filteredCases = cases;
      }

      console.log(`[useCaseTasksPCFNOL] Using ${filteredCases.length} cases`);

      // Find matching case
      let matchingCase: any = null;
      if (caseInstanceId) {
        matchingCase = filteredCases.find((c: any) => {
          const cId = c.id || c.instanceId || c.caseId || '';
          return cId === caseInstanceId || String(cId).toLowerCase() === String(caseInstanceId).toLowerCase();
        });
      }
      if (!matchingCase && caseId) {
        matchingCase = filteredCases.find((c: any) => {
          const businessKey = c.businessKey || c.instanceDisplayName || c.name || c.displayName || '';
          return businessKey === caseId || String(businessKey).includes(caseId) || caseId.includes(String(businessKey));
        });
      }
      if (!matchingCase && caseId) {
        matchingCase = filteredCases.find((c: any) => {
          const businessKey = String(c.businessKey || c.instanceDisplayName || c.name || c.displayName || '').toLowerCase();
          const searchCaseId = caseId.toLowerCase();
          return businessKey.includes(searchCaseId) || searchCaseId.includes(businessKey);
        });
      }

      const casesToFetchFirst = matchingCase ? [matchingCase] : filteredCases;
      if (!matchingCase) {
        console.log(`[useCaseTasksPCFNOL] No matching case for caseInstanceId: ${caseInstanceId}, caseId: ${caseId}. Fetching tasks for all ${filteredCases.length} cases.`);
      }

      const collectPendingTasks = async (casesToIterate: any[]): Promise<AppTask[]> => {
        const collected: AppTask[] = [];
        for (const c of casesToIterate) {
          const actualCaseId = c.id || c.instanceId || c.caseId || '';
          if (!actualCaseId) continue;
          try {
            const tasksResult = await maestro.cases.instances.getActionTasks(actualCaseId);
            const tasksList = Array.isArray(tasksResult) ? tasksResult : tasksResult?.items || tasksResult?.value || tasksResult?.data || [];
            const pending = tasksList
              .filter((t: any) => {
                const status = t.status || t.state || t.taskStatus || '';
                return status === 'Pending';
              })
              .map((t: any) => ({
                id: String(t.id || t.taskId || ''),
                taskId: t.id || t.taskId || '',
                caseInstanceId: actualCaseId,
                type: 'AppTask' as const,
                status: (t.status || t.state || t.taskStatus || 'Pending') as AppTask['status'],
                createdTime: t.createdTime || t.createdAt || t.created || '',
                lastAssignedTime: t.lastAssignedTime || t.lastAssignedAt || '',
                title: t.title || t.name || t.displayName || '',
                description: t.description || '',
                folderId: t.folderId || t.organizationUnitId || t.orgUnitId || t.folderKey || '',
              })) as AppTask[];
            collected.push(...pending);
          } catch (err: any) {
            console.warn(`[useCaseTasksPCFNOL] Failed to get tasks for case ${actualCaseId}:`, err?.message);
          }
        }
        return collected;
      };

      if (maestro?.cases?.instances?.getActionTasks) {
        let allAppTasks = await collectPendingTasks(casesToFetchFirst);

        if (matchingCase && allAppTasks.length === 0 && filteredCases.length > 1) {
          console.log(`[useCaseTasksPCFNOL] Matched case had 0 pending tasks. Fetching tasks for all ${filteredCases.length} cases.`);
          allAppTasks = await collectPendingTasks(filteredCases);
        }

        console.log(`[useCaseTasksPCFNOL] Total Pending tasks: ${allAppTasks.length}`);
        setTasks(allAppTasks);
      } else {
        setTasks([]);
      }
    } catch (e: any) {
      console.error('[useCaseTasksPCFNOL] Error fetching tasks:', e);
      setError(e?.message || 'Failed to fetch tasks');
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
  }, [caseInstanceId, sdk, caseId]);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const activeTask =
    tasks.length > 0
      ? [...tasks].sort((a, b) => {
          const aTime = a.lastAssignedTime || a.createdTime || '';
          const bTime = b.lastAssignedTime || b.createdTime || '';
          return bTime.localeCompare(aTime);
        })[0]
      : null;

  return {
    tasks,
    activeTask,
    isLoading,
    error,
    refresh: fetchTasks,
  };
}
