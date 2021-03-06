---
title: Software Mining of Downstream Dependency Repositories
subtitle: Exposé
author: Christoph Thiede
date: 2021-04-21
bibliography: exposé.bib
nocite: '@*'
classoption: twocolumn
---

# Introduction

Open Source software (OSS) solutions have become more and more and important during the last decades.
Especially, this trend has been experiencing an additional updraft due to the ongoing spreading of OSS platforms such as GitHub or GitLab.
Open-source development offers many advantages as opposed to traditional closed-source development, including large numbers of volunteer contributions from the open-source community, increased transparency effects in security-related domains, and a high potential for reusing solutions.
These solutions are usually organized as *packages* each of which tries to solve an isolated problem and provide a generic interface for the deliverables.
Most commonly, packages are developed in a *code repository* that is managed using a *development platform* (such a [GitHub]{.smallcaps}, [GitLab]{.smallcaps}, or [Bitbucket]{.smallcaps}) and deployed using a *package manager* (such as [PyPI]{.smallcaps} for Python, [npm]{.smallcaps} for Node.js/JavaScript/TypeScript, or [NuGet]{.smallcaps} for .NET languages).
Other solutions or packages then can *depend* on existing packages.
These dependency relations form a large directed graph that connects major parts of the software world for each popular programming language ecosystem.

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
  What versions of the ROI do the dependencies reference?
- How many direct references do the single code identifiers (e.g., object-oriented entities, methods, etc.) in the ROI have in the downstream dependencies?
  How are these identifiers used (provide permalinks to the dependent lines), what arguments are specified?
  Which users of the identifiers stand out from the majority of the users and how?
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
Also, the setup of an automated pipeline that periodically fills a database is an optional task that will be chosen later if need be.
For the MVP, a small tool that can be run locally using the simplest possible (non-graphical) interface will be an adequate solution.
To assess the baseline prototype, a small sample of packages will be identified that are written in JavaScript or Python, consist of a manageable interface, and are at least moderately spread.

Despite the agile approach of the project, some milestones will have to be met.
These are listed in +@tbl:schedule.

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
            <td><strong>Related work</strong> assessed</td>
        </tr>
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

Table: Preliminary schedule {#tbl:schedule}

# Resources

## Data sources of possible interest

- **Repositories:** GitHub (far more popular than competitors such as GitLab or BitBucket, best tool support)
- **Programming languages:** Python, JavaScript/TypeScript, maybe Java, .NET languages (also quite popular).
  While Python and JavaScript appear to be the most popular languages on GitHub [@githut], they are dynamically typed which could possibly impede the lookup of identifiers.
  On the other hand, Java, .NET, or TypeScript are not popular to the same extent (but still noticeably popular, @modct), but could be easier to analyze in this regard.
- **Repository dependencies:**
    - **Dependency declaration files** for **package managers,** depending on the selection of programming languages: PyPI (`requirements.txt`), npm (`packages.json`), Maven Central Repository (`pom.xml`), NuGet (`*.csproj`)
    - GitHub dependency graph

## Tools, libraries, APIs, and data sources

- Repository Mining:
    - GitHub: GitHub REST/GraphQL API (e.g., `Repository`, `Commit`, `DependencyGraphDependency`) [@githubrest; @githubgql]
    - GitHub mirror: GHTorrent [@gousi13]
    - git; GitPython/gittle/PyGit/Dulwich
- References analysis:
    - Tree-sitter [@tree-sitter]
    - manual type analysis for dynamically-typed languages if necessary: pytype; TAJS, Flow, dts-gen, dtsmake
- Pipeline analysis:
    - nektos/act [@nektos/act]
- Visualization of results:
    - Jupyter Notebook (for prototypes)
    - VS Code API (e.g., `CallHierarchyProvider`) [@vscodeapi]

## Related Work

While Software Mining, in general, is a quite young field, numerous results have been produced in the recent past:

Mining Software Repositories (MSR)

:   For an introduction into the field of MSR, @chaturvedi13 provide a broad overview of existing achievements and ongoing research topics.
    Inter alia, they show various data sources worthwhile to examine -- such as source code repositories, version control systems, integrated development environments, issue trackers, or discussion platforms -- and different directions for evaluating the retrieved data -- such as classifying or ranking repositories, analyzing the evolution of projects, studying development communities, or inspecting the relationships and dependencies between projects.
    @hassan08 elaborates further on present challenges such as the need to improve the quality of data mined, to cope with the complexity of extraction tasks, or to develop analysis approaches that scale for large datasets.
    Focusing on implementational tasks in greater detail, @jung12 compare current techniques for retrieving, extracting, and evaluating software repository data.
    They also discuss possible data structures of the retrieved data and explain different methods for data processing.

    In recent years, *GitHub* has gained outstanding importance for many OSS developers as a platform for managing all source code changes, development discussions, and also continuous integration (CI) tasks in one place.
    While GitHub provides a set of comprehensive APIs for retrieving most of their data [@githubrest; @githubgql], they impose freemium rate limitations to these interfaces which could bar the way to mining repositories in medium or large scale research contexts.
    For this and other reasons, such as historic or performance-related constraints of the APIs, @gousi13 introduces the [GHTorrent]{.smallcaps} dataset which aims to mirror all public GitHub repositories and associated data.
    To facilitate custom analysis tasks, GHTorrent also provides a flexible query interface for fetching relevant slices of the entire database [@gousi14].
    @mattis20 build upon this dataset to create an infrastructure that allows researchers to run evaluations against many GitHub repositories.

Software Cartography

:   To instruct the package manager of their choice about upstream dependencies of a software package, developers usually add a *dependency declaration file* into their repository (for instance, a file named `requirements.txt` for projects that use PyPI, `packages.json` for npm projects, `pom.xml` for Maven projects, or `*.csproj` for NuGet projects).
    A naive approach to identify all relationships and dependencies between a set of repositories would be to scan each repository for such declarations.
    Nevertheless, GitHub has already done this and provides their results as the *GitHub Dependency Graph* via their APIs mentioned above.
    A similar task is done by the [Libraries.io]{.smallcaps} service which sources its data from the package managers themselves, so they won't include leaf nodes from the dependency graph (i.e., repositories that do not provide an own package for further reuse, @librariesio).
    @kikas17 describe their methodology on determining and evaluating these dependencies by exploring characteristics and patterns of the global dependency graph for the JavaScript, Ruby, and Rust ecosystems.

API Usage

:   In order to give package developers detailed information on how downstream dependencies adopt their interfaces, methods are required to extract and aggregate generic usage information.
    To fulfill this need, @zhong09 propose the framework [MAPO]{.smallcaps} for mining frequent API usage patterns and even recommending them to API users.
    In particular, they describe their findings with regard to identifying and parsing API usage snippets, classifying them using clustering techniques, and recognizing patterns of API usage based on recurring co-locations of the caller snippets.
    @saied15 enhance this approach by extracting multi-level API usage patterns that, next to the frequency of usage sequences, also take into account the consistency of these co-usages, surpassing the quality of relationships described by MAPO.
    @amann19 go one step further by mining entire API usage graphs in their solution called [MuDetect]{.smallcaps} and then scanning a repository for deviations from the developed usage patterns to detect possible misuses of the API.

    That idea opens the door towards new applications of API usage mining that aim to predict defects in users of an API.
    @uddin12 combine this information with temporal properties of these usage patterns which they gain from the change history of the viewed repositories.
    By doing so, they are able to identify recurring development patterns concerning the usage of specific APIs.
    @osman14 focus on the correction of bug fixes while scanning the change history of a repository and evaluate the changes of relevant commits that aim to fix a bug.

Call Graphs

:   While the methods discussed above are promising about evaluating the general usage of APIs, finer-grained information can be helpful to identify additional circumstances of the usage occurrences, for instance, the type of passed method arguments or the invocation context for members of an API that acts as a framework through inversion of control.
    This kind of information can be gained from *call graphs* that are either *static* (i.e., derived from the source code without example) or *dynamic* (i.e., mapping a trace of the program execution during runtime).
    While the latter kind has greater potential for including a maximum of contextual information, the former has the advantage of being applicable to a larger probe of source code for that no actual execution instructions are available.
    There are many solutions for analyzing the structure of programs and extracting the relevant information for building call graphs:

    [srcML]{.smallcaps} is a "lightweight, highly scalable, robust, \[and\] multi-language" infrastructure that is aimed to create a unified representation of source code probes for arbitrary analysis purposes, including the construction of call graphs [@collard13].
    For its code-navigation feature in the browser, GitHub utilizes a general-purpose parsing tool called [tree-sitter]{.smallcaps} [@tree-sitter].
    Another solution is proposed by @bogar18 which focuses on unifying the analysis of multilingual codebases and utilizes an island parser to build call graphs.
    Besides, a number of language-specific call graph generators exist, such as [Code2graph]{.smallcaps} [@gharibi18], [PyCG]{.smallcaps} [@salis21], or [pyan]{.smallcaps}^[<https://pypi.org/project/pyan3>] for Python or several solutions for JavaScript [@antal18].

Ecosystem Call Graphs

:   To bring together dependency graphs and call graphs (see above), call graphs can be applied to entire ecosystems, crossing repository boundaries.
    @hejderup18 propose an approach to do so for the JavaScript/npm ecosystem.
    @wang20 describe a similar approach for the same ecosystem and apply it to the domain of security issues located in upstream dependencies.
    With [Präzi]{.smallcaps}, @hejderup21 also describe their implementation of a dependency-scale call graph for the Rust/Cratesio ecosystem in-depth.
    For Java/Maven, @keshani21 proposes another solution.

Mining CI build logs

:   To adapt continuous integration build logs as another data source for MSR, CI providers such as Travis CI, Jenkins, or GitHub Actions can be used.
    For a long time, the former played a central role, and it is even used to construct a dataset for research purposes, [TravisTorrent]{.smallcaps} by @beller17.
    @tomassi19 build a tool, [BugSwarm]{.smallcaps}, that aims to extract single fail-pass pairs of CI builds from Python and Java packages.
    @silva19 touches upon the reasons for failing test builds by identifying patterns for common bugs and their resolution strategies and even proposes an approach to recommend automatic bug fixes to the repository owners.

## Literature

<!-- See exposé.bib -->

