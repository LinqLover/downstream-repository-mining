import { graphql } from '@octokit/graphql'
import { gql } from 'graphql-request'
import _ from 'lodash'

import { NpmDependencySearcher } from './dependencies/npm'
import { Dowdep } from './dowdep'
import { Package } from './packages'
import { Reference } from './references'
import isDefined from './utils/isDefined'


export class Dependency {
    constructor(
        public name: string,
        public $package: Package
    ) { }

    description?: string
    githubRepository?: GithubRepository | null
    repositoryUrl?: string
    sourceDirectory?: string
    _references: Reference[] = []
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
    get urls() { return new Map() }

    async update(dowdep: Dowdep, options: Partial<DependencyUpdateOptions> = {}, updateCallback?: DependencyUpdateCallback) {
        const jobs = [...this.collectUpdateJobs(dowdep, options)]
        await Promise.allSettled(jobs.map(async (job, index) =>
            (await job()) && (await updateCallback?.(this, `job ${index}`))))
    }

    isSourceCodeReady(dowdep: Dowdep): Promise<boolean> {
        throw new Error("Not implemented")
    }

    updateSource(dowdep: Dowdep): Promise<boolean> {
        throw new Error("Not implemented") // Could use GitHub data for this
    }

    private *collectUpdateJobs(dowdep: Dowdep, options: Partial<DependencyUpdateOptions> = {}) {
        if (options.downloadMetadata ?? true) {
            yield () => this.updateFromGithub(dowdep)
        }
        if (options.downloadSource ?? false) {
            yield () => this.updateSource(dowdep)
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

    async updateFromGithub(dowdep: Dowdep) {
        const match = this.repositoryUrl?.match(/github\.com[/:](?<owner>[^/]+)\/(?<name>[\w-_.]+?)(?:.git)?$/)
        if (!match?.groups) {
            this.githubRepository = null
            return true
        }

        this.githubRepository = new GithubRepository(match.groups.owner, match.groups.name)
        await this.githubRepository.updateMetadata(dowdep)
        return true
    }
}

export abstract class DependencySearcher {
    constructor(
        public $package: Package
    ) { }

    abstract search(): AsyncGenerator<Dependency>

    protected createDependency(name: string) {
        return new Dependency(name, this.$package)
    }
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

    public stargazerCount?: number
    public forkCount?: number

    async updateMetadata(dowdep: Dowdep) {
        const githubClient = this.githubClient(dowdep)

        const metadata = await githubClient.fetchMetadata(this.owner, this.name)
        if (!metadata) {
            return
        }
        [this.forkCount, this.stargazerCount] = [metadata.forkCount, metadata.stargazerCount]
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

    async fetchMetadata(owner: string, name: string): Promise<{
        forkCount: number,
        stargazerCount: number
    } | undefined> {
        if (!this.graphql) {
            return
        }

        const
            query = gql`
                query githubDeps($owner: String!, $name: String!) {
                    repository(owner: $owner, name: $name) {
                        url, stargazerCount, forkCount
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

export {
    NpmDependencySearcher
}
