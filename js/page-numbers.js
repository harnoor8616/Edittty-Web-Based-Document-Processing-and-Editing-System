const POSITION_HINTS = {
    "top-left": "Top left is selected.",
    "top-center": "Top center is selected.",
    "top-right": "Top right is selected.",
    "bottom-left": "Bottom left is selected.",
    "bottom-center": "Bottom center is selected.",
    "bottom-right": "Bottom right is selected."
};

class PDFPageNumberTool {
    constructor() {
        this.file = null;
        this.pageCount = 0;
        this.position = "bottom-center";
        this.activeMessage = null;
        this.initTheme();
        this.bindEvents();
        this.updatePreview();
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
        document.getElementById("numberBtn").addEventListener("click", () => this.addPageNumbers());

        ["pageRangeInput", "startNumberInput", "fontSizeInput", "marginInput", "prefixInput", "suffixInput"].forEach((id) => {
            document.getElementById(id).addEventListener("input", () => {
                if (id === "pageRangeInput") {
                    this.updateSelectionSummary();
                }
                this.updatePreview();
            });
        });

        ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
            uploadArea.addEventListener(eventName, (event) => this.handleDragEvents(event));
        });

        ["dragenter", "dragover"].forEach((eventName) => {
            document.addEventListener(eventName, (event) => event.preventDefault());
        });

        document.querySelectorAll(".position-card").forEach((card) => {
            card.addEventListener("click", () => this.selectPosition(card.dataset.position));
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
            document.getElementById("lastResult").textContent = "Ready to number";

            this.updateSelectionSummary();
            this.updateUI();
            this.showMessage(`Loaded ${file.name} with ${this.pageCount} page(s).`, "success");
        } catch (error) {
            console.error("Page number load error:", error);
            this.file = null;
            this.pageCount = 0;
            this.updateUI();
            this.showMessage(`Failed to load PDF: ${getReadableErrorMessage(error)}`, "error");
        }
    }

    selectPosition(position) {
        if (!POSITION_HINTS[position]) return;
        this.position = position;
        document.querySelectorAll(".position-card").forEach((card) => {
            card.classList.toggle("active", card.dataset.position === position);
        });
        document.getElementById("positionHint").textContent = POSITION_HINTS[position];
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

    updatePreview() {
        const start = normalizeInteger(document.getElementById("startNumberInput").value, 1);
        const prefix = document.getElementById("prefixInput").value || "";
        const suffix = document.getElementById("suffixInput").value || "";
        document.getElementById("previewText").textContent = `${prefix}${start}${suffix}`;
    }

    updateUI() {
        document.getElementById("numberBtn").disabled = !this.file;
    }

    async addPageNumbers() {
        if (!this.file) {
            this.showMessage("Upload a PDF before adding page numbers.", "error");
            return;
        }

        let pagesToNumber;
        try {
            pagesToNumber = parsePageRange(document.getElementById("pageRangeInput").value, this.pageCount);
        } catch (error) {
            this.showMessage(error.message, "error");
            return;
        }

        const startNumber = normalizeInteger(document.getElementById("startNumberInput").value, 1);
        const fontSize = clampNumber(Number(document.getElementById("fontSizeInput").value), 8, 72, 12);
        const margin = clampNumber(Number(document.getElementById("marginInput").value), 8, 96, 24);
        const prefix = document.getElementById("prefixInput").value || "";
        const suffix = document.getElementById("suffixInput").value || "";

        const numberBtn = document.getElementById("numberBtn");
        const originalHtml = numberBtn.innerHTML;
        numberBtn.disabled = true;
        this.showMessage("Adding page numbers. Please wait...", "info");
        const startTime = performance.now();

        try {
            const pdfDoc = await PDFLib.PDFDocument.load(await this.file.arrayBuffer());
            const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

            pagesToNumber.forEach((pageNumber, index) => {
                const page = pdfDoc.getPage(pageNumber - 1);
                const text = `${prefix}${startNumber + index}${suffix}`;
                const placement = getTextPlacement(page, text, font, fontSize, margin, this.position);

                page.drawText(text, {
                    x: placement.x,
                    y: placement.y,
                    size: fontSize,
                    font,
                    color: PDFLib.rgb(0.15, 0.18, 0.25)
                });
            });

            const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
            const blob = new Blob([pdfBytes], { type: "application/pdf" });
            const outputFileName = buildOutputName(this.file.name);
            downloadBlob(blob, outputFileName);

            const endTime = performance.now();
            document.getElementById("lastResult").textContent = `${pagesToNumber.length} page(s) numbered • ${formatFileSize(blob.size)}`;
            this.showMessage("Page numbers added. Saving activity log...", "success");

            try {
                const result = await logOperation({
                    operation: "PAGE_NUMBERS",
                    input_files: [this.file.name],
                    output_file: outputFileName,
                    total_input_size: Math.round(this.file.size / 1024),
                    output_size: Math.round(blob.size / 1024),
                    processing_time: ((endTime - startTime) / 1000).toFixed(2),
                    status: "SUCCESS",
                    error_message: null,
                    device_info: navigator.userAgent
                });
                this.showMessage(`Page numbers added successfully. Log saved with ID ${result.id}.`, "success");
            } catch (logError) {
                console.error("Page number log save failed:", logError);
                this.showMessage(`Numbering finished, but log was not saved: ${getReadableErrorMessage(logError)}`, "error");
            }
        } catch (error) {
            console.error("Page number error:", error);

            try {
                await logOperation({
                    operation: "PAGE_NUMBERS",
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
                console.error("Failed to save page number error log:", logError);
            }

            this.showMessage(`Adding page numbers failed: ${getReadableErrorMessage(error)}`, "error");
        } finally {
            numberBtn.disabled = false;
            numberBtn.innerHTML = originalHtml;
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
        throw new Error("Enter at least one page number to number.");
    }

    return [...selected].sort((a, b) => a - b);
}

function addPageNumber(selected, page, totalPages) {
    if (!Number.isInteger(page) || page < 1 || page > totalPages) {
        throw new Error(`Page numbers must stay between 1 and ${totalPages}.`);
    }
    selected.add(page);
}

function normalizeInteger(value, fallback) {
    const number = Number(value);
    return Number.isInteger(number) ? number : fallback;
}

function clampNumber(value, min, max, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}

function getTextPlacement(page, text, font, fontSize, margin, position) {
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    const xMap = {
        left: margin,
        center: (pageWidth - textWidth) / 2,
        right: pageWidth - margin - textWidth
    };

    const yMap = {
        top: pageHeight - margin - textHeight,
        bottom: margin
    };

    const [vertical, horizontal] = position.split("-");
    return {
        x: xMap[horizontal],
        y: yMap[vertical]
    };
}

function buildOutputName(fileName) {
    const baseName = fileName.replace(/\.pdf$/i, "") || "document";
    return `${baseName}_numbered.pdf`;
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
    new PDFPageNumberTool();
});
