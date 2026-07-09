import * as winston from 'winston'

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'user-service' },
  transports: [
    // Write all logs with importance level of `error` or less to `error.log`
    new winston.transports.File({ filename: 'error.log', level: 'error' }),

    // Write all logs with importance level of `info` or less to `combined.log`
    new winston.transports.File({
      filename: 'combined.log',
    }),

    // Log to console so the user can see!
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        getUserLogFormat()
      ),
    }),
  ],
})

/**
 * Helper function to establish logging format - Example:
 * [info] [2024-11-23 | 1:07:22 AM | UTC-0800]: Log output
 * @returns
 */
function getUserLogFormat() {
  return winston.format.printf(info => {
    const now = new Date()

    // Format the local date in YYYY-MM-DD.
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const date = `${year}-${month}-${day}`
    const time = now.toLocaleTimeString()

    // Get the timezone offset in the format UTC±HHMM
    const timezoneOffsetMinutes = now.getTimezoneOffset()
    const offsetSign = timezoneOffsetMinutes <= 0 ? '+' : '-'
    const absoluteOffsetMinutes = Math.abs(timezoneOffsetMinutes)
    const hours = String(Math.floor(absoluteOffsetMinutes / 60)).padStart(2, '0')
    const minutes = String(absoluteOffsetMinutes % 60).padStart(2, '0')
    const timezone = `UTC${offsetSign}${hours}${minutes}`

    return `[${info.level}] [${date} | ${time} | ${timezone}]: ${info.message}`
  })
}

// Add colors to make it easier to read!
winston.addColors({
  error: 'red',
  warn: 'yellow',
  info: 'cyan',
  debug: 'green'
})

export default logger
