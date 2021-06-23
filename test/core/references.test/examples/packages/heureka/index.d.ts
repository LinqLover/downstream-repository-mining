export declare class Whole {
    primaryPart: Part;
    secondaryParts: Part[];
    constructor(primaryPart: Part, ...secondaryParts: ReadonlyArray<Part>);
    getName(): string;
    lastPart(): Part;
}
export declare class Part {
    name: string;
    constructor(name: string);
    inNewWhole(): Whole;
}
export declare function makeWhole(primaryName: string, ...secondaryNames: ReadonlyArray<string>): Whole;
import util = require("./util.js");
export { util };
