import asyncIteratorToArray from 'it-all'
import _ from 'lodash'
import { jsonc as json } from 'jsonc'

import { Package } from '../src/packages'
import { ReferenceSearcher, ReferenceKind } from '../src/references'
import ifCurtailed from '../src/utils/if-curtailed'
import { lodashClassifyNested } from '../src/utils/lodash-classify'
import { getSourceDirectory } from './_utils/sourceDirectory'
import { printDiff } from './_utils/printDiff'


const SOURCE_DIRECTORY = getSourceDirectory(__filename)

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

const expectedHeuristicReferences = <References>json.readSync(`${SOURCE_DIRECTORY}/expectedReferences-heuristic.jsonc`)
const expectedTypeReferences = <References>json.readSync(`${SOURCE_DIRECTORY}/expectedReferences-types.jsonc`)


describe('ReferenceSearcher', () => {
    it.each(_.flatMap(
        Object.entries({'heuristic': expectedHeuristicReferences, 'types': expectedTypeReferences}),
        ([packageReferenceSearcher, allExpectedReferences]) => _.map(
            Object.entries(allExpectedReferences),
            ([packageName, expectedReferences]) => ({ packageReferenceSearcher, packageName, expectedReferences }))
    ))("should find relevant references for %s", async (
        { packageReferenceSearcher, packageName, expectedReferences }) => {
        const $package = new Package(
            packageName,
            `${SOURCE_DIRECTORY}/examples/packages/${packageName}`
        )
        const searcher = new ReferenceSearcher($package, `${SOURCE_DIRECTORY}/examples/dependents`, packageReferenceSearcher)
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
                .groupBy(reference => stringify(reference.declarationMemberName))
                .mapValues(memberReferences => _.chain(memberReferences)
                    .groupBy(reference => reference.dependency.name)
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
