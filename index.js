#!/usr/bin/env node
const fs = require('fs')
const process = require('process')
const path = require('path');
const chalk = require('chalk');
const chokidar = require('chokidar');
const sassBin = require.resolve('sass-bin/src/sass');
const execa = require('execa');
const handler = require('serve-handler');
const http = require('http');
const portfinder = require('portfinder');
const Spinnies = require('spinnies');
const postcss = require('postcss');
const autoprefixer = require('autoprefixer');
const esbuild = require('esbuild');

// Spinnies is used to inform the user of build status.
// It allows us to output one message per built file and
// update the same message when the status of a build changes.
// However, any spinner which is complete or failed is removed
// automatically which leads to a new line every time a file
// is built, and persistent error messages. To avoid this,
// make the "spinner" which prepends the message blank and
// never mark a spinner as complete, just update its message.
const spinnies = new Spinnies({
	 spinner: {
		  "interval": 30,
		  "frames": ['']
	 }
});

(async () => {
	 const index = 'index.html';
	 const sass = 'src/main.scss';
	 const js = 'src/main.js';
	 const public = 'public';
	 const tutorialUrl = 'https://origami.ft.com/documentation/tutorials/manual-build/';

	 // Create a public directory if one does not exist.
	 fs.mkdirSync(path.resolve(process.cwd(), public), { recursive: true });

	 // Start a server for the public directory.
	 const server = http.createServer((request, response) => {
		  return handler(request, response, { public });
	 }, { public })

	 const port = await portfinder.getPortPromise({ port: 3000 });
	 server.listen(port, () => {
		  console.log(chalk.green(
				`Building Sass, JavaScript, and serving HTML for the Origami manual build tutorial!\n${tutorialUrl}\n\nYour code is running at: http://localhost:${port}\n`
		  ));
	 });

	 // Notify the user if an index.html wasn't found, they need to add one.
	 // Use `spinnies` so we can replace the message when index.html is added.
	 const indexStats = fs.existsSync(index) ? fs.statSync(index) : null;
	 if (!indexStats || !indexStats.isFile()) {
		  spinnies.add(index, {
				text: '! your web page won\'t be visible until we create index.html'
		  });
	 }

	 // Listen for changes to HTML, Sass, or Js. Rebuild on changes.
	 // Keep track of subprocesses used for bundling so a build can be
	 // cancelled if a file is changed multiple times before the previous build
	 // has finished.
	 const subprocesses = {};
	 chokidar.watch([index, sass, js]).on('all', async (event, file) => {
		  try {
				// Notify the user the file is being built.
				const buildingMessage = `- building ${file}`;
				try {
					 spinnies.update(file, { text: buildingMessage });
				} catch (error) {
					 spinnies.add(file, { text: buildingMessage });
				}

				// Cancel any subprocess which is already running
				// for the file being built.
				if (subprocesses[file]) {
					 subprocesses[file].cancel();
				}

				// If the Sass or JavaScript source file has been removed, then remove
				// the spinner which notifies the user of build progress.
				if ((file == sass || file == js) && event === 'unlink') {
					 spinnies.remove(file);
					 return;
				}

				// If the HTML source file has been removed, then update
				// the spinner to notify the user. We always expect an index.html
				// to present the users work.
				if (file == index && event === 'unlink') {
					 spinnies.update(file, { text: '! missing index.html' });
					 return;
				}

				// Build CSS.
				if (file == sass) {
					 // Parse Sass to CSS.
					 subprocesses[file] = execa(sassBin, [
						  sass,
						  '--embed-source-map',
						  '--source-map-urls',
						  'absolute',
						  '--load-path',
						  'node_modules'
					 ]);
					 let { stdout: css } = await subprocesses[file];

					 // Run CSS through PostCSS/autoprefixer.
					 // Many components use `appearance: none;` which needs vendor prefixes.

					 // PostCSS does not parse the charset unless it is also base64.
					 // Remove this code when PostCSS release a fix.
					 // https://github.com/postcss/postcss/issues/1281#issuecomment-599626666
					 css = css.replace(
						  `application/json;charset=utf-8,`,
						  `application/json,`
					 );

					 // Get the PostCSS result.
					 const result = await postcss(autoprefixer({
						  overrideBrowserslist: [
								'> 1%',
								'last 2 versions',
								'ie >= 11'
						  ],
						  cascade: false,
						  flexbox: 'no-2009',
						  grid: true
					 })).process(css, {
						  from: sass,
						  to: path.resolve(process.cwd(), `${public}/main.css`),
						  map: { inline: true }
					 });

					 // Write CSS to file.
					 fs.writeFileSync(
						  path.resolve(process.cwd(), `${public}/main.css`),
						  result.css
					 );

					 // Update the spinner status.
					 spinnies.update(file, { text: `√ built ${file}` });
				}

				// Build JavaScript.
				if (file == js) {
					 await esbuild.build({
						  entryPoints: [js],
						  bundle: true,
						  sourcemap: true,
						  outfile: path.resolve(process.cwd(), `${public}/main.js`)
					 });
					 spinnies.update(file, { text: `√ built ${file}` });
				}

				// Build HTML: copy it to the public directory.
				if (file == index) {
					 try {
						  fs.copyFileSync(file, `${public}/index.html`);
					 } catch (error) {
						  error = error.code === 'ENOTSUP' && error.path === 'index.html' ?
								new Error('Could not copy "index.html". Is it a file?') :
								error;
						  throw error;
					 }
					 spinnies.update(file, { text: `√ built ${file}` });
				}
		  } catch (error) {
				// Ignore cancelled subprocess.
				if (error.isCanceled){
					 return;
				}
				// If there was an error with a subprocess that had no output, exit.
				if (error.failed && (!error.stderr && !error.stdout)) {
					 console.error(chalk.red(`There was an unexpected error building ${file}:\n\n${error.message}`));
					 process.exit(1);
				}
				// Output other errors without existing, such as compilation errors.
				spinnies.update(file, { text: chalk.red(`× error building ${file}\n ${error.stderr || error.stdout || error.message}`) });
		  }
	 });
})();
