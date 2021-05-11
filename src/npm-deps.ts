import dotenv from 'dotenv'
import downloadPackageTarball from 'download-package-tarball';
import escapeRegexp from './utils/escape-string-regexp' // WORKAROUND! Importing escape-string-regexp leads to ERR_REQUIRE_ESM
import fs from 'fs'
import { promises as fsPromises, Dirent } from "fs"
import glob from 'glob-promise'
import { GraphQLClient, gql } from 'graphql-request'
import asyncIteratorToArray from 'it-all'
import _ from 'lodash'
import npmDependants from 'npm-dependants'
import tqdm from 'ntqdm'
import { RegistryClient } from 'package-metadata'
import path from 'path'

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
    // undefined: is default import
    // null: imports root
    // TODO: Primitive obsession! Model ExportMember class hierarchy.
    public memberName?: string | null
    public alias!: string

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

export async function* searchReferences(packageName: string, rootDirectory?: string, limit?: number): AsyncIterable<Reference> {
    yield* basicSearchReferences(packageName, rootDirectory ?? getCacheDirectory(), limit, 0)
}

async function* basicSearchReferences(packageName: string, rootDirectory: string, limit: number | undefined, depth: number): AsyncIterable<Reference> {
    if (!fs.existsSync(path.join(rootDirectory, 'package.json'))) {
        // Search recursively
        let depDirectories: Iterable<Dirent> = (
            await fsPromises.readdir(rootDirectory, {withFileTypes: true})
        ).filter(dirent => dirent.isDirectory)

        if (!(depth > 3)) {
            depDirectories = tqdm(depDirectories, {desc: `Scanning dependents (${rootDirectory})...`})
        }

        let i = 0
        for await (const depDirectory of depDirectories) {
            for await (const reference of basicSearchReferences(packageName, path.join(rootDirectory, depDirectory.name), undefined, depth + 1)) {
                yield reference
                if (limit && ++i > limit) {
                    return
                }
            }
        }
        return;
    }

    const dependencyName = path.basename(rootDirectory)
    let files: Iterable<string> = await glob('**{/!(dist)/,}!(*.min|dist).{js,ts}', {cwd: rootDirectory, nodir: true})
    if (!(depth > 3)) {
        files = tqdm(files, {desc: `Scanning dependents (${dependencyName})...`})
    }
    for (const file of files) {
        yield* searchReferencesInFile(packageName, dependencyName, rootDirectory, file)
    }
}

async function* searchReferencesInFile(packageName: string, dependencyName: string, rootDirectory: string, file: string) {
    const filePath = path.join(rootDirectory, file)
    const fileSize = (await fsPromises.stat(filePath)).size
    if (fileSize > 100_000 /*100 MB*/) {
        console.warn(`Skipping very large file '${filePath}'`)
        return
    }
    const source = fs.readFileSync(filePath).toString()
    // TODO: Convert into class (ReferenceSearch(er)) and initialize regexpes only once?

    // Let's build a regex family!
    // TODO: Support sophisticated import syntax such as:
    //  * `import foo0, { baz1, baz2 as foo2 }, * as foo3 from bar`
    //  * `import 'bar'` (side effects only)
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import
    // See also: parse-imports; babel; flow; hegel
    // Maybe check opportunities of a type analyzer before investing time into that.
    const identifierPattern = /[\p{L}\p{Nl}$_][\p{L}\p{Nl}$\p{Mn}\p{Mc}\p{Nd}\p{Pc}]*/u
    const nonIdentifierCharacterPattern = /[^\p{L}\p{Nl}$\p{Mn}\p{Mc}\p{Nd}\p{Pc}]/
    const packageNameStringPattern = rex`
        (?<quote>['"])
        (?<packageName> ${escapeRegexp(packageName)} )
        \k<quote>
    /gm`
    // `foo = require('bar')`
    // `foo = require('bar/baz')`
    // https://nodejs.org/api/modules.html#modules_require_id
    const requirePattern = rex`
        (?<alias> ${identifierPattern} ) \s*
        = \s*
        require \s* \( \s*
            (?<quote>['"])
            (?<packageName> ${escapeRegexp(packageName)} )
            (
                \/ (?<memberName> ${identifierPattern} )
            )?
            \k<quote>
        \s* \)
    /gm`
    // `import * as foo from 'bar'`
    const importStarPattern = rex`
        import \s+
        \* \s+
        as \s*
        (?<alias> ${identifierPattern} ) \s*
        from \s*
        ${packageNameStringPattern}
    /gm`
    const totalImportPatterns = [requirePattern, importStarPattern]

    const declarations = _.chain(totalImportPatterns)
        .flatMap(pattern => [...source.matchAll(pattern) ?? []])
        .map(match => ({
            moduleName: match.groups!.packageName,
            memberName: match.groups!.memberName ?? undefined /* require('foo') may either be default or root import, but is only equivalent to default import variant of ES6 */,
            alias: match.groups!.alias
        }))
        .value()
    if (!declarations.length) {
        return
    }

    const lines = source.split('\n')
    for (const [lineNo, line] of lines.entries()) {
        for (const declaration of declarations) {
            if (!line.includes(declaration.alias)) continue
            yield <Reference>{
                dependent: <Dependent>{name: dependencyName},
                file: file,
                lineNumber: lineNo + 1,
                memberName: declaration.memberName,
                alias: declaration.alias,
                matchString: line
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
