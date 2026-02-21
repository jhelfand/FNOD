import React, { useEffect, useState } from 'react';
import {
  getCaseInstanceTasks,
  getCaseInstanceTasksWithAllCasesFallback,
  getTasksByTitle,
  getAvailableTasks,
  type CaseInstanceTask,
  type CaseInstanceRecord,
} from '../services/caseManagement';
import { buildTaskEmbedUrl } from '../utils/formatters';
import Modal from './ui/modal';

interface CaseTasksEmbedProps {
  caseInstanceId: string | null;
  sdk: any;
  /** PCFNOL-style: when provided, fetches tasks for all cases if selected case has 0 tasks */
  caseInstances?: CaseInstanceRecord[];
  preferredTaskTitle?: string;
  buttonLabel?: string;
  /** When true, renders compact button; when false, always shows dropdown + View Task (PCFNOL style) */
  compact?: boolean;
}

export function CaseTasksEmbed({
  caseInstanceId,
  sdk,
  caseInstances = [],
  preferredTaskTitle = import.meta.env.VITE_TASK_TITLE_REVIEW_BENEFICIARY || 'Review Beneficiary OnBase Data',
  buttonLabel = 'Review Beneficiary OnBase Data',
  compact = false,
}: CaseTasksEmbedProps) {
  const [tasks, setTasks] = useState<CaseInstanceTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<CaseInstanceTask | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isFallbackMode, setIsFallbackMode] = useState(false);

  useEffect(() => {
    if (!sdk) {
      setTasks([]);
      setSelectedTask(null);
      setIsFallbackMode(false);
      return;
    }
    setLoading(true);
    setIsFallbackMode(false);

    const runFetch = async () => {
      let items: CaseInstanceTask[] = [];

      // 1. Try Orchestrator Tasks API FIRST (avoids Maestro case-json 401 when that path fails)
      if (import.meta.env.DEV) {
        console.debug('[CaseTasksEmbed] Trying Orchestrator Tasks API first (getTasksByTitle, getAvailableTasks)');
      }
      items = await getTasksByTitle(sdk, preferredTaskTitle || '', ['Analyst Review', 'Review Beneficiary OnBase Data', 'Beneficiary', 'OnBase', 'Review']);
      if (items.length === 0) {
        items = await getAvailableTasks(sdk, 100);
      }

      // 2. Fallback to Maestro getActionTasks (case-linked) when Orchestrator returns empty
      if (items.length === 0) {
        if (caseInstances.length > 0) {
          if (import.meta.env.DEV) {
            console.debug('[CaseTasksEmbed] Orchestrator empty, trying Maestro getCaseInstanceTasksWithAllCasesFallback');
          }
          items = await getCaseInstanceTasksWithAllCasesFallback(sdk, caseInstanceId, caseInstances);
        } else if (caseInstanceId?.trim()) {
          if (import.meta.env.DEV) {
            console.debug('[CaseTasksEmbed] Orchestrator empty, trying Maestro getCaseInstanceTasks for', caseInstanceId);
          }
          items = await getCaseInstanceTasks(sdk, caseInstanceId);
        }
      }

      if (import.meta.env.DEV) {
        console.debug('[CaseTasksEmbed] Total tasks found:', items.length);
      }

      if (items.length > 0) {
        const preferred = (preferredTaskTitle || '').trim().toLowerCase();
        if (preferred) {
          const matches = items.filter(
            (t) => (t.title || '').toLowerCase().includes(preferred) || preferred.includes((t.title || '').toLowerCase())
          );
          setSelectedTask(matches.length > 0 ? matches[0] : items[0]);
        } else {
          setSelectedTask(items[0]);
        }
        setTasks(items);
        setIsFallbackMode(true); // Show dropdown when we have tasks from any source
      } else {
        setTasks([]);
        setSelectedTask(null);
        setIsFallbackMode(false);
      }
    };

    runFetch()
      .catch(() => {
        setTasks([]);
        setIsFallbackMode(false);
      })
      .finally(() => setLoading(false));
  }, [caseInstanceId, sdk, preferredTaskTitle, caseInstances]);

  const handleOpenTask = () => {
    if (selectedTask) setModalOpen(true);
  };

  const hasNoTasks = !loading && tasks.length === 0;
  const canOpen = !!selectedTask;
  const showDropdown = tasks.length > 0 && (!compact || isFallbackMode);

  const dropdownAndButton = (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selectedTask?.id ?? ''}
        onChange={(e) => {
          const id = Number(e.target.value);
          setSelectedTask(tasks.find((t) => t.id === id) ?? null);
        }}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm"
      >
        {tasks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title || `Task ${t.id}`}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleOpenTask}
        disabled={!selectedTask}
        className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isFallbackMode ? 'View Task' : buttonLabel}
      </button>
    </div>
  );

  if (compact && !showDropdown) {
    return (
      <>
        <button
          type="button"
          onClick={handleOpenTask}
          disabled={loading || !canOpen}
          title={hasNoTasks ? 'No tasks available' : undefined}
          className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? 'Loading tasks…' : hasNoTasks ? 'No tasks for this case' : buttonLabel}
        </button>
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={selectedTask?.title || 'Task'}>
          {selectedTask && (
            <div className="w-full h-[70vh] min-h-[400px]">
              <iframe
                src={buildTaskEmbedUrl(selectedTask.id)}
                className="w-full h-full border-0 rounded"
                title={selectedTask.title || 'Task'}
              />
            </div>
          )}
        </Modal>
      </>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {loading && <p className="text-sm text-gray-500">Loading tasks…</p>}
        {!loading && hasNoTasks && <p className="text-sm text-gray-500">No tasks for this case.</p>}
        {!loading && showDropdown && (
          <>
            {isFallbackMode && (
              <p className="text-sm text-amber-600">No case-linked tasks found. Select from available tasks:</p>
            )}
            {dropdownAndButton}
          </>
        )}
      </div>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={selectedTask?.title || 'Task'}>
        {selectedTask && (
          <div className="w-full h-[70vh] min-h-[400px]">
            <iframe
              src={buildTaskEmbedUrl(selectedTask.id)}
              className="w-full h-full border-0 rounded"
              title={selectedTask.title || 'Task'}
            />
          </div>
        )}
      </Modal>
    </>
  );
}

export default CaseTasksEmbed;
