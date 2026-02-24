/**
 * Hook to load Data Fabric record for a specific case (underwriting flow).
 * Use for screens that need case data from Data Fabric; where Data Fabric is not found, show placeholders/notes.
 * Adapted from PC NOL useDataFabricClaim pattern.
 */

import { useState, useEffect, useCallback } from 'react';
import type { CaseModel, Caller } from '../types';
import { getDfField, type DfFieldKey } from '../utils/data-fabric';

const ENTITY_ID = import.meta.env.VITE_UIPATH_ENTITY_ID;

/** Extract trailing numeric part for matching (e.g. "Cases-55844663" or "FNOL-55844663" → "55844663") */
function trailingNumericId(value: string): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = trimmed.match(/-(\d+)$/);
  if (match) return match[1];
  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
}

/** Map Data Fabric record to CaseModel partial using getDfField */
function mapDfRecordToCase(
  dfRecord: Record<string, unknown>,
  caseId: string,
  caseInstanceId: string
): Partial<CaseModel> {
  const get = (field: DfFieldKey) => getDfField(dfRecord, field);
  const getStr = (field: DfFieldKey) => {
    const v = get(field);
    return v !== undefined && v !== null && String(v).trim() !== '' ? String(v) : undefined;
  };
  const getNum = (field: DfFieldKey) => {
    const v = get(field);
    if (v === undefined || v === null) return undefined;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return !isNaN(n) ? n : undefined;
  };

  const callerName = getStr('callerName');
  const callerRelationship = getStr('callerRelationship');
  const callerPhone = getStr('callerPhone');
  const callerAddress = getStr('callerAddress');
  const caller: Caller | undefined =
    callerName || callerRelationship || callerPhone || callerAddress
      ? { name: callerName ?? '', relationship: callerRelationship, phone: callerPhone, address: callerAddress }
      : undefined;

  return {
    id: getStr('caseId') ?? caseId,
    decedentName: getStr('decedentName'),
    dateOfDeath: getStr('dateOfDeath'),
    locationOfDeath: getStr('locationOfDeath'),
    causeOfDeath: getStr('causeOfDeath'),
    status: getStr('status'),
    currentState: getStr('currentState') ?? undefined,
    agingDays: getNum('agingDays'),
    priority: getStr('priority'),
    assignedAnalyst: getStr('assignedAnalyst'),
    queue: getStr('queue'),
    fnodDateTime: getStr('fnodDate'),
    ...(caller ? { caller } : {}),
  };
}

// Keys to hide when rendering raw Data Fabric record (internal/OData)
const DF_HIDDEN_KEYS = new Set(['@odata.context', '@odata.etag', 'odata.metadata']);

export type DataFabricFieldSource = 'Data Fabric' | 'Maestro/SDK' | null;

export interface UseDataFabricCaseResult {
  /** Raw Data Fabric record for this case, if found */
  dfRecord: Record<string, unknown> | null;
  /** Case-shaped overlay from Data Fabric (only defined fields) */
  caseFromDF: Partial<CaseModel> | null;
  loading: boolean;
  error: string | null;
  /** Which source a field came from (for placeholder notes) */
  getFieldSource: (field: keyof CaseModel) => DataFabricFieldSource;
  /** Get raw value from Data Fabric record by key (tries common key variants) */
  getDfValue: (keys: string[]) => string | number | undefined;
  /** Placeholder note when Data Fabric does not have the field */
  placeholderNote: string;
}

/** Keys to skip when rendering raw DF record (internal/OData) */
export const getDataFabricDisplayEntries = (dfRecord: Record<string, unknown> | null): [string, string][] => {
  if (!dfRecord) return [];
  return Object.entries(dfRecord)
    .filter(([k]) => !DF_HIDDEN_KEYS.has(k) && !k.startsWith('@') && !k.startsWith('odata.'))
    .map(([k, v]) => [k, v === undefined || v === null ? '—' : String(v)])
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
};

const PLACEHOLDER_NOTE = 'Data Fabric: field not found – update Data Fabric to populate.';

export function useDataFabricCase(
  caseId: string | undefined,
  caseInstanceId: string | undefined,
  sdk: { entities?: { getRecordsById?: (id: string, opts?: { pageSize?: number }) => Promise<unknown> } } | null
): UseDataFabricCaseResult {
  const [dfRecord, setDfRecord] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const caseFromDF =
    dfRecord && (caseId || caseInstanceId)
      ? mapDfRecordToCase(dfRecord, caseId ?? '', caseInstanceId ?? '')
      : null;

  useEffect(() => {
    if (!caseId && !caseInstanceId) {
      setLoading(false);
      setDfRecord(null);
      setError('No case ID or case instance ID provided.');
      return;
    }
    if (!ENTITY_ID || !sdk?.entities?.getRecordsById) {
      setLoading(false);
      setDfRecord(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // Query DF for this case (lineage: filter by case so we pull from the correct record)
        let items: any[] = [];
        const caseIdToFilter = caseInstanceId ?? caseId;
        if (caseIdToFilter) {
          try {
            const opts: { pageSize: number; filter: string } = {
              pageSize: 200,
              filter: `CaseInstanceId eq '${caseIdToFilter}' or CaseNumber eq '${caseIdToFilter}'`,
            };
            const res: any = await sdk.entities.getRecordsById(ENTITY_ID, opts);
            items = Array.isArray(res) ? res : res?.items ?? res?.data ?? [];
          } catch {
            // Filter may fail if column names differ; fall back to unfiltered fetch
          }
        }
        if (items.length === 0) {
          const res: any = await sdk.entities.getRecordsById(ENTITY_ID, { pageSize: 200 });
          items = Array.isArray(res) ? res : res?.items ?? res?.data ?? [];
        }
        const caseIdTrailing = trailingNumericId(caseId ?? '') ?? caseId ?? '';
        const match = items.find((r: any) => {
          const id = String(r.Id ?? r.id ?? '');
          const caseInst = String(r.CaseInstanceId ?? r.caseInstanceId ?? r.InstanceId ?? r.instanceId ?? '');
          const caseIdVal = String(
            r.CaseID ?? r.CaseId ?? r.caseId ?? r.caseID ?? r.CaseNumber ?? r.caseNumber ?? r.ClaimNumber ?? r.claimNumber ?? ''
          );
          const dfTrailing = trailingNumericId(caseIdVal);
          const exactMatch =
            id === caseInstanceId ||
            id === caseId ||
            caseInst === caseInstanceId ||
            caseInst === caseId ||
            caseIdVal === caseId ||
            caseIdVal === caseInstanceId;
          const trailingMatch =
            dfTrailing != null &&
            caseIdTrailing !== '' &&
            (dfTrailing === caseIdTrailing || dfTrailing === (trailingNumericId(caseInstanceId ?? '') ?? ''));
          return exactMatch || !!trailingMatch;
        });
        if (!cancelled) {
          setDfRecord(match ? (match as Record<string, unknown>) : null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to load Data Fabric record.');
          setDfRecord(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [caseId, caseInstanceId, sdk]);

  const getFieldSource = useCallback(
    (field: keyof CaseModel): DataFabricFieldSource => {
      if (!caseFromDF) return 'Maestro/SDK';
      const v = caseFromDF[field];
      if (field === 'caller' && v) {
        const caller = v as Caller;
        if (caller.name && caller.name.trim() !== '') return 'Data Fabric';
        return null;
      }
      if (v !== undefined && v !== null && String(v).trim() !== '') return 'Data Fabric';
      return null;
    },
    [caseFromDF]
  );

  const getDfValue = useCallback(
    (keys: string[]): string | number | undefined => {
      if (!dfRecord) return undefined;
      for (const k of keys) {
        const v = dfRecord[k];
        if (v !== undefined && v !== null && String(v).trim() !== '')
          return typeof v === 'number' ? v : String(v);
      }
      return undefined;
    },
    [dfRecord]
  );

  return {
    dfRecord,
    caseFromDF,
    loading,
    error,
    getFieldSource,
    getDfValue,
    placeholderNote: PLACEHOLDER_NOTE,
  };
}
