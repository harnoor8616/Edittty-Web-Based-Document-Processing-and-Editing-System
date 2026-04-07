const COMPRESSION_PROFILES = {
    light: {
        scale: 1.55,
        quality: 0.88,
        hint: "Light compression is selected. Best when you want to preserve more detail."
    },
    balanced: {
        scale: 1.2,
        quality: 0.7,
        hint: "Balanced compression is selected. Good default for most PDFs."
    },
    strong: {
        scale: 0.95,
        quality: 0.52,
        hint: "Strong compression is selected. Best for smaller files with more visible quality tradeoff."
    }
};

class PDFCompressor {
    constructor() {
        this.pdfFile = null;
        this.pageCount = 0;
        this.profile = "balanced";
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
        const compressBtn = document.getElementById("compressBtn");
        const themeToggle = document.getElementById("themeToggle");

        themeToggle.addEventListener("click", () => this.toggleTheme());
        fileInput.addEventListener("change", (event) => this.handleFile(event.target.files[0]));
        uploadArea.addEventListener("click", () => fileInput.click());
        compressBtn.addEventListener("click", () => this.compressPDF());

        ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
            uploadArea.addEventListener(eventName, (event) => this.handleDragEvents(event));
        });

        ["dragenter", "dragover"].forEach((eventName) => {
            document.addEventListener(eventName, (event) => event.preventDefault());
        });

        document.querySelectorAll(".profile-card").forEach((profileCard) => {
            profileCard.addEventListener("click", () => this.selectProfile(profileCard.dataset.profile));
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

    selectProfile(profile) {
        if (!COMPRESSION_PROFILES[profile]) return;
        this.profile = profile;
        document.querySelectorAll(".profile-card").forEach((card) => {
            card.classList.toggle("active", card.dataset.profile === profile);
        });
        document.getElementById("profileHint").textContent = COMPRESSION_PROFILES[profile].hint;
    }

    async handleFile(file) {
        if (!file || file.type !== "application/pdf") {
            this.showMessage("Please select a valid PDF file.", "error");
            return;
        }

        if (file.size > 50 * 1024 * 1024) {
            this.showMessage("Please select a PDF smaller than 50MB.", "error");
            return;
        }

        if (!window.pdfjsLib) {
            this.showMessage("Compression library failed to load. Refresh the page and try again.", "error");
            return;
        }

        try {
            this.showMessage("Loading PDF...", "info");
            const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;

            this.pdfFile = file;
            this.pageCount = pdf.numPages;

            document.getElementById("uploadArea").classList.add("has-file");
            document.getElementById("uploadText").innerHTML = "<strong>PDF loaded successfully</strong>";
            document.getElementById("detailsPanel").style.display = "block";
            document.getElementById("fileName").textContent = file.name;
            document.getElementById("originalSize").textContent = this.formatFileSize(file.size);
            document.getElementById("pageCount").textContent = `${pdf.numPages} page(s)`;
            document.getElementById("lastResult").textContent = "Ready to compress";
            this.updateUI();

            this.showMessage(`Loaded ${file.name} with ${pdf.numPages} page(s).`, "success");
        } catch (error) {
            console.error("PDF load error:", error);
            this.pdfFile = null;
            this.pageCount = 0;
            this.updateUI();
            this.showMessage(`Failed to load PDF: ${getReadableErrorMessage(error)}`, "error");
        }
    }

    updateUI() {
        document.getElementById("compressBtn").disabled = !this.pdfFile;
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    updateLastResult(text) {
        document.getElementById("lastResult").textContent = text;
    }

    async compressPDF() {
        if (!this.pdfFile) {
            this.showMessage("Upload a PDF before compressing.", "error");
            return;
        }

        if (!window.PDFLib || !window.pdfjsLib) {
            this.showMessage("Compression libraries are not ready. Refresh the page and try again.", "error");
            return;
        }

        const btn = document.getElementById("compressBtn");
        btn.disabled = true;
        btn.classList.add("loading");
        btn.textContent = "Compressing...";
        this.showMessage("Compressing your PDF. Please wait...", "info");

        const startTime = performance.now();

        try {
            const profile = COMPRESSION_PROFILES[this.profile];
            const sourceBytes = await this.pdfFile.arrayBuffer();
            const sourcePdf = await pdfjsLib.getDocument({ data: sourceBytes }).promise;
            const outputPdf = await PDFLib.PDFDocument.create();

            for (let pageNumber = 1; pageNumber <= sourcePdf.numPages; pageNumber++) {
                const page = await sourcePdf.getPage(pageNumber);
                const originalViewport = page.getViewport({ scale: 1 });
                const renderViewport = page.getViewport({ scale: profile.scale });
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d", { alpha: false });

                canvas.width = Math.max(1, Math.floor(renderViewport.width));
                canvas.height = Math.max(1, Math.floor(renderViewport.height));
                context.fillStyle = "#ffffff";
                context.fillRect(0, 0, canvas.width, canvas.height);

                await page.render({
                    canvasContext: context,
                    viewport: renderViewport
                }).promise;

                const imageDataUrl = canvas.toDataURL("image/jpeg", profile.quality);
                const image = await outputPdf.embedJpg(imageDataUrl);
                const outputPage = outputPdf.addPage([originalViewport.width, originalViewport.height]);

                outputPage.drawImage(image, {
                    x: 0,
                    y: 0,
                    width: originalViewport.width,
                    height: originalViewport.height
                });
            }

            const compressedBytes = await outputPdf.save({ useObjectStreams: true });
            const blob = new Blob([compressedBytes], { type: "application/pdf" });
            const outputFileName = `compressed_${this.pdfFile.name}`;
            const endTime = performance.now();
            const savingsBytes = this.pdfFile.size - blob.size;
            const savingsPercent = this.pdfFile.size > 0 ? (savingsBytes / this.pdfFile.size) * 100 : 0;

            if (savingsBytes <= 0) {
                this.updateLastResult("No smaller result produced");
                this.showMessage("This PDF is already optimized or text-heavy, so compression would make it larger. Saving activity log...", "info");

                try {
                    const logResult = await logOperation({
                        operation: "COMPRESS",
                        input_files: [this.pdfFile.name],
                        output_file: null,
                        total_input_size: Math.round(this.pdfFile.size / 1024),
                        output_size: Math.round(blob.size / 1024),
                        processing_time: ((endTime - startTime) / 1000).toFixed(2),
                        status: "SUCCESS",
                        error_message: "Compression skipped because the generated file was not smaller than the original.",
                        device_info: navigator.userAgent
                    });

                    this.showMessage(`No smaller compressed file was produced. Original kept. Log saved with ID ${logResult.id}.`, "info");
                } catch (logError) {
                    console.error("Compress log save failed:", logError);
                    this.showMessage(`No smaller compressed file was produced, and log was not saved: ${getReadableErrorMessage(logError)}`, "error");
                }

                return;
            }

            const downloadUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = downloadUrl;
            link.download = outputFileName;
            link.click();
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

            this.updateLastResult(`${this.formatFileSize(blob.size)} (${savingsPercent.toFixed(1)}% smaller)`);
            this.showMessage(`Compression finished. Reduced file size by ${savingsPercent.toFixed(1)}%. Saving activity log...`, "info");

            try {
                const logResult = await logOperation({
                    operation: "COMPRESS",
                    input_files: [this.pdfFile.name],
                    output_file: outputFileName,
                    total_input_size: Math.round(this.pdfFile.size / 1024),
                    output_size: Math.round(blob.size / 1024),
                    processing_time: ((endTime - startTime) / 1000).toFixed(2),
                    status: "SUCCESS",
                    error_message: null,
                    device_info: navigator.userAgent
                });

                this.showMessage(`Compression successful. Log saved with ID ${logResult.id}.`, "success");
            } catch (logError) {
                console.error("Compress log save failed:", logError);
                this.showMessage(`Compression finished, but log was not saved: ${getReadableErrorMessage(logError)}`, "error");
            }
        } catch (error) {
            console.error("Compression error:", error);

            try {
                await logOperation({
                    operation: "COMPRESS",
                    input_files: this.pdfFile ? [this.pdfFile.name] : [],
                    output_file: null,
                    total_input_size: this.pdfFile ? Math.round(this.pdfFile.size / 1024) : 0,
                    output_size: 0,
                    processing_time: 0,
                    status: "FAILED",
                    error_message: error.message,
                    device_info: navigator.userAgent
                });
            } catch (logError) {
                console.error("Failed to save compression error log:", logError);
            }

            this.showMessage(`Compression failed: ${getReadableErrorMessage(error)}`, "error");
        } finally {
            btn.innerHTML = '<i class="fas fa-compress"></i> Compress PDF';
            btn.disabled = false;
            btn.classList.remove("loading");
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

function getApiCandidates() {
    const candidates = [];
    const isHttp = window.location.protocol === "http:" || window.location.protocol === "https:";
    if (isHttp) candidates.push(window.location.origin);
    candidates.push("http://127.0.0.1:3000");
    candidates.push("http://localhost:3000");
    return [...new Set(candidates)];
}

async function logOperation(data) {
    console.log("[PDFPRO] Sending compress log payload:", data);
    const errors = [];

    for (const baseUrl of getApiCandidates()) {
        try {
            console.log(`[PDFPRO] Trying log endpoint: ${baseUrl}/log`);
            const response = await fetch(`${baseUrl}/log`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });

            const result = await response.json().catch(() => null);
            if (!response.ok) {
                const message = result?.message || result?.error || `Request failed with status ${response.status}`;
                console.error("[PDFPRO] Compress log request failed:", { url: `${baseUrl}/log`, status: response.status, body: result });
                errors.push(`${baseUrl}/log -> ${message}`);
                continue;
            }

            console.log("[PDFPRO] Compress log saved successfully:", { url: `${baseUrl}/log`, result });
            return result;
        } catch (error) {
            console.error("[PDFPRO] Compress log request error:", { url: `${baseUrl}/log`, error });
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

let app;
document.addEventListener("DOMContentLoaded", () => {
    app = new PDFCompressor();
});
