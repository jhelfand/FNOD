import React, { useState, useEffect } from 'react';
import Modal from '../ui/modal';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/use-toast';

interface IndividualPoliciesModalProps {
  open: boolean;
  onClose: () => void;
  individualName: string;
  individualType: 'decedent' | 'caller';
}

interface PolicyRecord {
  id: string;
  policyNumber: string;
  policyType?: string;
  faceValue?: number;
  status?: string;
  claimEffectiveDate?: string;
  [key: string]: any;
}

export const IndividualPoliciesModal: React.FC<IndividualPoliciesModalProps> = ({
  open,
  onClose,
  individualName,
  individualType,
}) => {
  const { sdk } = useAuth();
  const { toast } = useToast();
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && individualName && sdk) {
      loadPolicies();
    } else {
      setPolicies([]);
      setError(null);
    }
  }, [open, individualName, sdk]);

  const loadPolicies = async () => {
    if (!sdk || !individualName) return;

    setIsLoading(true);
    setError(null);

    try {
      const entityId = import.meta.env.VITE_UIPATH_ENTITY_ID;
      if (!entityId) {
        setError('Entity ID not configured');
        setIsLoading(false);
        return;
      }

      console.debug('[IndividualPoliciesModal] Loading policies for:', individualName, 'type:', individualType);

      // Fetch all records from Data Fabric and filter client-side for reliability
      const res: any = await sdk.entities.getRecordsById(entityId as string, {
        pageSize: 500, // Get more records to ensure we find all policies
      });

      let items: any[] = [];
      if (Array.isArray(res)) items = res;
      else if (res && res.items) items = res.items;
      else if (res && res.data) items = res.data;

      console.debug('[IndividualPoliciesModal] Total records from DF:', items.length);

      // Normalize the search name for comparison
      const searchName = individualName.toLowerCase().trim();
      
      // Helper to normalize names for comparison (handles variations in formatting)
      const normalizeForComparison = (name: string | undefined | null): string => {
        if (!name) return '';
        return name.toLowerCase().trim();
      };

      // Helper to check if names match (allows for partial matching)
      const namesMatch = (recordName: string | undefined | null): boolean => {
        const normalized = normalizeForComparison(recordName);
        if (!normalized) return false;
        // Check for exact match or if one contains the other
        return normalized === searchName || 
               normalized.includes(searchName) || 
               searchName.includes(normalized);
      };

      // Helper to check if a record matches the individual
      const matchesIndividual = (item: any): boolean => {
        if (individualType === 'decedent') {
          // Check all possible decedent name fields
          const decedentFields = [
            item.DecedentName,
            item.decedentName,
            item.Decedent_Name,
            item.decedent_name,
            item.PolicyHolderName,
            item.policyHolderName,
            item.InsuredName,
            item.insuredName
          ];
          return decedentFields.some(namesMatch);
        } else {
          // Check all possible caller name fields
          const callerFields = [
            item.FNODCaller,
            item.CallerName,
            item.callerName,
            item.Caller_Name,
            item.caller_name,
            item.ContactName,
            item.contactName
          ];
          return callerFields.some(namesMatch);
        }
      };

      // Extract unique policies from matching records
      const policiesMap = new Map<string, PolicyRecord>();

      items.forEach((item: any) => {
        if (matchesIndividual(item)) {
          const policyNumber = item.PolicyNumber || item.policyNumber || item.Policy_Number;
          if (!policyNumber) return;

          // If we already have this policy, skip (keep first occurrence)
          if (!policiesMap.has(policyNumber)) {
            const getField = (obj: any, keys: string[]) => {
              for (const k of keys) {
                if (obj[k] !== undefined && obj[k] !== null) return obj[k];
              }
              return null;
            };

            policiesMap.set(policyNumber, {
              id: item.Id || item.id || policyNumber,
              policyNumber,
              policyType: getField(item, ['PolicyType', 'ProductType', 'productType', 'Product_Type']) || 'Unknown',
              faceValue: getField(item, ['PolicyValues', 'policyvalue1', 'PolicyValue', 'FaceValue', 'faceValue', 'Amount', 'Face_Value']),
              status: getField(item, ['Status', 'status', 'PolicyStatus', 'Policy_Status']),
              claimEffectiveDate: getField(item, ['ClaimEffectiveDate', 'claimEffectiveDate', 'EffectiveDate', 'FNODDate', 'Effective_Date']),
              ...item,
            });
            console.debug('[IndividualPoliciesModal] Found matching policy:', policyNumber);
          }
        }
      });

      const uniquePolicies = Array.from(policiesMap.values());
      console.debug('[IndividualPoliciesModal] Unique policies found:', uniquePolicies.length);
      setPolicies(uniquePolicies);

      if (uniquePolicies.length === 0) {
        setError(`No policies found for "${individualName}"`);
      }
    } catch (err: any) {
      console.error('[IndividualPoliciesModal] Error loading policies:', err);
      setError(err?.message || 'Failed to load policies');
      toast({
        title: 'Error',
        description: 'Failed to load policies from Data Fabric.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadge = (status: string | undefined) => {
    if (!status) return null;
    const statusLower = status.toLowerCase();
    if (statusLower.includes('review')) {
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs">In Review</span>;
    }
    if (statusLower.includes('pending')) {
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs">Pending</span>;
    }
    if (statusLower.includes('ready') || statusLower.includes('paid')) {
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs">{status}</span>;
    }
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">{status}</span>;
  };

  return (
    <Modal open={open} onClose={onClose} title={`Policies for ${individualName}`}>
      <div className="space-y-4">
        <div className="text-sm text-gray-600">
          {individualType === 'decedent' 
            ? `Showing all policies associated with the decedent: ${individualName}`
            : `Showing all policies associated with the caller: ${individualName}`
          }
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Loading policies...</span>
          </div>
        )}

        {error && !isLoading && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {!isLoading && !error && policies.length === 0 && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-md text-center">
            <p className="text-sm text-gray-600">No policies found for this individual.</p>
          </div>
        )}

        {!isLoading && !error && policies.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
              <div className="grid grid-cols-12 gap-4 text-sm font-semibold text-gray-700">
                <div className="col-span-3">Policy Number</div>
                <div className="col-span-3">Type</div>
                <div className="col-span-2 text-right">Face Value</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Effective Date</div>
              </div>
            </div>
            <div className="divide-y divide-gray-200">
              {policies.map((policy) => (
                <div
                  key={policy.id}
                  className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="col-span-3 text-sm font-medium text-gray-900">
                    {policy.policyNumber}
                  </div>
                  <div className="col-span-3 text-sm text-gray-600">
                    {policy.policyType || '—'}
                  </div>
                  <div className="col-span-2 text-right text-sm font-medium">
                    {formatCurrency(policy.faceValue)}
                  </div>
                  <div className="col-span-2">
                    {getStatusBadge(policy.status)}
                  </div>
                  <div className="col-span-2 text-sm text-gray-600">
                    {policy.claimEffectiveDate
                      ? new Date(policy.claimEffectiveDate).toLocaleDateString()
                      : '—'}
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-gray-50 border-t border-gray-200 px-4 py-3">
              <div className="text-sm text-gray-600">
                Total: <span className="font-semibold">{policies.length}</span> {policies.length === 1 ? 'policy' : 'policies'}
                {policies.reduce((sum, p) => sum + (p.faceValue || 0), 0) > 0 && (
                  <span className="ml-4">
                    • Total Value: <span className="font-semibold">
                      {formatCurrency(policies.reduce((sum, p) => sum + (p.faceValue || 0), 0))}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default IndividualPoliciesModal;

