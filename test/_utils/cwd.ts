import callSites from 'callsites'
import path from 'path'

export function getCwd(filename: string) {
    const filePath = path.parse(filename)
    return path.resolve(filePath.dir, filePath.name)
}

export default getCwd(callSites()[1].getFileName()!)
