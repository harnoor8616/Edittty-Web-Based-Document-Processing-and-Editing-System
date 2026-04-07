require("dotenv").config({ quiet: true });

const mysql = require("mysql2/promise");

async function main() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || "localhost",
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "PDFPRO"
    });

    await connection.query("TRUNCATE TABLE logs");
    await connection.end();

    console.log(`Table reset complete: ${(process.env.DB_NAME || "PDFPRO")}.logs`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
