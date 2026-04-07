// ================= LOAD ENV =================
require("dotenv").config({ quiet: true });

const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

function timestamp() {
    return new Date().toLocaleString("en-US", { hour12: false });
}

function logInfo(message, meta) {
    if (meta !== undefined) {
        console.log(`[${timestamp()}] ${message}`, meta);
        return;
    }

    console.log(`[${timestamp()}] ${message}`);
}

function logError(message, error) {
    if (error !== undefined) {
        console.error(`[${timestamp()}] ${message}`, error);
        return;
    }

    console.error(`[${timestamp()}] ${message}`);
}

function sendError(res, statusCode, message, error = null) {
    const payload = {
        success: false,
        message
    };

    if (error) {
        payload.error = error;
    }

    return res.status(statusCode).json(payload);
}

function normalizeLogPayload(body = {}) {
    return {
        operation: typeof body.operation === "string" ? body.operation.trim() : "",
        input_files: Array.isArray(body.input_files) ? body.input_files : [],
        output_file: typeof body.output_file === "string" && body.output_file.trim() ? body.output_file.trim() : null,
        total_input_size: Number.isFinite(Number(body.total_input_size)) ? Number(body.total_input_size) : 0,
        output_size: Number.isFinite(Number(body.output_size)) ? Number(body.output_size) : 0,
        processing_time: Number.isFinite(Number(body.processing_time)) ? Number(body.processing_time) : 0,
        status: typeof body.status === "string" ? body.status.trim().toUpperCase() : "",
        error_message: typeof body.error_message === "string" && body.error_message.trim() ? body.error_message.trim() : null,
        device_info: typeof body.device_info === "string" && body.device_info.trim() ? body.device_info.trim() : null
    };
}

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use((req, res, next) => {
    logInfo(`➡️ ${req.method} ${req.originalUrl} from ${req.ip}`);
    next();
});

// ================= DATABASE CONNECTION (POOL - BETTER) =================
const db = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "PDFPRO",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

function verifyDatabaseConnection() {
    return new Promise((resolve, reject) => {
        db.getConnection((err, connection) => {
            if (err) {
                logError("❌ Database connection failed:", err.message);
                reject(err);
                return;
            }

            logInfo("✅ Connected to MySQL database");
            connection.release();
            resolve();
        });
    });
}


app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/index.html", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/merge.html", (req, res) => {
    res.sendFile(path.join(__dirname, "merge.html"));
});

app.get("/split.html", (req, res) => {
    res.sendFile(path.join(__dirname, "split.html"));
});

app.get("/compress.html", (req, res) => {
    res.sendFile(path.join(__dirname, "compress.html"));
});

app.get("/pdf-to-image.html", (req, res) => {
    res.sendFile(path.join(__dirname, "pdf-to-image.html"));
});

app.get("/image-to-pdf.html", (req, res) => {
    res.sendFile(path.join(__dirname, "image-to-pdf.html"));
});

app.get("/jpg-to-pdf.html", (req, res) => {
    res.sendFile(path.join(__dirname, "image-to-pdf.html"));
});

app.get("/rotate.html", (req, res) => {
    res.sendFile(path.join(__dirname, "rotate.html"));
});

app.get("/page-numbers.html", (req, res) => {
    res.sendFile(path.join(__dirname, "page-numbers.html"));
});

app.get("/about.html", (req, res) => {
    res.sendFile(path.join(__dirname, "about.html"));
});

app.get("/privacy.html", (req, res) => {
    res.sendFile(path.join(__dirname, "privacy.html"));
});

app.get("/contact.html", (req, res) => {
    res.sendFile(path.join(__dirname, "contact.html"));
});
// ================= LOG API =================
app.post("/log", (req, res) => {
    logInfo("📩 Incoming log payload:", req.body);

    try {
        const {
            operation,
            input_files,
            output_file,
            total_input_size,
            output_size,
            processing_time,
            status,
            error_message,
            device_info
        } = normalizeLogPayload(req.body);

        // ================= VALIDATION =================
        if (!operation || !status) {
            return sendError(res, 400, "Missing required fields: operation and status.");
        }

        if (!["SUCCESS", "FAILED"].includes(status)) {
            return sendError(res, 400, "Invalid status. Use SUCCESS or FAILED.");
        }

        if (input_files.length > 0 && !input_files.every(file => typeof file === "string")) {
            return sendError(res, 400, "input_files must be an array of file names.");
        }

        const user_ip =
            req.headers["x-forwarded-for"]?.split(",")[0] ||
            req.socket.remoteAddress ||
            "unknown";

        const sql = `
            INSERT INTO logs 
            (operation, input_files, output_file, total_input_size, output_size, 
             processing_time, status, error_message, user_ip, device_info)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(
            sql,
            [
                operation,
                JSON.stringify(input_files || []),
                output_file || null,
                total_input_size || 0,
                output_size || 0,
                processing_time || 0,
                status,
                error_message || null,
                user_ip,
                device_info || null
            ],
            (err, result) => {
                if (err) {
                    logError("❌ Insert error:", err);

                    return sendError(res, 500, "Unable to save log to the database.", err.message);
                }

                logInfo(`✅ Log saved to DB with ID ${result.insertId}`);

                res.json({
                    success: true,
                    message: "Log saved successfully",
                    id: result.insertId
                });
            }
        );
    } catch (error) {
        logError("❌ Server error:", error);

        return sendError(res, 500, "Internal server error while saving the log.", error.message);
    }
});

// ================= GET LOGS API =================
app.get("/logs", (req, res) => {
    const sql = "SELECT * FROM logs ORDER BY created_at DESC";

    db.query(sql, (err, results) => {
        if (err) {
            logError("❌ Fetch error:", err);

            return sendError(res, 500, "Failed to fetch logs from the database.", err.message);
        }

        logInfo(`📦 Returned ${results.length} log records`);
        res.json({
            success: true,
            count: results.length,
            data: results
        });
    });
});

// ================= GLOBAL ERROR HANDLER =================
app.use((err, req, res, next) => {
    logError("🔥 Unhandled Error:", err.stack);

    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        return sendError(res, 400, "Invalid JSON payload.");
    }

    return sendError(res, 500, "Something went wrong on the server.", err.message);
});

// ================= START SERVER =================
async function startServer(port = PORT) {
    await verifyDatabaseConnection();

    return new Promise((resolve) => {
        const server = app.listen(port, () => {
            logInfo(`🚀 Server running on http://localhost:${port}`);
            resolve(server);
        });
    });
}

if (require.main === module) {
    startServer().catch((error) => {
        logError("❌ Failed to start server:", error.message);
        process.exit(1);
    });
}

module.exports = {
    app,
    db,
    startServer
};
