import asyncIteratorToArray from 'it-all'
import _ from 'lodash'

import { Reference, ReferenceSearcher } from '../src/references'


describe('searchReferences', () => {
    it.each(Object.entries(<{
        [packageName: string]: {
            [memberName: string]: {
                [dependent: string]: {
                    [fileName: string]: number[]
                }
            }
        }
    }>require("./npm-deps.test/expectedReferences.json")).map(
        ([packageName, expectedReferences]) => ({ packageName, expectedReferences }))
    )("should find relevant references for %s", async (
        { packageName, expectedReferences }) => {
        const searcher = new ReferenceSearcher(packageName, 'test/npm-deps.test/examples')
        const references = await asyncIteratorToArray(searcher.searchReferences())

        /** Since null and undefined are invalid keys in JS objects, we stringify them for compatibility with lodash. See Reference.memberName. */
        function stringify(key: string | null | undefined) {
            if (key === undefined) return '<undefined>'
            if (key === null) return '<null>'
            return key
        }
        const aggregatedReferences = _.chain(references)
            .groupBy(reference => stringify(reference.memberName))
            .mapValues(memberReferences => _.chain(memberReferences)
                .groupBy(reference => reference.dependentName)
                .mapValues(dependentReferences => _.chain(dependentReferences)
                    .groupBy(reference => reference.file)
                    .mapValues(fileReferences => _.map(
                        fileReferences, reference => reference.lineNumber))
                    .value())
                .value())
            .value()

        expect(aggregatedReferences).toEqual(
            expect.objectContaining(
                _.mapValues(expectedReferences, dependentReferences => expect.objectContaining(
                    _.mapValues(dependentReferences, memberReferences => expect.objectContaining(
                        _.mapValues(memberReferences, lineNumbers => expect.arrayContaining(lineNumbers))
                    ))
                ))))
        // TODO: Test false positive rate?
    })
})
