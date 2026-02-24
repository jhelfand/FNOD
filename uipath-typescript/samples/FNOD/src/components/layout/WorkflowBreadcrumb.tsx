import React from 'react';
import { useCase } from '../../contexts/CaseContext';
import type { WorkflowStep } from '../../types';

const workflowSteps: { id: WorkflowStep; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'policy-review', label: 'Policy Review' },
  { id: 'beneficiaries', label: 'Beneficiary Research' },
  { id: 'doc-validation', label: 'Doc Validation' },
  { id: 'payout', label: 'Payout' },
];

export const WorkflowBreadcrumb: React.FC = () => {
  const { currentStep, completedSteps } = useCase();

  const getStepStatus = (stepId: WorkflowStep) => {
    if (completedSteps.includes(stepId)) {
      return 'completed';
    }
    if (currentStep === stepId) {
      return 'current';
    }
    return 'pending';
  };

  return (
    <div className="flex items-center justify-center py-4 bg-[#0a1f35] border-t border-[#102231]">
      <div className="flex items-center gap-2">
        {workflowSteps.map((step, index) => {
          const status = getStepStatus(step.id);
          const isLast = index === workflowSteps.length - 1;

          return (
            <React.Fragment key={step.id}>
              {/* Step Circle */}
              <div className="flex flex-col items-center">
                <div
                  className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                    status === 'completed'
                      ? 'bg-green-500 border-2 border-green-400'
                      : status === 'current'
                      ? 'bg-blue-500 border-2 border-blue-400'
                      : 'bg-gray-600 border-2 border-gray-500'
                  }`}
                  style={
                    status === 'current'
                      ? {
                          animation: 'blink 1.5s ease-in-out infinite',
                        }
                      : undefined
                  }
                >
                  {status === 'completed' ? (
                    <svg
                      className="w-5 h-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <div
                      className={`w-3 h-3 rounded-full ${
                        status === 'current' ? 'bg-white' : 'bg-gray-300'
                      }`}
                    />
                  )}
                </div>
                <span
                  className={`text-xs mt-1 ${
                    status === 'completed'
                      ? 'text-green-400'
                      : status === 'current'
                      ? 'text-blue-400 font-semibold'
                      : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector Line */}
              {!isLast && (
                <div
                  className={`h-0.5 w-12 transition-all duration-300 ${
                    status === 'completed' ? 'bg-green-500' : 'bg-gray-600'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default WorkflowBreadcrumb;
