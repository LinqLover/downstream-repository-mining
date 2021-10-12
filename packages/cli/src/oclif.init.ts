import dotenv from 'dotenv'
import { Hook } from '@oclif/config'
import { loadExternalModules } from 'dowdep'

export const hook: Hook<'init'> = async function (options) {
    dotenv.config()
    await loadExternalModules()
}
