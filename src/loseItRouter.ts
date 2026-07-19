import express from 'express'
import { getLoseItDaySummary } from '../lib/loseItExport'

const router = express.Router()

router.get('/loseit/day-summary', async (req, res) => {
  const date = typeof req.query.date === 'string' ? req.query.date : getTodayInTimeZone()

  try {
    const summary = await getLoseItDaySummary(date)
    res.status(200).json(summary)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown LoseIt error'
    res.status(500).json({ error: message })
  }
})

function getTodayInTimeZone(): string {
  const timeZone = process.env.LOSEIT_TIME_ZONE ?? 'America/Los_Angeles'
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(new Date())

  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  const day = parts.find(part => part.type === 'day')?.value
  if (year == null || month == null || day == null) throw new Error(`Could not format date for ${timeZone}`)

  return `${year}-${month}-${day}`
}

export default router
export { getTodayInTimeZone }
