import dotenv from 'dotenv'

dotenv.config()

process.env = Object.assign(process.env, {
    NPM_CACHE: 'cache-jest'
})
