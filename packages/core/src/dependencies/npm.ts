import downloadPackageTarball from 'download-package-tarball'
import npmDependants from 'npm-dependants'
import { RegistryClient } from 'package-metadata'
import psl from 'psl'

import { Dependency, DependencySearcher, DependencyUpdateCallback, DependencyUpdateOptions } from './base'
import { Dowdep } from '../dowdep'
import { Package } from '../packages'
import isDefined from '../utils/isDefined'
import { OnlyData } from '../utils/OnlyData'
import { URL } from 'url'


/** A downstream dependency of a {@link Package} that was retrieved from npm. */
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

    /** Download the source code of this dependency from the npm registry. */
    async updateSource(dowdep: Dowdep) {
        if (!this.tarballUrl) {
            return false
        }

        const cacheDirectory = dowdep.sourceCacheDirectory
        this.sourceDirectory = dowdep.fileSystem.join(cacheDirectory, this.name)
        if (await this.isSourceCodeReady(dowdep)) {
            return true
        }

        // TODO: Check system-wide npm/yarn caches?
        // TODO: Use dowdep.fileSystem!
        await downloadPackageTarball({
            url: this.tarballUrl,
            dir: cacheDirectory
        })
        return true
    }

    /** Fetch metadata about this dependency from the npm registry. */
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

        if (latestVersion.repository?.url) {
            try {
                const url = new URL(latestVersion.repository.url)
                const domain = psl.parse(url.hostname)
                if (!domain.error) {
                    this.pluggableUrls.set(domain.sld, url.href)
                }
            } catch (error) {
                console.warn("Invalid URL", latestVersion.repository.url)
            }
        }

        this.description = latestVersion.description
    }
}

/** Finds downstream dependencies for a package in the npm ecosystem. */
export class NpmDependencySearcher extends DependencySearcher {
    constructor($package: Package, init: Partial<OnlyData<NpmDependencySearcher>>) {
        super($package, init)
        Object.assign(this, init)
    }

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
