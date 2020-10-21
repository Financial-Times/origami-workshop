/* eslint-env mocha */
'use strict';

const uniqueTempDir = require('unique-temp-dir');
const rimraf = require('rimraf');
const execa = require('execa');
const path = require('path');
const fs = require('fs');
const proclaim = require('proclaim');
const chokidar = require('chokidar');

const pathToCommand = path.resolve(__dirname, '../../index.js');

describe('origami-workshop', function () {
    // Set test timeout time.
    const testTimeoutTime = 3000
    this.timeout(testTimeoutTime)
    // The directory to run the current test in.
    let testDirectory;
    // The current test command subprocess.
    let subprocess;
    // The current tests chokidar file watcher.
    let watcher;
    // A timer for the current test
    // to output logs before the actual
    // test timeout.
    let logTimeout;

    /**
     * An async function which resolves after a number of seconds.
     * @param {Number} seconds
     */
    async function sleep(seconds) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, seconds);
        });
    }

    /**
     * Run the command under test and:
     * - log all its output just before the test times out
     * - end the test with an error if the command throws an error
     *
     * @param {*} done
     */
    function runCommandUnderTest(done) {
        // Run the command.
        subprocess = execa(pathToCommand, {
            all: true
        });
        // Store all command output to log before the test times out.
        let commandOutput = '';
        subprocess.all.on('data', chunk => {
            commandOutput += chunk.toString('utf8');
        });
        logTimeout = setTimeout(() => {
            done(new Error(`Test took too long. Command output:\n\n${commandOutput}`));
        }, testTimeoutTime - 500);
        // Catch any error from the command and pass as Mocha's `done`
        // callback to avoid unhandled promise rejection.
        subprocess.catch(error => {
            if (!error.isCanceled) {
                done(new Error(`Found an unexpected error:\n\n ${error.stderr}`));
            }
        });
        return subprocess;
    }

    beforeEach(function () {
        // move to a new temporary directory
        testDirectory = uniqueTempDir({ create: true });
        process.chdir(testDirectory);
    });

    afterEach(async function () {
        // The test is done, clear the timeout which logs command output
        // just before a test timeout.
        clearTimeout(logTimeout);
        // Stop the test command from running.
        try {
            subprocess.cancel();
        } catch {}
        // Stop watching for changes in the test directory.
        if (watcher) {
            await watcher.close();
        }
        // Delete temporary test directory.
        process.chdir(process.cwd());
        rimraf.sync(testDirectory);
    });

    it('outputs a localhost url to stdout', function (done) {
        subprocess = runCommandUnderTest(done);
        subprocess.stdout.on('data', chunk => {
            try {
                proclaim.include(
                    chunk.toString('utf8'),
                    'Your code is running at: http://localhost'
                );
            } catch (error) {
                return done(error);
            }
            done();
        });
    });

    context('with no index.html', function () {

        it('outputs a notice', function (done) {
            subprocess = runCommandUnderTest(done);
            subprocess.all.once('data', chunk => {
                try {
                    proclaim.include(
                        chunk.toString('utf8'),
                        '! your web page won\'t be visible until we create index.html'
                    );
                } catch (error) {
                    return done(error);
                }
                done();
            });
        });

    });

    context('with index.html', function () {
        const htmlContent = '<div>test html content</div>';

        beforeEach(function () {
            fs.writeFileSync(path.resolve(process.cwd(), 'index.html'), htmlContent);
        });

        it('outputs a build in progress notice', function (done) {
            subprocess = runCommandUnderTest(done);
            subprocess.all.on('data', chunk => {
                if (chunk.toString('utf8').includes('building index.html')) {
                    done();
                }
            });
        });

        it('copies the html to a public directory', function (done) {
            subprocess = runCommandUnderTest(done);
            watcher = chokidar.watch('.').on('add', (file) => {
                if(file !== 'public/index.html') {
                    return;
                }
                try {
                    proclaim.include(fs.readFileSync(file, 'utf8'), htmlContent)
                } catch (error) {
                    return done(error);
                }
                done();
            });
        });

        it('outputs a build complete notice', function (done) {
            let commandOutput = '';
            subprocess = runCommandUnderTest(done);
            subprocess.all.on('data', chunk => {
                commandOutput += chunk.toString('utf8');
            });
            watcher = chokidar.watch('.').on('add', async (file) => {
                if(file !== 'public/index.html') {
                    return;
                }
                try {
                    // the build notice may come after the file is added
                    await sleep(100);
                    proclaim.include(commandOutput, 'built index.html');
                } catch (error) {
                    return done(error);
                }
                done();
            });
        });

        context('that is delete', function () {
            it('outputs a notice', function (done) {
                subprocess = runCommandUnderTest(done);
                watcher = chokidar.watch('.').on('add', (file) => {
                    if(file !== 'public/index.html') {
                        return;
                    }
                    rimraf.sync(path.resolve(process.cwd(), 'index.html'));
                    subprocess.all.on('data', chunk => {
                        if (chunk.toString('utf8').includes('! missing index.html')) {
                            done();
                        }
                    });
                });
            });
        })
    });

    context('with a valid Sass file', function () {
        const sassContent = '$color: red; body { background: $color; }';

        beforeEach(function () {
            fs.mkdirSync(path.resolve(process.cwd(), 'src'), { recursive: true });
            fs.writeFileSync(path.resolve(process.cwd(), 'src/main.scss'), sassContent);
        });

        it('outputs a build in progress notice', function (done) {
            subprocess = runCommandUnderTest(done);
            subprocess.all.on('data', chunk => {
                if (chunk.toString('utf8').includes('building src/main.scss')) {
                    done();
                }
            });
        });

        it('builds to CSS in the public directory', function (done) {
            subprocess = runCommandUnderTest(done);
            watcher = chokidar.watch('.').on('add', (file) => {
                if(file === 'public/main.css') {
                    done();
                }
            });
        });

        it('outputs a built file and build complete notice', function (done) {
            let commandOutput = '';
            subprocess = runCommandUnderTest(done);
            subprocess.all.on('data', chunk => {
                commandOutput += chunk.toString('utf8');
            });
            watcher = chokidar.watch('.').on('add', async (file) => {
                if(file !== 'public/main.css') {
                    return;
                }
                try {
                    // the build notice may come after the file is added
                    await sleep(100);
                    proclaim.include(
                        commandOutput,
                        'built src/main.scss'
                    );
                    // the built contents is what we expect
                    proclaim.include(fs.readFileSync(file, 'utf8'), 'background: red;');
                } catch (error) {
                    return done(error);
                }
                done();
            });
        });

        it('rebuilds on change', function (done) {
            subprocess = runCommandUnderTest(done);
            let firstBuild = true;
            watcher = chokidar.watch('.').on('all', (event, file) => {
                if(file !== 'public/main.css') {
                    return;
                }
                if (event === 'add' && firstBuild) {
                    firstBuild = false;
                    fs.writeFileSync(path.resolve(process.cwd(), 'src/main.scss'), sassContent);;
                    return;
                }
                if (event === 'change') {
                    done();
                }
            });
        });
    });

    context('with an invalid Sass file', function () {
        const sassContent = '!@£$%^&*';

        beforeEach(function () {
            fs.mkdirSync(path.resolve(process.cwd(), 'src'), { recursive: true });
            fs.writeFileSync(path.resolve(process.cwd(), 'src/main.scss'), sassContent);
        });

        it('outputs an error', function (done) {
            subprocess = runCommandUnderTest(done);
            subprocess.all.on('data', chunk => {
                if (chunk.toString('utf8').includes('error building src/main.scss')) {
                    done();
                }
            });
        });
    });

    context('with a valid JavaScript file', function () {
        const jsCopy = 'example javascript for test';
        const jsImport = `import b from './b.js';`;
        const jsContentMain = `${jsImport} console.log(b);`;
        const jsContentModule = `export default '${jsCopy}';`;

        beforeEach(function () {
            fs.mkdirSync(path.resolve(process.cwd(), 'src'), { recursive: true });
            fs.writeFileSync(path.resolve(process.cwd(), 'src/main.js'), jsContentMain);
            fs.writeFileSync(path.resolve(process.cwd(), 'src/b.js'), jsContentModule);
        });

        it('outputs a build in progress notice', function (done) {
            subprocess = runCommandUnderTest(done);
            subprocess.all.on('data', chunk => {
                if (chunk.toString('utf8').includes('building src/main.js')) {
                    done();
                }
            });
        });

        it('bundles JS in the public directory', function (done) {
            subprocess = runCommandUnderTest(done);
            watcher = chokidar.watch('.').on('add', (file) => {
                if(file === 'public/main.js') {
                    done();
                }
            });
        });

        it('outputs a built file and build complete notice', function (done) {
            let commandOutput = '';
            subprocess = runCommandUnderTest(done);
            subprocess.all.on('data', chunk => {
                commandOutput += chunk.toString('utf8');
            });
            watcher = chokidar.watch('.').on('add', async (file) => {
                if(file !== 'public/main.js') {
                    return;
                }
                try {
                    // the build notice may come after the file is added
                    await sleep(100);
                    proclaim.include(
                        commandOutput,
                        'built src/main.js'
                    );
                    // the built js is as expected
                    proclaim.include(fs.readFileSync(file, 'utf8'), jsCopy);
                    proclaim.doesNotInclude(
                        fs.readFileSync(file, 'utf8'),
                        jsImport,
                        'Expected JavaScript to be bundled.'
                    );
                } catch (error) {
                    return done(error);
                }
                done();
            });
        });

        it('rebuilds when the main file changes', function (done) {
            subprocess = runCommandUnderTest(done);
            let firstBuild = true;
            watcher = chokidar.watch('.').on('all', (event, file) => {
                if(file !== 'public/main.js') {
                    return;
                }
                if (event === 'add' && firstBuild) {
                    firstBuild = false;
                    fs.writeFileSync(path.resolve(process.cwd(), 'src/main.js'), jsContentMain);
                    return;
                }
                if (event === 'change') {
                    done();
                }
            });
        });
    });

    context('with an invalid JavaScript file', function () {
        const jsContentMain = `!@£$%^&*()`;

        beforeEach(function () {
            fs.mkdirSync(path.resolve(process.cwd(), 'src'), { recursive: true });
            fs.writeFileSync(path.resolve(process.cwd(), 'src/main.js'), jsContentMain);
        });

        it('outputs an error', function (done) {
            subprocess = runCommandUnderTest(done);
            subprocess.all.on('data', chunk => {
                if (chunk.toString('utf8').includes('error building src/main.js')) {
                    done();
                }
            });
        });
    });
});
