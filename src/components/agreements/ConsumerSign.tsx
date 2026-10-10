'use client'

import { useRouter } from 'next/navigation'

import { AgreementSigner } from '@/components/signature/AgreementSigner'
import { CONSUMER_TICKS } from '@/lib/agreements/ticks'

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
}: {
  text: string
  defaultName: string
  defaultTitle: string | null
  isBusiness: boolean
  phoneHint: string
}) {
  const router = useRouter()
  return (
    <AgreementSigner
      text={text}
      ticks={[...CONSUMER_TICKS]}
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
