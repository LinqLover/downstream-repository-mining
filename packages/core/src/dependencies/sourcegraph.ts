import { strict as assert } from 'assert'
import { gql, GraphQLClient } from 'graphql-request'
import _ from 'lodash'
import normalizePackageData from 'normalize-package-data'

import { Dependency, DependencySearcher } from './base'
import { Dowdep } from '../dowdep'
import { Package } from '../packages'
import { OnlyData } from '../utils/OnlyData'


/** Finds downstream dependencies for a package on [Sourcegraph](sourcegraph.com). */
export class SourcegraphDependencySearcher extends DependencySearcher {
    constructor($package: Package, init: Partial<OnlyData<SourcegraphDependencySearcher>>) {
        super($package, init)
        Object.assign(this, init)
    }

    async *search(dowdep: Dowdep) {
        const client = new SourcegraphClient(dowdep.sourcegraphToken)
        yield* client.fetchDependencies(this.$package, this.limit)
    }
}

interface SourcegraphResult {
    repository?: {
        name: string
        description: string
        stars: number
        externalURLs: readonly {
            serviceKind: string,
            url: string
        }[],
    },
    file?: {
        content: string,
        path: string
    },
    lineMatches: readonly {
        preview: string
    }[]
}

class SourcegraphClient {
    constructor(
        protected token?: string
    ) { }


    protected url = 'https://sourcegraph.com/.api/graphql'
    protected maximumLimit = 1000000000

    protected get documentSpecifier() {
        return {
            document: gql`query search($query: String!) {
                search(query: $query) {
                    results {
                        alert {
                            title
                            description
                        }
                        limitHit
                        matchCount
                        timedout {
                            name
                        }
                        indexUnavailable
                        results {
                            ... on FileMatch {
                                repository {
                                    name
                                    description
                                    stars
                                    externalURLs {
                                        serviceKind,
                                        url
                                    }
                                }
                                file {
                                    path
                                    content
                                }
                                lineMatches {
                                    preview
                                }
                            }
                        }
                    }
                }
            }`,
            protoResponse: <{
                search: {
                    results: {
                        alert: {
                            title: string,
                            description: string
                        } | null,
                        limitHit: boolean
                        matchCount: number
                        timedout: readonly {
                            name: string
                        }[]
                        results: readonly SourcegraphResult[]
                    }
                }
            }>{}
        }
    }

    async* fetchDependencies($package: Package, limit?: number) {
        for await (const result of this.fetchResults($package.name, limit)) {
            yield this.createDependency(result, $package)
        }
    }

    protected createDependency(result: SourcegraphResult, $package: Package) {
        const [repository, file] = [result.repository, result.file]
        assert(repository && file)

        const name = this.readPackageName(file.content) || (() => {
            console.warn("Falling back to repository name", repository.name)
            return repository.name
        })()
        const rootDir = _.initial(file.path.split('/')).join('/')
        const dependency = new Dependency(name, $package)
        dependency.rootDir = rootDir

        dependency.description = repository.description
        for (const link of repository.externalURLs) {
            dependency.pluggableUrls.set(link.serviceKind.toLowerCase(), link.url)
        }

        return dependency
    }

    protected async* fetchResults(packageName: string, limit?: number) {
        const graphql = new GraphQLClient(this.url, {
            headers: {
                authorization: `token ${this.token}`
            },
        })

        const queryArgs: Record<string, string> = {
            'select': 'file',
            'file': 'package\\.json',
            '-file': 'node_modules/',
            'count': `${limit || this.maximumLimit}`
        }

        // Workaround for https://github.com/microsoft/vscode/issues/130367 and https://github.com/microsoft/TypeScript/issues/43329 🤯
        const dynamicImport = new Function('moduleName', 'return import(moduleName)')
        const escapeRegexp: (regex: string) => string = (await dynamicImport('escape-string-regexp')).default

        const query = `"${escapeRegexp(packageName)}": ` + Object.entries(queryArgs).map(([key, value]) => `${key}:${value}`).join(' ')
        const response = this.documentSpecifier.protoResponse
        Object.assign(response, await graphql.request(this.documentSpecifier.document, { query }))

        const results = response.search.results
        if (results.alert) {
            throw new Error(`Sourcegraph alert: ${results.alert.title}\n${results.alert.description}`)
        }
        if (results.timedout.length) {
            console.warn("Sourcegraph timeouts", results.timedout.map(repo => repo.name).join(', '))
        }
        // TODO: Pagination?
        yield* results.results
    }

    private readPackageName(json: string) {
        try {
            let data = JSON.parse(json)
            data = { name: data.name }
            normalizePackageData(data)
            return (<normalizePackageData.Package>data).name
        } catch (error) {
            console.warn("Error while parsing package data", error, json)
            return
        }
    }
}
