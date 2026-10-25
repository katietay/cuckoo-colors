<?php
// Copy this file to config.php (same folder) and fill in the values.
// config.php must never be committed. It is listed in .gitignore.
return [
    'db' => [
        // From the IONOS control panel: Databases > MySQL. Example:
        //   mysql:host=db5000000000.hosting-data.io;dbname=dbs0000000;charset=utf8mb4
        'dsn' => 'mysql:host=DB_HOST;dbname=DB_NAME;charset=utf8mb4',
        'user' => 'DB_USER',
        'pass' => 'DB_PASSWORD',
    ],

    // Key needed to add, edit or delete colors. At least 16 characters.
    // Generate one with: npm run token. Leave '' to make the site read-only.
    'admin_token' => '',

    // Maximum write requests (add, edit, delete) per visitor per window.
    'write_limit' => 30,
    'window' => 900, // seconds
];
