import dotenv from 'dotenv'
import { Hook } from '@oclif/config'

export const hook: Hook<'init'> = async function (options) {
    dotenv.config()
}
