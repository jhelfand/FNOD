import { useState, useMemo } from 'react';
import { useCase } from '../../contexts/CaseContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { CurrentStatePill } from '../shared/CurrentStatePill';
import { getDfFieldString } from '../../utils/data-fabric';
import type { CaseInstanceRecord } from '../../services/caseManagement';
import { useToast } from '../../hooks/use-toast';

type StageFilter = 'in-progress' | 'completed' | 'all';

interface SummaryCaseScreenProps {
  onNavigate?: (tab: string) => void;
}

function isCaseCompleted(instance: CaseInstanceRecord): boolean {
  const s = (instance.latestRunStatus || '').toLowerCase();
  return ['completed', 'successful', 'closed', 'cancelled', 'canceled'].some(x => s.includes(x));
}

function findDfRecordForCase(dfRecords: any[], instanceId: string): any | null {
  const id = String(instanceId ?? '');
  const caseIdTrailing = id.match(/-(\d+)$/)?.[1] ?? (id.match(/^\d+$/) ? id : '');
  return dfRecords.find((r: any) => {
    const caseInst = String(r.CaseInstanceId ?? r.caseInstanceId ?? r.InstanceId ?? r.instanceId ?? '');
    const caseIdVal = String(r.CaseID ?? r.CaseId ?? r.caseId ?? r.CaseNumber ?? r.caseNumber ?? r.ClaimNumber ?? r.claimNumber ?? '');
    const dfTrailing = caseIdVal.match(/-(\d+)$/)?.[1] ?? (caseIdVal.match(/^\d+$/) ? caseIdVal : null);
    const exactMatch = caseInst === id || caseIdVal === id || String(r.Id ?? r.id) === id;
    const trailingMatch = dfTrailing && caseIdTrailing && (dfTrailing === caseIdTrailing || dfTrailing === id.match(/-(\d+)$/)?.[1]);
    return exactMatch || !!trailingMatch;
  }) ?? null;
}

export default function SummaryCaseScreen({ onNavigate }: SummaryCaseScreenProps) {
  const { caseInstances, selectedCaseInstance, selectCaseInstance, dfRecords, closeCaseInstance } = useCase();
  const { toast } = useToast();
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [closingCaseId, setClosingCaseId] = useState<string | null>(null);

  // Filter by status; default shows only in-progress
  const filteredRecords = useMemo(() => {
    return caseInstances.filter((inst) => {
      const completed = isCaseCompleted(inst);
      if (stageFilter === 'in-progress') return !completed;
      if (stageFilter === 'completed') return completed;
      return true;
    });
  }, [caseInstances, stageFilter]);

  const handleSelectInstance = (instance: CaseInstanceRecord) => {
    selectCaseInstance(instance);
    if (onNavigate) onNavigate('summary');
  };

  const handleCloseCase = async (instance: CaseInstanceRecord) => {
    const instanceId = String(instance.instanceId ?? '');
    if (!instanceId) return;
    const confirmed = window.confirm(`Close case ${instance.instanceDisplayName || instance.caseTitle || instanceId}?`);
    if (!confirmed) return;
    setClosingCaseId(instanceId);
    try {
      await closeCaseInstance(instanceId, 'Closed by user from FNOD Case Selector');
      toast({
        title: 'Case Closed',
        description: `Case ${instance.instanceDisplayName || instance.caseTitle || instanceId} was closed.`,
      });
    } catch (error: any) {
      toast({
        title: 'Close Failed',
        description: error?.message || 'Unable to close case.',
        variant: 'destructive',
      });
    } finally {
      setClosingCaseId(null);
    }
  };

  /** Shorten case ID for display */
  const formatCaseId = (rawId: string): string => {
    if (!rawId || rawId === 'Unknown ID') return rawId;
    const str = String(rawId).trim();
    const trailingMatch = str.match(/-(\d+)$/);
    if (trailingMatch) return trailingMatch[1];
    if (/^\d+$/.test(str)) return str;
    if (str.length > 12 && str.includes('-')) return str.slice(0, 8) + '…';
    return str.length > 12 ? str.slice(0, 12) + '…' : str;
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <Card>
        <CardHeader>
          <CardTitle>Case Selector</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">Select a case from Case Management to drive downstream screens.</p>

          {/* Status filter */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-sm font-medium text-gray-700">Filter:</span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={stageFilter === 'in-progress' ? undefined : 'outline'}
                onClick={() => setStageFilter('in-progress')}
              >
                In Progress
              </Button>
              <Button
                size="sm"
                variant={stageFilter === 'completed' ? undefined : 'outline'}
                onClick={() => setStageFilter('completed')}
              >
                Completed
              </Button>
              <Button
                size="sm"
                variant={stageFilter === 'all' ? undefined : 'outline'}
                onClick={() => setStageFilter('all')}
              >
                All
              </Button>
            </div>
          </div>

          {(!caseInstances || caseInstances.length === 0) && (
            <div className="text-sm text-gray-600">No case instances found. Ensure Case Management is configured and you have access.</div>
          )}

          {caseInstances.length > 0 && filteredRecords.length === 0 && (
            <div className="text-sm text-gray-600">No cases match the current filter.</div>
          )}

          <div className="grid grid-cols-1 gap-3">
            {filteredRecords.map((inst) => {
              const id = inst.instanceId;
              const displayId = formatCaseId(id);
              const isSelected = selectedCaseInstance && String(selectedCaseInstance.instanceId) === String(id);
              const completed = isCaseCompleted(inst);
              const statusLabel = inst.latestRunStatus || (completed ? 'Completed' : 'In Progress');
              const linkedDf = findDfRecordForCase(dfRecords, id);
              const dfCurrentState = linkedDf ? getDfFieldString(linkedDf, 'currentState') || getDfFieldString(linkedDf, 'caseStage') : null;
              return (
                <div key={id} className={`p-3 rounded border ${isSelected ? 'border-blue-600 bg-blue-50' : 'bg-white'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="font-medium" title={id}>
                          {inst.instanceDisplayName || inst.caseTitle || `Case ${displayId}`}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              completed ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {statusLabel}
                          </span>
                          <CurrentStatePill state={dfCurrentState || undefined} />
                          {linkedDf && (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700" title="Linked to Data Fabric">
                              Data Fabric
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => handleSelectInstance(inst)}>{isSelected ? 'Selected' : 'Select'}</Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { void handleCloseCase(inst); }}
                        disabled={closingCaseId === String(id)}
                        className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700"
                      >
                        {closingCaseId === String(id) ? 'Closing...' : 'Close Case'}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
