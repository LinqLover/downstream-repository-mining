module.exports = {
	"preset": "ts-jest",
	"testEnvironment": "node",
	"roots": [
		"test"
	],
	"globals": {
		"ts-jest": {
			"tsconfig": "tsconfig.test.json"
		}
	},
	"setupFiles": [
		"<rootDir>/test/.jest/setEnvVars.ts"
	]
}
