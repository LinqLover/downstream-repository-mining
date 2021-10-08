import itAll from 'it-all'
import _ from 'lodash'
import { jsonc as json } from 'jsonc'

import { Package } from '../src/packages'
import { ReferenceCollector, ReferenceKind, ReferenceSearchStrategy } from '../src/references'
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
        ([strategy, allExpectedReferences]) => _.map(
            Object.entries(allExpectedReferences),
            ([packageName, expectedReferences]) => ({ strategy: <ReferenceSearchStrategy>strategy, packageName, expectedReferences }))
    ))("should find relevant references for %s", async (
        { strategy, packageName, expectedReferences }) => {
        const $package = new Package(
            packageName,
            `${SOURCE_DIRECTORY}/examples/packages/${packageName}`
        )
        const collector = new ReferenceCollector($package, `${SOURCE_DIRECTORY}/examples/dependents`, strategy)
        const references = await itAll(collector.searchReferences(undefined, '*'))

        /** Since null and undefined are invalid keys in JS objects, we stringify them for compatibility with lodash dictionaries. See Reference.memberName. */
        function stringify(key: string | null | undefined) {
            if (key === undefined) return '<undefined>'
            if (key === null) return '<null>'
            return key
        }
        const aggregatedReferences = <PackageReferences>_.chain(references)
            .groupBy(reference => reference.kind)
            .mapValues(categorizedReferences => _.chain(categorizedReferences)
                .groupBy(reference => stringify(reference.declaration.memberName))
                .mapValues(memberReferences => _.chain(memberReferences)
                    .groupBy(reference => reference.dependency.name)
                    .mapValues(dependentReferences => _.chain(dependentReferences)
                        .groupBy(reference => reference.location.file)
                        .mapValues(fileReferences => _.map(
                            fileReferences, reference => reference.location.position.row))
                        .value())
                    .value())
                .value())
            .value()

        // Classify actual-expected data by whether we want to do make exact assertions or not
        const isExactExpectation = (kind: ReferenceKind) => strategy != 'heuristic' && kind != 'occurence'
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
                () => printDiff(actual, containingExpected, strategy, packageName))
        })
    })
})
