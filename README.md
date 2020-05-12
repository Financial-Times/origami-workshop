# Origami Workshop Build Tools

JavaScript and Sass build tools to facilitate the [Origami manual build tutorial](https://origami.ft.com/docs/tutorials/manual-build/). This is not meant for production use.

## Usage

Origami Workshop is a single command with no options. For detailed usage instructions, follow the [Origami manual build tutorial](https://origami.ft.com/docs/tutorials/manual-build/).

## What does it do?

- Creates a `public` directory if one does not already exist.
- Bundles `src/main.js` on change with [scrumple](https://github.com/Financial-Times/scrumple) to `public/main.js`.
_Note: this resolves imports but does not transpile JS for wider browser support._
- Builds `src/main.scss` on change with [dart-sass](https://github.com/Financial-Times/sass), [postcss](https://github.com/postcss/postcss/), and [autoprefixer](https://github.com/postcss/autoprefixer) to `public/main.css`.
- Copies `index.html` on change to `public/index.html`.
- Starts a server for the public directory at http://localhost:3000. Another port is used if 3000 is taken.

## Contact

If you have any questions or comments about this project, or need help using it, please either [raise an issue](https://github.com/Financial-Times/origami-workshop/issues), visit [#origami-support](https://financialtimes.slack.com/messages/origami-support/) or email [Origami Support](mailto:origami-support@ft.com).

----

## License

Copyright (c) 2020 Financial Times Ltd. All rights reserved.

This software is published under the [MIT licence](http://opensource.org/licenses/MIT).
