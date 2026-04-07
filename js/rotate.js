const ROTATION_OPTIONS = {
    90: "Rotate clockwise 90 degrees is selected.",
    180: "Rotate 180 degrees is selected.",
    270: "Rotate counterclockwise 90 degrees is selected."
};

class PDFRotator {
    constructor() {
        this.file = null;
        this.pageCount = 0;
        this.rotation = 90;
        this.activeMessage = null;
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
        document.getElementById("pageRangeInput").addEventListener("input", () => this.updateSelectionSummary());
        document.getElementById("rotateBtn").addEventListener("click", () => this.rotatePDF());

        ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
            uploadArea.addEventListener(eventName, (event) => this.handleDragEvents(event));
        });

        ["dragenter", "dragover"].forEach((eventName) => {
            document.addEventListener(eventName, (event) => event.preventDefault());
        });

        document.querySelectorAll(".angle-card").forEach((card) => {
            card.addEventListener("click", () => this.selectRotation(Number(card.dataset.angle)));
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
            const pdfDoc = await PDFLib.PDFDocument.load(await file.arrayBuffer());
            this.file = file;
            this.pageCount = pdfDoc.getPageCount();

            document.getElementById("uploadArea").classList.add("has-file");
            document.getElementById("uploadText").innerHTML = "<strong>PDF loaded successfully</strong>";
            document.getElementById("detailsPanel").style.display = "block";
            document.getElementById("fileName").textContent = file.name;
            document.getElementById("originalSize").textContent = formatFileSize(file.size);
            document.getElementById("pageCount").textContent = `${this.pageCount} page(s)`;
            document.getElementById("lastResult").textContent = "Ready to rotate";
            document.getElementById("outputNameInput").placeholder = buildOutputName(file.name);

            this.updateSelectionSummary();
            this.updateUI();
            this.showMessage(`Loaded ${file.name} with ${this.pageCount} page(s).`, "success");
        } catch (error) {
            console.error("Rotate load error:", error);
            this.file = null;
            this.pageCount = 0;
            this.updateUI();
            this.showMessage(`Failed to load PDF: ${getReadableErrorMessage(error)}`, "error");
        }
    }

    selectRotation(angle) {
        if (!ROTATION_OPTIONS[angle]) return;
        this.rotation = angle;
        document.querySelectorAll(".angle-card").forEach((card) => {
            card.classList.toggle("active", Number(card.dataset.angle) === angle);
        });
        document.getElementById("angleHint").textContent = ROTATION_OPTIONS[angle];
    }

    updateSelectionSummary() {
        const summary = document.getElementById("pageSelectionSummary");
        if (!this.pageCount) {
            summary.textContent = "All pages";
            return;
        }

        try {
            const pages = parsePageRange(document.getElementById("pageRangeInput").value, this.pageCount);
            summary.textContent = pages.length === this.pageCount ? "All pages" : `${pages.length} page(s) selected`;
        } catch (error) {
            summary.textContent = error.message;
        }
    }

    updateUI() {
        document.getElementById("rotateBtn").disabled = !this.file;
    }

    async rotatePDF() {
        if (!this.file) {
            this.showMessage("Upload a PDF before rotating.", "error");
            return;
        }

        let pagesToRotate;
        try {
            pagesToRotate = parsePageRange(document.getElementById("pageRangeInput").value, this.pageCount);
        } catch (error) {
            this.showMessage(error.message, "error");
            return;
        }

        const rotateBtn = document.getElementById("rotateBtn");
        const originalHtml = rotateBtn.innerHTML;
        rotateBtn.disabled = true;
        this.showMessage("Applying page rotation. Please wait...", "info");
        const startTime = performance.now();

        try {
            const pdfDoc = await PDFLib.PDFDocument.load(await this.file.arrayBuffer());

            for (const pageNumber of pagesToRotate) {
                const page = pdfDoc.getPage(pageNumber - 1);
                const currentAngle = page.getRotation().angle || 0;
                page.setRotation(PDFLib.degrees((currentAngle + this.rotation) % 360));
            }

            const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
            const blob = new Blob([pdfBytes], { type: "application/pdf" });
            const outputFileName = normalizeOutputName(
                document.getElementById("outputNameInput").value,
                buildOutputName(this.file.name)
            );

            downloadBlob(blob, outputFileName);

            const endTime = performance.now();
            document.getElementById("lastResult").textContent = `${pagesToRotate.length} page(s) rotated • ${formatFileSize(blob.size)}`;
            this.showMessage("Rotation complete. Saving activity log...", "success");

            try {
                const result = await logOperation({
                    operation: "ROTATE",
                    input_files: [this.file.name],
                    output_file: outputFileName,
                    total_input_size: Math.round(this.file.size / 1024),
                    output_size: Math.round(blob.size / 1024),
                    processing_time: ((endTime - startTime) / 1000).toFixed(2),
                    status: "SUCCESS",
                    error_message: null,
                    device_info: navigator.userAgent
                });
                this.showMessage(`Rotation successful. Log saved with ID ${result.id}.`, "success");
            } catch (logError) {
                console.error("Rotate log save failed:", logError);
                this.showMessage(`Rotation finished, but log was not saved: ${getReadableErrorMessage(logError)}`, "error");
            }
        } catch (error) {
            console.error("Rotate error:", error);

            try {
                await logOperation({
                    operation: "ROTATE",
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
                console.error("Failed to save rotate error log:", logError);
            }

            this.showMessage(`Rotation failed: ${getReadableErrorMessage(error)}`, "error");
        } finally {
            rotateBtn.disabled = false;
            rotateBtn.innerHTML = originalHtml;
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
}

function parsePageRange(input, totalPages) {
    const trimmed = input.trim();
    if (!trimmed) {
        return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const selected = new Set();

    for (const token of trimmed.split(",")) {
        const normalized = token.trim().replace(/\s+/g, "");
        if (!normalized) continue;

        if (/^\d+$/.test(normalized)) {
            addPageNumber(selected, Number(normalized), totalPages);
            continue;
        }

        const rangeMatch = normalized.match(/^(\d+)-(\d+)$/);
        if (!rangeMatch) {
            throw new Error("Use page numbers like 1,3,5 or ranges like 2-6.");
        }

        const start = Number(rangeMatch[1]);
        const end = Number(rangeMatch[2]);
        if (start > end) {
            throw new Error("Page ranges must go from smaller to larger numbers.");
        }

        for (let page = start; page <= end; page += 1) {
            addPageNumber(selected, page, totalPages);
        }
    }

    if (!selected.size) {
        throw new Error("Enter at least one page number to rotate.");
    }

    return [...selected].sort((a, b) => a - b);
}

function addPageNumber(selected, page, totalPages) {
    if (!Number.isInteger(page) || page < 1 || page > totalPages) {
        throw new Error(`Page numbers must stay between 1 and ${totalPages}.`);
    }
    selected.add(page);
}

function buildOutputName(fileName) {
    const baseName = fileName.replace(/\.pdf$/i, "") || "document";
    return `${baseName}_rotated.pdf`;
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

function getApiCandidates() {
    const candidates = [];
    const isHttp = window.location.protocol === "http:" || window.location.protocol === "https:";
    if (isHttp) candidates.push(window.location.origin);
    candidates.push("http://127.0.0.1:3000");
    candidates.push("http://localhost:3000");
    return [...new Set(candidates)];
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
    if (error.name === "TypeError") {
        return "Could not reach the server. Make sure the backend is running on port 3000.";
    }
    return error.message || "Unexpected error.";
}

document.addEventListener("DOMContentLoaded", () => {
    new PDFRotator();
});
