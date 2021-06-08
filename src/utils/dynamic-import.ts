/**
 * Workaround for https://github.com/microsoft/TypeScript/issues/43329.
 *
 * TypeScript will always try to replace dynamic imports with  requires` which doesn't work for importing ESM from CJS.
 * We work around by "hiding" our dynamic import in a Function constructor (terrible...)
 */
export default new Function('moduleName', 'return import(moduleName)')
