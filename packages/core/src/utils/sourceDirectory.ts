import callSites from 'callsites'
import path from 'path'

export function getSourceDirectory(filename: string) {
    const filePath = path.parse(filename)
    return path.resolve(filePath.dir, filePath.name)
}

export default getSourceDirectory(callSites()[1].getFileName()!)
