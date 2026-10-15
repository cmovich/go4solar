/** The lock tick names the days from the setting lock_after_days_overdue. */
export const lockTickLabel = (lockAfterDays: number) =>
  `I understand the system can be locked remotely if a payment is ${lockAfterDays} days overdue, and unlocked once I pay.`

/** The separate confirmations a signer gives before signing (one tick each). */
export const consumerTicks = (lockAfterDays: number) =>
  [
    { id: 'agreement', label: 'I have read the payment plan agreement and I agree to it.' },
    {
      id: 'collateral',
      label: 'I understand the solar system is collateral until my final payment.',
    },
    { id: 'lock', label: lockTickLabel(lockAfterDays) },
    {
      id: 'bureau',
      label: 'I agree that my payment record may be shared with licensed credit bureaus.',
    },
    {
      id: 'biometrics',
      label:
        'I agree to the use of my ID and face images to verify my identity and manage this plan.',
    },
  ] as const

export type ConsumerTickId = ReturnType<typeof consumerTicks>[number]['id']

export const GUARANTOR_TICKS = [
  { id: 'agreement', label: 'I have read the guarantee agreement and I agree to it.' },
  {
    id: 'liability',
    label: 'I understand I must pay any overdue amounts if the customer does not.',
  },
  {
    id: 'bureau',
    label: 'I agree that this guarantee may be shared with licensed credit bureaus.',
  },
  { id: 'biometrics', label: 'I agree to the use of my ID and face images to verify my identity.' },
] as const
