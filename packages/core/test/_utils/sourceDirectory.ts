import callSites from 'callsites'
import path from 'path'

/** Standardize filename. */
export function getSourceDirectory(filename: string) {
    const filePath = path.parse(filename)
    return path.resolve(filePath.dir, filePath.name)
}

/** The current source directory of the caller file. */
export default getSourceDirectory(callSites()[1].getFileName()!)
