const { execFile, exec } = require("child_process");

function testExecFile() {
    return new Promise((resolve) => {
        try {
            execFile(
                "C:\\Users\\DC\\AppData\\Local\\Programs\\Python\\Python314\\python.exe",
                ["--version"],
                { windowsHide: true },
                (error, stdout, stderr) => {
                    resolve({
                        method: "execFile",
                        error: error ? error.message : null,
                        stdout: stdout.trim(),
                        stderr: stderr.trim()
                    });
                }
            );
        } catch (error) {
            resolve({
                method: "execFile",
                error: error.message,
                stdout: "",
                stderr: ""
            });
        }
    });
}

function testExec() {
    return new Promise((resolve) => {
        exec(
            "\"C:\\Users\\DC\\AppData\\Local\\Programs\\Python\\Python314\\python.exe\" --version",
            { windowsHide: true },
            (error, stdout, stderr) => {
                resolve({
                    method: "exec",
                    error: error ? error.message : null,
                    stdout: stdout.trim(),
                    stderr: stderr.trim()
                });
            }
        );
    });
}

async function main() {
    console.log(JSON.stringify(await testExecFile(), null, 2));
    console.log(JSON.stringify(await testExec(), null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
