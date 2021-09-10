import downloadPackageTarball from 'download-package-tarball'
import fs from 'fs'
import { GraphQLClient, gql } from 'graphql-request'
import asyncIteratorToArray from 'it-all'
import npmDependants from 'npm-dependants'
import tqdm from 'ntqdm'
import { RegistryClient } from 'package-metadata'
import path from 'path'

import { OnlyData } from './utils/OnlyData'


export class Dependent {
    constructor(init: OnlyData<Dependent>) {
        Object.assign(this, init)
    }

    public name!: string
    public github?: GithubRepository
    public tarballUrl!: string

    public dependentCount?: number
}

class GithubRepository {
    constructor(owner: string, name: string) {
        this.owner = owner
        this.name = name
    }

    public owner!: string
    public name!: string

    public stargazerCount!: number
    public forkCount!: number
}


export async function getNpmDeps(packageName: string, limit?: number, countNestedDependents = false, downloadGitHubData = false) {
    const githubEndpoint = 'https://api.github.com/graphql'
    // TODO: Consider using octokit
    const githubClient = new GraphQLClient(githubEndpoint, {
        headers: {
            authorization: `Bearer ${process.env.GITHUB_OAUTH_TOKEN}`,
            accept: 'application/vnd.github.hawkgirl-preview+json'
        },
    })

    let dependents = (
        await asyncIteratorToArray(getNpmDependents(packageName, limit))
    ).map(name => (<Dependent>{ name }))

    for (const dependent of tqdm(dependents, { desc: "Gathering metadata" })) {
        const metadata = await RegistryClient.getMetadata(dependent.name, { fullMetadata: true })

        const tarballUrl = metadata.versions?.latest.dist?.tarball
        if (!tarballUrl) {
            console.warn("Package has no tarball", { metadata })
            continue
        }
        dependent.tarballUrl = tarballUrl

        if (downloadGitHubData) {
            const repositoryUrl = metadata?.versions?.latest?.repository?.url
            const match = repositoryUrl?.match(/github\.com[/:](?<owner>[^/]+)\/(?<name>[\w-_.]+?)(?:.git)?$/)
            if (!match) {
                console.warn("Package has no GitHub link", { metadata, url: repositoryUrl })
                continue
            }
            dependent.github = new GithubRepository(match.groups.owner, match.groups.name)
        }
    }

    if (downloadGitHubData) {
        for (const repo of tqdm(dependents, { desc: "Gathering GitHub data" })) {
            if (!repo.github) continue
            const repoData = (await getRepoData(githubClient, repo.github.owner, repo.github.name)).repository
            Object.assign(repo.github, repoData)
        }
    }

    if (countNestedDependents) {
        for (const dependent of tqdm(dependents, { desc: "Gathering nested dependents data" })) {
            dependent.dependentCount = (await asyncIteratorToArray(getNpmDependents(dependent.name, limit))).length
        }
    }

    dependents = dependents.sort((a, b) => (a.github?.stargazerCount ?? 0) - (b.github?.stargazerCount ?? 0))

    return dependents.map(proto => new Dependent(proto))
}

export async function downloadDep(dependent: Dependent) {
    const cacheDirectory = getCacheDirectory()

    if (fs.existsSync(path.join(cacheDirectory, dependent.name))) {
        return
    }

    // TODO: Check system-wide npm/yarn caches?
    await downloadPackageTarball({
        url: dependent.tarballUrl,
        dir: getCacheDirectory()
    })
}

export function getCacheDirectory() {
    return process.env.NPM_CACHE || 'cache'
}

async function* getNpmDependents(packageName: string, limit?: number) {
    let count = 0
    for await (const dependent of npmDependants(packageName)) {
        yield dependent
        if (limit && ++count >= limit) break
    }
}

async function getRepoData(graphQLClient: GraphQLClient, owner: string, name: string) {
    const query = gql`
        query githubDeps($owner: String!, $name: String!) {
            repository(owner: $owner, name: $name) {
                url, stargazerCount, forkCount
            }
        }
    `

    const variables = { owner, name }

    return await graphQLClient.request(query, variables)
}
