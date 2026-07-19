import axios from 'axios'
import { inflateRawSync } from 'zlib'

const LOSEIT_EXPORT_URL = 'https://www.loseit.com/export/data'
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50

const DEFAULT_PRODUCE_REGEX = [
  'apple', 'apricot', 'asparagus', 'avocado', 'banana', 'bean', 'beet', 'berry',
  'blackberry', 'blueberry', 'broccoli', 'brussels sprout', 'cabbage',
  'carrot', 'cauliflower', 'celery', 'cherry', 'cucumber', 'eggplant', 'grape',
  'green bean', 'kale', 'kiwi', 'lettuce', 'mango', 'melon', 'mushroom',
  'nectarine', 'onion', 'orange', 'papaya', 'peach', 'pear', 'pepper',
  'pineapple', 'plum', 'potato', 'raspberry', 'spinach', 'squash',
  'strawberry', 'tomato', 'zucchini'
].join('|')

export interface LoseItFoodLogEntry {
  date: string
  name: string
  meal: string
  quantity: number
  units: string
  calories: number
  deleted: boolean
}

export interface LoseItProduceEntry {
  name: string
  meal: string
  quantity: number
  units: string
  grams: number | null
}

export interface LoseItDaySummary {
  date: string
  caloriesLogged: boolean
  foodCalories: number
  produceGrams: number
  produceOverThreshold: boolean
  produceThresholdGrams: number
  produceEntries: LoseItProduceEntry[]
  unconvertedProduceEntries: LoseItProduceEntry[]
  foodEntries: LoseItFoodLogEntry[]
}

interface ZipEntry {
  name: string
  compressionMethod: number
  compressedSize: number
  localHeaderOffset: number
}

interface CsvRow {
  [key: string]: string
}

export async function getLoseItDaySummary(date: string): Promise<LoseItDaySummary> {
  const cookie = process.env.LOSEIT_COOKIE
  if (cookie == null || cookie.trim().length === 0) {
    throw new Error('LOSEIT_COOKIE is required to fetch LoseIt export data')
  }

  const threshold = Number(process.env.LOSEIT_PRODUCE_THRESHOLD_GRAMS ?? 200)
  const produceRegex = new RegExp(process.env.LOSEIT_PRODUCE_REGEX ?? DEFAULT_PRODUCE_REGEX, 'i')
  const csvDate = formatCsvDate(date)
  const zip = await downloadLoseItExport(cookie)

  const dailyRows = parseCsv(extractZipTextFile(zip, 'daily-calorie-summary.csv'))
  const foodRows = parseCsv(extractZipTextFile(zip, 'food-logs.csv'))
  const dailyRow = dailyRows.find(row => row.Date === csvDate)

  const foodEntries = foodRows
    .filter(row => row.Date === csvDate)
    .map(rowToFoodLogEntry)
    .filter(entry => !entry.deleted)

  const foodCalories = dailyRow == null
    ? sum(foodEntries.map(entry => entry.calories))
    : parseNumber(dailyRow['Food cals'])

  const produceEntries = foodEntries
    .filter(entry => produceRegex.test(entry.name))
    .map(entry => {
      return {
        name: entry.name,
        meal: entry.meal,
        quantity: entry.quantity,
        units: entry.units,
        grams: convertToGrams(entry.quantity, entry.units),
      }
    })

  const produceGrams = sum(produceEntries
    .map(entry => entry.grams)
    .filter((grams): grams is number => grams != null))

  return {
    date,
    caloriesLogged: foodCalories > 0 || foodEntries.length > 0,
    foodCalories,
    produceGrams,
    produceOverThreshold: produceGrams > threshold,
    produceThresholdGrams: threshold,
    produceEntries,
    unconvertedProduceEntries: produceEntries.filter(entry => entry.grams == null),
    foodEntries,
  }
}

async function downloadLoseItExport(cookie: string): Promise<Buffer> {
  const response = await axios.get<ArrayBuffer>(LOSEIT_EXPORT_URL, {
    headers: {
      Accept: 'application/zip',
      Cookie: cookie,
      Referer: 'https://www.loseit.com/',
      'User-Agent': 'amazing-marvin-automation/1.0',
    },
    responseType: 'arraybuffer',
  })

  return Buffer.from(response.data)
}

function extractZipTextFile(zip: Buffer, fileName: string): string {
  const entry = listZipEntries(zip).find(candidate => candidate.name === fileName)
  if (entry == null) throw new Error(`LoseIt export is missing ${fileName}`)

  const localHeader = entry.localHeaderOffset
  if (zip.readUInt32LE(localHeader) !== ZIP_LOCAL_FILE_SIGNATURE) {
    throw new Error(`Invalid ZIP local header for ${fileName}`)
  }

  const nameLength = zip.readUInt16LE(localHeader + 26)
  const extraLength = zip.readUInt16LE(localHeader + 28)
  const dataStart = localHeader + 30 + nameLength + extraLength
  const compressed = zip.subarray(dataStart, dataStart + entry.compressedSize)

  if (entry.compressionMethod === 0) return compressed.toString('utf8')
  if (entry.compressionMethod === 8) return inflateRawSync(compressed).toString('utf8')
  throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} for ${fileName}`)
}

function listZipEntries(zip: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = []
  for (let offset = 0; offset <= zip.length - 46; offset += 1) {
    if (zip.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) continue

    const compressionMethod = zip.readUInt16LE(offset + 10)
    const compressedSize = zip.readUInt32LE(offset + 20)
    const nameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    const localHeaderOffset = zip.readUInt32LE(offset + 42)
    const nameStart = offset + 46
    const name = zip.subarray(nameStart, nameStart + nameLength).toString('utf8')

    entries.push({ name, compressionMethod, compressedSize, localHeaderOffset })
    offset = nameStart + nameLength + extraLength + commentLength - 1
  }
  return entries
}

function parseCsv(csv: string): CsvRow[] {
  const rows = parseCsvRows(csv).filter(row => row.length > 0)
  const [headers, ...dataRows] = rows
  if (headers == null) return []

  return dataRows.map(row => {
    const parsed: CsvRow = {}
    headers.forEach((header, index) => {
      parsed[header] = row[index] ?? ''
    })
    return parsed
  })
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]
    const next = csv[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(field)
      field = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }

    field += char
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

function rowToFoodLogEntry(row: CsvRow): LoseItFoodLogEntry {
  return {
    date: row.Date,
    name: row.Name,
    meal: row.Meal,
    quantity: parseNumber(row.Quantity),
    units: row.Units,
    calories: parseNumber(row.Calories),
    deleted: row.Deleted === '1',
  }
}

function formatCsvDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (match == null) throw new Error('date must be in YYYY-MM-DD format')

  const [, year, month, day] = match
  return `${month}/${day}/${year}`
}

function parseNumber(value: string | undefined): number {
  if (value == null || value === 'n/a' || value.trim().length === 0) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function convertToGrams(quantity: number, units: string): number | null {
  const normalizedUnits = units.toLowerCase()
  if (['g', 'gram', 'grams'].includes(normalizedUnits)) return quantity
  if (['kg', 'kilogram', 'kilograms'].includes(normalizedUnits)) return quantity * 1000
  if (['oz', 'ounce', 'ounces'].includes(normalizedUnits)) return quantity * 28.349523125
  if (['lb', 'lbs', 'pound', 'pounds'].includes(normalizedUnits)) return quantity * 453.59237
  return null
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

export {
  convertToGrams,
  extractZipTextFile,
  formatCsvDate,
  parseCsv,
}
