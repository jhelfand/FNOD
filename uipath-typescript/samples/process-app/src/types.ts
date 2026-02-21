export interface PersonData {
  name: string;
  dob?: string;
  ssn?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface Beneficiary {
  id: string;
  name: string;
  isPrimary?: boolean;
  percentage?: number;
  relationship?: string;
  onbaseData: PersonData;
  policySystemData: PersonData;
}

export type Caller = {
  name: string;
  relationship?: string;
  phone?: string;
  address?: string;
};

export interface Policy {
  id: string;
  policyNumber: string;
  productType: string;
  faceValue: number;
  status: string;
  accountValue?: number;
  claimEffectiveDate?: string;
  requiredClaimProof?: string[];
  riders?: string[];
  hasLoans?: boolean;
  hasWithdrawals?: boolean;
  loanAmount?: number;
  withdrawalAmount?: number;
  eligibilityChecks?: Array<{
    id: string;
    name: string;
    description?: string;
    aiStatus: 'Pass' | 'Fail' | 'Review';
  }>;
}

export interface CaseModel {
  id: string;
  caller: Caller;
  channel: string;
  decedentName: string;
  dateOfDeath: string;
  locationOfDeath?: string;
  causeOfDeath?: string;
  status: string;
  agingDays: number;
  priority: string;
  assignedAnalyst?: string;
  queue?: string;
  policyCount?: number;
  fnodDateTime?: string;
  flags?: {
    highAmount?: boolean;
    foreignDeath?: boolean;
    fraudRisk?: boolean;
    contestable?: boolean;
    suicideClause?: boolean;
  };
}

export type WorkflowStep = 'summary' | 'policy-review' | 'beneficiaries' | 'doc-validation' | 'payout';

/** Data Fabric record - allows unknown fields from entity schema */
export interface DfRecord {
  [key: string]: unknown;
}
