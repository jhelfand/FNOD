import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProcessInstanceExecutionHistoryResponse } from '@uipath/uipath-typescript';

import BpmnJS from 'bpmn-js/lib/NavigatedViewer';

import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';

interface BpmnViewerProps {
  bpmnXml: string;
  executionHistory?: ProcessInstanceExecutionHistoryResponse[];
}

type Status = 'completed' | 'running' | 'faulted' | 'pending';

type ActivityStatus = {
  // what we saw in history
  name?: string;
  status: Status;
  startTime?: string;
  endTime?: string;

  // best-effort identifiers from history
  historyIds: string[];
};

function norm(s: unknown): string {
  return String(s ?? '').trim();
}

function normKey(s: unknown): string {
  return norm(s).toLowerCase();
}

function toHistoryIds(span: any): string[] {
  const candidates = [
    // most likely for BPMN element mapping
    span?.activityKey,
    span?.activityId,
    span?.activityID,
    span?.bpmnActivityId,
    span?.bpmnElementId,
    span?.bpmnElementID,
    span?.elementId,
    span?.elementID,
    span?.nodeId,
    span?.nodeID,

    // sometimes nested
    span?.activity?.id,
    span?.activity?.key,
    span?.activity?.name,
    span?.node?.id,
    span?.node?.key,
    span?.node?.name,

    // fallback
    span?.name,
  ]
    .map(norm)
    .filter(Boolean);

  return Array.from(new Set(candidates));
}


function computeStatus(span: any): Status {
  const statusRaw = normKey(span?.status ?? span?.state ?? '');
  const hasStart = !!span?.startTime;
  const hasEnd = !!span?.endTime;

  if (statusRaw.includes('fault') || statusRaw.includes('fail') || statusRaw.includes('error')) {
    return 'faulted';
  }

  // Treat gateway-style executions as completed
  if (hasEnd && !hasStart) {
    return 'completed';
  }

  if (hasEnd && (
    statusRaw.includes('complete') ||
    statusRaw.includes('success') ||
    statusRaw.includes('done') ||
    statusRaw.includes('finish')
  )) {
    return 'completed';
  }

  if (hasStart && !hasEnd) {
    return 'running';
  }

  return 'pending';
}


/**
 * Create a lookup so we can match execution spans to BPMN nodes by:
 * - diagram element id (el.id)
 * - BPMN businessObject.id
 * - element name
 */
function buildElementIndex(elementRegistry: any) {
  const byKey = new Map<string, string>(); // key -> canvas element id
  const all = elementRegistry.getAll?.() ?? [];

  for (const el of all) {
    const canvasId = norm(el?.id);

    const bo = el?.businessObject;
    const boId = norm(bo?.id);
    const boName = norm(bo?.name);

    // NOTE: do NOT access bo.di (will crash in bpmn-js)
    // Use only safe properties on businessObject.

    for (const k of [canvasId, boId]) {
      if (k) byKey.set(normKey(k), canvasId);
    }

    if (boName) {
      byKey.set(normKey(boName), canvasId);
      byKey.set(normKey(boName.replace(/\s+/g, '')), canvasId);
      byKey.set(normKey(boName.replace(/[^a-z0-9]/gi, '')), canvasId);
    }
  }

  return { byKey, all };
}



/**
 * Try to find the BPMN canvas element id that best matches this span.
 */
function matchSpanToElementId(span: any, index: ReturnType<typeof buildElementIndex>): string | null {
  const ids = toHistoryIds(span);

  // also treat span.name as an id candidate (Gateway_70pcDT etc.)
  const name = norm(span?.name);
  if (name) ids.unshift(name);

  // 1) exact match
  for (const id of ids) {
    const hit = index.byKey.get(normKey(id));
    if (hit) return hit;
  }

  // 2) normalized forms (strip spaces/punct)
  for (const id of ids) {
    const n1 = normKey(id.replace(/\s+/g, ''));
    const n2 = normKey(id.replace(/[^a-z0-9]/gi, ''));
    const hit = index.byKey.get(n1) ?? index.byKey.get(n2);
    if (hit) return hit;
  }

  return null;
}


export function BpmnViewer({ bpmnXml, executionHistory }: BpmnViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  // Triggers marker application only after importXML has completed
  const [diagramReadyTick, setDiagramReadyTick] = useState(0);

  // Keep last non-empty history so markers don't flicker to "none" during polling
  const [stableHistory, setStableHistory] = useState<ProcessInstanceExecutionHistoryResponse[]>([]);
  useEffect(() => {
    if (Array.isArray(executionHistory) && executionHistory.length > 0) {
      setStableHistory(executionHistory);
    }
  }, [executionHistory]);
  

  // Build statuses from execution history
  const activityStatuses = useMemo(() => {
    // Normalize execution history into a flat list of objects
    const raw = (stableHistory ?? []) as any[];

    const flat: any[] = raw.flatMap((item) => {
      // If the SDK returns tuples/arrays, merge object-like entries
      if (Array.isArray(item)) {
        const objs = item.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
        if (objs.length === 0) return [];
        if (objs.length === 1) return [objs[0]];
        // merge two objects (common tuple shape)
        return [Object.assign({}, ...objs)];
      }

      // If it's already an object, keep it
      if (item && typeof item === 'object') return [item];

      return [];
    });

    const result: ActivityStatus[] = [];
    if (!flat.length) return result;

    // sort by start time (chronological)
    const sorted = [...flat].sort((a, b) => {
      const at = a?.startTime ? new Date(a.startTime).getTime() : 0;
      const bt = b?.startTime ? new Date(b.startTime).getTime() : 0;
      return at - bt;
    });

    for (const span of sorted) {
      const historyIds = toHistoryIds(span);
    
      // Filter: keep only entries that look like an activity execution
      // (must have startTime OR a non-instance id/key OR a specific activity-ish field)
      const name = norm(span?.name ?? span?.activityName ?? span?.displayName ?? span?.activity?.name ?? span?.node?.name);
    
      const looksInstanceLevel =
        name.toLowerCase().startsWith('instance:') ||
        name.toLowerCase().startsWith('process instance') ||
        name.toLowerCase().includes('instance ') ||
        name.toLowerCase().includes('process instance');
    
      // Much looser filter:
      // Maestro history often doesn't include startTime for every step,
      // and activity ids may be nested / renamed across SDK versions.
      // If it has a "name-like" signal, keep it and let matching decide.
      const hasUsefulName =
      !!name &&
      name.length > 2 &&
      !looksInstanceLevel;

      if (!hasUsefulName) {
      continue;
      }

    
      const status = computeStatus(span);
    
      result.push({
        name,
        status,
        startTime: span?.startTime,
        endTime: span?.endTime,
        historyIds,
      });
    }
    

    return result;
  }, [stableHistory]);



  // find "current" running activity (latest startTime where running)
  const currentRunning = useMemo(() => {
    let best: ActivityStatus | null = null;
    let bestT = 0;

    for (const s of activityStatuses) {
      if (s.status !== 'running' || !s.startTime) continue;
      const t = new Date(s.startTime).getTime();
      if (t > bestT) {
        bestT = t;
        best = s;
      }
    }
    return best;
  }, [activityStatuses]);

  // Create/destroy viewer only when BPMN changes
  useEffect(() => {
    async function render() {
      if (!containerRef.current || !bpmnXml) return;

      // destroy old
      if (viewerRef.current) {
        try { viewerRef.current.destroy(); } catch {}
        viewerRef.current = null;
      }

      const viewer = new (BpmnJS as any)({
        container: containerRef.current,
      
        // Explicitly enable interaction
        keyboard: {
          bindTo: document,
        },
      });
      viewerRef.current = viewer;

      try {
        await viewer.importXML(bpmnXml);
      
        // --- Center-zoom wheel/trackpad behavior ---
        // bpmn-js default zoom behavior can feel like it zooms "away" from where you want.
        // This forces zooming around the viewport center.
        const canvas = viewer.get('canvas');
      
        const el = containerRef.current;
        if (el) {
          const onWheel = (evt: WheelEvent) => {
            evt.preventDefault();
      
            const viewbox = canvas.viewbox();
            const center = {
              x: viewbox.x + viewbox.width / 2,
              y: viewbox.y + viewbox.height / 2,
            };
      
            const delta = evt.deltaY;
            const direction = delta > 0 ? -1 : 1; // deltaY>0 usually means zoom out
            const factor = evt.ctrlKey ? 1.06 : 1.12; // pinch vs wheel
      
            const current = canvas.zoom();
            const next = direction > 0 ? current * factor : current / factor;
            const clamped = Math.max(0.2, Math.min(4, next));
      
            canvas.zoom(clamped, center);
          };
      
          el.addEventListener('wheel', onWheel, { passive: false });
          (viewer as any).__onWheel = onWheel; // stash for cleanup
        }
      
        // IMPORTANT: only now is elementRegistry populated
        // This triggers marker application below
        setDiagramReadyTick((n) => n + 1);
        // END IMPORTANT
      
        const eventBus = viewer.get('eventBus');
      
        canvas.zoom('fit-viewport');
        const viewbox = canvas.viewbox();
        setZoomLevel(viewbox.scale || 1);
      
        eventBus.on('canvas.viewbox.changed', (e: any) => {
          setZoomLevel(e.viewbox.scale || 1);
        });
      } catch (e) {
        // Maestro BPMN sometimes logs SequenceFlow warnings; still render what we can
        // eslint-disable-next-line no-console
        console.error('Failed to import BPMN', e);
      }
    }

    void render();

    return () => {
      if (viewerRef.current) {
        const el = containerRef.current;
        const onWheel = (viewerRef.current as any)?.__onWheel;
        if (el && onWheel) {
          el.removeEventListener('wheel', onWheel as any);
        }
    
        try { viewerRef.current.destroy(); } catch {}
        viewerRef.current = null;
      }
    };
    
  }, [bpmnXml]);

  // Apply markers whenever history changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const canvas = viewer.get('canvas');
    const elementRegistry = viewer.get('elementRegistry');
    const overlays = viewer.get('overlays', false);

    const index = buildElementIndex(elementRegistry);
    if (!index.all.length) {
      // eslint-disable-next-line no-console
      console.log('Diagram not ready yet (elementRegistry empty) - skipping marker apply');
      return;
    }
    
    console.log('Sample normalized span:', activityStatuses[0]);

    // IMPORTANT: don't clear the diagram if the API briefly returns empty during polling.
    // Keep the last drawn markers until we have new data.
    if (!activityStatuses.length) {
      // eslint-disable-next-line no-console
      console.log('No activityStatuses - skipping marker wipe/apply to avoid flicker');
      return;
    }




    // wipe markers first
    for (const el of index.all) {
      canvas.removeMarker(el.id, 'uipath-completed');
      canvas.removeMarker(el.id, 'uipath-running');
      canvas.removeMarker(el.id, 'uipath-faulted');
      canvas.removeMarker(el.id, 'uipath-current');
    }

    // wipe overlays (safe)
    if (overlays) {
      try {
        for (const el of index.all) overlays.remove({ element: el });
      } catch {}
    }

    // Apply markers by matching each span to a BPMN element id
    let applied = 0;

    for (const span of activityStatuses) {
      const elId = matchSpanToElementId(span, index);
      if (!elId) continue;

      if (span.status === 'completed') {
        canvas.addMarker(elId, 'uipath-completed');
        applied++;
      } else if (span.status === 'running') {
        canvas.addMarker(elId, 'uipath-running');
        applied++;
      } else if (span.status === 'faulted') {
        canvas.addMarker(elId, 'uipath-faulted');
        applied++;
      }
    }

    // Current running highlight (stronger styling)
    if (currentRunning) {
      const elId = matchSpanToElementId(currentRunning, index);
      if (elId) {
        canvas.addMarker(elId, 'uipath-current');

        // optional pulsing dot overlay
        if (overlays) {
          try {
            overlays.add(elId, 'uipath-current-dot', {
              position: { top: -10, right: -10 },
              html:
                '<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 0 0 2px #2563eb,0 0 12px rgba(37,99,235,.6);animation:uipathPulseDot 1.5s ease-in-out infinite;"></div>',
            });
          } catch {}
        }
      }
    }

    // helpful debug
    // eslint-disable-next-line no-console
    console.log(`BPMN status markers applied: ${applied} (spans: ${activityStatuses.length}, elements: ${index.all.length})`);
  }, [diagramReadyTick, activityStatuses, currentRunning]);

  // Zoom controls
  const handleZoomIn = () => {
    if (viewerRef.current) {
      const canvas = viewerRef.current.get('canvas');
      canvas.zoom(canvas.zoom() * 1.2);
    }
  };
  const handleZoomOut = () => {
    if (viewerRef.current) {
      const canvas = viewerRef.current.get('canvas');
      canvas.zoom(canvas.zoom() * 0.8);
    }
  };
  const handleZoomFit = () => {
    if (viewerRef.current) {
      const canvas = viewerRef.current.get('canvas');
      canvas.zoom('fit-viewport');
    }
  };
  const handleZoomReset = () => {
    if (viewerRef.current) {
      const canvas = viewerRef.current.get('canvas');
      canvas.zoom(1);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={handleZoomOut} className="px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">−</button>
          <span className="text-xs text-gray-600 min-w-[4rem] text-center">{Math.round(zoomLevel * 100)}%</span>
          <button onClick={handleZoomIn} className="px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">+</button>
          <button onClick={handleZoomFit} className="px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">Fit</button>
          <button onClick={handleZoomReset} className="px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">1:1</button>
        </div>
        <div className="text-xs text-gray-500">Use mouse wheel to zoom • Drag to pan</div>
      </div>

      <div
      ref={containerRef}
      tabIndex={0}
      className="w-full h-[28rem] border border-gray-200 rounded bg-white relative outline-none"
      style={{
        touchAction: 'none',
        overscrollBehavior: 'contain',
      }}
    />

      {/* Styles for markers */}
      <style>
  {`
    @keyframes uipathDash {
      to { stroke-dashoffset: -18; }
    }

    /* IMPORTANT:
      bpmn-js renders shapes with nested SVG:
      .djs-element.uipath-* (marker class) -> .djs-visual -> (g) -> rect/path/polygon/circle/ellipse/polyline...
      So target DESCENDANTS, not :first-child.
    */

    /* COMPLETED = green fill + green border */
    .djs-element.uipath-completed .djs-visual rect,
    .djs-element.uipath-completed .djs-visual path,
    .djs-element.uipath-completed .djs-visual polygon,
    .djs-element.uipath-completed .djs-visual circle,
    .djs-element.uipath-completed .djs-visual ellipse,
    .djs-element.uipath-completed .djs-visual polyline,
    .djs-element.uipath-completed .djs-visual line {
      fill: #bbf7d0 !important;
      fill-opacity: 0.9 !important;
      stroke: #16a34a !important;
      stroke-width: 4px !important;
    }

    /* RUNNING = animated blue border (no fill changes) */
    .djs-element.uipath-running .djs-visual rect,
    .djs-element.uipath-running .djs-visual path,
    .djs-element.uipath-running .djs-visual polygon,
    .djs-element.uipath-running .djs-visual circle,
    .djs-element.uipath-running .djs-visual ellipse,
    .djs-element.uipath-running .djs-visual polyline,
    .djs-element.uipath-running .djs-visual line {
      stroke: #2563eb !important;
      stroke-width: 5px !important;
      stroke-dasharray: 10 8 !important;
      animation: uipathDash 1s linear infinite !important;
      fill-opacity: 1 !important;
    }

    /* CURRENT = extra glow on top of running */
    .djs-element.uipath-current .djs-visual rect,
    .djs-element.uipath-current .djs-visual path,
    .djs-element.uipath-current .djs-visual polygon,
    .djs-element.uipath-current .djs-visual circle,
    .djs-element.uipath-current .djs-visual ellipse,
    .djs-element.uipath-current .djs-visual polyline,
    .djs-element.uipath-current .djs-visual line {
      filter: drop-shadow(0 0 8px rgba(37, 99, 235, 0.75)) !important;
    }

    /* FAULTED = red fill + red border */
    .djs-element.uipath-faulted .djs-visual rect,
    .djs-element.uipath-faulted .djs-visual path,
    .djs-element.uipath-faulted .djs-visual polygon,
    .djs-element.uipath-faulted .djs-visual circle,
    .djs-element.uipath-faulted .djs-visual ellipse,
    .djs-element.uipath-faulted .djs-visual polyline,
    .djs-element.uipath-faulted .djs-visual line {
      fill: #fecaca !important;
      fill-opacity: 0.95 !important;
      stroke: #dc2626 !important;
      stroke-width: 4px !important;
    }

    /* Optional: make labels readable */
    .djs-element.uipath-completed .djs-label text,
    .djs-element.uipath-running .djs-label text,
    .djs-element.uipath-faulted .djs-label text,
    .djs-element.uipath-current .djs-label text {
      font-weight: 700 !important;
    }
  `}
</style>

    </div>
  );
}
