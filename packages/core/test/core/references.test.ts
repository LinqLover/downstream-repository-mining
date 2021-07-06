import asyncIteratorToArray from 'it-all'
import _ from 'lodash'
import { jsonc as json } from 'jsonc'

import Package from '../../src/core/package'
import { ReferenceSearcher, ReferenceKind } from '../../src/core/references'
import ifCurtailed from '../../src/utils/if-curtailed'
import { lodashClassifyNested } from '../../src/utils/lodash-classify'
import { getCwd } from '../_utils/cwd'
import { printDiff } from '../_utils/printDiff'


const CWD = getCwd(__filename)

type PackageReferences = {
    [kind: string]: {
        [memberName: string]: {
            [dependent: string]: {
                [fileName: string]: number[]
            }
        }
    }
}
type References = {
    [packageName: string]: PackageReferences
}

const expectedHeuristicReferences = <References>json.readSync(`${CWD}/expectedReferences-heuristic.jsonc`)
const expectedTypeReferences = <References>json.readSync(`${CWD}/expectedReferences-types.jsonc`)


describe('ReferenceSearcher', () => {
    it.each(_.flatMap(
        Object.entries({'heuristic': expectedHeuristicReferences, 'types': expectedTypeReferences}),
        ([packageReferenceSearcher, allExpectedReferences]) => _.map(
            Object.entries(allExpectedReferences),
            ([packageName, expectedReferences]) => ({ packageReferenceSearcher, packageName, expectedReferences }))
    ))("should find relevant references for %s", async (
        { packageReferenceSearcher, packageName, expectedReferences }) => {
        const _package = new Package({
            name: packageName,
            directory: `${CWD}/examples/packages/${packageName}`
        })
        const searcher = new ReferenceSearcher(_package, `${CWD}/examples/dependents`, packageReferenceSearcher)
        const references = await asyncIteratorToArray(searcher.searchReferences(undefined, '*'))

        /** Since null and undefined are invalid keys in JS objects, we stringify them for compatibility with lodash. See Reference.memberName. */
        function stringify(key: string | null | undefined) {
            if (key === undefined) return '<undefined>'
            if (key === null) return '<null>'
            return key
        }
        const aggregatedReferences = <PackageReferences>_.chain(references)
            .groupBy(reference => reference.kind)
            .mapValues(categorizedReferences => _.chain(categorizedReferences)
                .groupBy(reference => stringify(reference.memberName))
                .mapValues(memberReferences => _.chain(memberReferences)
                    .groupBy(reference => reference.dependentName)
                    .mapValues(dependentReferences => _.chain(dependentReferences)
                        .groupBy(reference => reference.file)
                        .mapValues(fileReferences => _.map(
                            fileReferences, reference => reference.position.row))
                        .value())
                    .value())
                .value())
            .value()

        // Classify actual-expected data by whether we want to do make exact assertions or not
        const isExactExpectation = (kind: ReferenceKind) => packageReferenceSearcher != 'heuristic' && kind != 'occurence'
        const allExpectations = lodashClassifyNested(
            {
                actual: aggregatedReferences,
                expected: expectedReferences
            },
            kind => isExactExpectation(<ReferenceKind>kind)
        )

        ;[true, false].forEach(isExactExpectation => {
            const { actual, expected } = _.mapValues(allExpectations, expectations => expectations.get(isExactExpectation) ?? {})
            if (isExactExpectation) {
                return expect(actual).toEqual(expected)
            }

            // Mode: Ignore false positives
            const containingExpected = expect.objectContaining(
                _.mapValues(expected, categorizedReferences => expect.objectContaining(
                    _.mapValues(categorizedReferences, dependentReferences => expect.objectContaining(
                        _.mapValues(dependentReferences, memberReferences => expect.objectContaining(
                            _.mapValues(memberReferences, lineNumbers => expect.arrayContaining(lineNumbers))
                        ))
                    ))
                )))
            ifCurtailed(
                () => expect(actual).toEqual(containingExpected),
                () => printDiff(actual, containingExpected, packageReferenceSearcher, packageName))
        })
    })
})
