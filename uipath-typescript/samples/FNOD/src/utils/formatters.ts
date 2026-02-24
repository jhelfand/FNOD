export const getStatusColor = (status: string) => {
  const s = status.toLowerCase();
  // Maestro / process statuses
  if (['running', 'resumed'].includes(s)) return 'bg-blue-100 text-blue-800';
  if (['completed', 'successful', 'success', 'paid', 'ready to pay', 'pass'].includes(s)) return 'bg-green-100 text-green-800';
  if (['faulted', 'failed', 'denied', 'fail', 'error'].includes(s)) return 'bg-red-100 text-red-800';
  if (['pending', 'waiting', 'docs pending', 'pending payment'].includes(s)) return 'bg-yellow-100 text-yellow-800';
  if (['paused', 'pausing', 'cancelling', 'canceling'].includes(s)) return 'bg-amber-100 text-amber-800';
  if (['cancelled', 'canceled'].includes(s)) return 'bg-gray-100 text-gray-800';
  // Underwriting statuses (partial match)
  if (s.includes('policy review') || s.includes('review')) return 'bg-amber-100 text-amber-800';
  if (s.includes('ready') || s.includes('complete')) return 'bg-green-100 text-green-800';
  if (s.includes('pending') || s.includes('docs')) return 'bg-yellow-100 text-yellow-800';
  return 'bg-gray-100 text-gray-800';
};

export const formatDuration = (startTime: string, endTime?: string) => {
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date();
  const durationMs = end.getTime() - start.getTime();
  
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
};

export const formatProcessName = (packageId: string) => {
  return packageId
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export const getEmbedTaskUrl = (taskUrl: string) => {
  try {
    // Extract parts from the URL
    const url = new URL(taskUrl);
    const parts = url.pathname.split('/');
    const orgId = parts[1];
    const tenantId = parts[2];
    const taskId = parts[parts.length - 1];
    
    // Construct the embed URL
    return `${url.origin}/embed_/${orgId}/${tenantId}/actions_/current-task/tasks/${taskId}`;
  } catch (e) {
    console.error('Error parsing task URL:', e);
    return taskUrl;
  }
};

/**
 * Build embed URL for an Action Center task from task ID.
 * Uses VITE_UIPATH_* env vars.
 */
export function buildTaskEmbedUrl(taskId: number): string {
  const baseUrl = import.meta.env.VITE_UIPATH_BASE_URL || 'https://staging.uipath.com';
  const orgName = import.meta.env.VITE_UIPATH_ORG_NAME || '82e69757-09ff-4e6d-83e7-d530f2ac4e7b';
  const tenantName = import.meta.env.VITE_UIPATH_TENANT_NAME || 'Playground';
  return `${baseUrl}/embed_/${orgName}/${tenantName}/actions_/current-task/tasks/${taskId}`;
}