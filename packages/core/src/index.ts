export {
    Dependency,
    DependencySearchStrategy,
    DependencyUpdateOptions
} from './dependencies'
export { Dowdep } from './dowdep'
export { Package } from './packages'
export {
    DeclarationLocation,
    FilePosition,
    FilePositionPrimitive,
    Location,
    Reference,
    ReferenceCollector,
    ReferenceKind,
    ReferenceSearcher,
    ReferenceSearchStrategy
} from './references'

import pkgDir from 'pkg-dir'
import externalModules from './externalModules'

let _loadedExternalModules = false

/** Load external modules asynchronously that cannot be imported in the usual way. See `externalModules.ts` for details. This function must be called before using any other  functionality of this package! */
export async function loadExternalModules() {
    if (_loadedExternalModules) {
        return
    }

    /**
     * Truly awful hack! There are a few things going on here:
     * - Jest (or something) can't find parse-imports by just importing its package name
     *   no matter what. Just give it the path to the src/index.js file
     * - Workaround for https://github.com/microsoft/TypeScript/issues/43329.
     *
     * - TypeScript will always try to replace dynamic imports with `requires` which doesn't work for importing ESM from CJS.
     *   We work around by "hiding" our dynamic import in a Function constructor (terrible...).
     *
     * In particular, we must not extract this call into a separate module.
     * This would result in sporadic unresolved promises in the jest environment.
     * See #65.
     *
     * All of this required jest@next, ts-jest@next, AND `NODE_OPTIONS=--experimental-vm-modules`
     *
     * Developed with the kind help of @TomerAbach.
     */
    const dynamicImport = new Function('moduleName', 'return import(moduleName)')

    externalModules.escapeRegexp = (await dynamicImport('escape-string-regexp')).default
    const parseImportsIndexPath = `${await pkgDir()}/node_modules/parse-imports/src/index.js`

    try {
        externalModules.parseImports = (await dynamicImport(parseImportsIndexPath)).default
    } catch (parseError) {
        if (!(parseError instanceof Error && 'code' in parseError && (<{ code: string }>parseError).code == 'ERR_MODULE_NOT_FOUND')) {
            throw parseError
        }
        // This will occur if this package is imported as a local dependency from another package via a symlink.
        // For now, let's handle this by assuming the depending package is a sibling of ourselves ...
        // Hardcoded! So many hacks! 😭
        const parseImportsIndexPath = `${await pkgDir()}/../core/node_modules/parse-imports/src/index.js`
        externalModules.parseImports = (await dynamicImport(parseImportsIndexPath)).default
    }

    _loadedExternalModules = true
}
