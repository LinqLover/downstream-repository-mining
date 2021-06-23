module.exports = {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "roots": [
        "test"
    ],
    "globals": {
        "ts-jest": {
            "tsconfig": "test/tsconfig.json"
        }
    },
    "setupFiles": [
        "<rootDir>/test/.jest/setEnvVars.ts"
    ],
    "testPathIgnorePatterns": [
        "test/*.test"
    ],
    "moduleNameMapper": {
        '^@core/(.*)$': '<rootDir>/src/core/$1',
        '^@utils/(.*)$': '<rootDir>/src/utils/$1'
    }
}
