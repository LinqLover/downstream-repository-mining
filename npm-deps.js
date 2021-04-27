import { GraphQLClient, gql } from 'graphql-request'
import npmDependants from 'npm-dependants'
import { RegistryClient } from 'package-metadata';
import tqdm from 'ntqdm'
import * as util from 'util'
import * as dotenv from 'dotenv'

async function main(rootName, limit = 20) {
	dotenv.config()
	
	const endpoint = 'https://api.github.com/graphql'

	const graphQLClient = new GraphQLClient(endpoint, {
		headers: {
			authorization: `Bearer ${process.env.GITHUB_OAUTH_TOKEN}`,
			accept: 'application/vnd.github.hawkgirl-preview+json'
		},
	})

	console.log("Collecting dependents ...")
	if (limit) {
		console.log(`Will only consider a probe of ${limit}`)
	}
	let dependents = [];
	for await (const dependent of npmDependants(rootName)) {
		dependents.push({name: dependent})
		if (dependents.length >= limit) break;
	}
	console.log(`Retrieved ${dependents.length} dependents`);
	
	console.log("Gathering metadata ...")
	for (const dependent of tqdm(dependents)) {
		const metadata = await RegistryClient.getMetadata(dependent.name, {fullMetadata: true})
		const url = metadata?.versions?.latest?.repository?.url
		const match = url?.match(/github\.com[\/:](?<owner>[^/]+)\/(?<name>[^\/]+?)(?:.git)?$/)
		if (!match) {
			console.log("Package has no GitHub link", {metadata, url})
			continue
		}
		dependent.github = {
			owner: match.groups.owner,
			name: match.groups.name
		}
	}
	
	console.log("Gathering GitHub data ...")
	for (const repo of tqdm(dependents)) {
		if (!repo.github) continue
		const repoData = (await getRepoData(graphQLClient, repo.github.owner, repo.github.name)).repository
		Object.assign(repo.github, repoData);
	}
	
	if (!limit) {
		console.log("Gathering nested dependents data ...")
		for (const dependent of tqdm(dependents)) {
			let nestedDependents = [];
			for await (const nestedDependent of npmDependants(dependent.name)) {
				nestedDependents.push(nestedDependent)
			}
			dependent.dependentCount = nestedDependents.length;
		}
	}
	
	console.log("Sorting ...")
	dependents = dependents.sort((a, b) => a.github?.stargazerCount ?? 0 > b.github?.stargazerCount ?? 0)
	
	console.log("Done.", "\n")
	console.log(util.inspect(dependents, {showHidden: false, depth: null}))
}

async function getRepoData(graphQLClient, owner, name) {
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

main('glob').catch(console.error)
