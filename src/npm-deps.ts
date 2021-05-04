import { GraphQLClient, gql } from 'graphql-request'
import npmDependants from 'npm-dependants'
import { RegistryClient } from 'package-metadata';
import tqdm from 'ntqdm'
import * as dotenv from 'dotenv'
import asyncIteratorToArray from 'it-all'


export class Dependent {
    public name!: string
    public github?: GitHubRepository

    public dependentCount?: number
}

class GitHubRepository {
    constructor(owner: string, name: string) {
        this.owner = owner
        this.name = name
    }

    public owner!: string
    public name!: string

    public stargazerCount!: number
    public forkCount!: number
}


export async function getNpmDeps(packageName: string, limit: number, countNestedDependents = false, downloadGitHubData = false) {
    dotenv.config()

    const githubEndpoint = 'https://api.github.com/graphql'
    // TODO: Consider using octokit
    const githubClient = new GraphQLClient(githubEndpoint, {
        headers: {
            authorization: `Bearer ${process.env.GITHUB_OAUTH_TOKEN}`,
            accept: 'application/vnd.github.hawkgirl-preview+json'
        },
    })

    let dependents = await asyncIteratorToArray(getNpmDependents(packageName, limit))

    for (const dependent of tqdm(dependents, {desc: "Gathering metadata"})) {
        const metadata = await RegistryClient.getMetadata(dependent.name, {fullMetadata: true})

        if (downloadGitHubData) {
            const repositoryUrl = metadata?.versions?.latest?.repository?.url
            const match = repositoryUrl?.match(/github\.com[\/:](?<owner>[^/]+)\/(?<name>[\w-_\.]+?)(?:.git)?$/)
            if (!match) {
                console.warn("Package has no GitHub link", {metadata, url: repositoryUrl})
                continue
            }
            dependent.github = new GitHubRepository(match.groups.owner, match.groups.name)
        }
    }

    for (const repo of tqdm(dependents, {desc: "Gathering GitHub data"})) {
        if (!repo.github) continue
        const repoData = (await getRepoData(githubClient, repo.github.owner, repo.github.name)).repository
        Object.assign(repo.github, repoData);
    }

    if (countNestedDependents) {
        for (const dependent of tqdm(dependents, {desc: "Gathering nested dependents data"})) {
            dependent.dependentCount = (await asyncIteratorToArray(getNpmDependents(dependent.name, limit))).length;
        }
    }

    dependents = dependents.sort((a, b) => (a.github?.stargazerCount ?? 0) - (b.github?.stargazerCount ?? 0))

    return dependents
}

async function* getNpmDependents(packageName: string, limit: number | null) {
    let count = 0
    for await (const dependent of npmDependants(packageName)) {
        yield <Dependent>{name: <string>dependent, github: undefined, dependentCount: undefined}
        if (limit && ++count >= limit) break;
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

    const variables = {owner, name}

    return await graphQLClient.request(query, variables)
}
