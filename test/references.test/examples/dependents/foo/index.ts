import solve from 'heureka/util'
import * as baz from 'heureka'
import { huey as jolo1, dewey } from 'jolo'
import allJolo, * as myJolo from 'jolo'
import * as fs from 'fs'

const tick = myJolo.dewey()
console.log([tick.cap, tick.firstNames])
const sacks = solve(...tick.firstNames.map(name => name.length))

const parts = [
    new baz.Part("one"),
    new baz.Part("two"),
    new baz.Part("three")
]
const whole = new baz.Whole(parts[0], parts[1], parts[2])
console.log(whole.getName())

let err: Error = undefined; try { heureka.hello() } catch (referenceError) { err = referenceError }; console.log(err.message) // $ExpectedError TS2304 cannot find name

console.log(jolo1())
console.log(dewey)
console.log(solve)
console.log(sacks)
console.log(baz)
console.log(baz.makeWhole)
console.log(fs.Dir)  // irrelevant
console.log(allJolo.louie())
