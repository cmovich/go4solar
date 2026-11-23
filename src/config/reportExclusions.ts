/**
 * Accounts that are NOT test data but must never count as real customers in reports (Profit,
 * Forecasts, dashboard tiles, the Applications queue): every report that leaves out test
 * accounts (`testProfileIds()`) leaves these out too, and shows them with "Show test data".
 * Their records stay exactly as they are (e.g. the SPEWA demo file still waits in SPEWA
 * approvals). Remove an entry when its file is cancelled (see CLAUDE.md, "cancel the demo file").
 */
export const REPORT_EXCLUSIONS: readonly { profileId: string; reason: string }[] = [
  {
    profileId: '497fe7f0-5d49-4ceb-b4bf-40f08b13d9f2',
    reason:
      'SPEWA demo file G4S-E7B59741 (DEMO — SPEWA Demo Business), kept waiting for the postponed demo (Semako, 23 Nov 2026)',
  },
]
