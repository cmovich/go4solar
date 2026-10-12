import { ErrorScreen } from '@/components/brand/ErrorScreen'

export default function NotFound() {
  return (
    <ErrorScreen
      code="404"
      title="We can't find that page"
      body="The link may be old or mistyped. Start again from the home page, or check your plan from your dashboard."
    />
  )
}
