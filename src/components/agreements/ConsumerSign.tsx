'use client'

import { useRouter } from 'next/navigation'

import { AgreementSigner } from '@/components/signature/AgreementSigner'
import { consumerTicks } from '@/lib/agreements/ticks'

import {
  sendConsumerSignCode,
  signConsumerAgreement,
} from '@/app/(consumer)/app/apply/sign/actions'

export function ConsumerSign({
  text,
  defaultName,
  defaultTitle,
  isBusiness,
  phoneHint,
  lockAfterDays,
}: {
  text: string
  defaultName: string
  defaultTitle: string | null
  isBusiness: boolean
  phoneHint: string
  lockAfterDays: number
}) {
  const router = useRouter()
  return (
    <AgreementSigner
      text={text}
      ticks={[...consumerTicks(lockAfterDays)]}
      defaultName={defaultName}
      titleLabel={isBusiness ? 'Your title (director / authorised signatory)' : undefined}
      defaultTitle={defaultTitle}
      phoneHint={phoneHint}
      sendCode={sendConsumerSignCode}
      sign={signConsumerAgreement}
      onSigned={() => router.refresh()}
    />
  )
}
