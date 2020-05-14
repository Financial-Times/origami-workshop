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
    let testDirectory;
    let subprocess;
    let watcher;
    const testTimeout = 3000
    this.timeout(testTimeout)

    function runCommandUnderTest(done) {
        let commandOutput = '';
        subprocess = execa(pathToCommand, {
            all: true
        });
        subprocess.all.on('data', chunk => {
            commandOutput += chunk.toString('utf8');
        });
        subprocess.catch(error => {
            if (!error.isCanceled) {
                done(new Error(`Found an unexpected error:\n\n ${error.stderr}`));
            }
        });
        setTimeout(() => {
            new Error(`Test took too long. Command output:\n\n${commandOutput}`);
        }, testTimeout - 500);
        return subprocess;
    }

    beforeEach(function () {
        // move to a new temporary directory
        testDirectory = uniqueTempDir({ create: true });
        process.chdir(testDirectory);
    });

    afterEach(function () {
        // delete temporary test directory
        try {
            subprocess.cancel();
        } catch {}
        if (watcher) {
            watcher.close();
        }
        process.chdir(process.cwd());
        rimraf.sync(testDirectory);
    });

    it('outputs a localhost url to stdout', function (done) {
        subprocess = runCommandUnderTest(done);
        subprocess.stdout.on('data', chunk => {
            proclaim.include(
                chunk.toString('utf8'),
                'Your code is running at: http://localhost'
            );
            done();
        });
    });

    context('with no index.html', function () {
        it('outputs a notice to stderr', function (done) {
            subprocess = runCommandUnderTest(done);
            subprocess.stderr.on('data', chunk => {
                proclaim.include(
                    chunk.toString('utf8'),
                    '! your web page won\'t be visible until we create index.html'
                );
                done();
            });
        });
    });

    context('with index.html', function () {
        const htmlContent = '<div>test html content</div>';

        beforeEach(function () {
            fs.writeFileSync(path.resolve(process.cwd(), 'index.html'), htmlContent);
        });

        it('outputs a build in progress notice to stderr', function (done) {
            subprocess = runCommandUnderTest(done);
            subprocess.stderr.on('data', chunk => {
                if (chunk.toString('utf8').includes('building index.html')) {
                    done();
                }
            });
        });

        it('copies the html to a public directory', function (done) {
            subprocess = runCommandUnderTest(done);
            watcher = chokidar.watch(['public/index.html']).on('add', (file) => {
                proclaim.include(fs.readFileSync(file, 'utf8'), htmlContent);
                done();
            });
        });

        it('outputs a build complete notice to stderr', function (done) {
            let stderrOutput = '';
            subprocess = runCommandUnderTest(done);
            subprocess.stderr.on('data', chunk => {
                stderrOutput += chunk.toString('utf8');
            });
            watcher = chokidar.watch(['public/index.html']).on('add', () => {
                proclaim.include(
                    stderrOutput,
                    'built index.html'
                );
                done();
            });
        });

        context('that is delete', function () {
            it('outputs a notice to stderr', function (done) {
                subprocess = runCommandUnderTest(done);
                watcher = chokidar.watch(['public/index.html']).on('add', () => {
                    rimraf.sync(path.resolve(process.cwd(), 'index.html'));
                    subprocess.stderr.on('data', chunk => {
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

        it('outputs a build in progress notice to stderr', function (done) {
            subprocess = runCommandUnderTest(done);
            subprocess.stderr.on('data', chunk => {
                if (chunk.toString('utf8').includes('building src/main.scss')) {
                    done();
                }
            });
        });

        it('builds to CSS in the public directory', function (done) {
            subprocess = runCommandUnderTest(done);
            watcher = chokidar.watch(['public/main.css']).on('add', () => {
                done();
            });
        });

        it('outputs a build complete notice to stderr', function (done) {
            let stderrOutput = '';
            subprocess = runCommandUnderTest(done);
            subprocess.stderr.on('data', chunk => {
                stderrOutput += chunk.toString('utf8');
            });
            watcher = chokidar.watch(['public/main.css']).on('add', (file) => {
                proclaim.include(
                    stderrOutput,
                    'built src/main.scss'
                );
                proclaim.include(fs.readFileSync(file, 'utf8'), 'background: red;');
                done();
            });
        });

        it('rebuilds on change', function (done) {
            subprocess = runCommandUnderTest(done);
            let firstBuild = true;
            watcher = chokidar.watch(['public/main.css']).on('all', (event) => {
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

        it('outputs an error to stderr', function (done) {
            subprocess = runCommandUnderTest(done);
            subprocess.stderr.on('data', chunk => {
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

        it('outputs a build in progress notice to stderr', function (done) {
            subprocess = runCommandUnderTest(done);
            subprocess.stderr.on('data', chunk => {
                if (chunk.toString('utf8').includes('building src/main.js')) {
                    done();
                }
            });
        });

        it('bundles JS in the public directory', function (done) {
            subprocess = runCommandUnderTest(done);
            watcher = chokidar.watch(['public/main.js']).on('add', () => {
                done();
            });
        });

        it('outputs a build complete notice to stderr', function (done) {
            let stderrOutput = '';
            subprocess = runCommandUnderTest(done);
            subprocess.stderr.on('data', chunk => {
                stderrOutput += chunk.toString('utf8');
            });
            watcher = chokidar.watch(['public/main.js']).on('add', (file) => {
                proclaim.include(
                    stderrOutput,
                    'built src/main.js'
                );
                proclaim.include(fs.readFileSync(file, 'utf8'), jsCopy);
                proclaim.doesNotInclude(
                    fs.readFileSync(file, 'utf8'),
                    jsImport,
                    'Expected JavaScript to be bundled.'
                );
                done();
            });
        });

        it('rebuilds when the main file changes', function (done) {
            subprocess = runCommandUnderTest(done);
            let firstBuild = true;
            watcher = chokidar.watch(['public/main.js']).on('all', (event) => {
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

        it('outputs an error to stderr', function (done) {
            subprocess = runCommandUnderTest(done);
            subprocess.stderr.on('data', chunk => {
                if (chunk.toString('utf8').includes('error building src/main.js')) {
                    done();
                }
            });
        });
    });
});
