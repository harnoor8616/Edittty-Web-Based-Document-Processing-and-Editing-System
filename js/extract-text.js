class PDFTextExtractor {
    constructor() {
        this.file = null;
        this.pageCount = 0;
        this.outputText = "";
        this.activeMessage = null;
        this.initTheme();
        this.initPdfJs();
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

    initPdfJs() {
        if (window.pdfjsLib) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
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
        document.getElementById("extractBtn").addEventListener("click", () => this.extractText());
        document.getElementById("copyBtn").addEventListener("click", () => this.copyText());
        document.getElementById("downloadBtn").addEventListener("click", () => this.downloadText());

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

        if (!window.pdfjsLib) {
            this.showMessage("PDF text library failed to load. Refresh and try again.", "error");
            return;
        }

        try {
            const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
            this.file = file;
            this.pageCount = pdf.numPages;
            await pdf.destroy();

            document.getElementById("uploadArea").classList.add("has-file");
            document.getElementById("uploadText").innerHTML = "<strong>PDF loaded successfully</strong>";
            document.getElementById("detailsPanel").style.display = "block";
            document.getElementById("fileName").textContent = file.name;
            document.getElementById("originalSize").textContent = formatFileSize(file.size);
            document.getElementById("pageCount").textContent = `${this.pageCount} page(s)`;
            document.getElementById("lastResult").textContent = "Ready to extract";
            document.getElementById("fileNameInput").placeholder = buildOutputName(file.name);

            this.outputText = "";
            document.getElementById("resultsSection").style.display = "none";
            document.getElementById("outputBox").value = "";
            this.updateSelectionSummary();
            this.updateUI();
            this.showMessage(`Loaded ${file.name} with ${this.pageCount} page(s).`, "success");
        } catch (error) {
            console.error("Extract text load error:", error);
            this.file = null;
            this.pageCount = 0;
            this.updateUI();
            this.showMessage(`Failed to load PDF: ${getReadableErrorMessage(error)}`, "error");
        }
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
        const hasFile = Boolean(this.file);
        const hasOutput = Boolean(this.outputText);
        document.getElementById("extractBtn").disabled = !hasFile;
        document.getElementById("copyBtn").disabled = !hasOutput;
        document.getElementById("downloadBtn").disabled = !hasOutput;
    }

    async extractText() {
        if (!this.file) {
            this.showMessage("Upload a PDF before extracting text.", "error");
            return;
        }

        let pagesToExtract;
        try {
            pagesToExtract = parsePageRange(document.getElementById("pageRangeInput").value, this.pageCount);
        } catch (error) {
            this.showMessage(error.message, "error");
            return;
        }

        const includePageLabels = document.getElementById("includePageLabels").checked;
        const preserveBreaks = document.getElementById("preserveBreaks").checked;
        const extractBtn = document.getElementById("extractBtn");
        const originalHtml = extractBtn.innerHTML;
        extractBtn.disabled = true;
        this.showMessage("Extracting text from your PDF. Please wait...", "info");
        const startTime = performance.now();

        try {
            const pdf = await pdfjsLib.getDocument({ data: await this.file.arrayBuffer() }).promise;
            const parts = [];

            for (let index = 0; index < pagesToExtract.length; index += 1) {
                const pageNumber = pagesToExtract[index];
                extractBtn.innerHTML = `<i class="fas fa-file-lines"></i> Extracting ${index + 1}/${pagesToExtract.length}`;
                const page = await pdf.getPage(pageNumber);
                const content = await page.getTextContent();
                const pageText = buildPageText(content.items, preserveBreaks);

                if (includePageLabels) {
                    parts.push(`Page ${pageNumber}`);
                    parts.push(pageText || "[No selectable text found]");
                } else if (pageText) {
                    parts.push(pageText);
                }

                if (index < pagesToExtract.length - 1) {
                    parts.push("");
                }
            }

            await pdf.destroy();

            this.outputText = parts.join("\n").trim();
            document.getElementById("outputBox").value = this.outputText || "[No selectable text found in the selected pages]";
            document.getElementById("resultsSection").style.display = "block";
            this.updateUI();

            const outputFileName = normalizeOutputName(
                document.getElementById("fileNameInput").value,
                buildOutputName(this.file.name)
            );
            const textSize = new Blob([this.outputText], { type: "text/plain;charset=utf-8" }).size;
            const endTime = performance.now();
            document.getElementById("lastResult").textContent = `${pagesToExtract.length} page(s) extracted • ${formatFileSize(textSize)}`;
            this.showMessage("Text extracted successfully. Saving activity log...", "success");

            try {
                const result = await logOperation({
                    operation: "EXTRACT_TEXT",
                    input_files: [this.file.name],
                    output_file: outputFileName,
                    total_input_size: Math.round(this.file.size / 1024),
                    output_size: Math.round(textSize / 1024),
                    processing_time: ((endTime - startTime) / 1000).toFixed(2),
                    status: "SUCCESS",
                    error_message: null,
                    device_info: navigator.userAgent
                });
                this.showMessage(`Text extracted successfully. Log saved with ID ${result.id}.`, "success");
            } catch (logError) {
                console.error("Extract text log save failed:", logError);
                this.showMessage(`Extraction finished, but log was not saved: ${getReadableErrorMessage(logError)}`, "error");
            }
        } catch (error) {
            console.error("Extract text error:", error);

            try {
                await logOperation({
                    operation: "EXTRACT_TEXT",
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
                console.error("Failed to save extract text error log:", logError);
            }

            this.showMessage(`Text extraction failed: ${getReadableErrorMessage(error)}`, "error");
        } finally {
            extractBtn.disabled = false;
            extractBtn.innerHTML = originalHtml;
        }
    }

    async copyText() {
        if (!this.outputText) return;

        try {
            await navigator.clipboard.writeText(this.outputText);
            this.showMessage("Extracted text copied to clipboard.", "success");
        } catch (error) {
            this.showMessage("Could not copy the extracted text.", "error");
        }
    }

    downloadText() {
        if (!this.outputText) return;
        const fileName = normalizeOutputName(
            document.getElementById("fileNameInput").value,
            buildOutputName(this.file?.name || "document.pdf")
        );
        downloadTextFile(this.outputText, fileName);
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
        throw new Error("Enter at least one page number to extract.");
    }

    return [...selected].sort((a, b) => a - b);
}

function addPageNumber(selected, page, totalPages) {
    if (!Number.isInteger(page) || page < 1 || page > totalPages) {
        throw new Error(`Page numbers must stay between 1 and ${totalPages}.`);
    }
    selected.add(page);
}

function buildPageText(items, preserveBreaks) {
    const tokens = items
        .filter((item) => typeof item.str === "string" && item.str.trim())
        .map((item) => ({
            text: item.str,
            x: item.transform?.[4] || 0,
            y: item.transform?.[5] || 0,
            width: item.width || 0
        }));

    if (!tokens.length) {
        return "";
    }

    if (!preserveBreaks) {
        return tokens.map((token) => token.text).join(" ").replace(/\s+/g, " ").trim();
    }

    tokens.sort((a, b) => {
        if (Math.abs(b.y - a.y) > 3) return b.y - a.y;
        return a.x - b.x;
    });

    const lines = [];

    for (const token of tokens) {
        const currentLine = lines[lines.length - 1];
        if (!currentLine || Math.abs(currentLine.y - token.y) > 3) {
            lines.push({ y: token.y, tokens: [token] });
        } else {
            currentLine.tokens.push(token);
        }
    }

    return lines.map((line) => {
        line.tokens.sort((a, b) => a.x - b.x);
        let text = "";
        let lastEnd = null;

        for (const token of line.tokens) {
            if (text) {
                const gap = lastEnd === null ? 0 : token.x - lastEnd;
                if (gap > 2) {
                    text += " ";
                }
            }
            text += token.text;
            lastEnd = token.x + token.width;
        }

        return text.replace(/\s+/g, " ").trim();
    }).filter(Boolean).join("\n");
}

function buildOutputName(fileName) {
    const baseName = fileName.replace(/\.pdf$/i, "") || "document";
    return `${baseName}_text.txt`;
}

function normalizeOutputName(value, fallback) {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    return trimmed.toLowerCase().endsWith(".txt") ? trimmed : `${trimmed}.txt`;
}

function downloadTextFile(text, filename) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
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
    new PDFTextExtractor();
});
