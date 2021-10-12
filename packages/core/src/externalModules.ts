import type { Import, Options } from "parse-imports"


/**
 * Stores external modules that have been loaded in a non-standard, weird way.
 * 
 * The existence of this is a large workaround. Some components of our toolchain, including oclif and jest, do not support dynamic importing of pure ES modules correctly. See `loadExternalModules()` in `index.ts`. As the technique used there cannot be applied from submodules, imported modules are stored in this file.
 */
const modules = {
    /** Escape RegExp special characters */
    escapeRegexp: <(regex: string) => string><any>undefined,
    /** A blazing fast ES module imports parser. */
    parseImports: <(
        code: string,
        options?: Options
    ) => Promise<Iterable<Import>>><any>undefined
}

export default modules
