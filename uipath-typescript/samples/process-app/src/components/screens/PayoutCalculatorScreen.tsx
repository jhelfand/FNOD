import { useState, useEffect } from 'react';
import { useCase } from '../../contexts/CaseContext';
import { useUiPathSdk } from '../../hooks/useUiPathSdk';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import Modal from '../ui/modal';
import { useToast } from '../../hooks/use-toast';
import { useAuth } from '../../hooks/useAuth';
import mergeBeneficiaries from '../../utils/beneficiary-normalize';
import { getDfFieldString } from '../../utils/data-fabric';

// Small inline icons used for action buttons (keeps no external icon dependency)
const IconCheck = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.2" />
    <path d="M9 12.5l2 2 4-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

const IconPlane = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M22 2L11 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M22 2l-7 20  -3-8-8-3 20-9z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="currentColor" fillOpacity="0.06" />
  </svg>
);

// Minimal local types to match expected data shape
type Beneficiary = { id: string; name: string; relationship?: string; paymentMethod?: string; percentage?: number; dob?: string; address?: string };
type PayoutCalculation = {
  beneficiaryId: string;
  baseShare: number;
  grossAmount: number;
  interestCredit: number;
  loanDeduction: number;
  withdrawalDeduction: number;
  riderAdjustment: number;
  taxableAmount: number;
  nonTaxableAmount: number;
  federalWithholding: number;
  stateWithholding: number;
};
type PayoutSummary = {
  totalFaceValue: number;
  draftTotalPayout: number;
  beneficiaryPayouts: PayoutCalculation[];
  totalDeductions: number;
  totalInterest: number;
  stateJurisdiction: string;
  stateInterestRate: number;
};

interface PayoutCalculatorScreenProps {
  onNavigate?: (tab: string) => void;
}

export default function PayoutCalculatorScreen({ onNavigate }: PayoutCalculatorScreenProps) {
  const { currentCase, selectedPolicy, selectedDfRecord, completeStep, completeAllSteps, setCaseStatus, setCurrentStep, setPolicyStatus } = useCase();
  const { services } = useUiPathSdk();
  const { toast } = useToast();
  const { sdk } = useAuth();

  const [payoutSummary, setPayoutSummary] = useState<PayoutSummary | null>(null);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [selectedBeneficiaryTab, setSelectedBeneficiaryTab] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [showDeductionsDialog, setShowDeductionsDialog] = useState(false);
  const [showInterestDialog, setShowInterestDialog] = useState(false);
  const [dfData, setDfData] = useState<any>(null);

  // Clear dfData when selected policy or DF record changes
  useEffect(() => {
    setDfData(null);
  }, [selectedPolicy?.id, selectedDfRecord?.Id, selectedDfRecord?.id]);

  // Query DF for policy data (now returns multiple beneficiary records)
  useEffect(() => {
    const loadPolicyDfData = async () => {
      if (!sdk) return;
      
      // Get policy number from selectedDfRecord first, then fall back to selectedPolicy
      const dfPolicyNumber = selectedDfRecord?.PolicyNumber || selectedDfRecord?.policyNumber;
      const selectedPolicyNumber = selectedPolicy?.policyNumber?.replace(/^TL-/, '');
      const policyNumeric = dfPolicyNumber || selectedPolicyNumber;
      
      if (!policyNumeric) return;
      
      console.log('[PayoutCalculatorScreen] Querying DF for policy:', policyNumeric);
      
      try {
        const entityId = import.meta.env.VITE_UIPATH_ENTITY_ID;
        if (!entityId) return;

        const res: any = await sdk.entities.getRecordsById(entityId as string, {
          filter: `PolicyNumber eq '${policyNumeric}'`,
          pageSize: 100
        });

        let items: any[] = [];
        if (Array.isArray(res)) items = res;
        else if (res && res.items) items = res.items;
        else if (res && res.data) items = res.data;
        
        if (items.length > 0) {
          const filtered = items.filter(item => {
            const itemPolicyNum = String(item.PolicyNumber || item.policyNumber || item.PolicyNumberBeneficiary || '');
            return itemPolicyNum.includes(policyNumeric);
          });
          
          console.log('[PayoutCalculatorScreen] DF Data loaded - all beneficiary records:', filtered);
          if (filtered.length > 0) {
            filtered.forEach((record, idx) => {
              console.log(`[PayoutCalculatorScreen] Beneficiary ${idx + 1} fields:`, {
                BeneficiaryBase: record.BeneficiaryBase,
                BeneficiaryTotal: record.BeneficiaryTotal,
                BeneficiaryAdjustment: record.BeneficiaryAdjustment,
                InterestCredit: record.InterestCredit,
                FederalWithholding: record.FederalWithholding,
                StateWithholding: record.StateWithholding,
                OutstandingDeductions: record.OutstandingDeductions
              });
            });
            setDfData(filtered); // Store all beneficiary records
          }
        }
      } catch (error) {
        console.error('[PayoutCalculatorScreen] Failed to load DF data:', error);
      }
    };

    loadPolicyDfData();
  }, [selectedPolicy, selectedDfRecord, sdk]);

  useEffect(() => { loadPayoutData(); }, [selectedPolicy, selectedDfRecord, dfData]);

  const loadPayoutData = async () => {
    if (!selectedPolicy && !selectedDfRecord) return;
    setIsLoading(true);
    try {
      const [summary, bens] = await Promise.all([
        services.getPayoutSummary?.(selectedPolicy.id),
        services.getBeneficiaries?.(selectedPolicy.id),
      ]);

      // Use DF data if available (now it's an array of beneficiary records)
      const dfBeneficiaryRecords = Array.isArray(dfData) ? dfData : (dfData ? [dfData] : []);
      const hasDfData = dfBeneficiaryRecords.length > 0;
      
      // Calculate totals from all beneficiary records
      let totalInterest = 0;
      let totalDeductions = 0;
      let totalFaceValue = selectedPolicy.faceValue || 0;
      
      if (hasDfData) {
        totalInterest = dfBeneficiaryRecords.reduce((sum, record) => 
          sum + (record.InterestCredit ? Number(record.InterestCredit) : 0), 0);
        totalDeductions = dfBeneficiaryRecords.reduce((sum, record) => 
          sum + (record.OutstandingDeductions ? Number(record.OutstandingDeductions) : 0), 0);
        if (dfBeneficiaryRecords[0]?.PolicyValues) {
          totalFaceValue = Number(dfBeneficiaryRecords[0].PolicyValues);
        }
      }
      
      let resolvedSummary = summary ?? {
        totalFaceValue,
        draftTotalPayout: 0,
        beneficiaryPayouts: [],
        totalDeductions,
        totalInterest,
        stateJurisdiction: selectedPolicy.state || 'Unknown',
        stateInterestRate: 0,
      };

      // Use DF beneficiary data if available
      const resolvedBens = (bens && bens.length > 0) ? bens : [
        { id: 'ben-1', name: 'Anna J Anderson', relationship: 'Child', paymentMethod: 'ACH', percentage: 50, dob: '1976-08-08', address: '1354 Smith Street NW, Eagle, NM 46661' },
        { id: 'ben-2', name: 'Nicole V Anderson', relationship: 'Child', paymentMethod: 'Check', percentage: 50, dob: '1978-10-26', address: '4574 Flower Drive, Lewis, WI 45864' }
      ];

      // Build payouts from DF beneficiary records if available
      const demoPayouts: PayoutCalculation[] = resolvedSummary.beneficiaryPayouts && resolvedSummary.beneficiaryPayouts.length > 0
        ? resolvedSummary.beneficiaryPayouts
        : hasDfData
        ? dfBeneficiaryRecords.map((record, idx) => ({
            beneficiaryId: `ben-${idx + 1}`,
            baseShare: record.BeneficiaryBase ? Number(record.BeneficiaryBase) : 0,
            grossAmount: record.BeneficiaryTotal ? Number(record.BeneficiaryTotal) : 0,
            interestCredit: record.InterestCredit ? Number(record.InterestCredit) : 0,
            loanDeduction: 0,
            withdrawalDeduction: 0,
            riderAdjustment: record.BeneficiaryAdjustment ? Number(record.BeneficiaryAdjustment) : 0,
            taxableAmount: 0,
            nonTaxableAmount: record.BeneficiaryTotal ? Number(record.BeneficiaryTotal) : 0,
            federalWithholding: record.FederalWithholding ? Number(record.FederalWithholding) : 0,
            stateWithholding: record.StateWithholding ? Number(record.StateWithholding) : 0
          }))
        : [
          {
            beneficiaryId: 'ben-1', baseShare: 300000, grossAmount: 300172.6, interestCredit: 172.6,
            loanDeduction: 0, withdrawalDeduction: 0, riderAdjustment: 0, taxableAmount: 0, nonTaxableAmount: 300172.6,
            federalWithholding: 0, stateWithholding: 0
          },
          {
            beneficiaryId: 'ben-2', baseShare: 200000, grossAmount: 200115.07, interestCredit: 115.07,
            loanDeduction: 0, withdrawalDeduction: 0, riderAdjustment: 0, taxableAmount: 0, nonTaxableAmount: 200115.07,
            federalWithholding: 0, stateWithholding: 0
          }
        ];

      // compute draft total payout from demo payouts
      // grossAmount (BeneficiaryTotal) already includes all adjustments, so just subtract withholdings
      const computedDraft = demoPayouts.reduce((acc, p) => acc + p.grossAmount - (p.federalWithholding + p.stateWithholding), 0);

      resolvedSummary = { ...resolvedSummary, beneficiaryPayouts: demoPayouts, draftTotalPayout: computedDraft, totalInterest: 0 };

      // Ensure the displayed beneficiaries line up with the payout rows. If backend beneficiaries
      // don't include matching IDs for the payout rows, fall back to demo beneficiaries (Anna/Nicole)
      const demoById: Record<string, Beneficiary> = {
        'ben-1': { id: 'ben-1', name: 'Anna J Anderson', relationship: 'Child', paymentMethod: 'ACH', percentage: 50, dob: '1976-08-08', address: '1354 Smith Street NW, Eagle, NM 46661' },
        'ben-2': { id: 'ben-2', name: 'Nicole V Anderson', relationship: 'Child', paymentMethod: 'Check', percentage: 50, dob: '1978-10-26', address: '4574 Flower Drive, Lewis, WI 45864' }
      };

      // Build a beneficiaries array that follows the payout order and falls back to demo values
      let mergedBeneficiaries: Beneficiary[] = resolvedSummary.beneficiaryPayouts.map(p => {
        const found = (resolvedBens || []).find(b => String(b.id) === String(p.beneficiaryId));
        if (found) return found;
        // fallback to demo mapping or a minimal placeholder
        return demoById[p.beneficiaryId] ?? { id: p.beneficiaryId, name: 'Unknown', percentage: 0 } as Beneficiary;
      });

      // If a DF record has been selected at the Case level, prefer its beneficiary fields
      try {
        if (selectedDfRecord) {
          const dfItems: any[] = Array.isArray(selectedDfRecord.Beneficiaries) ? selectedDfRecord.Beneficiaries : [selectedDfRecord];
          if (dfItems && dfItems.length) {
            const dfBens = dfItems.map((it: any, idx: number) => ({
              id: it.Id ?? it.id ?? `df-${idx}`,
              name: (it.BeneficiaryFirstName || it.FirstName ? `${it.BeneficiaryFirstName || it.FirstName} ${it.BeneficiaryLastName || it.LastName}` : it.name) || `Beneficiary ${idx + 1}`,
              policySystemData: {
                name: (it.BeneficiaryFirstName || it.FirstName ? `${it.BeneficiaryFirstName || it.FirstName} ${it.BeneficiaryLastName || it.LastName}` : it.name) || undefined,
                dob: it.BeneficiaryDOB ?? it.DOB ?? undefined,
                ssn: it.BeneficiarySSN ?? it.SSN ?? undefined,
                phone: it.BeneficiaryPhone ?? it.Phone ?? undefined,
                email: it.BeneficiaryEmail ?? it.Email ?? undefined,
                address: it.BeneficiaryAddress ?? it.Address ?? undefined,
                relationship: it.Relationship ?? undefined,
              }
            }));

            mergedBeneficiaries = mergeBeneficiaries(mergedBeneficiaries, dfBens) as Beneficiary[];
          }
        } else {
          const entityId = import.meta.env.VITE_UIPATH_ENTITY_ID;
          if (entityId && sdk && selectedPolicy && selectedPolicy.policyNumber) {
            const policyNumMatch = String(selectedPolicy.policyNumber).match(/(\d{6,})/);
            const policyNumeric = policyNumMatch ? policyNumMatch[1] : String(selectedPolicy.policyNumber);
            const dfRes: any = await (sdk as any).entities.getRecordsById(entityId as string, { filter: `PolicyNumber eq '${policyNumeric}'`, pageSize: 50 }).catch(() => null);
            let dfItems: any[] = [];
            if (Array.isArray(dfRes)) dfItems = dfRes;
            else if (dfRes && dfRes.items) dfItems = dfRes.items;
            else if (dfRes && dfRes.data) dfItems = dfRes.data;

            if (dfItems && dfItems.length) {
              const dfBens = dfItems.map((it: any, idx: number) => ({
                id: it.Id ?? it.id ?? `df-${idx}`,
                name: (it.BeneficiaryFirstName || it.FirstName ? `${it.BeneficiaryFirstName || it.FirstName} ${it.BeneficiaryLastName || it.LastName}` : it.name) || `Beneficiary ${idx + 1}`,
                policySystemData: {
                  name: (it.BeneficiaryFirstName || it.FirstName ? `${it.BeneficiaryFirstName || it.FirstName} ${it.BeneficiaryLastName || it.LastName}` : it.name) || undefined,
                  dob: it.BeneficiaryDOB ?? it.DOB ?? undefined,
                  ssn: it.BeneficiarySSN ?? it.SSN ?? undefined,
                  phone: it.BeneficiaryPhone ?? it.Phone ?? undefined,
                  email: it.BeneficiaryEmail ?? it.Email ?? undefined,
                  address: it.BeneficiaryAddress ?? it.Address ?? undefined,
                  relationship: it.Relationship ?? undefined,
                }
              }));

              mergedBeneficiaries = mergeBeneficiaries(mergedBeneficiaries, dfBens) as Beneficiary[];
            }
          }
        }
      } catch (e) {
        console.debug('Payout screen DF merge guard failed', e);
      }

      setPayoutSummary(resolvedSummary);

      // Development mode: force demo names for the known demo payout ids so the UI
      // matches the screenshot. This ensures Anna / Nicole appear even when the
      // backend returns different display names for the same policy.
      const finalBeneficiaries = mergedBeneficiaries.map(b => {
        if (!b) return b;
        if (String(b.id).startsWith('ben-')) {
          // replace with demo name where available
          return demoById[b.id] ?? b;
        }
        return b;
      });

      setBeneficiaries(finalBeneficiaries);
    } catch (error) {
      console.error('Failed to load payout data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);

  const handleValidatePayout = () => {
    if (payoutSummary && payoutSummary.draftTotalPayout > 1000000) {
      setWarningMessage('Total payout exceeds $1,000,000. This requires additional approval.');
      setShowWarningDialog(true);
      return;
    }
    // Mark payout step as complete
    completeStep('payout');
    toast({ title: 'Payout Validated', description: 'All payout calculations have been verified.' });
  };

  const handleSubmitPayout = async () => {
    setIsLoading(true);
    try {
      await new Promise(r => setTimeout(r, 800));
      // Mark all workflow steps as complete (turns all breadcrumbs green)
      completeAllSteps();
      // Update case status to Pending Payment
      setCaseStatus('Pending Payment');
      // Update selected policy status to Pending Payment
      if (selectedPolicy) {
        setPolicyStatus(selectedPolicy.id, 'Pending Payment');
      }
      // Navigate back to Summary
      setCurrentStep('summary');
      toast({ title: 'Payout Submitted', description: 'Case status updated to Pending Payment. Returning to Summary.' });
      onNavigate?.('summary');
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to submit payout.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  if (!currentCase || !selectedPolicy || !payoutSummary) return null;

  const dfRecord = (Array.isArray(dfData) && dfData[0]) ? dfData[0] : (dfData ?? selectedDfRecord);
  const dfForCaseFields = selectedDfRecord ?? dfRecord;

  const getBeneficiaryById = (id: string) => beneficiaries.find(b => b.id === id);

  // Exclude Unknown beneficiaries from display (they have no real payout data)
  const displayPayouts = payoutSummary.beneficiaryPayouts.filter(p => {
    const ben = getBeneficiaryById(p.beneficiaryId);
    const name = ben?.name?.trim().toLowerCase();
    return name !== 'unknown';
  });

  const getEffectivePayout = (payout: PayoutCalculation) => {
    const net = payout.grossAmount + payout.interestCredit - payout.loanDeduction - payout.withdrawalDeduction + payout.riderAdjustment - payout.federalWithholding - payout.stateWithholding;
    return { ...payout, netPayable: net } as any;
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="grid grid-cols-12 gap-6">
        <Card className="col-span-12 lg:col-span-3 bg-white border rounded-lg">
          <CardContent className="pt-4 pb-4">
            <div>
              <p className="data-label">Policy Holder</p>
              <p className="font-medium">{getDfFieldString(dfRecord, 'decedentName') || getDfFieldString(dfForCaseFields, 'decedentName') || (dfRecord as any)?.DecedentName || (dfForCaseFields as any)?.DecedentName || currentCase.decedentName}</p>
              <p className="text-xs text-muted-foreground">{currentCase.decedentSSN}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-12 lg:col-span-3 bg-white border rounded-lg">
          <CardContent className="pt-4 pb-4">
            <div>
              <p className="data-label">Policy Number</p>
              <p className="font-medium font-mono">{(Array.isArray(dfData) && dfData[0]?.PolicyNumber) ? `TL-${dfData[0].PolicyNumber}` : (selectedDfRecord?.PolicyNumber ? `TL-${selectedDfRecord.PolicyNumber}` : '-')}</p>
              <p className="text-xs text-muted-foreground">{getDfFieldString(dfRecord, 'policyType') || getDfFieldString(dfForCaseFields, 'policyType') || (dfRecord as any)?.ProductType || (dfForCaseFields as any)?.ProductType || '-'}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-12 lg:col-span-3 bg-white border rounded-lg">
          <CardContent className="pt-4 pb-4">
            <div>
              <p className="data-label">Total Face Value</p>
              <p className="text-lg font-semibold">{formatCurrency((Array.isArray(dfData) && dfData[0]?.PolicyValues) ? Number(dfData[0].PolicyValues) : (selectedDfRecord?.PolicyValues ? Number(selectedDfRecord.PolicyValues) : payoutSummary.totalFaceValue))}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-12 lg:col-span-3 bg-white border rounded-lg">
          <CardContent className="pt-4 pb-4">
            <div>
              <p className="data-label">Draft Total Payout</p>
              <p className="text-lg font-semibold text-primary">{formatCurrency(payoutSummary.draftTotalPayout)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white border rounded-lg">
        <CardHeader className="pb-3">
          <div>
            <CardTitle className="text-base">Claim & Policy Data</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Review or adjust values before final payout calculation</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-12 gap-x-6 gap-y-4 items-start">
            <div className="col-span-12 lg:col-span-3">
              <p className="text-xs text-muted-foreground uppercase">Policy Number</p>
              <p className="font-medium font-mono">{(Array.isArray(dfData) && dfData[0]?.PolicyNumber) ? `TL-${dfData[0].PolicyNumber}` : (selectedDfRecord?.PolicyNumber ? `TL-${selectedDfRecord.PolicyNumber}` : '-')}</p>
            </div>
            <div className="col-span-12 lg:col-span-3">
              <p className="text-xs text-muted-foreground uppercase">Policy Status</p>
              <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${selectedPolicy.status === 'In Policy Review' ? 'bg-blue-600 text-white' : 'bg-primary/10 text-primary'}`}>{selectedPolicy.status}</div>
            </div>
            <div className="col-span-12 lg:col-span-3">
              <p className="text-xs text-muted-foreground uppercase">Policy Type</p>
              <p className="font-medium">{getDfFieldString(dfRecord, 'policyType') || getDfFieldString(dfForCaseFields, 'policyType') || (dfRecord as any)?.ProductType || (dfForCaseFields as any)?.ProductType || '-'}</p>
            </div>
            <div className="col-span-12 lg:col-span-3">
              <p className="text-xs text-muted-foreground uppercase">Docs IGO</p>
              <div className="inline-block px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-sm font-medium">Yes</div>
            </div>

            <div className="col-span-12 lg:col-span-3">
              <p className="text-xs text-muted-foreground uppercase">Date of Death</p>
              <p className="font-medium">{new Date(currentCase.dateOfDeath).toLocaleDateString()}</p>
            </div>
            <div className="col-span-12 lg:col-span-3">
              <p className="text-xs text-muted-foreground uppercase">Claim Effective Date</p>
              <p className="font-medium">{(Array.isArray(dfData) && dfData[0]?.FNODDate) || selectedDfRecord?.FNODDate || '-'}</p>
            </div>
            <div className="col-span-12 lg:col-span-3">
              <p className="text-xs text-muted-foreground uppercase">Federal Withholding</p>
              <p className="font-medium">0%</p>
            </div>
            <div className="col-span-12 lg:col-span-3">
              <p className="text-xs text-muted-foreground uppercase">State Withholding</p>
              <p className="font-medium">0%</p>
            </div>

            <div className="col-span-12 lg:col-span-3">
              <p className="text-xs text-muted-foreground uppercase">Account Value</p>
              <p className="font-medium">{formatCurrency(payoutSummary.totalFaceValue)}</p>
            </div>
            <div className="col-span-12 lg:col-span-3">
              <p className="text-xs text-muted-foreground uppercase">Outstanding Deductions</p>
              <button
                type="button"
                onClick={() => setShowDeductionsDialog(true)}
                className={`font-medium text-left ${((payoutSummary.totalDeductions || 0) > 0) ? 'text-destructive' : 'text-foreground'} hover:underline`}
                aria-label="View outstanding deductions"
              >
                {formatCurrency(payoutSummary.totalDeductions || 0)}
              </button>
            </div>
            <div className="col-span-12 lg:col-span-3">
              <p className="text-xs text-muted-foreground uppercase">State Jurisdiction</p>
              <p className="font-medium">{payoutSummary.stateJurisdiction}</p>
            </div>
            <div className="col-span-12 lg:col-span-3">
              <p className="text-xs text-muted-foreground uppercase">State Interest</p>
              <p className="font-medium">{payoutSummary.stateInterestRate}%</p>
            </div>

            <div className="col-span-12 lg:col-span-3">
              <p className="text-xs text-muted-foreground uppercase">Interest Credit</p>
              <button
                type="button"
                onClick={() => setShowInterestDialog(true)}
                className="font-medium text-emerald-600 hover:underline"
                aria-label="View interest credit details"
              >
                +{formatCurrency(payoutSummary.totalInterest || 287.67)}
              </button>
            </div>
            <div className="col-span-12 lg:col-span-9">
              <p className="text-xs text-muted-foreground uppercase">Riders</p>
              <p className="font-medium">{getDfFieldString(dfRecord, 'livingBenefitRiders') || getDfFieldString(dfForCaseFields, 'livingBenefitRiders') || (dfRecord as any)?.LivingBenefitsRider || (dfForCaseFields as any)?.LivingBenefitsRider || '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border rounded-lg">
        <CardHeader className="pb-3"><CardTitle className="text-base">Beneficiary Payouts</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center gap-2">
            <button className={`px-3 py-1 rounded-md text-sm ${selectedBeneficiaryTab==='all'?'bg-muted text-muted-foreground':'bg-white text-muted-foreground border'} border`} onClick={() => setSelectedBeneficiaryTab('all')}>All Beneficiaries</button>
            {displayPayouts.map(p => (
              <button key={p.beneficiaryId} className={`px-3 py-1 rounded-md text-sm ${selectedBeneficiaryTab===p.beneficiaryId?'bg-muted text-muted-foreground':'bg-white text-muted-foreground border'}`} onClick={() => setSelectedBeneficiaryTab(p.beneficiaryId)}>{getBeneficiaryById(p.beneficiaryId)?.name.split(' ')[0]}</button>
            ))}
          </div>

          {selectedBeneficiaryTab === 'all' ? (
            <table className="w-full">
              <thead className="text-left text-xs text-muted-foreground border-b"><tr><th>Beneficiary</th><th className="text-right">Share %</th><th className="text-right">Base Amount</th><th className="text-right">Adjustments</th><th className="text-right">Withholding</th><th className="text-right">Net Payable</th></tr></thead>
              <tbody>
                {displayPayouts.map(payout => {
                  const ben = getBeneficiaryById(payout.beneficiaryId);
                  const totalAdjustments = payout.riderAdjustment;
                  const totalWithholding = payout.federalWithholding + payout.stateWithholding;
                  const netPayable = payout.grossAmount;
                  return (
                    <tr key={payout.beneficiaryId} className="border-b py-6">
                      <td className="py-4"><div><div className="font-medium">{ben?.name}</div><div className="text-xs text-muted-foreground">{ben?.relationship} • {ben?.paymentMethod}</div></div></td>
                      <td className="text-right py-4 font-medium">{ben?.percentage}%</td>
                      <td className="text-right py-4">{formatCurrency(payout.baseShare)}</td>
                      <td className={`text-right py-4 ${totalAdjustments>=0?'text-success':'text-destructive'}`}>{totalAdjustments>=0?'+':''}{formatCurrency(totalAdjustments)}</td>
                      <td className="text-right py-4 text-destructive">-{formatCurrency(totalWithholding)}</td>
                      <td className="text-right py-4 font-semibold text-primary">{formatCurrency(netPayable)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            displayPayouts.filter(p=>p.beneficiaryId===selectedBeneficiaryTab).map(payout => {
              const ben = getBeneficiaryById(payout.beneficiaryId);
              const effective = getEffectivePayout(payout);
              return (
                <div key={payout.beneficiaryId} className="mt-4">
                  <Card className="mb-4 border-muted"><CardHeader className="pb-2"><div><CardTitle className="text-sm font-medium">Beneficiary Data</CardTitle><p className="text-xs text-muted-foreground">Review or adjust values before final payout calculation</p></div></CardHeader><CardContent>
                    <div className="grid grid-cols-3 gap-x-8 gap-y-4">
                      <div className="space-y-3"><div><p className="text-xs text-muted-foreground uppercase">Name</p><p className="font-medium">{ben?.name}</p></div><div><p className="text-xs text-muted-foreground uppercase">DoB</p><p className="font-medium">{ben?.dob?new Date(ben.dob).toLocaleDateString():'-'}</p></div><div><p className="text-xs text-muted-foreground uppercase">Address</p><p className="text-sm">{ben?.address||'-'}</p></div><div><p className="text-xs text-muted-foreground uppercase">Relationship</p><p className="font-medium">{ben?.relationship}</p></div></div>
                      <div className="space-y-3"><div><p className="text-xs text-muted-foreground uppercase">Payout Share</p><p className="font-medium">{ben?.percentage}%</p></div><div><p className="text-xs text-muted-foreground uppercase">Payment Method</p><p className="font-medium">{ben?.paymentMethod||'Check'}</p></div></div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase">Gross Payout</p>
                          <p className="font-medium">{formatCurrency(payout.grossAmount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase">State Interest</p>
                          <p className="text-success">+{formatCurrency(payout.interestCredit)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase">Federal Withholding</p>
                          <p className="font-medium">{formatCurrency(effective.federalWithholding)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase">State Withholding</p>
                          <p className="font-medium">{formatCurrency(effective.stateWithholding)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase">Net Payable</p>
                          <p className="font-semibold text-primary">{formatCurrency((effective as any).netPayable)}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent></Card></div>
              );
            })
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" onClick={handleValidatePayout} disabled={isLoading}>
          Validate Payout
        </Button>
        <Button 
          onClick={handleSubmitPayout} 
          disabled={isLoading} 
          className="bg-green-600 text-white hover:bg-green-700 px-6 py-2"
        >
          Complete & Submit for Payment
        </Button>
      </div>

      {/* Warning Modal */}
      <Modal open={showWarningDialog} onClose={() => setShowWarningDialog(false)} title="Validation Warning">
        <div className="p-2">{warningMessage}</div>
        <div className="flex justify-end gap-2 mt-4"><Button variant="outline" onClick={() => setShowWarningDialog(false)}>Cancel</Button><Button onClick={() => { setShowWarningDialog(false); toast({ title: 'Payout Validated with Warning', description: 'Proceeding with validation despite warning.' }); }}>Proceed Anyway</Button></div>
      </Modal>

      {/* Deductions Modal */}
      <Modal open={showDeductionsDialog} onClose={() => setShowDeductionsDialog(false)} title="Outstanding Deductions">
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b"><span className="text-sm">Policy Loan Balance</span><span className="font-medium text-destructive">-{formatCurrency(selectedPolicy.loanAmount||0)}</span></div>
          <div className="flex justify-between items-center py-2 border-b"><span className="text-sm">Prior Withdrawals</span><span className="font-medium text-destructive">-{formatCurrency(selectedPolicy.withdrawalAmount||0)}</span></div>
          <div className="flex justify-between items-center py-2 border-b"><span className="text-sm">Premium Due</span><span className="font-medium text-destructive">-$0.00</span></div>
          <div className="flex justify-between items-center py-2 border-b"><span className="text-sm">Administrative Fees</span><span className="font-medium text-destructive">-$0.00</span></div>
          <div className="flex justify-between items-center pt-2 font-semibold"><span>Total Deductions</span><span className="text-destructive">-{formatCurrency(payoutSummary.totalDeductions)}</span></div>
        </div>
        <div className="flex justify-end mt-4"><Button variant="outline" onClick={() => setShowDeductionsDialog(false)}>Close</Button></div>
      </Modal>

      {/* Interest Modal */}
      <Modal open={showInterestDialog} onClose={() => setShowInterestDialog(false)} title="Interest Credit Details">
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b"><div><span className="text-sm block">State Mandated Interest</span><span className="text-xs text-muted-foreground">{payoutSummary.stateJurisdiction} @ {payoutSummary.stateInterestRate}% APR</span></div><span className="font-medium text-success">+{formatCurrency(payoutSummary.totalInterest)}</span></div>
          <div className="flex justify-between items-center py-2 border-b"><div><span className="text-sm block">Days of Interest</span><span className="text-xs text-muted-foreground">From date of death to claim effective date</span></div><span className="font-medium">{currentCase.agingDays||0} days</span></div>
          <div className="flex justify-between items-center pt-2 font-semibold"><span>Total Interest Credit</span><span className="text-success">+{formatCurrency(payoutSummary.totalInterest)}</span></div>
        </div>
        <div className="flex justify-end mt-4"><Button variant="outline" onClick={() => setShowInterestDialog(false)}>Close</Button></div>
      </Modal>
    </div>
  );
}
