import { useState, useEffect } from 'react';
import { useCase } from '../../contexts/CaseContext';
import { useAuth } from '../../hooks/useAuth';
import { useUiPathSdk } from '../../hooks/useUiPathSdk';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import Modal from '../ui/modal';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
// lightweight icon placeholders (inline SVGs) to avoid external dependency
const IconUsers = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M17 21v-2a4 4 0 00-4-4H9a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconSparkles = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M12 3l1.5 3L17 8l-3.5 1L12 12l-1.5-3L7 8l3.5-2L12 3z" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round" />
  </svg>
);
const IconCheck = () => (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1" fill="none" />
    <path d="M8 12.5l2 2 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);
const IconX = () => (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1" fill="none" />
    <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);
import { useToast } from '../../hooks/use-toast';
import type { Beneficiary } from '../../types';
import { CaseTasksEmbed } from '../CaseTasksEmbed';
import { CaseTasksPCFNOL } from '../CaseTasksPCFNOL';

interface BeneficiaryResearchScreenProps {
  onNavigate: (tab: string) => void;
}

export function BeneficiaryResearchScreen({ onNavigate }: BeneficiaryResearchScreenProps) {
  const { currentCase, selectedPolicy, selectedCaseInstanceId, caseInstances, completeStep, moveToNextStep } = useCase();
  const { sdk } = useAuth();
  const { services } = useUiPathSdk();
  const { toast } = useToast();
  
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [beneficiaryReconStatus, setBeneficiaryReconStatus] = useState<string | null>(null);
  const [tloValidationStatus, setTloValidationStatus] = useState<string | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailContent, setEmailContent] = useState('');
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<Beneficiary | null>(null);

  useEffect(() => {
    loadBeneficiaries();
  }, [selectedPolicy]);

  // Demo status values (not connected to Data Fabric)
  useEffect(() => {
    setBeneficiaryReconStatus('Reconciled');
    setTloValidationStatus('Validated');
  }, []);

  const loadBeneficiaries = async () => {
    if (!selectedPolicy) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await services.getBeneficiaries(selectedPolicy.id);
      const rawBens = Array.isArray(data) ? data : [];

      // Use backend data when available; otherwise fall back to demo beneficiaries
      // onbaseData: no email (not in OnBase docs); policySystemData: has email
      const DEMO_BENEFICIARIES: any[] = [
        {
          id: 'ben-1',
          name: 'Anna J Anderson',
          isPrimary: true,
          percentage: 50,
          relationship: 'Child',
          onbaseData: { name: 'Anna J Anderson', dob: '1976-08-08', ssn: '***-**-4521', phone: '(555) 555-0142', address: '1354 Smith Street NW, Eagle, NM 46661', relationship: 'Child' },
          policySystemData: { name: 'Anna J Anderson', dob: '1976-08-08', ssn: '***-**-4521', phone: '(555) 555-0142', email: 'anna.anderson@example.com', address: '1354 Smith Street NW, Eagle, NM 46461', relationship: 'Child', reconStatus: 'Reconciled', tloStatus: 'Validated', percentage: 50 }
        },
        {
          id: 'ben-2',
          name: 'Nicole V Anderson',
          isPrimary: false,
          percentage: 50,
          relationship: 'Child',
          onbaseData: { name: 'Nicole V Anderson', dob: '1978-10-26', ssn: '***-**-7834', phone: '(555) 555-0143', address: '4574 Flower Drive, Lewis, WI 45864', relationship: 'Child' },
          policySystemData: { name: 'Nicole Anderson', dob: '1978-10-26', ssn: '***-**-7834', phone: '(555) 555-0143', email: 'nicole.anderson@example.com', address: '4574 Flower Drive, Lewis, WI 45864', relationship: 'Child', reconStatus: 'Reconciled', tloStatus: 'Validated', percentage: 50 }
        }
      ];

      const resolved = rawBens.length > 0 ? rawBens : DEMO_BENEFICIARIES;

      // Ensure each resolved beneficiary has `policySystemData.name` populated (fallback to main name)
      const normalized = resolved.map(r => ({
        ...r,
        policySystemData: {
          ...(r.policySystemData || {}),
          name: (r.policySystemData && r.policySystemData.name) ? r.policySystemData.name : (r.name ?? '')
        }
      }));
      // No deduplication for beneficiaries
      const deduped = normalized;

      // Helper to ensure visible fields exist on each beneficiary
      // onbaseData: no email (not in OnBase docs)
      const ensureFields = (b: any) => {
        const ps = b.policySystemData || {};
        const ob = b.onbaseData || {};
        const normalizedPercentage = (typeof ps.percentage === 'number') ? ps.percentage : (typeof b.percentage === 'number' ? b.percentage : undefined);
        return {
          ...b,
          onbaseData: {
            name: ob.name ?? b.name ?? '',
            dob: ob.dob ?? '',
            ssn: ob.ssn ?? '',
            phone: ob.phone ?? '',
            address: ob.address ?? '',
            relationship: ob.relationship ?? '',
            ...(ob || {}),
            email: '' // OnBase docs do not have email - always empty
          } as any,
          // policySystemData should ONLY use explicitly mapped DF PAS fields - no fallbacks
          policySystemData: {
            name: ps.name ?? b.name ?? '',
            dob: ps.dob ?? '',
            ssn: ps.ssn ?? '',
            phone: ps.phone ?? '',
            email: ps.email ?? '',
            address: ps.address ?? '',
            relationship: ps.relationship ?? '',
            reconStatus: ps.reconStatus ?? undefined,
            tloStatus: ps.tloStatus ?? undefined,
            percentage: normalizedPercentage,
            ...(ps || {})
          }
        };
      };

      // Apply demo override for Anna Anderson's OnBase address (46661 zip) when present
      const final = deduped.map(b => {
        const ensured = ensureFields(b);
        const name = (ensured.name || '').toLowerCase();
        if (name.includes('anna') && name.includes('anderson')) {
          return {
            ...ensured,
            onbaseData: {
              ...ensured.onbaseData,
              address: ensured.onbaseData?.address?.replace(/\d{5}(-\d{4})?$/, '46661') ?? '1354 Smith Street NW, Eagle, NM 46661',
            },
          };
        }
        return ensured;
      });
      setBeneficiaries(final as any[]);
    } catch (err: any) {
      console.error('Failed to load beneficiaries:', err);
      setError(err?.message ?? 'Failed to load beneficiaries');
      setBeneficiaries([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTriggerEmail = async (beneficiaryId: string) => {
    const beneficiary = beneficiaries.find(b => b.id === beneficiaryId);
    if (!beneficiary) return;
    
    setSelectedBeneficiary(beneficiary);
    // Generate prebuilt email template
    const template = `Dear ${beneficiary.name || 'Valued Beneficiary'},

We are writing to you regarding the life insurance policy for ${currentCase?.decedentName || '[Decedent Name]'}.

As part of our claims processing, we need to request additional documentation from you. Please provide the following:

• Valid government-issued photo identification
• Completed beneficiary claim form
• Death certificate (certified copy)
• Any other supporting documentation

Please submit these documents at your earliest convenience to expedite the claims process.

If you have any questions, please don't hesitate to contact us at [phone number] or reply to this email.

Sincerely,
${currentCase?.assignedAnalyst || 'Claims Department'}
Claims Processing Team`;
    
    setEmailContent(template);
    setIsEmailModalOpen(true);
  };

  const handleSendEmail = async () => {
    if (!selectedBeneficiary) return;
    
    try {
      await services.triggerCorrespondence({
        beneficiaryId: selectedBeneficiary.id,
        type: 'Email',
        templateName: 'Document Request',
        customContent: emailContent
      });
      toast({
        title: 'Email Sent',
        description: `Email sent successfully to ${selectedBeneficiary.name}.`,
      });
      setIsEmailModalOpen(false);
      setEmailContent('');
      setSelectedBeneficiary(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send email.',
        variant: 'destructive',
      });
    }
  };

  const handleGenerateLetter = async (beneficiaryId: string) => {
    try {
      await services.triggerCorrespondence({
        beneficiaryId,
        type: 'Letter',
        templateName: 'Document Request',
      });
      toast({
        title: 'Letter Generated',
        description: 'Letter is ready for print.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate letter.',
        variant: 'destructive',
      });
    }
  };

  if (!currentCase) return null;
  if (!selectedPolicy) return (
    <div className="p-6">
      <div className="text-sm text-gray-600">No policy selected. Please select a policy to view beneficiaries.</div>
    </div>
  );

  // Use DF beneficiaries as-is - no demo overrides
  const displayBeneficiaries = beneficiaries || [];

  const hasMismatch = (onbaseVal?: string, policyVal?: string) => (onbaseVal ?? '') !== (policyVal ?? '');

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Agentic Output — show at top with same styling as Policy Review */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-base font-semibold">Agentic Output</span>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Left column: Onbase reconciliation with pill inline with heading */}
          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-sm text-gray-700 font-semibold flex items-center gap-2">
                Onbase - ALIP Reconciliation
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${beneficiaryReconStatus && (/pass/i.test(beneficiaryReconStatus) || /completed/i.test(beneficiaryReconStatus) || /reconciled/i.test(beneficiaryReconStatus)) ? 'bg-green-100 text-green-800 border border-green-200' : beneficiaryReconStatus && /fail/i.test(beneficiaryReconStatus) ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-gray-50 text-gray-700'}`}>
                  {beneficiaryReconStatus && (/pass/i.test(beneficiaryReconStatus) || /completed/i.test(beneficiaryReconStatus) || /reconciled/i.test(beneficiaryReconStatus)) && <IconCheck />}
                  {beneficiaryReconStatus && /fail/i.test(beneficiaryReconStatus) && <IconX />}
                  <span>{beneficiaryReconStatus && /completed/i.test(beneficiaryReconStatus) ? 'Pass' : beneficiaryReconStatus ?? 'Unknown'}</span>
                </span>
              </h4>
            </div>

            <div className="mt-3 text-sm text-gray-600">
              All beneficiaries reconciled successfully with high confidence scores. Minor data quality issues noted for address formatting differences.
            </div>

            <p className="mt-4 text-sm text-gray-600 mb-2 font-semibold">Recommended Actions</p>
            <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
              <li>fix_typo: Update address formatting to match DOC extraction</li>
              <li>update_system: Add Middle_Initial to DB record to match DOC data</li>
            </ol>
          </div>

          {/* Right column: TLO Validation with pill inline with heading */}
          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-sm text-gray-700 font-semibold flex items-center gap-2">
                TLO Validation
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${tloValidationStatus && (/pass/i.test(tloValidationStatus) || /validated/i.test(tloValidationStatus)) ? 'bg-green-100 text-green-800 border border-green-200' : tloValidationStatus && /fail/i.test(tloValidationStatus) ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-gray-50 text-gray-700'}`}>
                  {tloValidationStatus && (/pass/i.test(tloValidationStatus) || /validated/i.test(tloValidationStatus)) && <IconCheck />}
                  {tloValidationStatus && /fail/i.test(tloValidationStatus) && <IconX />}
                  <span>{tloValidationStatus ?? 'Unknown'}</span>
                </span>
              </h4>
            </div>

            <div className="mt-3 text-sm text-gray-600">
              For Anna J Anderson, both CLEAR and TU returned matching records for name, DOB, SSN, and address, which also match the input data.
              For Nicole V Anderson, both CLEAR and TU returned matching records for name, DOB, SSN, and address, which also match the input data.
              All beneficiaries confirmed with high confidence.
            </div>
          </div>
        </div>
      </div>
      {/* Data Fabric debug removed in production - console.debug kept for diagnostics */}
      {/* Beneficiary Comparison Section (one card per beneficiary) */}
      <div className="space-y-4">
        {isLoading && (
          <div className="p-4 text-sm text-gray-600">Loading beneficiaries...</div>
        )}
        {error && (
          <div className="p-4 text-sm text-red-600">{error} <button className="ml-3 text-sm underline" onClick={loadBeneficiaries}>Retry</button></div>
        )}
        {(!isLoading && !error && beneficiaries.length === 0) && (
          <div className="p-4 text-sm text-gray-600">No beneficiaries found for this policy.</div>
        )}

        {displayBeneficiaries.map((ben, index) => (
          <Card key={ben.id} className="card-elevated">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <IconUsers />
                Beneficiary {index + 1}: {ben.name}
                <span className="text-sm font-normal text-muted-foreground">({ben.isPrimary ? 'Primary' : 'Contingent'} • {ben.policySystemData?.percentage ?? ben.percentage ?? '—'}%)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-8">
                {/* OnBase Column */}
                <div>
                  <h3 className="font-semibold text-sm mb-4 text-blue-800 border-b pb-2">Onbase Data</h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-4 items-center gap-2">
                      <Label className="text-sm text-muted-foreground">Name:</Label>
                      <Input value={ben.onbaseData?.name ?? ''} readOnly className={`col-span-2 h-8 text-sm ${hasMismatch(ben.onbaseData?.name, ben.policySystemData?.name) ? 'bg-warning/20 border-warning' : 'bg-muted'}`} />
                      <div className="flex items-center gap-1">
                        <Label className="text-xs text-muted-foreground">%:</Label>
                        <Input value={ben.policySystemData?.percentage ?? ben.percentage ?? ''} readOnly className="w-12 h-8 text-sm bg-muted" />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-2">
                      <Label className="text-sm text-muted-foreground">Relationship:</Label>
                      <Input value={ben.relationship} readOnly className="col-span-3 h-8 text-sm bg-muted" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-2">
                      <Label className="text-sm text-muted-foreground">DoB:</Label>
                      <Input value={ben.onbaseData?.dob ?? ''} readOnly className={`col-span-3 h-8 text-sm ${hasMismatch(ben.onbaseData?.dob, ben.policySystemData?.dob) ? 'bg-warning/20 border-warning' : 'bg-muted'}`} />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-2">
                      <Label className="text-sm text-muted-foreground">SSN:</Label>
                      <div className={`col-span-3 h-8 text-sm flex items-center px-3 rounded-md border ${hasMismatch(ben.onbaseData?.ssn, ben.policySystemData?.ssn) ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                        <span className={`font-medium ${hasMismatch(ben.onbaseData?.ssn, ben.policySystemData?.ssn) ? 'text-red-600' : 'text-green-600'}`}>
                          {hasMismatch(ben.onbaseData?.ssn, ben.policySystemData?.ssn) ? 'Not Match' : 'Match'}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-2">
                      <Label className="text-sm text-muted-foreground">Phone:</Label>
                      <Input value={ben.onbaseData?.phone ?? ''} readOnly className={`col-span-3 h-8 text-sm ${hasMismatch(ben.onbaseData?.phone, ben.policySystemData?.phone) ? 'bg-warning/20 border-warning' : 'bg-muted'}`} />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-2">
                      <Label className="text-sm text-muted-foreground">Email:</Label>
                      <Input value={ben.onbaseData?.email ?? ''} readOnly className={`col-span-3 h-8 text-sm ${hasMismatch(ben.onbaseData?.email, ben.policySystemData?.email) ? 'bg-warning/20 border-warning' : 'bg-muted'}`} />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-2">
                      <Label className="text-sm text-muted-foreground">Address:</Label>
                      <Input value={ben.onbaseData?.address ?? ''} readOnly className={`col-span-3 h-8 text-sm ${hasMismatch(ben.onbaseData?.address, ben.policySystemData?.address) ? 'bg-warning/20 border-warning' : 'bg-muted'}`} />
                    </div>
                  </div>
                </div>

                {/* Policy Column */}
                <div>
                  <h3 className="font-semibold text-sm mb-4 text-blue-800 border-b pb-2">Policy System Data</h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-4 items-center gap-2">
                      <Label className="text-sm text-muted-foreground">Name:</Label>
                      <Input value={ben.policySystemData?.name ?? ''} readOnly className={`col-span-2 h-8 text-sm ${hasMismatch(ben.onbaseData?.name, ben.policySystemData?.name) ? 'bg-warning/20 border-warning' : 'bg-muted'}`} />
                      <div className="flex items-center gap-1">
                        <Label className="text-xs text-muted-foreground">%:</Label>
                        <Input value={ben.policySystemData?.percentage ?? ben.percentage ?? ''} readOnly className="w-12 h-8 text-sm bg-muted" />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-2">
                      <Label className="text-sm text-muted-foreground">Relationship:</Label>
                      <Input value={ben.relationship} readOnly className="col-span-3 h-8 text-sm bg-muted" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-2">
                      <Label className="text-sm text-muted-foreground">DoB:</Label>
                      <Input value={ben.policySystemData?.dob ?? ''} readOnly className={`col-span-3 h-8 text-sm ${hasMismatch(ben.onbaseData?.dob, ben.policySystemData?.dob) ? 'bg-warning/20 border-warning' : 'bg-muted'}`} />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-2">
                      <Label className="text-sm text-muted-foreground">SSN:</Label>
                      <div className={`col-span-3 h-8 text-sm flex items-center px-3 rounded-md border ${hasMismatch(ben.onbaseData?.ssn, ben.policySystemData?.ssn) ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                        <span className={`font-medium ${hasMismatch(ben.onbaseData?.ssn, ben.policySystemData?.ssn) ? 'text-red-600' : 'text-green-600'}`}>
                          {hasMismatch(ben.onbaseData?.ssn, ben.policySystemData?.ssn) ? 'Not Match' : 'Match'}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-2">
                      <Label className="text-sm text-muted-foreground">Phone:</Label>
                      <Input value={ben.policySystemData?.phone ?? ''} readOnly className={`col-span-3 h-8 text-sm ${hasMismatch(ben.onbaseData?.phone, ben.policySystemData?.phone) ? 'bg-warning/20 border-warning' : 'bg-muted'}`} />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-2">
                      <Label className="text-sm text-muted-foreground">Email:</Label>
                      <Input value={ben.policySystemData?.email ?? ''} readOnly className={`col-span-3 h-8 text-sm ${hasMismatch(ben.onbaseData?.email, ben.policySystemData?.email) ? 'bg-warning/20 border-warning' : 'bg-muted'}`} />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-2">
                      <Label className="text-sm text-muted-foreground">Address:</Label>
                      <Input value={ben.policySystemData?.address ?? ''} readOnly className={`col-span-3 h-8 text-sm ${hasMismatch(ben.onbaseData?.address, ben.policySystemData?.address) ? 'bg-warning/20 border-warning' : 'bg-muted'}`} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t flex items-center gap-4">
                <Button size="sm" onClick={() => handleTriggerEmail(ben.id)}>
                  Send Email
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleGenerateLetter(ben.id)}>
                  Send Letter
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* PCFNOL Test — exact implementation from PC claims workbench */}
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <CaseTasksPCFNOL />
        </div>

        <div className="flex justify-center gap-4 flex-wrap">
          <CaseTasksEmbed
            caseInstanceId={selectedCaseInstanceId}
            sdk={sdk}
            caseInstances={caseInstances}
            preferredTaskTitle="Review Beneficiary OnBase Data"
            buttonLabel="Review Onbase Beneficiary Document"
            compact={false}
          />
          <Button
            size="lg"
            onClick={() => {
              completeStep('beneficiaries');
              moveToNextStep();
              toast({
                title: 'Beneficiary Research Complete',
                description: 'Moving to Document Validation.',
              });
              onNavigate?.('doc-validation');
            }}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            Complete & Continue to Doc Validation
          </Button>
        </div>
        {/* Email Composition Modal */}
        <Modal open={isEmailModalOpen} onClose={() => setIsEmailModalOpen(false)} title="Compose Email">
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium mb-2">To: {selectedBeneficiary?.name || 'Beneficiary'}</div>
              <div className="data-label mb-2">Email: {selectedBeneficiary?.policySystemData?.email || '[Email not available]'}</div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Message</label>
              <textarea
                className="w-full min-h-[400px] p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={emailContent}
                onChange={(e) => setEmailContent(e.target.value)}
                placeholder="Enter your email message..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => {
                setIsEmailModalOpen(false);
                setEmailContent('');
                setSelectedBeneficiary(null);
              }}>
                Cancel
              </Button>
              <Button onClick={handleSendEmail} className="bg-blue-600 text-white hover:bg-blue-700">
                Send Email
              </Button>
            </div>
          </div>
        </Modal>
      </div>

      {/* Manual beneficiary editing removed — screen uses comparison view only. */}

      {/* Agentic Output Section was moved to top of the page. */}
    </div>
  );
}

export default BeneficiaryResearchScreen;
