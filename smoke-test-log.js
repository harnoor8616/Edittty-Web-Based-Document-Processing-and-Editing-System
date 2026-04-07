require("dotenv").config({ quiet: true });

const { startServer, db } = require("./server");

async function run() {
    const server = await startServer(3001);

    try {
        const response = await fetch("http://127.0.0.1:3001/log", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                operation: "MERGE",
                input_files: ["test-a.pdf", "test-b.pdf"],
                output_file: "merged.pdf",
                total_input_size: 12,
                output_size: 10,
                processing_time: 0.42,
                status: "SUCCESS",
                error_message: null,
                device_info: "smoke-test"
            })
        });

        const result = await response.json();
        console.log("SMOKE_TEST_RESULT", JSON.stringify({ status: response.status, result }, null, 2));
    } finally {
        await new Promise((resolve) => server.close(resolve));
        db.end();
    }
}

run().catch((error) => {
    console.error("SMOKE_TEST_FAILED", error);
    process.exit(1);
});
