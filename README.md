# Software Mining of Downstream Dependency Repositories

[![GitHub CI](https://img.shields.io/github/checks-status/LinqLover/downstream-repository-mining/master)](https://github.com/LinqLover/downstream-repository-mining/actions/workflows/test.yml)
[![Codacy](https://app.codacy.com/project/badge/Grade/e4c01a65b11c4098b206122915bbaedb)](https://www.codacy.com/gh/LinqLover/downstream-repository-mining/dashboard?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=LinqLover/downstream-repository-mining&amp;utm_campaign=Badge_Grade)
[![CodeFactor](https://www.codefactor.io/repository/github/linqlover/downstream-repository-mining/badge)](https://www.codefactor.io/repository/github/linqlover/downstream-repository-mining)

Mine usage information about your JavaScript/TypeScript package from dependent repositories.

For more information, read the [exposé](./docs/exposé.md):  
[![Exposé](https://github.com/LinqLover/downstream-repository-mining/actions/workflows/expos%C3%A9.yml/badge.svg?branch=master)](https://github.com/LinqLover/downstream-repository-mining/actions/workflows/exposé.yml?query=branch%3Amaster)

## Repository Structure

- **[`packages/core/`](./packages/core):** Contains the core logic
- **[`packages/cli/`](./packages/cli):** Provides a simple command-line interface
- **[`docs/`](./docs):** Documents examining the scientific background of this project
- **[`./`](./) (this folder):** Holds everything together, contains [CI](./github) and [`eslint`](./.eslintrc) definitions

## Acknowledgements

This is currently a student project for the course "Software Mining and Applications" offered by the Computer Graphics System Group ([@hpicgs](https://github.com/hpicgs)/[@varg-dev](https://github.com/varg-dev)) at the Hasso Plattner Institute (HPI), Potsdam, Germany.
Thanks to my supervisors, Daniel Limberger ([@cgcostume](https://github.com/cgcostume)) and Willy Scheibel ([@scheibel](https://github.com/scheibel))!
For further information, see [ACKNOWLEDGEMENTS.md](./ACKNOWLEDGEMENTS.md).
