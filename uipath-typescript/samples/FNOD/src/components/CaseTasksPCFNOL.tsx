/**
 * EXACT PCFNOL implementation - dropdown + View Task, for testing in FNOD.
 * Mirrors ReviewDecisionStrip's task selection UI from template-processapp---PC_claims_workbench.
 */

import { useState } from 'react';
import { useCaseTasksPCFNOL, type AppTask } from '../hooks/useCaseTasksPCFNOL';
import { useAuth } from '../hooks/useAuth';
import { useCase } from '../contexts/CaseContext';
import { buildTaskEmbedUrl } from '../utils/formatters';
import Modal from './ui/modal';

export function CaseTasksPCFNOL() {
  const { sdk } = useAuth();
  const { selectedCaseInstanceId, currentCase } = useCase();
  const { tasks: pendingTasks = [], isLoading } = useCaseTasksPCFNOL(
    selectedCaseInstanceId ?? undefined,
    sdk,
    currentCase?.id
  );

  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [showTaskIframe, setShowTaskIframe] = useState(false);

  const selectedTask = pendingTasks.find(
    (t) => String(t.taskId || t.id) === selectedTaskId || String(t.id || t.taskId) === selectedTaskId
  );

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
        PCFNOL Test — exact implementation from PC claims workbench
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium text-gray-700">Select Pending Task</label>
        <select
          value={selectedTaskId}
          onChange={(e) => {
            setSelectedTaskId(e.target.value);
          }}
          disabled={pendingTasks.length === 0}
          className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
        >
          {pendingTasks.length === 0 ? (
            <option value="">{isLoading ? 'Loading tasks…' : 'No pending tasks available'}</option>
          ) : (
            <>
              <option value="">-- Select a task --</option>
              {pendingTasks.map((task: AppTask) => {
                const taskIdValue = task.id || task.taskId;
                const taskTitle = task.title || task.description || task.name || task.displayName || 'Task';
                return (
                  <option key={String(taskIdValue)} value={String(taskIdValue)}>
                    {taskTitle} - {taskIdValue}
                  </option>
                );
              })}
            </>
          )}
        </select>
        <button
          type="button"
          onClick={() => setShowTaskIframe(true)}
          disabled={!selectedTaskId}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 whitespace-nowrap"
          title="View task in Action Center"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          View Task
        </button>
      </div>

      {pendingTasks.length === 0 && !isLoading && (
        <p className="text-sm text-gray-500">No pending AppTasks found for this case</p>
      )}

      {showTaskIframe && selectedTaskId && selectedTask && (
        <Modal
          open={showTaskIframe}
          onClose={() => setShowTaskIframe(false)}
          title={`Action Center Task — ${selectedTask.title || selectedTaskId}`}
        >
          <div className="w-full h-[70vh] min-h-[400px]">
            <iframe
              src={buildTaskEmbedUrl(Number(selectedTask.taskId || selectedTask.id))}
              className="w-full h-full border-0 rounded"
              title={selectedTask.title || 'Task'}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

export default CaseTasksPCFNOL;
