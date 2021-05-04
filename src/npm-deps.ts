import * as dotenv from 'dotenv'
import downloadPackageTarball from 'download-package-tarball';
import escapeRegexp from 'escape-string-regexp'
import * as fs from 'fs'
import { promises as fsPromises } from "fs"
import glob from 'glob-promise'
import { GraphQLClient, gql } from 'graphql-request'
import asyncIteratorToArray from 'it-all'
import npmDependants from 'npm-dependants'
import tqdm from 'ntqdm'
import { RegistryClient } from 'package-metadata'
import * as path from 'path'

import rex from './utils/rex'


export class Dependent {
    public name!: string
    public github?: GitHubRepository
    public tarballUrl!: string

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

class Reference {
    public dependent!: Dependent
    public file!: string
    public lineNumber!: number

    public matchString?: string
}


export async function getNpmDeps(packageName: string, limit?: number, countNestedDependents = false, downloadGitHubData = false) {
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

        const tarballUrl = metadata.versions?.latest.dist?.tarball
        if (!tarballUrl) {
            console.warn("Package has no tarball", {metadata})
            continue
        }
        dependent.tarballUrl = tarballUrl

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

    if (downloadGitHubData) {
        for (const repo of tqdm(dependents, {desc: "Gathering GitHub data"})) {
            if (!repo.github) continue
            const repoData = (await getRepoData(githubClient, repo.github.owner, repo.github.name)).repository
            Object.assign(repo.github, repoData);
        }
    }

    if (countNestedDependents) {
        for (const dependent of tqdm(dependents, {desc: "Gathering nested dependents data"})) {
            dependent.dependentCount = (await asyncIteratorToArray(getNpmDependents(dependent.name, limit))).length;
        }
    }

    dependents = dependents.sort((a, b) => (a.github?.stargazerCount ?? 0) - (b.github?.stargazerCount ?? 0))

    return dependents
}

export async function downloadDep(dependent: Dependent) {
    // TODO: Check cache before. Also check system-wide npm/yarn caches?
    await downloadPackageTarball({
        url: dependent.tarballUrl,
        dir: getCacheDirectory()
    })
}

export async function* searchReferences(packageName: string, limit?: number, rootDirectory?: string): AsyncIterable<Reference> {
    if (!rootDirectory) {
        rootDirectory = getCacheDirectory();
    }
    if (!fs.existsSync(path.join(rootDirectory, 'package.json'))) {
        // Search recursively
        const depDirectories = (await fsPromises.readdir(rootDirectory, {withFileTypes: true})).filter(dirent => dirent.isDirectory)
        for (const depDirectory of tqdm(depDirectories, {desc: `Scanning dependents (${rootDirectory})...`})) {
            let i = 0;
            for await (const reference of searchReferences(packageName, undefined, path.join(rootDirectory, depDirectory.name))) {
                yield reference
                if (limit && i++ > limit) {
                    return
                }
            }
        }
        return;
    }

    // Search references in package directory
    const identifierPattern = /[\p{L}\p{Nl}$_][\p{L}\p{Nl}$\p{Mn}\p{Mc}\p{Nd}\p{Pc}]*/u
    const nonIdentifierCharacterPattern = /[^\p{L}\p{Nl}$\p{Mn}\p{Mc}\p{Nd}\p{Pc}]/
    const packageNameStringPattern = rex`
        (?<quote>['"])
        ${escapeRegexp(packageName)}
        \k<quote>
    /gm`
    const requirePattern = rex`
        (?<name> ${identifierPattern} ) \s*
        = \s*
        require \s* \( \s*
            ${packageNameStringPattern}
        \s* \)
    /gm`
    const importStarPattern = rex`
        import \s+
        \* \s+
        as \s*
        (?<name> ${identifierPattern} ) \s*
        from \s*
        ${packageNameStringPattern}
    /gm`
    const totalImportPatterns = [requirePattern, importStarPattern]

    const files = await glob('**{/!(dist)/,}!(*.min|dist).{js,ts}', {cwd: rootDirectory, nodir: true})
    for (const file of files) {
        const source = fs.readFileSync(path.join(rootDirectory, file)).toString()
        const declarations = Array.prototype.concat(...totalImportPatterns.map(pattern => Array.from(source.matchAll(pattern))))
        if (!declarations.length) continue

        const declarationNames = declarations.map(match => match!.groups!['name'])
        const lines: string[] = source.split('\n')
        const matches = <[number, RegExpMatchArray][]>lines.map(
            (line, lineNo) => [lineNo, line.match(rex`
                ^ .* ( ${
                    declarationNames.map(escapeRegexp).join('|')
                }) .* $`)
            ]).filter(([, match]) => match)
        for (const [lineNo, match] of matches) {
            yield <Reference>{
                dependent: <Dependent>{name: rootDirectory},
                file: file,
                lineNumber: lineNo,
                matchString: match[0]
            }
        }
    }
}

function getCacheDirectory() {
    return process.env.NPM_CACHE || 'cache';
}

async function* getNpmDependents(packageName: string, limit?: number) {
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
