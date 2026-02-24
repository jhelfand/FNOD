/**
 * Case Management service - loads case instances from Maestro Case Management API
 */

function unwrapItems(resp: any): any[] {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp.items)) return resp.items;
  if (Array.isArray(resp.value)) return resp.value;
  return [];
}

export interface CaseInstanceRecord {
  instanceId: string;
  latestRunStatus: string;
  processKey?: string;
  instanceDisplayName?: string;
  caseTitle?: string;
  caseType?: string;
  startedTime?: string;
  completedTime?: string;
  folderKey?: string;
  [key: string]: unknown;
}

/**
 * Get all case instances. Optionally filter by version (packageVersion) or case definition.
 */
export async function getCaseInstances(
  sdk: any,
  options: { caseDefinitionId?: string; folderKey?: string; processKey?: string; pageSize?: number; packageVersion?: string }
): Promise<CaseInstanceRecord[]> {
  if (!sdk?.maestro?.cases?.instances?.getAll) {
    console.warn('[caseManagement] SDK maestro.cases.instances not available');
    return [];
  }
  try {
    const opts: Record<string, unknown> = {};
    if (options.pageSize) opts.pageSize = options.pageSize;
    if (options.packageVersion) opts.packageVersion = options.packageVersion;
    if (options.folderKey) opts.folderKey = options.folderKey;

    const resp = await sdk.maestro.cases.instances.getAll(opts);
    const items = unwrapItems(resp);
    if (import.meta.env.DEV) {
      console.debug('[caseManagement] API returned', items.length, 'items. opts:', opts);
      if (items.length > 0) console.debug('[caseManagement] sample:', items[0]);
    }
    const mapped = items.map((item: any) => ({
      instanceId: item.instanceId ?? item.id,
      latestRunStatus: item.latestRunStatus ?? item.status ?? item.runStatus ?? 'Unknown',
      processKey: item.processKey,
      instanceDisplayName: item.instanceDisplayName ?? item.displayName,
      caseTitle: item.caseTitle,
      caseType: item.caseType,
      startedTime: item.startedTime,
      completedTime: item.completedTime,
      folderKey: item.folderKey,
      ...item
    }));
    const targetFolderKey = options.folderKey;
    const targetProcessKey = options.processKey;
    return mapped.filter((rec) => {
      const s = (rec.latestRunStatus || '').toLowerCase();
      if (s === 'faulted' || s === 'cancelling' || s === 'cancelled') return false;
      if (targetFolderKey && rec.folderKey && rec.folderKey !== targetFolderKey) return false;
      if (targetProcessKey && rec.processKey && !rec.processKey.toLowerCase().includes('fnod')) return false;
      return true;
    });
  } catch (e) {
    console.error('[caseManagement] Failed to load case instances:', e);
    return [];
  }
}

export interface CaseInstanceTask {
  id: number;
  title?: string;
  status?: string;
  [key: string]: unknown;
}

/**
 * Get human-in-the-loop tasks associated with a case instance.
 * Uses sdk.maestro.cases.instances.getActionTasks (requires OR.Tasks.Read scope).
 */
export async function getCaseInstanceTasks(
  sdk: any,
  caseInstanceId: string
): Promise<CaseInstanceTask[]> {
  if (!caseInstanceId?.trim()) return [];
  if (!sdk?.maestro?.cases?.instances?.getActionTasks) {
    console.warn('[caseManagement] SDK maestro.cases.instances.getActionTasks not available');
    return [];
  }
  try {
    const resp = await sdk.maestro.cases.instances.getActionTasks(caseInstanceId);
    const items = unwrapItems(resp);
    if (import.meta.env.DEV && items.length > 0) {
      console.debug('[caseManagement] getActionTasks returned', items.length, 'tasks');
    }
    return items.map((item: any) => ({
      id: item.id ?? item.taskId,
      title: item.title ?? item.name,
      status: item.status,
      ...item
    }));
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('[caseManagement] getCaseInstanceTasks failed for', caseInstanceId, ':', e);
    }
    return [];
  }
}

/**
 * PCFNOL-style: Get tasks for a case, with fallback to ALL cases when selected case has 0 tasks.
 * When the selected case has no tasks, fetches getActionTasks for every case in caseInstances.
 */
export async function getCaseInstanceTasksWithAllCasesFallback(
  sdk: any,
  caseInstanceId: string | null,
  caseInstances: CaseInstanceRecord[]
): Promise<CaseInstanceTask[]> {
  // First try the selected case (if we have one)
  if (caseInstanceId?.trim()) {
    const items = await getCaseInstanceTasks(sdk, caseInstanceId);
    if (items.length > 0) {
      if (import.meta.env.DEV) {
        console.debug('[caseManagement] getCaseInstanceTasksWithAllCasesFallback: found', items.length, 'tasks for selected case');
      }
      return items;
    }
  }

  // PCFNOL fallback: selected case had 0 tasks (or no case selected), fetch for ALL cases
  if (caseInstances.length === 0) return [];

  const collected: CaseInstanceTask[] = [];
  const seenIds = new Set<number>();

  for (const rec of caseInstances) {
    const id = rec.instanceId ?? (rec as any).id;
    if (!id) continue;
    try {
      const items = await getCaseInstanceTasks(sdk, String(id));
      for (const t of items) {
        const taskId = t.id ?? (t as any).taskId;
        if (taskId != null && !seenIds.has(Number(taskId))) {
          seenIds.add(Number(taskId));
          collected.push(t);
        }
      }
    } catch {
      /* skip failed case */
    }
  }

  if (import.meta.env.DEV && collected.length > 0) {
    console.debug('[caseManagement] getCaseInstanceTasksWithAllCasesFallback: found', collected.length, 'tasks across all cases');
  }
  return collected;
}

/**
 * Fallback: get tasks by title filter when case-linked tasks return empty.
 * Use sdk.tasks.getAll with OData filter. Helps before process is republished with case instance ID tag.
 */
export async function getTasksByTitle(
  sdk: any,
  titleFilter: string,
  alternativeTitles?: string[]
): Promise<CaseInstanceTask[]> {
  const titles = [titleFilter, ...(alternativeTitles || [])].filter(Boolean);
  if (titles.length === 0 || !sdk?.tasks?.getAll) return [];
  const buildFilter = (t: string[]) => {
    const clauses = t.map((title) => {
      const escaped = title.trim().replace(/'/g, "''");
      return `contains(Title,'${escaped}') or Title eq '${escaped}'`;
    });
    return clauses.join(' or ');
  };
  const tryGet = async (filter: string, asAdmin: boolean) => {
    const resp = await sdk.tasks.getAll({ filter, pageSize: 50, asTaskAdmin: asAdmin });
    return unwrapItems(resp);
  };
  try {
    const filter = buildFilter(titles);
    let items: any[] = [];
    try {
      items = await tryGet(filter, true);
    } catch {
      items = await tryGet(filter, false);
    }
    if (items.length === 0 && titles.some((t) => t.toLowerCase().includes('beneficiary') || t.toLowerCase().includes('onbase'))) {
      const broader = ['Beneficiary', 'OnBase', 'Review'];
      const altFilter = buildFilter([...titles, ...broader]);
      try {
        const alt = await tryGet(altFilter, true);
        if (alt.length > 0) items = alt;
      } catch {
        try {
          const alt = await tryGet(altFilter, false);
          if (alt.length > 0) items = alt;
        } catch {
          /* ignore */
        }
      }
    }
    if (import.meta.env.DEV && items.length > 0) {
      console.debug('[caseManagement] getTasksByTitle fallback returned', items.length, 'tasks');
    }
    return items.map((item: any) => ({
      id: item.id ?? item.taskId,
      title: item.title ?? item.name,
      status: item.status,
      ...item
    }));
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('[caseManagement] getTasksByTitle fallback failed:', e);
    }
    return [];
  }
}

/**
 * Get available tasks from Orchestrator Tasks API (no title filter).
 * Tries asTaskAdmin first, then non-admin. Filters to actionable statuses when possible.
 */
export async function getAvailableTasks(sdk: any, pageSize = 100): Promise<CaseInstanceTask[]> {
  if (!sdk?.tasks?.getAll) return [];
  const unwrap = (r: any) => unwrapItems(r);
  const mapTask = (item: any) => ({
    id: item.id ?? item.taskId,
    title: item.title ?? item.name,
    status: item.status,
    ...item
  });
  try {
    let items: any[] = [];
    try {
      items = unwrap(await sdk.tasks.getAll({ pageSize, asTaskAdmin: true }));
    } catch {
      items = unwrap(await sdk.tasks.getAll({ pageSize, asTaskAdmin: false }));
    }
    const actionable = ['Pending', 'Unassigned', 'Assigned', 'PendingApproval'];
    const filtered = items.filter((t: any) => {
      const s = (t.status || '').toString();
      return actionable.some(a => s.toLowerCase().includes(a.toLowerCase()));
    });
    const result = (filtered.length > 0 ? filtered : items).map(mapTask);
    if (import.meta.env.DEV && result.length > 0) {
      console.debug('[caseManagement] getAvailableTasks returned', result.length, 'tasks');
    }
    return result;
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('[caseManagement] getAvailableTasks failed:', e);
    }
    return [];
  }
}
