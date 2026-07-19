import express from 'express'
import axios from 'axios'
import dotenv from 'dotenv'
import cors from 'cors'
import habitTaskRouter from './habitsToTaskRouter'
import loseItRouter from './loseItRouter'

dotenv.config()

// Send API token each time to Marvin
axios.defaults.headers.common['X-API-Token'] = process.env.MARVIN_API_TOKEN
axios.defaults.headers.common['X-Full-Access-Token'] = process.env.MARVIN_FULL_ACCESS_TOKEN

const app = express()
app.use(express.json())

// Set up a general CORS policy
const corsOptions = {
  allowedHeaders: ['Content-Type'],
  credentials: false,
  methods: ['GET', 'HEAD', 'POST'],
  origin: 'https://app.amazingmarvin.com',
}
app.use(cors(corsOptions))


app.get('/', (_, res) => {
  res.status(200).json({ success: 'Hello Marvin Automation' })
})

// Routers
app.use(habitTaskRouter)
app.use(loseItRouter)

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`)
})
