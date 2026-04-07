class PDFProtector {
    constructor() {
        this.file = null;
        this.pageCount = 0;
        this.activeMessage = null;
        this.pdfLibReady = null;
        this.initTheme();
        this.bindEvents();
        this.updateUI();
    }

    initTheme() {
        const savedTheme = localStorage.getItem("theme");
        if (savedTheme === "dark") {
            document.documentElement.setAttribute("data-theme", "dark");
        }
        this.updateThemeIcon();
    }

    updateThemeIcon() {
        const icon = document.querySelector("#themeToggle i");
        if (!icon) return;
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        icon.className = isDark ? "fas fa-sun" : "fas fa-moon";
    }

    toggleTheme() {
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        if (isDark) {
            document.documentElement.removeAttribute("data-theme");
            localStorage.setItem("theme", "light");
        } else {
            document.documentElement.setAttribute("data-theme", "dark");
            localStorage.setItem("theme", "dark");
        }
        this.updateThemeIcon();
    }

    bindEvents() {
        const uploadArea = document.getElementById("uploadArea");
        const fileInput = document.getElementById("fileInput");

        document.getElementById("themeToggle").addEventListener("click", () => this.toggleTheme());
        uploadArea.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", (event) => {
            this.handleFile(event.target.files[0]);
            event.target.value = "";
        });
        document.getElementById("protectBtn").addEventListener("click", () => this.protectPDF());
        ["passwordInput", "confirmPasswordInput"].forEach((id) => {
            document.getElementById(id).addEventListener("input", () => this.updateUI());
        });

        ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
            uploadArea.addEventListener(eventName, (event) => this.handleDragEvents(event));
        });

        ["dragenter", "dragover"].forEach((eventName) => {
            document.addEventListener(eventName, (event) => event.preventDefault());
        });
    }

    handleDragEvents(event) {
        const uploadArea = document.getElementById("uploadArea");
        event.preventDefault();
        event.stopPropagation();

        if (event.type === "dragenter" || event.type === "dragover") {
            uploadArea.classList.add("dragover");
        } else if (event.type === "dragleave") {
            uploadArea.classList.remove("dragover");
        } else if (event.type === "drop") {
            uploadArea.classList.remove("dragover");
            this.handleFile(event.dataTransfer.files[0]);
        }
    }

    async handleFile(file) {
        if (!file || (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf")) {
            this.showMessage("Please select a valid PDF file.", "error");
            return;
        }

        if (file.size > 50 * 1024 * 1024) {
            this.showMessage("Please select a PDF smaller than 50MB.", "error");
            return;
        }

        try {
            const pdfDoc = await PDFLib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
            this.file = file;
            this.pageCount = pdfDoc.getPageCount();

            document.getElementById("uploadArea").classList.add("has-file");
            document.getElementById("uploadText").innerHTML = "<strong>PDF loaded successfully</strong>";
            document.getElementById("detailsPanel").style.display = "block";
            document.getElementById("fileName").textContent = file.name;
            document.getElementById("originalSize").textContent = formatFileSize(file.size);
            document.getElementById("pageCount").textContent = `${this.pageCount} page(s)`;
            document.getElementById("lastResult").textContent = "Ready to protect";
            document.getElementById("outputNameInput").placeholder = buildOutputName(file.name);

            this.updateUI();
            this.showMessage(`Loaded ${file.name} with ${this.pageCount} page(s).`, "success");
        } catch (error) {
            console.error("Protect load error:", error);
            this.file = null;
            this.pageCount = 0;
            this.updateUI();
            this.showMessage(`Failed to load PDF: ${getReadableErrorMessage(error)}`, "error");
        }
    }

    updateUI() {
        const password = document.getElementById("passwordInput").value;
        const confirmPassword = document.getElementById("confirmPasswordInput").value;
        document.getElementById("protectBtn").disabled = !this.file || !password || !confirmPassword;
    }

    async protectPDF() {
        if (!this.file) {
            this.showMessage("Upload a PDF before protecting it.", "error");
            return;
        }

        const password = document.getElementById("passwordInput").value;
        const confirmPassword = document.getElementById("confirmPasswordInput").value;

        if (password.length < 4) {
            this.showMessage("Password must be at least 4 characters long.", "error");
            return;
        }

        if (password !== confirmPassword) {
            this.showMessage("Password and confirmation do not match.", "error");
            return;
        }

        const protectBtn = document.getElementById("protectBtn");
        const originalHtml = protectBtn.innerHTML;
        protectBtn.disabled = true;
        this.showMessage("Protecting your PDF. Please wait...", "info");
        const startTime = performance.now();

        try {
            const outputFileName = normalizeOutputName(
                document.getElementById("outputNameInput").value,
                buildOutputName(this.file.name)
            );
            const protectedBlob = await this.protectInBrowser(password);
            downloadBlob(protectedBlob, outputFileName);

            const endTime = performance.now();
            document.getElementById("lastResult").textContent = `Protected PDF • ${formatFileSize(protectedBlob.size)}`;
            this.showMessage("PDF protected successfully. Saving activity log...", "success");

            try {
                const result = await logOperation({
                    operation: "PROTECT",
                    input_files: [this.file.name],
                    output_file: outputFileName,
                    total_input_size: Math.round(this.file.size / 1024),
                    output_size: Math.round(protectedBlob.size / 1024),
                    processing_time: ((endTime - startTime) / 1000).toFixed(2),
                    status: "SUCCESS",
                    error_message: null,
                    device_info: navigator.userAgent
                });
                this.showMessage(`Protection successful. Log saved with ID ${result.id}.`, "success");
            } catch (logError) {
                console.error("Protect log save failed:", logError);
                this.showMessage(`Protection finished, but log was not saved: ${getReadableErrorMessage(logError)}`, "error");
            }
        } catch (error) {
            console.error("Protect error:", error);

            try {
                await logOperation({
                    operation: "PROTECT",
                    input_files: this.file ? [this.file.name] : [],
                    output_file: null,
                    total_input_size: this.file ? Math.round(this.file.size / 1024) : 0,
                    output_size: 0,
                    processing_time: 0,
                    status: "FAILED",
                    error_message: error.message,
                    device_info: navigator.userAgent
                });
            } catch (logError) {
                console.error("Failed to save protect error log:", logError);
            }

            this.showMessage(`PDF protection failed: ${getReadableErrorMessage(error)}`, "error");
        } finally {
            protectBtn.disabled = false;
            protectBtn.innerHTML = originalHtml;
        }
    }

    showMessage(message, type = "success") {
        const container = document.getElementById("messagesContainer");
        if (this.activeMessage) {
            this.activeMessage.remove();
        }

        const div = document.createElement("div");
        const icon = type === "success" ? "check-circle" : type === "info" ? "info-circle" : "exclamation-circle";
        div.className = `message ${type}`;
        div.innerHTML = `<i class="fas fa-${icon}"></i> ${message}`;
        container.appendChild(div);
        this.activeMessage = div;

        if (type !== "info") {
            setTimeout(() => {
                if (this.activeMessage === div) {
                    div.remove();
                    this.activeMessage = null;
                }
            }, 5000);
        }
    }

    async ensurePdfLib() {
        if (this.pdfLibReady) {
            return this.pdfLibReady;
        }

        this.pdfLibReady = (async () => {
            if (window.PDFLib?.PDFDocument?.prototype?.encrypt) {
                return window.PDFLib;
            }

            const sources = [
                "/node_modules/pdf-lib-plus-encrypt/dist/pdf-lib-plus-encrypt.iife.js",
                "/node_modules/pdf-lib-plus-encrypt/dist/pdf-lib-plus-encrypt.min.js"
            ];
            let lastError = null;

            for (const source of sources) {
                try {
                    await loadScript(source);
                    if (window.PDFLib?.PDFDocument?.prototype?.encrypt) {
                        return window.PDFLib;
                    }
                } catch (error) {
                    lastError = error;
                }
            }

            throw new Error(lastError?.message || "Could not load the PDF protection library.");
        })();

        return this.pdfLibReady;
    }

    async protectInBrowser(password) {
        const PDFLibWithEncrypt = await this.ensurePdfLib();
        const pdfDoc = await PDFLibWithEncrypt.PDFDocument.load(await this.file.arrayBuffer(), { ignoreEncryption: true });

        if (typeof pdfDoc.encrypt !== "function") {
            throw new Error("Protect PDF library loaded, but encryption support is unavailable.");
        }

        pdfDoc.encrypt({
            userPassword: password,
            ownerPassword: password,
            permissions: {
                printing: "highResolution",
                modifying: true,
                copying: true,
                annotating: true,
                fillingForms: true,
                contentAccessibility: true,
                documentAssembly: true
            }
        });

        const protectedBytes = await pdfDoc.save({ useObjectStreams: false });
        return new Blob([protectedBytes], { type: "application/pdf" });
    }
}

function buildOutputName(fileName) {
    const baseName = fileName.replace(/\.pdf$/i, "") || "document";
    return `${baseName}_protected.pdf`;
}

function normalizeOutputName(value, fallback) {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    return trimmed.toLowerCase().endsWith(".pdf") ? trimmed : `${trimmed}.pdf`;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-protect-src="${src}"]`);
        if (existing) {
            if (existing.dataset.loaded === "true") {
                resolve();
                return;
            }

            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
            return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.dataset.protectSrc = src;
        script.addEventListener("load", () => {
            script.dataset.loaded = "true";
            resolve();
        }, { once: true });
        script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
        document.head.appendChild(script);
    });
}

async function logOperation(data) {
    const errors = [];
    for (const baseUrl of getApiCandidates()) {
        try {
            const response = await fetch(`${baseUrl}/log`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });

            const result = await response.json().catch(() => null);
            if (!response.ok) {
                errors.push(`${baseUrl}/log -> ${result?.message || result?.error || response.status}`);
                continue;
            }

            return result;
        } catch (error) {
            errors.push(`${baseUrl}/log -> ${error.message}`);
        }
    }

    throw new Error(errors.join(" | "));
}

function getReadableErrorMessage(error) {
    if (!error) return "Unknown error.";
    return error.message || "Unexpected error.";
}

function getApiCandidates() {
    const candidates = [];
    const isHttp = window.location.protocol === "http:" || window.location.protocol === "https:";

    if (isHttp && window.location.port === "3000") {
        candidates.push(window.location.origin);
    }

    candidates.push("http://127.0.0.1:3000");
    candidates.push("http://localhost:3000");

    return [...new Set(candidates)];
}

document.addEventListener("DOMContentLoaded", () => {
    new PDFProtector();
});
