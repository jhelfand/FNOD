import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { useCase } from '../../contexts/CaseContext';
import { useToast } from '../../hooks/use-toast';

interface DocValidationScreenProps {
  onNavigate?: (tab: string) => void;
}

export default function DocValidationScreen({ onNavigate }: DocValidationScreenProps) {
  const { completeStep, moveToNextStep, currentCase, selectedDfRecord } = useCase();
  const { toast } = useToast();
  const [docAuthenticityChecked, setDocAuthenticityChecked] = useState(true);
  const [identityMatchChecked, setIdentityMatchChecked] = useState(true);
  const [causeMatchChecked, setCauseMatchChecked] = useState(true);
  const [isCertifierPresentChecked, setIsCertifierPresentChecked] = useState(true);

  const extracted = useMemo(
    () => ({
      decedentName: 'Susan Anderson',
      dateOfDeath: '08-01-2025',
      dateOfBirth: '01-26-1956',
      sex: 'Female',
      ssn: '111-11-1111',
      placeOfDeath: 'Banner Desert Medical Center',
      countyOfDeath: 'Maricopa',
      immediateCause: 'Cardiac Arrest',
      underlyingCause: 'Unspecified Natural Causes',
      mannerOfDeath: 'Natural Death',
      certifier: 'Mohamed Sameh Teleb, M.D.',
      dateCertified: '08-03-2025',
    }),
    []
  );

  const caseDateOfDeath = currentCase?.dateOfDeath ?? String(selectedDfRecord?.DateOfDeath ?? selectedDfRecord?.dateOfDeath ?? '');
  const caseCauseOfDeath = currentCase?.causeOfDeath ?? String(selectedDfRecord?.CauseOfDeath ?? selectedDfRecord?.causeOfDeath ?? '');
  const dateMismatch = !!caseDateOfDeath && !caseDateOfDeath.includes('08-01-2025');
  const causeMismatch = !!caseCauseOfDeath && caseCauseOfDeath.toLowerCase() !== extracted.immediateCause.toLowerCase();

  const allChecksPassed = docAuthenticityChecked && identityMatchChecked && causeMatchChecked && isCertifierPresentChecked;

  return (
    <div className="space-y-6 animate-slide-up">
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Document Validation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Death Certificate Review mock for analyst validation before payout.
          </p>

          <div className="mt-4 grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-7">
              <div className="rounded-lg border bg-slate-50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">Attached Document</div>
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800">Death Certificate</span>
                </div>
                <div className="h-[540px] border rounded bg-white overflow-auto">
                  <img
                    src="/death-certificate.jpg"
                    alt="Arizona death certificate for Susan Anderson"
                    className="w-full h-auto"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Source: provided death certificate image.
                </p>
              </div>
            </div>

            <div className="col-span-12 lg:col-span-5 space-y-4">
              <div className="rounded-lg border p-3 bg-white">
                <div className="font-medium mb-2">Extracted Key Fields</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Decedent</span><span className="font-medium">{extracted.decedentName}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Date of Death</span><span className="font-medium">{extracted.dateOfDeath}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Date of Birth</span><span className="font-medium">{extracted.dateOfBirth}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Sex</span><span className="font-medium">{extracted.sex}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">SSN</span><span className="font-medium">{extracted.ssn}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Place of Death</span><span className="font-medium">{extracted.placeOfDeath}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">County</span><span className="font-medium">{extracted.countyOfDeath}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Immediate Cause</span><span className="font-medium">{extracted.immediateCause}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Underlying Cause</span><span className="font-medium">{extracted.underlyingCause}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Manner</span><span className="font-medium">{extracted.mannerOfDeath}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Certifier</span><span className="font-medium">{extracted.certifier}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Date Certified</span><span className="font-medium">{extracted.dateCertified}</span></div>
                </div>
              </div>

              <div className="rounded-lg border p-3 bg-white">
                <div className="font-medium mb-2">Validation Checklist</div>
                <div className="space-y-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={docAuthenticityChecked} onChange={(e) => setDocAuthenticityChecked(e.target.checked)} />
                    Document authenticity appears valid
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={identityMatchChecked} onChange={(e) => setIdentityMatchChecked(e.target.checked)} />
                    Decedent identity matches case and policy
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={causeMatchChecked} onChange={(e) => setCauseMatchChecked(e.target.checked)} />
                    Cause of death supports claim processing
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={isCertifierPresentChecked} onChange={(e) => setIsCertifierPresentChecked(e.target.checked)} />
                    Certifier signature and date present
                  </label>
                </div>
              </div>

              {(dateMismatch || causeMismatch) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="font-medium mb-1">Case Data Mismatch Detected</div>
                  {dateMismatch && <div>Date of death differs from case record ({caseDateOfDeath}).</div>}
                  {causeMismatch && <div>Cause of death differs from case record ({caseCauseOfDeath}).</div>}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <Button variant="outline" onClick={() => onNavigate && onNavigate('beneficiaries')}>
              Back to Beneficiaries
            </Button>
            <Button
              onClick={() => {
                if (!allChecksPassed) {
                  toast({
                    title: 'Validation Incomplete',
                    description: 'Please complete all document checks before continuing.',
                    variant: 'destructive',
                  });
                  return;
                }
                completeStep('doc-validation');
                moveToNextStep();
                toast({
                  title: 'Document Validation Complete',
                  description: 'Moving to Payout Calculator.',
                });
                onNavigate?.('payout');
              }}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              Complete & Continue to Payout
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
