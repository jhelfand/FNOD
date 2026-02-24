import React from 'react';

interface CurrentStatePillProps {
  /** Current state label (e.g. "Policy Review", "Beneficiary Research") */
  state: string | null | undefined;
  /** Optional variant for dark header vs light background */
  variant?: 'default' | 'header';
  /** Optional title for tooltip */
  title?: string;
}

export function CurrentStatePill({ state, variant = 'default', title }: CurrentStatePillProps) {
  if (!state || state.trim() === '') return null;

  const baseClass =
    variant === 'header'
      ? 'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-600 text-white'
      : 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200';

  return (
    <span className={baseClass} title={title || state}>
      {state}
    </span>
  );
}

export default CurrentStatePill;
