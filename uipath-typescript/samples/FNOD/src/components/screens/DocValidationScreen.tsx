// React import not required with new JSX transform
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { useCase } from '../../contexts/CaseContext';
import { useToast } from '../../hooks/use-toast';

interface DocValidationScreenProps {
  onNavigate?: (tab: string) => void;
}

export default function DocValidationScreen({ onNavigate }: DocValidationScreenProps) {
  const { completeStep, moveToNextStep } = useCase();
  const { toast } = useToast();

  return (
    <div className="space-y-6 animate-slide-up">
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Document Validation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Placeholder Document Validation screen — wire to OnBase viewer and validation logic.
          </p>
          <div className="mt-4 flex gap-3">
            <Button variant="outline" onClick={() => onNavigate && onNavigate('beneficiaries')}>
              Back to Beneficiaries
            </Button>
            <Button
              onClick={() => {
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
