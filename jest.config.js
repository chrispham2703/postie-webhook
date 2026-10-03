module.exports = {
    setupFiles: ['<rootDir>/jest.setup.js'],
    // Tests share real Postgres rows (app_test_1/ep_test_1) and some queries
    // (recoveryScan.scanOnce) aren't scoped to one app -- running test files
    // in parallel let two files mutate shared fixtures at the same instant,
    // causing intermittent failures. Suite is small enough that running
    // serially costs a couple seconds and buys back reliability.
    maxWorkers: 1,
};
