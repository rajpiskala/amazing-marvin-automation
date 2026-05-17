import express from 'express'
import axios from 'axios'
import dotenv from 'dotenv'
import cors from 'cors'
import habitTaskRouter from './habitsToTaskRouter'

dotenv.config()

// Send API token each time to Marvin
axios.defaults.headers.common['X-API-Token'] = process.env.MARVIN_API_TOKEN
axios.defaults.headers.common['X-Full-Access-Token'] = process.env.MARVIN_FULL_ACCESS_TOKEN

const app = express()
app.use(express.json())

// Set up a general CORS policy
const corsOptions = {
  credentials: true,
  allowedHeaders: 'content-type',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  origin: 'https://app.amazingmarvin.com',
}
app.use(cors(corsOptions))


app.get('/', (_, res) => {
  res.status(200).json({ success: 'Hello Marvin Automation' })
})

// Routers
app.use(habitTaskRouter)

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`)
})
