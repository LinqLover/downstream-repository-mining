import downloadGitRepo from 'download-git-repo'
import { graphql } from '@octokit/graphql'
import { gql } from 'graphql-request'
import _ from 'lodash'
import parseGitHubRepoUrl from 'parse-github-repo-url'
import { promisify } from 'util'

import { Dowdep } from '../dowdep'
import { Package } from '../packages'
import { Reference } from '../references'
import isDefined from '../utils/isDefined'
import { OnlyData } from '../utils/OnlyData'


export class Dependency {
    constructor(
        public name: string,
        public $package: Package
    ) { }

    description?: string
    githubRepository?: GithubRepository | null
    sourceDirectory?: string
    rootDir = '/'
    pluggableUrls = new Map<string | null, string>()
    _references: Reference[] = []
    /** In kilobyte (kB). */
    static maximumRepositorySize = 100_000
    get githubUrl() {
        return [...this.urls.entries()].find(([key, ]) => key.toLowerCase() === 'github')?.[1]
    }
    get isGitHubRepositoryReady() {
        if (_.isUndefined(this.githubRepository)) {
            return false
        }
        if (this.githubRepository === null) {
            return true
        }
        return isDefined(this.githubRepository.stargazerCount)
    }

    get references() { return this._references }
    get urls() {
        const map = new Map<string, string>([...this.pluggableUrls.entries()].map(
            ([key, value]) => [key && ({"github": "GitHub"}[key] ?? key) || '?', value]
        ))
        if (this.githubRepository?.url) {
            map.set("GitHub", this.githubRepository.url)
        }
        return map
    }

    async update(dowdep: Dowdep, options: Partial<DependencyUpdateOptions> = {}, updateCallback?: DependencyUpdateCallback) {
        const jobs = [...this.collectUpdateJobs(dowdep, options)]
        await Promise.allSettled(jobs.map(async (job, index) => {
            let success
            try {
                await job()
                success = true
            } catch (error) {
                console.warn(error)
                success = false
            }
            if (success) {
                await updateCallback?.(this, `job ${index}`)
            }
        }))
    }

    async isSourceCodeReady(dowdep: Dowdep): Promise<boolean> {
        return isDefined(this.sourceDirectory) && await dowdep.fileSystem.exists(this.sourceDirectory)
    }

    async updateSource(dowdep: Dowdep): Promise<boolean> {
        if (!this.urls.size) {
            return false
        }
        if (await this.isSourceCodeReady(dowdep)) {
            return true // TODO: What to return here?
        }

        const cacheDirectory = dowdep.sourceCacheDirectory
        const basicSourceDirectory = dowdep.fileSystem.join(cacheDirectory, this.name)
        this.sourceDirectory = basicSourceDirectory
        if (this.rootDir) {
            this.sourceDirectory += `/${this.rootDir}`
        }

        let repo: string
        if (this.githubUrl) {
            const url = parseGitHubRepoUrl(this.githubUrl)
            if (!url) {
                return false // TODO: Raise?
            }
            repo = `${url[0]}/${url[1]}`
        } else {
            repo = this.urls.values().next().value
        }

        if ((this.githubRepository?.diskUsage ?? 0) > Dependency.maximumRepositorySize) {
            console.warn("Repository is too large, skipping download", this.githubUrl)
            return false
        }

        // TODO: Use dowdep.fileSystem!
        await promisify(downloadGitRepo)(repo, basicSourceDirectory)
        return true
    }

    private *collectUpdateJobs(dowdep: Dowdep, options: Partial<DependencyUpdateOptions> = {}) {
        yield async () => {
            console.log("Downloading GitHub metadata", this.name)
            await this.updateFromGithub(dowdep, options.downloadMetadata ?? false)
            console.log("Downloaded GitHub metadata", this.name)
            
            if (options.downloadSource ?? false) {
                console.log("Downloading source", this.name)
                if (await this.updateSource(dowdep)) {
                    console.log("Downloaded source", this.name)
                } else {
                    console.log("Not downloaded source", this.name)
                }
            }
        }
    }

    async updateReferences(dowdep: Dowdep, updateCallback: () => Promise<void>) {
        const searcher = dowdep.createReferenceSearcher(this, this.$package)

        // TODO: Don't pass directory separately
        for await (const reference of searcher.searchReferences(this.sourceDirectory!)) {
            const existingReference = this._references.find(existingReference =>
                existingReference.location.keyEquals(reference.location))
            if (existingReference) {
                // reference.updateFrom(existingReference)
                // await updateCallback()
                continue
            }

            this._references.push(reference)
            await updateCallback()
        }
    }

    async updateFromGithub(dowdep: Dowdep, richMetadata: boolean) {
        const match = this.githubUrl?.match(/github\.com[/:](?<owner>[^/]+)\/(?<name>[\w-_.]+?)(?:.git)?$/)
        if (!match?.groups) {
            this.githubRepository = null
            return true
        }

        this.githubRepository = new GithubRepository(match.groups.owner, match.groups.name)
        await this.githubRepository.updateMetadata(dowdep, richMetadata)
        return true
    }
}

export abstract class DependencySearcher {
    constructor(
        public $package: Package,
        init?: Partial<OnlyData<DependencySearcher>>
    ) {
        Object.assign(this, init)
    }

    limit?: number = undefined

    abstract search(dowdep: Dowdep): AsyncGenerator<Dependency>
}

export type DependencyUpdateCallback = (dependency: Dependency, data: any) => void | Promise<void>

export type DependencyUpdateOptions = {
    downloadMetadata: boolean
    downloadSource: boolean
}

export class GithubRepository {
    constructor(
        public owner: string,
        public name: string
    ) { }

    public url?: string
    public diskUsage?: number
    public stargazerCount?: number
    public forkCount?: number

    async updateMetadata(dowdep: Dowdep, richMetadata: boolean) {
        const githubClient = this.githubClient(dowdep)

        const metadata = await githubClient.fetchMetadata(this.owner, this.name, richMetadata)
        if (!metadata) {
            console.warn("Could not fetch GitHub metadata", { owner: this.owner, name: this.name })
            return
        }
        this.url = metadata.url
        this.diskUsage = metadata.diskUsage
        ;[this.forkCount, this.stargazerCount] = [metadata.forkCount, metadata.stargazerCount]
    }

    githubClient(dowdep: Dowdep) {
        if (dowdep.githubClient) {
            return <GithubClient>dowdep.githubClient
        }

        return dowdep.githubClient = new GithubClient(dowdep.githubAccessToken)
    }
}

class GithubClient {
    constructor(accessToken: string | undefined) {
        this.tokenChanged(accessToken)
    }

    protected graphql?: typeof graphql

    async fetchMetadata(owner: string, name: string, richMetadata: boolean): Promise<{
        url: string,
        diskUsage: number,
        stargazerCount?: number,
        forkCount?: number
    } | undefined> {
        if (!this.graphql) {
            return
        }

        const
            query = gql`
                query githubDeps($owner: String!, $name: String!) {
                    repository(owner: $owner, name: $name) {
                        url,
                        diskUsage
                        ${richMetadata ? ', stargazerCount, forkCount' : ''}
                    }
                }
            `,
            variables = { owner, name }

        // TODO: Try to bundle queries using aliases: https://stackoverflow.com/a/64267839/13994294
        const { repository } = await this.graphql(query, variables)

        return repository
    }

    tokenChanged(newToken: string | undefined) {
        this.graphql = !newToken ? undefined : graphql.defaults({
            headers: {
                authorization: `token ${newToken}`,
            }
        })
    }
}
