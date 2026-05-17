export function getDateFormatted(time: number): string {
  // Convert the Unix timestamp to a Date object
  const date = new Date(time)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0') // Months are zero-indexed
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

// Default behavior in JS if a timezone is behind GMT, then it has a positive
// offset, but if it's ahead, it has a negative offset.
// E.g. UTC-8 has an offset of 480 mins, but UTC+2 will be offset by -120 mins
//
// Marvin expects a negative offset (which is logical)
// for timezones that are behind UTC and positive for ones that are ahead
export function getMarvinTimezoneOffset(date = new Date()): number {
  return -date.getTimezoneOffset()
}
