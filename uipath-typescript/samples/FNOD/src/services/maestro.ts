import type { UiPath } from '@uipath/uipath-typescript';

function unwrapItems(resp: any): any[] {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp.items)) return resp.items;
  if (Array.isArray(resp.value)) return resp.value;
  return [];
}

export async function getMaestroProcesses(sdk: UiPath): Promise<any[]> {
  const resp = await (sdk as any).maestro.processes.getAll();
  return unwrapItems(resp);
}

export async function getMaestroInstances(
  sdk: UiPath,
  options: { processKey: string }
): Promise<any[]> {
  const resp = await (sdk as any).maestro.processes.instances.getAll({
    processKey: options.processKey,
  });
  return unwrapItems(resp);
}

export async function getInstanceDetails(
  sdk: UiPath,
  instanceId: string,
  folderKey: string
): Promise<any> {
  return await (sdk as any).maestro.processes.instances.getById(instanceId, folderKey);
}

export async function getInstanceBpmn(
  sdk: UiPath,
  instanceId: string,
  folderKey: string
): Promise<string> {
  const bpmnXml = await (sdk as any).maestro.processes.instances.getBpmn(instanceId, folderKey);
  return String(bpmnXml || '');
}

export async function getInstanceExecutionHistory(
  sdk: UiPath,
  instanceId: string
): Promise<any[]> {
  const history = await (sdk as any).maestro.processes.instances.getExecutionHistory(instanceId);
  return unwrapItems(history);
}

/**
 * Pause a process instance
 */
export async function pauseInstance(
  sdk: UiPath,
  instanceId: string,
  folderKey: string,
  comment?: string
): Promise<any> {
  return await (sdk as any).maestro.processes.instances.pause(instanceId, folderKey, {
    comment: comment || 'Paused from dashboard',
  });
}

/**
 * Resume a process instance
 */
export async function resumeInstance(
  sdk: UiPath,
  instanceId: string,
  folderKey: string,
  comment?: string
): Promise<any> {
  return await (sdk as any).maestro.processes.instances.resume(instanceId, folderKey, {
    comment: comment || 'Resumed from dashboard',
  });
}

/**
 * Cancel a process instance
 */
export async function cancelInstance(
  sdk: UiPath,
  instanceId: string,
  folderKey: string,
  comment?: string
): Promise<any> {
  return await (sdk as any).maestro.processes.instances.cancel(instanceId, folderKey, {
    comment: comment || 'Cancelled from dashboard',
  });
}

/**
 * Get variables for a process instance
 */
export async function getInstanceVariables(
  sdk: UiPath,
  instanceId: string,
  folderKey: string
): Promise<any> {
  return await (sdk as any).maestro.processes.instances.getVariables(instanceId, folderKey);
}

/**
 * Get incidents for a process instance
 */
export async function getInstanceIncidents(
  sdk: UiPath,
  instanceId: string,
  folderKey: string
): Promise<any[]> {
  const incidents = await (sdk as any).maestro.processes.instances.getIncidents(instanceId, folderKey);
  return unwrapItems(incidents);
}

/**
 * Start a new Maestro process instance
 * Note: Starting Maestro processes directly through the SDK is not supported
 * Maestro processes are typically started by triggers, schedules, or external events
 */
export async function startMaestroProcess(
  sdk: UiPath,
  processKey: string,
  folderKey: string,
  inputArguments?: Record<string, any>
): Promise<any> {
  throw new Error('Starting Maestro processes directly is not supported. Maestro processes are typically started by triggers or events.');
}

/**
 * Retry a faulted instance by starting a new one with the same input
 */
export async function retryInstance(
  sdk: UiPath,
  instanceId: string,
  folderKey: string,
  processKey: string
): Promise<any> {
  // Get the original instance details to extract input
  const instanceDetails = await getInstanceDetails(sdk, instanceId, folderKey);
  
  // Extract input arguments from the instance
  // The input might be in various places depending on the instance structure
  let inputArguments: Record<string, any> = {};
  
  // Try to get input from instance variables
  try {
    const variables = await getInstanceVariables(sdk, instanceId, folderKey);
    if (variables?.globalVariables) {
      // Extract input variables (you may need to adjust this based on your process structure)
      variables.globalVariables.forEach((variable: any) => {
        if (variable.name && variable.value !== undefined) {
          inputArguments[variable.name] = variable.value;
        }
      });
    }
  } catch (e) {
    console.warn('Could not extract input from variables:', e);
  }

  // Try to get input from instance details
  if (instanceDetails?.inputArguments) {
    try {
      const parsed = typeof instanceDetails.inputArguments === 'string' 
        ? JSON.parse(instanceDetails.inputArguments)
        : instanceDetails.inputArguments;
      inputArguments = { ...inputArguments, ...parsed };
    } catch (e) {
      console.warn('Could not parse inputArguments:', e);
    }
  }

  // Convert folderKey to folderId if needed
  const folderId = typeof folderKey === 'string' && !isNaN(Number(folderKey)) 
    ? Number(folderKey) 
    : folderKey;

  return await startMaestroProcess(sdk, processKey, folderId, inputArguments);
}
