import { useAuth } from './useAuth';

export const useUiPathSdk = () => {
  const { sdk } = useAuth();

  const services = {
    updatePolicy: async (policyId: string, payload: any) => {
      void policyId; // referenced to satisfy no-unused parameter rule in sample
      void payload;
      if (sdk && sdk.entities) {
        return new Promise((res) => setTimeout(() => res({ success: true }), 600));
      }
      return new Promise((res) => setTimeout(() => res({ success: true }), 600));
    },

    // Return a mocked list of beneficiaries when SDK isn't available.
    getBeneficiaries: async (policyId: string) => {
      if (sdk && (sdk as any).policies?.getBeneficiaries) {
        return (sdk as any).policies.getBeneficiaries(policyId);
      }
      return new Promise((res) => setTimeout(() => res([
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
      ]), 400));
    },

    // Trigger correspondence mock
    triggerCorrespondence: async (opts: { beneficiaryId: string; type: 'Email' | 'Letter'; templateName?: string }) => {
      if ((sdk as any)?.correspondence?.trigger) {
        return (sdk as any).correspondence.trigger(opts);
      }
      return new Promise((res) => setTimeout(() => res({ success: true }), 300));
    }
  };

  return { services };
};

export default useUiPathSdk;
