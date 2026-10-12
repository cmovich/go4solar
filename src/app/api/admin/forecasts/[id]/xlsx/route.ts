import { forecastExcel } from '@/lib/reports/forecastExport'
import { fileName, scenarioForExport } from '@/lib/reports/forecastRoute'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await scenarioForExport((await params).id)
  if ('error' in r) return r.error
  const xlsx = await forecastExcel(r.scenario.name, r.scenario.inputs)
  return new Response(new Uint8Array(xlsx), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${fileName(r.scenario.name, 'xlsx')}"`,
    },
  })
}
