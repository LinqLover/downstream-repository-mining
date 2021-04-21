---
title: Software Mining of Downstream Dependency Repositories
subtitle: Exposé
author: Christoph Thiede
date: 2021-04-21
bibliography: exposé.bib
nocite: '@*'
---

# Introduction

Open Source software (OSS) solutions have become more and more and important during the last decades.
Especially, this trend has been experiencing an additional updraft due to the ongoing spreading of OSS platforms such as GitHub or GitLab.
Open-source development offers many advantages as opposed to traditional closed-source development, including large numbers of volunteer contributions from the open-source community, increased transparency effects in security-related domains, and a high potential for reusing solutions.
These solutions are usually organized as *packages* each of which tries to solve an isolated problem and provide a generic interface for the deliverables.
Most commonly, packages are developed in a *code repository* that is managed using a *development platform* (such a <span class="smallcaps">GitHub</span>, <span class="smallcaps">GitLab</span>, or <span class="smallcaps">Bitbucket</span>) and deployed using a *package manager* (such as <span class="smallcaps">PyPI</span> for Python, <span class="smallcaps">npm</span> for Node.js/JavaScript/TypeScript, or <span class="smallcaps">NuGet</span> for .NET languages).
Other solutions or packages then can *depend* on existing packages. These dependency relations form a large directed acyclic graph (DAG) that connects major parts of the software world for each popular programming language ecosystem.

Despite this connectedness by design, however, the development process of many packages is still characterized by an isolated approach:
While OSS developers use to submit tickets or contribute patches against *upstream repositories* that they depend on and consider the right place to solve their problems, the reverse direction of *downstream dependencies* is often neglected by package developers when they extend, restructure, or refactor their solutions.
This disregard can cause a wide range of alignment issues, including poorly suited interfaces, unidentified defects, and compatibility problems.
Eventually, all these issues impair the capabilities of the global OSS community to build and support flawless products.
In order to tackle these concerns, in this project, we will explore ideas and solutions to support package developers in surveying downstream dependencies of their projects.

# Goals

The primary goal is to build a tool that enables package developers to obtain an overview of as many downstream repositories as possible.
Necessary steps towards that goal consist of *mining* existing repositories to identify their dependency structure, *analyzing* them to extract fine-granular usage information about individual code identifiers, and *visualizing* the results to provide the developers explorable representations of the downstream usages.

Possible questions of package developers to be answered through the tool:

- How many dependencies does the repository of interest (ROI) have?
  What are these dependencies (provide permalinks)?
  How large/popular/active are there, how many grand-dependencies do they have?
- How many direct references do the single code identifiers (e.g., object-oriented entities, methods, etc.) in the ROI have in the downstream dependencies?
  How are these identifiers used (provide permalinks to the dependent lines)?
- How often are the ROI or its single code identifiers mentioned in the conversations of downstream repositories (e.g., issues, pull requests (PRs), GitHub Discussions)?
  What are the contents of these conversations (provide permalinks)?
- Which ROI identifiers are correlated to a change rate above average in the downstream repositories (scan commit diffs and commit messages)?
  What is the intent of these changes (provide permalinks)?
  How are they related to version updates of the ROI (slice commits based on the history of the dependency declaration files)?
- Which correlations exist between the success of CI jobs in downstream repositories and the behavior of the ROI?
  How often do single code identifiers appear in possible stack traces of downstream CI failures?
  What are the causes of these failures?
- How many indirect usages do the single code identifiers have in the downstream dependencies?
  How does a coverage heatmap for the logical forest graph of the ROI look like?

# Possible Challenges

- Are the rate limits for the GitHub API sufficient?
  If not, we would need to use an inofficial scraper or mirror instead.
- How slow or fast is fetching or mining large numbers of repositories?
  This could actually come into conflict with the schedule (see [schedule](#schedule)).
  It is thus important to start with a working baseline on production as early as possible.
  Other measures that could be taken include the prioritization of repositories based on their language or popularity.

# Schedule

The project will be run following an agile approach in close consultation with the supervisors.
This involves running in small iterations and a focus on an MVP (minimum viable product).
As soon as a minimum baseline for the first two goals (see [goals](#goals)) exists, we will identify further goals as the project evolves.
These goals can be based on the list from above but also other interesting subfields of the central vision.
The focus on mining vs. presenting data can be adjusted during the semester.
Nevertheless, some milestones will have to be met:

<table>
    <thead>
        <tr>
            <td>Deadline</td>
            <td>Milestone</td>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>2021-05-05</td>
            <td><strong>Baseline prototype</strong> ready for review</td>
        </tr>
        <tr>
            <td>2021-05-13</td>
            <td><strong>Baseline</strong> set up on production</td>
        </tr>
        <tr>
            <td>2021-06-09</td>
            <td><strong>Intermediary presentation slides</strong> ready for discussion</td>
        </tr>
        <tr>
            <td>2021-06-30</td>
            <td><strong>Satisfying extent of features</strong> on production</td>
        </tr>
        <tr>
            <td>2021-07-07</td>
            <td><strong>Paper concept</strong> ready for review</td>
        </tr>
        <tr>
            <td>2021-07-21</td>
            <td>Preliminary version of <strong>paper</strong> exists</td>
        </tr>
        <tr>
            <td>2021-09-01</td>
            <td>Summer holidays enjoyed 😎</td>
        </tr>
        <tr>
            <td>2021-09-08</td>
            <td><strong>Paper candidate</strong> ready for discussion</td>
        </tr>
        <tr>
            <td>2021-09-08</td>
            <td>Final <strong>presentation slides</strong> ready for discussion</td>
        </tr>
        <tr>
            <td>2021-09-15</td>
            <td><strong>Final presentation</strong> completed</td>
        </tr>
        <tr>
            <td>2021-09-29</td>
            <td><strong>Final paper</strong> submitted</td>
        </tr>
        <tr>
            <td>2021-09-29</td>
            <td><strong>Final code base</strong> submitted</td>
        </tr>
    </tbody>
</table>

# Resources

## Data sources of possible interest

- **Repositories:** GitHub (far more popular than competitors such as GitLab or BitBucket, best tool support)
- **Programming languages:** Python, JavaScript/TypeScript, maybe Java, .NET languages (also quite popular).
  While Python and JavaScript appear to be the most popular languages on GitHub [@githut], they are dynamically typed which could possibly impede the lookup of identifiers.
  On the other hand, Java, .NET, or TypeScript are not popular to the same extent (but still noticeably popular [@modct]), but could be easier to analyze in this regard.
- **Repository dependencies:**
    - **Dependency declaration files** for **package managers,** depending on the selection of programming languages: PyPI (`requirements.txt`), npm (`packages.json`), Maven Central Repository (`pom.xml`), NuGet (`*.csproj`)
    - GitHub dependency graph

## Tools, libraries, APIs, and data sources

- Repository Mining:
    - GitHub: GitHub REST/GraphQL API (e.g., `Repository`, `Commit`, `DependencyGraphDependency`) [@githubrest; @githubgql]
    - GitHub mirror: GHTorrent [@Gousi13]
    - git; GitPython/gittle/PyGit/Dulwich
- References analysis:
    - Tree-sitter [@tree-sitter]
    - manual type analysis for dynamically-typed languages if necessary: pytype; TAJS, Flow, dts-gen, dtsmake
- Pipeline analysis:
    - nektos/act [@nektos/act]
- Visualization of results:
    - Jupyter Notebook (for prototypes)
    - VS Code API (e.g., `CallHierarchyProvider`) [@vscodeapi]

## Literature

<!-- See exposé.bib -->


<!---

# Questions

- paper before holidays?
- what‘s the role of literature? (how many references?)
- do we need to *do* actual analysis as part of the paper?
-->
