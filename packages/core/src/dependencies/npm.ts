import downloadPackageTarball from 'download-package-tarball'
import npmDependants from 'npm-dependants'
import { RegistryClient } from 'package-metadata'

import { Dependency, DependencySearcher, DependencyUpdateCallback, DependencyUpdateOptions } from '../dependencies'
import { Dowdep } from '../dowdep'
import { Package } from '../packages'
import isDefined from '../utils/isDefined'
import { OnlyData } from '../utils/OnlyData'


export class NpmDependency extends Dependency {
    tarballUrl?: string

    get urls() {
        const urls = new Map<string, string>()
        urls.set("npm", this.npmUrl)
        super.urls.forEach((url, label) => urls.set(label, url))
        return urls
    }

    get npmUrl() {
        return `https://www.npmjs.com/package/${this.name}`
    }

    async update(dowdep: Dowdep, options: Partial<DependencyUpdateOptions> = {}, updateCallback?: DependencyUpdateCallback) {
        await this.updateFromRegistry()
        await updateCallback?.(this, 'registry')

        await super.update(dowdep, options, updateCallback)
    }

    async isSourceCodeReady(dowdep: Dowdep) {
        return isDefined(this.sourceDirectory) && await dowdep.fileSystem.exists(this.sourceDirectory)
    }

    async updateSource(dowdep: Dowdep) {
        if (!this.tarballUrl) {
            return false
        }

        const cacheDirectory = dowdep.sourceCacheDirectory
        this.sourceDirectory = dowdep.fileSystem.join(cacheDirectory, this.name)
        if (await this.isSourceCodeReady(dowdep)) {
            return true // TODO: What to return here?
        }

        // TODO: Check system-wide npm/yarn caches?
        // TODO: Use dowdep.fileSystem! How???
        await downloadPackageTarball({
            url: this.tarballUrl,
            dir: cacheDirectory
        })
        return true
    }

    async updateFromRegistry() {
        const metadata = await RegistryClient.getMetadata(this.name, { fullMetadata: true })
        const latestVersion = metadata.versions?.latest
        if (!latestVersion) {
            console.warn("Package has no metadata", { metadata })
            return
        }

        this.tarballUrl = latestVersion.dist?.tarball
        if (!this.tarballUrl) {
            console.warn("Package has no tarball", { metadata })
            return
        }

        this.repositoryUrl = latestVersion.repository?.url

        this.description = latestVersion.description
    }
}

export class NpmDependencySearcher extends DependencySearcher {
    constructor($package: Package, init: Partial<OnlyData<NpmDependencySearcher>>) {
        super($package)
        Object.assign(this, init)
    }

    limit?: number = undefined
    countNestedDependents = true
    downloadGitHubData = true

    async *search() {
        for await (const name of this.getNpmDependents(this.$package.name, this.limit)) {
            yield this.createDependency(name)
        }
    }

    createDependency(name: string) {
        return new NpmDependency(name, this.$package)
    }

    async* getNpmDependents(packageName: string, limit?: number) {
        let count = 0
        if (isDefined(limit) && limit <= 0) {
            return
        }
        for await (const dependent of npmDependants(packageName)) {
            yield dependent
            if (isDefined(limit) && ++count >= limit) break
        }
    }
}
