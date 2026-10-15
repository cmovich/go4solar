import { forecastPdf } from '@/lib/reports/forecastExport'
import { fileName, scenarioForExport } from '@/lib/reports/forecastRoute'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await scenarioForExport((await params).id)
  if ('error' in r) return r.error
  const pdf = await forecastPdf(r.scenario.name, r.scenario.inputs)
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${fileName(r.scenario.name, 'pdf')}"`,
    },
  })
}
