const fs = require("fs/promises");

async function main() {
    const body = await fs.readFile("03-LineAlgorithms.pdf");
    const response = await fetch("http://127.0.0.1:3000/api/protect-pdf?password=test1234", {
        method: "POST",
        headers: {
            "Content-Type": "application/pdf"
        },
        body
    });

    const contentType = response.headers.get("content-type") || "";
    const text = contentType.includes("application/json")
        ? JSON.stringify(await response.json())
        : await response.text();

    console.log("status:", response.status);
    console.log("body:", text);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
