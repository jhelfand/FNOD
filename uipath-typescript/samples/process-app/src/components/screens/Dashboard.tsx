import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import type { UiPath } from '@uipath/uipath-typescript';
import type { ProcessInstanceExecutionHistoryResponse } from '@uipath/uipath-typescript';
import { BpmnViewer } from '../BpmnViewer';
import { StatusBadge } from '../shared/StatusBadge';
import {
  getMaestroProcesses,
  getMaestroInstances,
  getInstanceDetails,
  getInstanceBpmn,
  getInstanceExecutionHistory,
  pauseInstance,
  resumeInstance,
  cancelInstance,
  getInstanceVariables,
  getInstanceIncidents,
} from '../../services/maestro';

type InstanceLike = any; // keep flexible across SDK versions
type ProcessLike = any;  // keep flexible across SDK versions

interface DashboardProps {
  sdk: UiPath;
}

const DEFAULT_PROCESS_UUID = '4c27bf70-249f-4159-ba9c-a4bea267a125'; // Updated from URL
const DEFAULT_FOLDER_KEY = '3cc88a06-cffd-4255-a82d-42a4f2e21e0b'; // Updated from URL

export function Dashboard({ sdk }: DashboardProps) {
  const [processKey, setProcessKey] = useState<string>(
    import.meta.env.VITE_MAESTRO_PROCESS_KEY || DEFAULT_PROCESS_UUID
  );

  // NOTE: Some SDK versions call this "folderKey" and expect a string.
  // Other codebases pass folderId; to be safe, we store it as string and pass through.
  const [folderKey, setFolderKey] = useState<string>(
    import.meta.env.VITE_MAESTRO_FOLDER_KEY || DEFAULT_FOLDER_KEY
  );

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [processes, setProcesses] = useState<ProcessLike[]>([]);
  const [instances, setInstances] = useState<InstanceLike[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

  const [bpmnXml, setBpmnXml] = useState<string | null>(null);
  const [executionHistory, setExecutionHistory] = useState<ProcessInstanceExecutionHistoryResponse[] | null>(null);
  const [instanceDetails, setInstanceDetails] = useState<any | null>(null);
  const [instanceVariables, setInstanceVariables] = useState<any | null>(null);
  const [instanceIncidents, setInstanceIncidents] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'variables' | 'incidents'>('overview');
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const previousInstanceIdRef = useRef<string | null>(null);

  const selectedInstance = useMemo(() => {
    if (!selectedInstanceId) return null;
    return instances.find((i: any) => String(i?.id ?? i?.instanceId ?? '') === String(selectedInstanceId)) ?? null;
  }, [instances, selectedInstanceId]);

  async function loadProcessAndInstances(preserveSelection = false) {
    setIsLoading(true);
    setLoadError(null);
    
    // Preserve the currently selected instance ID if requested
    const currentSelectedId = preserveSelection ? selectedInstanceId : null;
    
    if (!preserveSelection) {
      setSelectedInstanceId(null);
      setBpmnXml(null);
      setExecutionHistory(null);
      setInstanceDetails(null);
    }

    try {
      const [procList, instList] = await Promise.all([
        getMaestroProcesses(sdk),
        getMaestroInstances(sdk, { processKey }),
      ]);

      setProcesses(procList);
      setInstances(instList);

      if (preserveSelection && currentSelectedId) {
        // Verify the selected instance still exists, otherwise clear selection
        const stillExists = instList.some((inst: any) => {
          const id = String(inst?.id ?? inst?.instanceId ?? '');
          return id === currentSelectedId;
        });
        if (!stillExists) {
          setSelectedInstanceId(null);
        }
      } else {
        // auto-select the newest instance if present (only on initial load)
        const first = instList?.[0];
        const firstId = first?.id ?? first?.instanceId;
        if (firstId) setSelectedInstanceId(String(firstId));
      }
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load Maestro process data');
    } finally {
      setIsLoading(false);
    }
  }

  const loadSelectedInstanceArtifacts = useCallback(async () => {
    if (!selectedInstanceId) return;

    setLoadError(null);
    
    // Only clear BPMN XML if instance changed (to prevent viewer recreation)
    const instanceChanged = previousInstanceIdRef.current !== selectedInstanceId;
    if (instanceChanged) {
      setBpmnXml(null);
      previousInstanceIdRef.current = selectedInstanceId;
    }
    
    // Always update execution history (this triggers marker updates, not viewer recreation)
    setExecutionHistory(null);
    setInstanceDetails(null);
    setInstanceVariables(null);
    setInstanceIncidents([]);

    try {
      const promises: Promise<any>[] = [
        folderKey ? getInstanceDetails(sdk, selectedInstanceId, folderKey) : Promise.resolve(null),
        // Only fetch BPMN if instance changed or we don't have it
        (instanceChanged || !bpmnXml) && folderKey 
          ? getInstanceBpmn(sdk, selectedInstanceId, folderKey) 
          : Promise.resolve(bpmnXml),
        getInstanceExecutionHistory(sdk, selectedInstanceId),
      ];

      if (folderKey) {
        promises.push(
          getInstanceVariables(sdk, selectedInstanceId, folderKey),
          getInstanceIncidents(sdk, selectedInstanceId, folderKey)
        );
      }

      const results = await Promise.all(promises);
      const [details, bpmn, history, variables, incidents] = results;

      setInstanceDetails(details);
      // Only update BPMN XML if instance changed (prevents unnecessary viewer recreation)
      if (instanceChanged && bpmn) {
        setBpmnXml(bpmn);
      }
      // Always update execution history (this is what drives the dynamic updates)
      setExecutionHistory(history);
      if (variables) setInstanceVariables(variables);
      if (incidents) setInstanceIncidents(incidents);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load instance details/BPMN/history');
    }
  }, [selectedInstanceId, folderKey, sdk, bpmnXml]);

  async function handleInstanceAction(
    action: 'pause' | 'resume' | 'cancel',
    instanceId: string
  ) {
    if (!folderKey) {
      setActionError('Folder Key is required to perform actions on instances');
      return;
    }

    setIsActionLoading(true);
    setActionError(null);

    try {
      let result;
      switch (action) {
        case 'pause':
          result = await pauseInstance(sdk, instanceId, folderKey);
          break;
        case 'resume':
          result = await resumeInstance(sdk, instanceId, folderKey);
          break;
        case 'cancel':
          result = await cancelInstance(sdk, instanceId, folderKey);
          break;
      }

      if (result?.success) {
        // Reload instances and selected instance data
        await loadProcessAndInstances();
        await loadSelectedInstanceArtifacts();
      } else {
        setActionError(result?.message || `Failed to ${action} instance`);
      }
    } catch (e: any) {
      setActionError(e?.message || `Failed to ${action} instance`);
    } finally {
      setIsActionLoading(false);
    }
  }

  useEffect(() => {
    // initial load
    void loadProcessAndInstances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // whenever selection changes, pull BPMN + execution history
    void loadSelectedInstanceArtifacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInstanceId]);

  const stats = useMemo(() => {
    const total = instances.length;
    const byStatus: Record<string, number> = {};
    for (const inst of instances) {
      const status = String(
        inst?.latestRunStatus ??
          inst?.status ??
          inst?.runStatus ??
          'Unknown'
      );
      byStatus[status] = (byStatus[status] || 0) + 1;
    }
    return { total, byStatus };
  }, [instances]);

  return (
    <div className="space-y-6">
      {/* Header + Controls */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Maestro Process Explorer</h2>
            <p className="text-sm text-gray-600">
              Loads process metadata + instances for the configured Maestro process UUID, then renders the BPMN for a selected instance.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">Process UUID / Key</span>
              <input
                value={processKey}
                onChange={(e) => setProcessKey(e.target.value)}
                className="w-full sm:w-[28rem] rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={DEFAULT_PROCESS_UUID}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">Folder Key (optional, enables BPMN/details)</span>
              <input
                value={folderKey}
                onChange={(e) => setFolderKey(e.target.value)}
                className="w-full sm:w-[18rem] rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 123456 or a folder key string"
              />
            </label>

            <button
              onClick={() => void loadProcessAndInstances(false)}
              disabled={isLoading}
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isLoading ? 'Loading…' : 'Load'}
            </button>
            <button
              onClick={() => void loadProcessAndInstances(true)}
              disabled={isLoading}
              className="inline-flex items-center justify-center rounded-md bg-gray-600 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-60"
              title="Refresh instances while keeping current selection"
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {loadError ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {loadError}
          </div>
        ) : null}

        {/* Process summary */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Kpi label="Total instances" value={String(stats.total)} />
          {Object.entries(stats.byStatus)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([status, count]) => (
              <Kpi key={status} label={status} value={String(count)} />
            ))}
        </div>

      </div>

      {/* Instances + BPMN */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Instance list */}
        <div className="lg:col-span-2 bg-white shadow rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Instances</h3>
              <span className="text-xs text-gray-500">{instances.length} found</span>
            </div>
          </div>

          <div className="max-h-[38rem] overflow-auto">
            {instances.length === 0 ? (
              <div className="p-4 text-sm text-gray-600">
                No instances returned. Confirm your process key and scopes, then try again.
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {instances.map((inst: any) => {
                  const id = String(inst?.id ?? inst?.instanceId ?? '');
                  const status = String(inst?.latestRunStatus ?? inst?.status ?? inst?.runStatus ?? 'Unknown');
                  const started = inst?.startTime ?? inst?.startedAt ?? inst?.createdAt ?? '';
                  const selected = selectedInstanceId === id;
                  const statusLower = status.toLowerCase();
                  const isRunning = ['running', 'pausing', 'resuming'].includes(statusLower);
                  const isPaused = statusLower === 'paused';
                  const canControl = folderKey && (isRunning || isPaused || statusLower === 'faulted');

                  return (
                    <li key={id}>
                      <div className={[
                        'p-4',
                        selected ? 'bg-blue-50' : 'bg-white',
                      ].join(' ')}>
                        <button
                          onClick={() => setSelectedInstanceId(id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-gray-900 truncate">
                                {id}
                              </div>
                              <div className="mt-1 text-xs text-gray-600">
                                {started ? `Started: ${String(started)}` : 'Started: —'}
                              </div>
                            </div>
                            <StatusBadge status={status} />
                          </div>
                        </button>
                        {canControl && (
                          <div className="mt-2 flex gap-2">
                            {isRunning && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleInstanceAction('pause', id);
                                  }}
                                  disabled={isActionLoading}
                                  className="flex-1 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 disabled:opacity-50"
                                >
                                  ⏸ Pause
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleInstanceAction('cancel', id);
                                  }}
                                  disabled={isActionLoading}
                                  className="flex-1 px-2 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50"
                                >
                                  ⏹ Cancel
                                </button>
                              </>
                            )}
                            {isPaused && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleInstanceAction('resume', id);
                                }}
                                disabled={isActionLoading}
                                className="flex-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100 disabled:opacity-50"
                              >
                                ▶ Resume
                              </button>
                            )}
                            {statusLower === 'faulted' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleInstanceAction('cancel', id);
                                }}
                                disabled={isActionLoading}
                                className="flex-1 px-2 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50"
                              >
                                ⏹ Cancel
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* BPMN + history */}
        <div className="lg:col-span-3 bg-white shadow rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Instance Details</h3>
                <div className="mt-1 text-xs text-gray-600">
                  Select an instance. BPMN/details require <span className="font-mono">Folder Key</span> to be set.
                </div>
              </div>
              {selectedInstanceId && (
                <button
                  onClick={() => void loadSelectedInstanceArtifacts()}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  title="Refresh instance data"
                >
                  🔄 Refresh
                </button>
              )}
            </div>
          </div>

          {actionError && (
            <div className="mx-4 mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {actionError}
            </div>
          )}

          {selectedInstance && (
            <div className="px-4 pt-4 border-b border-gray-200">
              <div className="flex items-center gap-2 mb-4">
                <StatusBadge status={String(selectedInstance?.latestRunStatus ?? selectedInstance?.status ?? selectedInstance?.runStatus ?? 'Unknown')} />
                {(() => {
                  const status = String(selectedInstance?.latestRunStatus ?? selectedInstance?.status ?? selectedInstance?.runStatus ?? '').toLowerCase();
                  const isRunning = ['running', 'pausing', 'resuming'].includes(status);
                  const isPaused = status === 'paused';
                  const canControl = folderKey && (isRunning || isPaused || status === 'faulted');

                  if (!canControl) return null;

                  return (
                    <div className="flex gap-2 ml-auto">
                      {isRunning && (
                        <>
                          <button
                            onClick={() => void handleInstanceAction('pause', selectedInstanceId!)}
                            disabled={isActionLoading}
                            className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 disabled:opacity-50"
                          >
                            ⏸ Pause
                          </button>
                          <button
                            onClick={() => void handleInstanceAction('cancel', selectedInstanceId!)}
                            disabled={isActionLoading}
                            className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50"
                          >
                            ⏹ Cancel
                          </button>
                        </>
                      )}
                      {isPaused && (
                        <button
                          onClick={() => void handleInstanceAction('resume', selectedInstanceId!)}
                          disabled={isActionLoading}
                          className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100 disabled:opacity-50"
                        >
                          ▶ Resume
                        </button>
                      )}
                      {status === 'faulted' && (
                        <button
                          onClick={() => void handleInstanceAction('cancel', selectedInstanceId!)}
                          disabled={isActionLoading}
                          className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50"
                        >
                          ⏹ Cancel
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Tabs */}
              <div className="flex space-x-1 border-b border-gray-200">
                {(['overview', 'logs', 'variables', 'incidents'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={[
                      'px-4 py-2 text-xs font-medium border-b-2 transition-colors',
                      activeTab === tab
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                    ].join(' ')}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    {tab === 'incidents' && instanceIncidents.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs font-semibold text-red-700 bg-red-100 rounded-full">
                        {instanceIncidents.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 space-y-4">
            {selectedInstance ? (
              <>
                {/* Tab Content */}
                {activeTab === 'overview' && (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                      <div className="font-semibold text-gray-900">Instance Information</div>
                      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-700">
                        <Field label="Instance ID" value={String(selectedInstanceId)} />
                        <Field
                          label="Status"
                          value={String(selectedInstance?.latestRunStatus ?? selectedInstance?.status ?? selectedInstance?.runStatus ?? '—')}
                        />
                        <Field label="Start" value={String(selectedInstance?.startTime ?? selectedInstance?.startedAt ?? '—')} />
                        <Field label="End" value={String(selectedInstance?.endTime ?? selectedInstance?.endedAt ?? '—')} />
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 overflow-hidden">
                      <div className="p-3 border-b border-gray-200 bg-white flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-900">BPMN Diagram</div>
                        {!folderKey ? (
                          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-1">
                            Folder Key required
                          </span>
                        ) : null}
                      </div>

                      <div className="p-3">
                        {folderKey && bpmnXml ? (
                          <BpmnViewer bpmnXml={bpmnXml} executionHistory={executionHistory ?? undefined} />
                        ) : (
                          <div className="text-sm text-gray-600">
                            {folderKey
                              ? 'No BPMN loaded yet (or the SDK call returned empty).'
                              : 'Set Folder Key to enable BPMN rendering.'}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 overflow-hidden">
                      <div className="p-3 border-b border-gray-200 bg-white">
                        <div className="text-sm font-semibold text-gray-900">Instance Details (raw)</div>
                        <div className="text-xs text-gray-600">Shown if Folder Key is provided and getById succeeds.</div>
                      </div>
                      <div className="p-3">
                        {instanceDetails ? (
                          <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-auto max-h-64">
                            {JSON.stringify(instanceDetails, null, 2)}
                          </pre>
                        ) : (
                          <div className="text-sm text-gray-600">No instance details loaded.</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'logs' && (
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <div className="p-3 border-b border-gray-200 bg-white">
                      <div className="text-sm font-semibold text-gray-900">Execution History (Logs)</div>
                      <div className="text-xs text-gray-600 mt-1">
                        Timeline of execution spans showing activity flow and timing.
                      </div>
                    </div>

                    <div className="p-3">
                      {executionHistory && executionHistory.length > 0 ? (
                        <div className="max-h-[600px] overflow-auto">
                          <table className="w-full text-xs">
                            <thead className="text-left text-gray-600 bg-gray-50 sticky top-0">
                              <tr className="border-b border-gray-200">
                                <th className="py-2 pr-2 font-semibold">Name</th>
                                <th className="py-2 pr-2 font-semibold">Type</th>
                                <th className="py-2 pr-2 font-semibold">Start Time</th>
                                <th className="py-2 pr-2 font-semibold">End Time</th>
                                <th className="py-2 pr-2 font-semibold">Duration</th>
                                <th className="py-2 pr-2 font-semibold">Status</th>
                              </tr>
                            </thead>
                            <tbody className="text-gray-800">
                              {executionHistory.map((span: any, idx: number) => {
                                const startTime = span?.startTime ? new Date(span.startTime) : null;
                                const endTime = span?.endTime ? new Date(span.endTime) : null;
                                const duration = startTime && endTime ? endTime.getTime() - startTime.getTime() : null;
                                const status = String(span?.status ?? span?.state ?? '—').toLowerCase();

                                return (
                                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                    <td className="py-2 pr-2 font-medium">{String(span?.name ?? '—')}</td>
                                    <td className="py-2 pr-2 text-gray-600">{String(span?.type ?? span?.activityType ?? '—')}</td>
                                    <td className="py-2 pr-2 font-mono text-[10px]">{startTime ? startTime.toLocaleString() : '—'}</td>
                                    <td className="py-2 pr-2 font-mono text-[10px]">{endTime ? endTime.toLocaleString() : '—'}</td>
                                    <td className="py-2 pr-2">
                                      {duration !== null ? (
                                        <span className={duration > 5000 ? 'text-amber-600 font-semibold' : ''}>
                                          {duration}ms
                                        </span>
                                      ) : (
                                        '—'
                                      )}
                                    </td>
                                    <td className="py-2 pr-2">
                                      <StatusBadge status={String(span?.status ?? span?.state ?? '—')} small />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-600">No execution history loaded.</div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'variables' && (
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <div className="p-3 border-b border-gray-200 bg-white">
                      <div className="text-sm font-semibold text-gray-900">Process Variables</div>
                      <div className="text-xs text-gray-600 mt-1">
                        Global variables and element-specific variables for this instance.
                      </div>
                    </div>

                    <div className="p-3">
                      {instanceVariables ? (
                        <div className="space-y-4">
                          {instanceVariables.globalVariables && instanceVariables.globalVariables.length > 0 && (
                            <div>
                              <div className="text-xs font-semibold text-gray-700 mb-2">Global Variables</div>
                              <div className="max-h-96 overflow-auto">
                                <table className="w-full text-xs">
                                  <thead className="text-left text-gray-600 bg-gray-50">
                                    <tr className="border-b border-gray-200">
                                      <th className="py-2 pr-2 font-semibold">Name</th>
                                      <th className="py-2 pr-2 font-semibold">Type</th>
                                      <th className="py-2 pr-2 font-semibold">Value</th>
                                      <th className="py-2 pr-2 font-semibold">Element ID</th>
                                    </tr>
                                  </thead>
                                  <tbody className="text-gray-800">
                                    {instanceVariables.globalVariables.map((variable: any, idx: number) => (
                                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="py-2 pr-2 font-medium">{String(variable?.name ?? '—')}</td>
                                        <td className="py-2 pr-2 text-gray-600">{String(variable?.type ?? '—')}</td>
                                        <td className="py-2 pr-2">
                                          <pre className="font-mono text-[10px] whitespace-pre-wrap break-all">
                                            {JSON.stringify(variable?.value ?? '—', null, 2)}
                                          </pre>
                                        </td>
                                        <td className="py-2 pr-2 font-mono text-[10px]">{String(variable?.elementId ?? '—')}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                          {(!instanceVariables.globalVariables || instanceVariables.globalVariables.length === 0) && (
                            <div className="text-sm text-gray-600">No variables available.</div>
                          )}
                        </div>
                      ) : folderKey ? (
                        <div className="text-sm text-gray-600">Loading variables...</div>
                      ) : (
                        <div className="text-sm text-gray-600">Folder Key is required to view variables.</div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'incidents' && (
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <div className="p-3 border-b border-gray-200 bg-white">
                      <div className="text-sm font-semibold text-gray-900">Incidents & Errors</div>
                      <div className="text-xs text-gray-600 mt-1">
                        Errors and incidents that occurred during process execution.
                      </div>
                    </div>

                    <div className="p-3">
                      {instanceIncidents.length > 0 ? (
                        <div className="space-y-3 max-h-[600px] overflow-auto">
                          {instanceIncidents.map((incident: any, idx: number) => {
                            const severity = String(incident?.incidentSeverity ?? 'Unknown').toLowerCase();
                            const severityColor =
                              severity === 'critical' || severity === 'high'
                                ? 'bg-red-50 border-red-200 text-red-800'
                                : severity === 'medium'
                                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                                  : 'bg-gray-50 border-gray-200 text-gray-800';

                            return (
                              <div key={idx} className={`rounded-lg border p-3 ${severityColor}`}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <div className="font-semibold text-sm mb-1">
                                      {String(incident?.incidentElementActivityName ?? 'Unknown Activity')}
                                    </div>
                                    <div className="text-xs opacity-90 mb-2">
                                      Type: {String(incident?.incidentElementActivityType ?? '—')} | Status:{' '}
                                      {String(incident?.incidentStatus ?? '—')}
                                    </div>
                                    {incident?.errorMessage && (
                                      <div className="text-xs font-mono bg-white/50 rounded p-2 mt-2 whitespace-pre-wrap break-all">
                                        {String(incident.errorMessage)}
                                      </div>
                                    )}
                                    {incident?.stackTrace && (
                                      <details className="mt-2">
                                        <summary className="text-xs cursor-pointer font-medium">Stack Trace</summary>
                                        <pre className="text-[10px] font-mono bg-white/50 rounded p-2 mt-1 whitespace-pre-wrap break-all overflow-auto max-h-48">
                                          {String(incident.stackTrace)}
                                        </pre>
                                      </details>
                                    )}
                                  </div>
                                  <div className="text-xs font-semibold shrink-0">
                                    {String(incident?.incidentSeverity ?? 'Unknown')}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : folderKey ? (
                        <div className="text-sm text-gray-600">No incidents found for this instance.</div>
                      ) : (
                        <div className="text-sm text-gray-600">Folder Key is required to view incidents.</div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-gray-600">No instance selected.</div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium text-gray-600">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-gray-500">{label}</div>
      <div className="font-mono text-[11px] text-gray-800 truncate max-w-[22rem]" title={value}>
        {value}
      </div>
    </div>
  );
}

