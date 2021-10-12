import { promises as fsPromises } from 'fs'


/**
 * Replacement for deprecated `fs.promises.exists`.
 *
 * CREDITS: https://stackoverflow.com/a/39876121/13994294
 */
export default async function fileExists(filename: string) {
    try {
        await fsPromises.stat(filename)
        return true
    } catch (err) {
        if ((<NodeJS.ErrnoException>err).code === 'ENOENT') {
            return false
        } else {
            throw err
        }
    }
}
