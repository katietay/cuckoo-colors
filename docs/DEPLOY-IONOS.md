# Deploying to IONOS (Web Hosting Plus)

This puts Cuckoo Colors on your existing IONOS hosting at no extra cost. The app is static files plus a small PHP API that stores colors in a MySQL database from your plan.

Default address used below: `https://katietaylor.info/colors/`

The IONOS dashboard changes its labels now and then. If a menu name differs, look for the closest match.

## 1. Create the MySQL database

1. In the IONOS dashboard, open your Web Hosting Plus package and find **Databases** (MySQL).
2. Create a new database. Pick a password and keep it somewhere safe.
3. Open the database's details and note four values: **host name**, **database name**, **user name** and **password**. The host looks like `db5000000000.hosting-data.io`.

You do not need to create tables. The API creates them the first time it runs and adds the ten default colors.

## 2. Make the admin key

On your computer, in the project folder:

```bash
npm run token
```

Copy the output. This is the key you type on the Color Management page to add, edit or delete colors. Anyone without it can only view.

## 3. Build the upload folder

```bash
npm install
npm run package:ionos -- /colors/
```

This creates `deploy/ionos/`, containing the built site, the PHP API and a `.htaccess` file. The `/colors/` part must match the folder name you upload to.

For a subdomain instead (for example `colors.katietaylor.info`), run `npm run package:ionos` with no argument. This works only if IONOS has an HTTPS certificate for that subdomain. Check this in IONOS before choosing it.

## 4. Fill in the API settings

1. In `deploy/ionos/api/`, copy `config.sample.php` to `config.php`.
2. Edit `config.php`:
   - `dsn`: replace `DB_HOST` and `DB_NAME` with your host and database name
   - `user` and `pass`: your database user and password
   - `admin_token`: the key from step 2 (at least 16 characters)

Keep `config.php` private. It is excluded from git and from the packaging step, and `api/.htaccess` blocks it from being downloaded.

## 5. Upload

Use SFTP (the IONOS dashboard shows your SFTP host and user) or the IONOS file manager.

1. Create a folder called `colors` in your site's web root (the same place as your site's `index.html`).
2. Upload the **contents** of `deploy/ionos/` into it. Include the hidden `.htaccess` file and the `api` folder. Hidden files can be missed, so turn on "show hidden files" in your SFTP program.
3. Also upload your edited `config.php` into `colors/api/`.

## 6. Check it

- `https://katietaylor.info/colors/api/health` should show `{"status":"ok"}`
- `https://katietaylor.info/colors/` should show the app
- `https://katietaylor.info/colors/api/config.php` and `.../api/lib/Config.php` should show **403 Forbidden**
- On Color Management, enter the admin key and add a color

If the health check shows `{"error":"Something went wrong on the server."}`, the API could not read its settings or reach the database. Check `config.php` (host, database name, user, password) and that the PHP version is 8.1 or newer (IONOS dashboard, Hosting, PHP version).

## If your main site hides the folder

Your main site is a single-page app, so its `.htaccess` may send unknown paths to its own `index.html`. A real folder should win. If `/colors/` shows your main site instead of this app, add this line to the main site's `.htaccess`, just before its fallback rule:

```
RewriteRule ^colors/ - [L]
```

## Updating later

Run `npm run package:ionos -- /colors/` again and upload the contents, but do not overwrite `api/config.php`. The database is untouched by updates.

## Backups

Export the database from the IONOS database tools (phpMyAdmin or the export option). The `colors` table is tiny.

## Notes

- The PHP API and the Node API (used for local development) share the same rules and are tested against the same test suite (`npm run test:contract`).
- Writes are rate limited per visitor, using a small `rate_limits` table in the same database.
- Name uniqueness on MySQL ignores case and accents ("Cafe" and "Café" count as the same name). The Node and SQLite version ignores case only.
