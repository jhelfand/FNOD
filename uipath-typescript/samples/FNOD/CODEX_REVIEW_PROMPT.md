# Codex Deep Review Prompt

Use this prompt when asking Codex to review the FNOD app after pushing to GitHub.

---

## Prompt for Codex

```
Perform a deep, thorough code review of the FNOD (First Notice of Death) case management app in `samples/FNOD/`. Run tests, verify the app builds, and validate the critical flows below.

## CONTEXT

**What it is:** A React/TypeScript app for FNOD (life insurance) claims processing. It integrates with UiPath Data Fabric for case data and has screens for Policy Review, Beneficiary Research, Doc Validation, and Payout Calculator.

**Data flow:** 
1. User authenticates via UiPath
2. App starts on Case Selector tab (user picks a case from Case Management)
3. When a case is selected, we find the matching Data Fabric record by CaseInstanceId/CaseNumber
4. **Data lineage is critical:** All screens must pull DF fields from the SELECTED case's record, not from the table in general.

**Data Fabric entity:** Uses `VITE_UIPATH_ENTITY_ID` (e.g. 3f9e08f7-ee0c-f111-a69a-000d3a234247). Key fields:
- PolicyNumber, DecedentName, FNODDate (Claim Effective Date)
- EligibilityReviewed, BeneficiaryReviewed, QAReviewed, CurrentState
- CaseInstanceId, CaseNumber (for linking to case)

**Key files:**
- `src/contexts/CaseContext.tsx` – Case selection, selectedDfRecord, dfRecords, workflow
- `src/hooks/useDataFabricCase.ts` – Case-filtered DF query
- `src/utils/data-fabric.ts` – DF field registry
- `src/components/screens/SummaryScreen.tsx` – Uses selectedDfRecord or dfRecordFromHook
- `src/components/screens/PolicyReviewScreen.tsx` – Updates EligibilityReviewed, uses dfData restricted to case
- `src/components/screens/BeneficiaryResearchScreen.tsx` – Updates BeneficiaryReviewed
- `src/components/screens/PayoutCalculatorScreen.tsx` – Updates QAReviewed, CurrentState
- `src/components/screens/SummaryCaseScreen.tsx` – Case Selector

## REVIEW TASKS

1. **Build & tests:** Run `npm run build` and `npm test` (if any). Fix any failures.

2. **Data lineage:** Trace through all screens:
   - Does SummaryScreen use selectedDfRecord or case-matched dfRecordFromHook?
   - Does PolicyReviewScreen restrict dfData to records matching the selected case (CaseInstanceId/CaseNumber)?
   - Does PayoutCalculatorScreen do the same?
   - Are DF updates (EligibilityReviewed, BeneficiaryReviewed, QAReviewed) targeting selectedDfRecord (the case record) and not a policy-matched beneficiary row?

3. **Field display:** Verify PolicyNumber, DecedentName, FNODDate (Claim Effective Date) come from DF fields as specified.

4. **Navigation:** App starts on Case Selector tab (activeTab='case-selector'). Verify routing and tab flow.

5. **Edge cases:** What happens when selectedDfRecord is null? When DF filter fails? When case has no matching DF record?

6. **Type safety:** Check for TypeScript errors, unused vars, missing props.

7. **Security:** No secrets in code; .env vars used for config.

8. **Manual test suggestions:** If you can run the app, test: select case → Summary → Policy Review → Complete & Continue → Beneficiary Research → Payout. Verify DF updates hit the correct record.
```

---

## Quick copy-paste (shorter version)

```
Deep review FNOD app in samples/FNOD: (1) Run build & tests.
(2) Verify Data Fabric lineage: all screens pull from selected case's record (selectedDfRecord), not policy-matched or first-record fallbacks. PolicyReviewScreen and PayoutCalculatorScreen must restrict dfData to case-linked records.
(3) DF updates (EligibilityReviewed, BeneficiaryReviewed, QAReviewed) must target selectedDfRecord.
(4) PolicyNumber, DecedentName, FNODDate from DF. (5) App starts on Case Selector tab.
(6) Fix type errors, edge cases, security issues.
```
