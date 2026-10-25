# Cuckoo Colors

**CS 312 - Modern Web Development, Spring 2025**
Colorado State University

## Academic Integrity Notice - Portfolio Use Only

This repository is publicly visible for portfolio and professional reference purposes only.
It was developed as part of a course project at Colorado State University.

If you are a student completing a similar assignment, at CSU or any other institution, do not reuse, copy, or submit this code. Doing so may be considered academic dishonesty and violate university policies.

## Project Overview

Cuckoo Colors generates color coordinate activities: a printable grid that students paint cell by cell using a chosen set of colors. It is built around accessibility, with keyboard support, labelled controls, high contrast and a print layout. Colors are stored in a database and managed through their own page.

The project started as a four-person course project (Team 28). It has since been updated by Katie Taylor with a new database, server-side validation, security hardening, bug fixes and automated tests.

## Features

- Color Coordinate: choose rows (1 to 1000), columns (1 to 702, labelled A to ZZ) and colors, then paint cells
- Changing a color recolors every cell already painted with it
- Printable, grayscale-friendly worksheet layout
- Color Management page to view, add, edit and delete colors (editing and deleting require an admin key)
- Optional public color suggestions, from the Color Management page or directly on the Color Coordinate page: strict name rules plus an offensive-word filter, a daily limit per visitor, a cap on visitor colors, a 75 color total, automatic expiry, and an "Email me" button when the list is full. Off by default (`public_add`)
- Keyboard-accessible painting grid (arrow keys move, Enter or Space paints), skip link, labelled inputs, text alternatives for painted cells
- RESTful API with server-side input validation, rate limiting and generic error responses
- Unit and integration tests across backend and frontend
- CI workflow with tests, build and dependency audit

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Angular 20, TypeScript, CSS |
| Backend (local development) | Node.js 22, Express 5, SQLite (`better-sqlite3`) |
| Backend (production on IONOS) | PHP 8.1+, MySQL, Apache `.htaccess` |
| Security | Content Security Policy, rate limiting, admin key header, prepared statements |
| Testing | Karma and Jasmine, Node test runner, shared API contract tests |
| DevOps | GitHub Actions, Dependabot |

## Project Structure

```
.
├── api/                    # Node API for local development (Express + SQLite)
│   ├── app.js             # Routes, security headers, rate limits, static serving
│   ├── auth.js            # Admin key check
│   ├── db.js              # SQLite setup, seeding, queries
│   ├── validate.js        # Input validation
│   ├── index.js           # Server entry point
│   └── test/              # Node API tests
├── php/                    # PHP API for production on IONOS (MySQL)
│   ├── api/               # index.php, lib/, config.sample.php, .htaccess
│   ├── root.htaccess      # Routing, security headers, caching
│   └── dev-router.php     # Local PHP test server
├── contract/               # Black-box tests run against both APIs
├── scripts/                # package-ionos.mjs (builds the upload folder)
├── docs/                   # DEPLOY-IONOS.md
├── src/                    # Angular app
│   └── app/               # Components, services, shared utilities, specs
├── launch-page/            # Static project page for katietaylor.info
├── public/                 # Favicon
├── .github/                # CI workflow and Dependabot config
├── .env.example            # Environment variable template
└── README.md               # Project documentation
```

## Getting Started

### Prerequisites

- Node.js 22.12 or higher
- PHP 8.1 or higher with `pdo_sqlite` (only for the PHP contract tests)
- Chrome or Chromium (for front-end tests)

### Setup

```bash
npm install
cp .env.example .env     # then set ADMIN_TOKEN
npm run token            # prints a random key to use as ADMIN_TOKEN
```

### Running the Application

```bash
# Development: two terminals
npm run dev:api          # API on http://127.0.0.1:3000
npm run dev:web          # Angular on http://localhost:4200, proxies /api to the API

# Production
npm run build
NODE_ENV=production npm start    # serves the app and API on http://localhost:3000
```

### Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `ADMIN_TOKEN` | (Node API) Key required to add, edit or delete colors (16+ characters). If unset, the site is read-only. | unset |
| `DATABASE_PATH` | SQLite file location | `data/colors.db` |
| `PORT` | Port to listen on | `3000` |
| `HOST` | Interface to bind | `127.0.0.1` (`0.0.0.0` in production) |
| `TRUST_PROXY` | Number of reverse proxies in front of the app, for accurate rate limiting | `false` |

`.env` is git-ignored. Never commit it.

### Database

Locally, colors are stored in a SQLite file, so no database server or account is needed. In production on IONOS the same table lives in MySQL and is created automatically. The table is created if missing and never dropped, and the ten default colors are inserted only into an empty table. Back up by copying the `.db` file while the app is stopped. To reset, stop the app and delete the `.db`, `.db-wal` and `.db-shm` files. On a host, point `DATABASE_PATH` at a persistent disk. Database code is isolated in `api/db.js`.

### API

| Method and path | Auth | Notes |
| --- | --- | --- |
| `GET /api/colors` | none | List colors |
| `GET /api/config` | none | `{ editingEnabled, minColors, maxColors }` |
| `POST /api/colors` | admin | Body `{ name, hex }`. 201, 400, 409 |
| `PUT /api/colors/:id` | admin | Body `{ name, hex }`. 200, 400, 404, 409 |
| `DELETE /api/colors/:id` | admin | 204, 404, 409 if only 2 colors remain |

Send the key in the `X-Admin-Key` header. (A custom header is used because shared Apache hosts often strip `Authorization`.)

## Testing

- Backend: `npm run test:api`
- Frontend: `npm run test:web` (headless Chrome; set `CHROME_BIN` if Chrome is in an unusual location)
- Both APIs against one shared test suite: `npm run test:contract` (needs PHP 8.1+ with `pdo_sqlite`)
- Everything: `npm test`

## Deployment

Production runs on IONOS Web Hosting Plus (PHP and MySQL, no extra cost). The Angular app is built to static files and a PHP API stores colors in a MySQL database.

```bash
npm run token                          # admin key
npm run package:ionos -- /colors/      # builds deploy/ionos/
```

Then create the MySQL database, fill in `api/config.php` and upload the folder. Full steps: [docs/DEPLOY-IONOS.md](docs/DEPLOY-IONOS.md).

The Node and SQLite API stays in the repo for local development and runs the same tests as the PHP one. It can also be hosted on any Node host with a persistent disk, using `npm run build` and `npm start`.

`launch-page/` holds a static page for the portfolio site that links to the running app.

## Updates Since the Course

- Replaced the course MySQL setup (which dropped the table on every start and pointed at one student's database) with a database that keeps its data: SQLite locally, MySQL on IONOS
- Replaced the hard-coded CSU server address with same-origin `/api`
- Fixed: changing a color did not recolor painted cells, a new grid did not clear the painted-cell list, and the Print button also submitted the form
- Added server-side validation, admin-key protection for writes, rate limiting, security headers and a Content Security Policy
- Made the painting grid usable with a keyboard
- Upgraded Angular from 19 to 20.3 to pick up security fixes and removed server-side rendering
- Removed embedded location metadata from images and self-hosted fonts

## License

All rights reserved. The code is public for viewing and portfolio reference only. See [LICENSE](LICENSE). To ask about other uses, email katie@katietaylor.info.

## Acknowledgements

Team Members (CS 312 Team 28):

- Sophia Lopez ([@elsophia04](https://github.com/elsophia04))
- Katie Taylor ([@katietay](https://github.com/katietay))
- Adam ([@AdoApplescider](https://github.com/AdoApplescider))
- Torria ([@torriac](https://github.com/torriac))

## Contact

Name: Katie Taylor
Email: katie@katietaylor.info
GitHub: https://github.com/katietay
