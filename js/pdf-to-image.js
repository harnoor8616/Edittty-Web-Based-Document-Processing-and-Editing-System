const EXPORT_PROFILES = {
    standard: { scale: 1.25, hint: "Standard is selected. Fastest export with smaller images." },
    high: { scale: 2, hint: "High is selected. Good balance for most PDFs." },
    print: { scale: 3, hint: "Print is selected. Sharpest output with larger files." }
};

class PDFToImageTool {
    constructor() {
        this.file = null;
        this.pdf = null;
        this.pageCount = 0;
        this.format = "png";
        this.quality = 0.88;
        this.resolution = "high";
        this.activeMessage = null;
        this.initTheme();
        this.initPdfJs();
        this.bind();
        this.syncFormatUI();
        this.syncSelectionUI();
    }

    initTheme() {
        if (localStorage.getItem("theme") === "dark") document.documentElement.setAttribute("data-theme", "dark");
        this.syncThemeIcon();
    }

    initPdfJs() {
        if (window.pdfjsLib) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
    }

    bind() {
        const uploadArea = document.getElementById("uploadArea");
        const fileInput = document.getElementById("fileInput");
        const formatSelect = document.getElementById("formatSelect");
        const qualitySlider = document.getElementById("qualitySlider");
        const pageRangeInput = document.getElementById("pageRangeInput");

        document.getElementById("themeToggle").addEventListener("click", () => this.toggleTheme());
        uploadArea.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", (event) => this.loadFile(event.target.files[0]));
        document.getElementById("convertBtn").addEventListener("click", () => this.exportImages());
        formatSelect.addEventListener("change", (event) => {
            this.format = event.target.value;
            this.syncFormatUI();
            this.syncSelectionUI();
        });
        qualitySlider.addEventListener("input", (event) => {
            this.quality = Number(event.target.value) / 100;
            document.getElementById("qualityValue").textContent = `${event.target.value}%`;
        });
        pageRangeInput.addEventListener("input", () => this.syncSelectionUI());

        ["dragenter", "dragover", "dragleave", "drop"].forEach((name) => {
            uploadArea.addEventListener(name, (event) => this.handleDrag(event));
        });
        ["dragenter", "dragover"].forEach((name) => {
            document.addEventListener(name, (event) => event.preventDefault());
        });

        document.querySelectorAll(".resolution-card").forEach((card) => {
            card.addEventListener("click", () => this.setResolution(card.dataset.resolution));
        });
    }

    syncThemeIcon() {
        const icon = document.querySelector("#themeToggle i");
        icon.className = document.documentElement.getAttribute("data-theme") === "dark" ? "fas fa-sun" : "fas fa-moon";
    }

    toggleTheme() {
        const dark = document.documentElement.getAttribute("data-theme") === "dark";
        if (dark) {
            document.documentElement.removeAttribute("data-theme");
            localStorage.setItem("theme", "light");
        } else {
            document.documentElement.setAttribute("data-theme", "dark");
            localStorage.setItem("theme", "dark");
        }
        this.syncThemeIcon();
    }

    handleDrag(event) {
        const area = document.getElementById("uploadArea");
        event.preventDefault();
        event.stopPropagation();
        if (event.type === "dragenter" || event.type === "dragover") area.classList.add("dragover");
        if (event.type === "dragleave") area.classList.remove("dragover");
        if (event.type === "drop") {
            area.classList.remove("dragover");
            this.loadFile(event.dataTransfer.files[0]);
        }
    }

    async loadFile(file) {
        if (!file || (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf")) {
            this.showMessage("Please select a valid PDF file.", "error");
            return;
        }
        if (file.size > 50 * 1024 * 1024) {
            this.showMessage("Please select a PDF smaller than 50MB.", "error");
            return;
        }
        try {
            this.showMessage("Loading PDF...", "info");
            if (this.pdf) await this.pdf.destroy();
            const bytes = await file.arrayBuffer();
            this.pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
            this.file = file;
            this.pageCount = this.pdf.numPages;
            document.getElementById("uploadArea").classList.add("has-file");
            document.getElementById("uploadText").innerHTML = "<strong>PDF loaded successfully</strong>";
            document.getElementById("detailsPanel").style.display = "block";
            document.getElementById("fileName").textContent = file.name;
            document.getElementById("originalSize").textContent = formatSize(file.size);
            document.getElementById("pageCount").textContent = `${this.pageCount} page(s)`;
            document.getElementById("lastResult").textContent = "Ready to export";
            this.syncSelectionUI();
            document.getElementById("convertBtn").disabled = false;
            this.showMessage(`Loaded ${file.name} with ${this.pageCount} page(s).`, "success");
        } catch (error) {
            this.file = null;
            this.pdf = null;
            this.pageCount = 0;
            document.getElementById("convertBtn").disabled = true;
            this.showMessage(`Failed to load PDF: ${readableError(error)}`, "error");
        }
    }

    setResolution(value) {
        if (!EXPORT_PROFILES[value]) return;
        this.resolution = value;
        document.querySelectorAll(".resolution-card").forEach((card) => {
            card.classList.toggle("active", card.dataset.resolution === value);
        });
        document.getElementById("resolutionHint").textContent = EXPORT_PROFILES[value].hint;
    }

    syncFormatUI() {
        const jpg = this.format === "jpg";
        const block = document.getElementById("qualityBlock");
        block.style.opacity = jpg ? "1" : ".55";
        block.style.pointerEvents = jpg ? "auto" : "none";
    }

    syncSelectionUI() {
        const summary = document.getElementById("pageSelectionSummary");
        const downloadSummary = document.getElementById("downloadSummary");
        const downloadHint = document.getElementById("downloadHint");
        if (!this.pageCount) {
            summary.textContent = "All pages";
            return;
        }
        try {
            const pages = parseRange(document.getElementById("pageRangeInput").value, this.pageCount);
            summary.textContent = pages.length === this.pageCount ? "All pages" : `${pages.length} page(s) selected`;
            downloadSummary.textContent = pages.length === 1 ? `One ${this.format.toUpperCase()} image` : `${pages.length} ${this.format.toUpperCase()} images`;
            downloadHint.textContent = pages.length === 1 ? "Your export will download as a single image file." : "Your export will download as one ZIP archive.";
        } catch (error) {
            summary.textContent = "Invalid range";
            downloadSummary.textContent = "Fix range to export";
            downloadHint.textContent = error.message;
        }
    }

    async exportImages() {
        if (!this.pdf || !this.file) {
            this.showMessage("Upload a PDF before exporting images.", "error");
            return;
        }
        let pages;
        try {
            pages = parseRange(document.getElementById("pageRangeInput").value, this.pageCount);
        } catch (error) {
            this.showMessage(error.message, "error");
            return;
        }

        const button = document.getElementById("convertBtn");
        const original = button.innerHTML;
        const base = this.file.name.replace(/\.pdf$/i, "") || "pdf-export";
        const ext = this.format === "png" ? "png" : "jpg";
        const type = this.format === "png" ? "image/png" : "image/jpeg";
        const started = performance.now();
        button.disabled = true;

        try {
            let outputBlob;
            let outputName;
            if (pages.length === 1) {
                button.textContent = `Rendering page ${pages[0]}...`;
                outputBlob = await this.renderPage(pages[0], type);
                outputName = `${base}_page_${pages[0]}.${ext}`;
                downloadBlob(outputBlob, outputName);
            } else {
                const zip = new JSZip();
                for (let i = 0; i < pages.length; i += 1) {
                    button.textContent = `Rendering ${i + 1}/${pages.length}...`;
                    const blob = await this.renderPage(pages[i], type);
                    zip.file(`${base}_page_${pages[i]}.${ext}`, blob);
                }
                outputName = `${base}_${ext}_images.zip`;
                outputBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }, (meta) => {
                    button.textContent = `Packing ZIP ${Math.round(meta.percent)}%...`;
                });
                downloadBlob(outputBlob, outputName);
            }

            const elapsed = ((performance.now() - started) / 1000).toFixed(2);
            document.getElementById("lastResult").textContent = `${pages.length} page(s) as ${this.format.toUpperCase()} (${formatSize(outputBlob.size)})`;
            this.showMessage(`Export complete. Downloaded ${pages.length} page(s).`, "success");
            try {
                const result = await logOperation({
                    operation: "PDF_TO_IMAGE",
                    input_files: [this.file.name],
                    output_file: outputName,
                    total_input_size: Math.round(this.file.size / 1024),
                    output_size: Math.round(outputBlob.size / 1024),
                    processing_time: elapsed,
                    status: "SUCCESS",
                    error_message: null,
                    device_info: navigator.userAgent
                });
                this.showMessage(`Export complete. Log saved with ID ${result.id}.`, "success");
            } catch (logError) {
                this.showMessage(`Export finished, but log was not saved: ${readableError(logError)}`, "error");
            }
        } catch (error) {
            try {
                await logOperation({
                    operation: "PDF_TO_IMAGE",
                    input_files: this.file ? [this.file.name] : [],
                    output_file: null,
                    total_input_size: this.file ? Math.round(this.file.size / 1024) : 0,
                    output_size: 0,
                    processing_time: 0,
                    status: "FAILED",
                    error_message: error.message,
                    device_info: navigator.userAgent
                });
            } catch (_) {}
            this.showMessage(`Export failed: ${readableError(error)}`, "error");
        } finally {
            button.disabled = false;
            button.innerHTML = original;
        }
    }

    async renderPage(pageNumber, mimeType) {
        const page = await this.pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: EXPORT_PROFILES[this.resolution].scale });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: false });
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;
        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not generate the image file.")), mimeType, mimeType === "image/jpeg" ? this.quality : undefined);
        });
        page.cleanup();
        canvas.width = 0;
        canvas.height = 0;
        return blob;
    }

    showMessage(message, type) {
        const container = document.getElementById("messagesContainer");
        if (this.activeMessage) this.activeMessage.remove();
        const div = document.createElement("div");
        div.className = `msg ${type}`;
        div.innerHTML = `<i class="fas fa-${type === "success" ? "check-circle" : type === "info" ? "info-circle" : "exclamation-circle"}"></i> ${message}`;
        container.appendChild(div);
        this.activeMessage = div;
    }
}

function parseRange(input, total) {
    const raw = input.trim();
    if (!raw) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = new Set();
    for (const part of raw.split(",")) {
        const token = part.trim().replace(/\s+/g, "");
        if (!token) continue;
        if (/^\d+$/.test(token)) {
            addPage(pages, Number(token), total);
            continue;
        }
        const match = token.match(/^(\d+)-(\d+)$/);
        if (!match) throw new Error("Use page numbers like 1,3,5 or ranges like 2-6.");
        const start = Number(match[1]);
        const end = Number(match[2]);
        if (start > end) throw new Error("Page ranges must go from smaller to larger numbers.");
        for (let page = start; page <= end; page += 1) addPage(pages, page, total);
    }
    if (!pages.size) throw new Error("Enter at least one page number to export.");
    return [...pages].sort((a, b) => a - b);
}

function addPage(set, page, total) {
    if (!Number.isInteger(page) || page < 1 || page > total) throw new Error(`Page numbers must stay between 1 and ${total}.`);
    set.add(page);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function apiCandidates() {
    const list = [];
    if (window.location.protocol === "http:" || window.location.protocol === "https:") list.push(window.location.origin);
    list.push("http://127.0.0.1:3000", "http://localhost:3000");
    return [...new Set(list)];
}

async function logOperation(payload) {
    const errors = [];
    for (const baseUrl of apiCandidates()) {
        try {
            const response = await fetch(`${baseUrl}/log`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
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

function readableError(error) {
    if (!error) return "Unknown error.";
    if (error.name === "TypeError") return "Could not reach the server. Make sure the backend is running on port 3000.";
    return error.message || "Unexpected error.";
}

document.addEventListener("DOMContentLoaded", () => new PDFToImageTool());
