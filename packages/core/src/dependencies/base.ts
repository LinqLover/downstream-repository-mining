import { strict as assert } from 'assert'
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


/** A downstream dependency of a {@link Package}. */
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
        return [...this.urls.entries()].find((
            [key, ]) => key.toLowerCase() === 'github'
        )?.[1]
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
        // Pretty-print URL labels
        const map = new Map<string, string>([...this.pluggableUrls.entries()].map(
            ([key, value]) => [key && ({"github": "GitHub"}[key] ?? key) || '?', value]
        ))

        // Prefer official GitHub URL if available
        if (this.githubRepository?.url) {
            map.set("GitHub", this.githubRepository.url)
        }

        return map
    }

    /** Update this dependency from multiple data sources as specified in the `options`. After each step, evauate `updateCallback`. */
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

    /** Download the source code for this dependency from GitHub unless already cached. */
    async updateSource(dowdep: Dowdep): Promise<boolean> {
        if (!this.urls.size) {
            return false
        }
        if (await this.isSourceCodeReady(dowdep)) {
            return true
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
                console.warn("Invalid GitHub URL, skipping dependency", this.githubUrl)
                return false
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
            console.debug("Downloading GitHub metadata", this.name)
            await this.updateFromGithub(dowdep, options.downloadMetadata ?? false)
            console.debug("Downloaded GitHub metadata", this.name)

            if (options.downloadSource ?? false) {
                console.debug("Downloading source", this.name)
                if (await this.updateSource(dowdep)) {
                    console.debug("Downloaded source", this.name)
                } else {
                    console.debug("Not downloaded source", this.name)
                }
            }
        }
    }

    /** Update the references for this dependency asynchronously. Whenever a reference is found, evaluate `updateCallback`. */
    async updateReferences(dowdep: Dowdep, updateCallback: () => Promise<void>) {
        assert(this.sourceDirectory)

        const searcher = dowdep.createReferenceSearcher(this, this.$package)
        console.debug("Updating references", this.name)

        for await (const reference of searcher.searchReferences()) {
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

        console.debug("Updated references", this.name)
    }

    /**
     * Fetch metadata for this dependency from GitHub if available.
     *
     * @argument richMetadata If `false`, fetch a bare minimum of data only for identifying the repository and retrieving the disk usage. If `true`, gain extended metadata indicating the popularity of the repository etc.
     */
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

/** Abstract base class for all downstream dependency searchers using different data sources. */
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

export type DependencyUpdateCallback = (dependency: Dependency, data: unknown) => void | Promise<void>

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
