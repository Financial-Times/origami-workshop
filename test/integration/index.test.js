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

    beforeEach(function () {
        // move to a new temporary directory
        testDirectory = uniqueTempDir({ create: true });
        process.chdir(testDirectory);
    });

    afterEach(function () {
        // delete temporary test directory
        try {
            subprocess.cancel();
        } catch (error) {

        }
        process.chdir(process.cwd());
        rimraf.sync(testDirectory);
    });

    it('outputs a localhost url to stdout', function (done) {
        subprocess = execa(pathToCommand);
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
            subprocess = execa(pathToCommand);
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
            subprocess = execa(pathToCommand);
            subprocess.stderr.on('data', chunk => {
                proclaim.include(
                    chunk.toString('utf8'),
                    'building index.html'
                );
                done();
            });
        });

        it('copies the html to a public directory', function (done) {
            subprocess = execa(pathToCommand);
            const watcher = chokidar.watch(['public/index.html']).on('add', (file) => {
                proclaim.include(fs.readFileSync(file, 'utf8'), htmlContent);
                watcher.close();
                done();
            });
        });

        it('outputs a build complete notice to stderr', function (done) {
            let stderrOutput = '';
            subprocess = execa(pathToCommand);
            subprocess.stderr.on('data', chunk => {
                stderrOutput += chunk.toString('utf8');
            });
            const watcher = chokidar.watch(['public/index.html']).on('add', () => {
                proclaim.include(
                    stderrOutput,
                    'built index.html'
                );
                watcher.close();
                done();
            });
        });
    });

    context('with a valid Sass file', function () {
        const sassContent = '$color: red; body { background: $color; }';

        beforeEach(function () {
            fs.mkdirSync(path.resolve(process.cwd(), 'src'), { recursive: true });
            fs.writeFileSync(path.resolve(process.cwd(), 'src/main.scss'), sassContent);
        });

        it('outputs a build in progress notice to stderr', function (done) {
            subprocess = execa(pathToCommand);
            subprocess.stderr.on('data', chunk => {
                if (chunk.toString('utf8').includes('building src/main.scss')) {
                    done();
                }
            });
        });

        it('builds to CSS in the public directory', function (done) {
            subprocess = execa(pathToCommand);
            const watcher = chokidar.watch(['public/main.css']).on('add', () => {
                watcher.close();
                done();
            });
        });

        it('outputs a build complete notice to stderr', function (done) {
            let stderrOutput = '';
            subprocess = execa(pathToCommand);
            subprocess.stderr.on('data', chunk => {
                stderrOutput += chunk.toString('utf8');
            });
            const watcher = chokidar.watch(['public/main.css']).on('add', (file) => {
                proclaim.include(
                    stderrOutput,
                    'built src/main.scss'
                );
                proclaim.include(fs.readFileSync(file, 'utf8'), 'background: red;');
                watcher.close();
                done();
            });
        });

        it('rebuilds on change', function (done) {
            subprocess = execa(pathToCommand);
            let firstBuild = true;
            const watcher = chokidar.watch(['public/main.css']).on('all', (event) => {
                if (event === 'add' && firstBuild) {
                    firstBuild = false;
                    fs.writeFileSync(path.resolve(process.cwd(), 'src/main.scss'), sassContent);;
                    return;
                }
                if (event === 'change') {
                    watcher.close();
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
            subprocess = execa(pathToCommand);
            subprocess.stderr.on('data', chunk => {
                if (chunk.toString('utf8').includes('building src/main.js')) {
                    done();
                }
            });
        });

        it('bundles JS in the public directory', function (done) {
            subprocess = execa(pathToCommand);
            const watcher = chokidar.watch(['public/main.js']).on('add', () => {
                watcher.close();
                done();
            });
        });

        it('outputs a build complete notice to stderr', function (done) {
            let stderrOutput = '';
            subprocess = execa(pathToCommand);
            subprocess.stderr.on('data', chunk => {
                stderrOutput += chunk.toString('utf8');
            });
            const watcher = chokidar.watch(['public/main.js']).on('add', (file) => {
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
                watcher.close();
                done();
            });
        });

        it('rebuilds when the main file changes', function (done) {
            subprocess = execa(pathToCommand);
            let firstBuild = true;
            const watcher = chokidar.watch(['public/main.js']).on('all', (event) => {
                if (event === 'add' && firstBuild) {
                    firstBuild = false;
                    fs.writeFileSync(path.resolve(process.cwd(), 'src/main.js'), jsContentMain);
                    return;
                }
                if (event === 'change') {
                    watcher.close();
                    done();
                }
            });
        });
    });
});
