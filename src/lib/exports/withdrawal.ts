/**
 * The email to a funder's contact when a customer withdraws consent after their details were
 * exported to that funder (pure). It names the customer only by our reference and the batch, so
 * the email itself carries no more personal data than needed.
 */
export function consentWithdrawalEmail(input: {
  funderName: string
  reference: string
  batches: string[]
  withdrawnOn: string
}): { subject: string; text: string } {
  const where = input.batches.join(', ')
  return {
    subject: `Customer consent withdrawn: ${input.reference} (${where})`,
    text:
      `Dear ${input.funderName},\n\n` +
      `The customer with reference ${input.reference}, sent to you in ${where}, withdrew their ` +
      `consent for Go4Solar to share their details with you on ${input.withdrawnOn}.\n\n` +
      `Please stop using this customer's details and delete them from your systems, and reply to ` +
      `confirm when this is done.\n\nThank you,\nGo4Solar Energy Limited`,
  }
}
