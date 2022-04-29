# Software Mining of Downstream Dependency Repositories

[![GitHub CI](https://img.shields.io/github/checks-status/LinqLover/downstream-repository-mining/master)](https://github.com/LinqLover/downstream-repository-mining/actions)
[![Codacy](https://app.codacy.com/project/badge/Grade/e4c01a65b11c4098b206122915bbaedb)](https://www.codacy.com/gh/LinqLover/downstream-repository-mining/dashboard?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=LinqLover/downstream-repository-mining&amp;utm_campaign=Badge_Grade)
[![CodeFactor](https://www.codefactor.io/repository/github/linqlover/downstream-repository-mining/badge)](https://www.codefactor.io/repository/github/linqlover/downstream-repository-mining)
[![Citation info](https://img.shields.io/badge/-citation-blue)](#citation)

Mine usage information about your JavaScript/TypeScript package from dependent repositories.

For more information, read our [scientific paper](./docs/paper).

## Repository Structure

- **[`packages/core/`](./packages/core):** Contains the core logic
- **[`packages/cli/`](./packages/cli):** Provides a simple command-line interface
- **[`packages/vscode-extension/`](./packages/vscode-extension):** IDE integration that presents the data to the user
- **[`docs/`](./docs):** Documents examining the scientific background of this project
- **[`./`](./) (this folder):** Holds everything together, contains [CI](./github) and other configuration files

## Installation and Usage

Prerequisites (see [Dockerfile](./.gitpod.Dockerfile)):

- node v16
- npm
- for the IDE integration: Visual Studio Code (tested with v1.61.0 on Windows/Linux) or Gitpod Code (tested with v1.61.0)

Installation and usage structures can be found in the `README.md`s of the relevant packages.
If you have any trouble reproducing the instructions, please try it out on our reference configuration using Gitpod:

[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/#https://github.com/LinqLover/downstream-repository-mining)

### Express guide

First of all:

```bash
$ npm run install-all
```

- To run the VS Code extension:

  ```bash
  $ code packages/vscode-extension
  ```

  Then head to the debugging activity bar (<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd>) and launch the target `Run Extension`.

  See [usage](./packages/vscode-extension/README.md#usage) for the complete documentation of the extension.

- To use the CLI:

  ```bash
  $ cd packages/cli
  $ npm link
  $ dowdep-cli help
  ```

  Read the [readme](./packages/cli/README.md) for the complete documentation of the CLI.

Don't forget to specify the access tokens for the data sources as described in the relevant package documentation.

## Citation

- To cite **this repository,** press the <kbd>Cite</kbd> button in the About section of the repository:

  [![https://doi.org/10.5281/zenodo.6338060](https://img.shields.io/badge/doi-10.5281%2Fzenodo.6338060-blue)](https://doi.org/10.5281/zenodo.6338060)

  > Thiede, C. (2022). LinqLover/downstream-repository-mining: Submission (17th International Conference on Evaluation of Novel Approaches to Software Engineering) (submission-enase17) [Computer software]. Zenodo. <https://doi.org/10.5281/ZENODO.6338060>

  <details>
    <summary>BibTeX citation file (repository)</summary>
    <pre lang="bib"><code>@software{dowdep2022,
  	author = {Thiede, Christoph and Scheibel, Willy and Limberger, Daniel and Döllner, Jürgen},
  	doi = {10.5281/zenodo.6338060},
  	month = {3},
  	title = {{dowdep: Software Mining of Downstream Dependency Repositories}},
  	version = {submission-enase17},
  	year = {2022}
  }</code></pre>
  </details>

- To cite **the [scientific paper](docs/paper),** please use this citation:

  [![https://doi.org/10.5220/0011093700003176](https://img.shields.io/badge/doi-10.5220%2F0011093700003176-blue)](https://doi.org/10.5220/0011093700003176)

  > Thiede, C., Scheibel, W., Limberger, D., & Döllner, J. (2022). Augmenting Library Development by Mining Usage Data from Downstream Dependencies. In *Proceedings of the 17th International Conference on Evaluation of Novel Approaches to Software Engineering*. 17th International Conference on Evaluation of Novel Approaches to Software Engineering. SCITEPRESS - Science and Technology Publications. <https://doi.org/10.5220/0011093700003176>

  <details>
    <summary>BibTeX citation file (paper)</summary>

    <pre lang="bib"><code>@conference{dowdep22paper,
  	author={Christoph Thiede and Willy Scheibel. and Daniel Limberger. and Jürgen Döllner.},
  	title={Augmenting Library Development by Mining Usage Data from Downstream Dependencies},
  	booktitle={Proceedings of the 17th International Conference on Evaluation of Novel Approaches to Software Engineering - ENASE,},
  	year={2022},
  	pages={221-232},
  	publisher={SciTePress},
  	organization={INSTICC},
  	doi={10.5220/0011093700003176},
  	isbn={978-989-758-568-5},
  }</code></pre>
  </details>

## Acknowledgements

This is currently a student project for the course "Software Mining and Applications" offered by the Computer Graphics System Group ([@hpicgs](https://github.com/hpicgs)/[@varg-dev](https://github.com/varg-dev)) at the Hasso Plattner Institute (HPI), Potsdam, Germany.
Thanks to my supervisors, Daniel Limberger ([@cgcostume](https://github.com/cgcostume)) and Willy Scheibel ([@scheibel](https://github.com/scheibel))!
For further information, see [ACKNOWLEDGEMENTS.md](./ACKNOWLEDGEMENTS.md).
