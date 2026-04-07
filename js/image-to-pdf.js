const PDF_PAGE_SIZES = {
    a4: PDFLib.PageSizes.A4,
    letter: PDFLib.PageSizes.Letter
};

class ImageToPDFTool {
    constructor() {
        this.items = [];
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
            this.handleFiles(event.target.files);
            event.target.value = "";
        });
        document.getElementById("convertBtn").addEventListener("click", () => this.createPDF());
        document.getElementById("queueList").addEventListener("click", (event) => this.handleQueueAction(event));

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
            this.handleFiles(event.dataTransfer.files);
        }
    }

    async handleFiles(fileList) {
        const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
        if (!files.length) {
            this.showMessage("Please select at least one valid image file.", "error");
            return;
        }

        try {
            const newItems = await Promise.all(files.map((file, index) => this.createItem(file, index)));
            this.items = [...this.items, ...newItems];
            document.getElementById("uploadArea").classList.add("has-file");
            document.getElementById("uploadText").innerHTML = "<strong>Images loaded successfully</strong>";
            this.updateUI();
            this.showMessage(`Loaded ${newItems.length} image(s).`, "success");
        } catch (error) {
            console.error("Image load error:", error);
            this.showMessage(`Failed to load images: ${getReadableErrorMessage(error)}`, "error");
        }
    }

    async createItem(file, index) {
        const previewUrl = URL.createObjectURL(file);
        const image = await loadImage(previewUrl);
        const normalized = await normalizeImageFile(file, image);

        return {
            id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
            file,
            name: file.name,
            size: file.size,
            width: image.naturalWidth,
            height: image.naturalHeight,
            previewUrl,
            dataUrl: normalized.dataUrl,
            mimeType: normalized.mimeType
        };
    }

    handleQueueAction(event) {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        const { action, id } = button.dataset;
        const index = this.items.findIndex((item) => item.id === id);
        if (index === -1) return;

        if (action === "remove") {
            URL.revokeObjectURL(this.items[index].previewUrl);
            this.items.splice(index, 1);
        } else if (action === "up" && index > 0) {
            [this.items[index - 1], this.items[index]] = [this.items[index], this.items[index - 1]];
        } else if (action === "down" && index < this.items.length - 1) {
            [this.items[index + 1], this.items[index]] = [this.items[index], this.items[index + 1]];
        }

        this.updateUI();
    }

    updateUI() {
        const hasItems = this.items.length > 0;
        document.getElementById("detailsPanel").style.display = hasItems ? "block" : "none";
        document.getElementById("queueSection").style.display = hasItems ? "block" : "none";
        document.getElementById("convertBtn").disabled = !hasItems;

        if (!hasItems) {
            document.getElementById("uploadArea").classList.remove("has-file");
            document.getElementById("uploadText").textContent = "Drop your images here or click to browse";
            document.getElementById("imageCount").textContent = "0";
            document.getElementById("totalSize").textContent = "0 B";
            document.getElementById("firstFile").textContent = "-";
            document.getElementById("queueList").innerHTML = "";
            return;
        }

        const totalSize = this.items.reduce((sum, item) => sum + item.size, 0);
        document.getElementById("imageCount").textContent = `${this.items.length} image(s)`;
        document.getElementById("totalSize").textContent = formatFileSize(totalSize);
        document.getElementById("firstFile").textContent = this.items[0].name;
        document.getElementById("queueList").innerHTML = this.items.map((item, index) => `
            <div class="queue-item">
                <img src="${item.previewUrl}" alt="${escapeHtml(item.name)}" class="queue-thumb">
                <div class="queue-meta">
                    <strong>${index + 1}. ${escapeHtml(item.name)}</strong>
                    <span>${item.width} × ${item.height} px • ${formatFileSize(item.size)}</span>
                </div>
                <div class="queue-actions">
                    <button class="queue-btn" type="button" data-action="up" data-id="${item.id}"><i class="fas fa-arrow-up"></i> Up</button>
                    <button class="queue-btn" type="button" data-action="down" data-id="${item.id}"><i class="fas fa-arrow-down"></i> Down</button>
                    <button class="queue-btn" type="button" data-action="remove" data-id="${item.id}"><i class="fas fa-trash"></i> Remove</button>
                </div>
            </div>
        `).join("");
    }

    async createPDF() {
        if (!this.items.length) {
            this.showMessage("Add at least one image before creating a PDF.", "error");
            return;
        }

        const convertBtn = document.getElementById("convertBtn");
        const originalHtml = convertBtn.innerHTML;
        const pageSizeMode = document.getElementById("pageSizeSelect").value;
        const orientationMode = document.getElementById("orientationSelect").value;
        const fitMode = document.getElementById("fitSelect").value;
        const margin = clampNumber(Number(document.getElementById("marginInput").value), 0, 72, 24);
        const startTime = performance.now();

        convertBtn.disabled = true;
        this.showMessage("Building your PDF. Please wait...", "info");

        try {
            const pdfDoc = await PDFLib.PDFDocument.create();

            for (let index = 0; index < this.items.length; index += 1) {
                const item = this.items[index];
                convertBtn.textContent = `Adding ${index + 1}/${this.items.length}...`;

                const embeddedImage = await embedImage(pdfDoc, item);
                const pageDimensions = getPageDimensions(pageSizeMode, orientationMode, item.width, item.height);
                const page = pdfDoc.addPage(pageDimensions);
                const placement = getPlacement({
                    fitMode,
                    margin,
                    imageWidth: embeddedImage.width,
                    imageHeight: embeddedImage.height,
                    pageWidth: page.getWidth(),
                    pageHeight: page.getHeight()
                });

                page.drawImage(embeddedImage, placement);
            }

            const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
            const blob = new Blob([pdfBytes], { type: "application/pdf" });
            const outputFileName = `${stripExtension(this.items[0].name)}_images.pdf`;
            downloadBlob(blob, outputFileName);

            const endTime = performance.now();
            document.getElementById("lastResult").textContent = `${this.items.length} page(s) • ${formatFileSize(blob.size)}`;
            this.showMessage("PDF created successfully. Saving activity log...", "success");

            try {
                const result = await logOperation({
                    operation: "IMAGE_TO_PDF",
                    input_files: this.items.map((item) => item.name),
                    output_file: outputFileName,
                    total_input_size: Math.round(this.items.reduce((sum, item) => sum + item.size, 0) / 1024),
                    output_size: Math.round(blob.size / 1024),
                    processing_time: ((endTime - startTime) / 1000).toFixed(2),
                    status: "SUCCESS",
                    error_message: null,
                    device_info: navigator.userAgent
                });

                this.showMessage(`PDF created successfully. Log saved with ID ${result.id}.`, "success");
            } catch (logError) {
                console.error("Image to PDF log save failed:", logError);
                this.showMessage(`PDF created, but log was not saved: ${getReadableErrorMessage(logError)}`, "error");
            }
        } catch (error) {
            console.error("Image to PDF conversion error:", error);

            try {
                await logOperation({
                    operation: "IMAGE_TO_PDF",
                    input_files: this.items.map((item) => item.name),
                    output_file: null,
                    total_input_size: Math.round(this.items.reduce((sum, item) => sum + item.size, 0) / 1024),
                    output_size: 0,
                    processing_time: 0,
                    status: "FAILED",
                    error_message: error.message,
                    device_info: navigator.userAgent
                });
            } catch (logError) {
                console.error("Failed to save image to PDF error log:", logError);
            }

            this.showMessage(`PDF creation failed: ${getReadableErrorMessage(error)}`, "error");
        } finally {
            convertBtn.disabled = false;
            convertBtn.innerHTML = originalHtml;
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

function getPageDimensions(pageSizeMode, orientationMode, imageWidth, imageHeight) {
    if (pageSizeMode === "image") {
        return [imageWidth, imageHeight];
    }

    const base = PDF_PAGE_SIZES[pageSizeMode] || PDFLib.PageSizes.A4;
    const wantsLandscape = orientationMode === "landscape" || (orientationMode === "auto" && imageWidth > imageHeight);
    return wantsLandscape ? [base[1], base[0]] : [base[0], base[1]];
}

function getPlacement({ fitMode, margin, imageWidth, imageHeight, pageWidth, pageHeight }) {
    const safeMargin = Math.min(margin, Math.max(0, pageWidth / 2 - 1), Math.max(0, pageHeight / 2 - 1));
    const targetWidth = pageWidth - safeMargin * 2;
    const targetHeight = pageHeight - safeMargin * 2;
    const scale = fitMode === "fill"
        ? Math.max(targetWidth / imageWidth, targetHeight / imageHeight)
        : Math.min(targetWidth / imageWidth, targetHeight / imageHeight);
    const width = imageWidth * scale;
    const height = imageHeight * scale;

    return {
        x: (pageWidth - width) / 2,
        y: (pageHeight - height) / 2,
        width,
        height
    };
}

async function embedImage(pdfDoc, item) {
    const bytes = await dataUrlToBytes(item.dataUrl);
    return item.mimeType === "image/jpeg" ? pdfDoc.embedJpg(bytes) : pdfDoc.embedPng(bytes);
}

async function normalizeImageFile(file, image) {
    const mimeType = file.type === "image/jpeg" || file.type === "image/png" ? file.type : "image/png";
    const dataUrl = await readFileAsDataUrl(file);

    if (mimeType === file.type) {
        return { mimeType, dataUrl };
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);

    return {
        mimeType: "image/png",
        dataUrl: canvas.toDataURL("image/png")
    };
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Could not read one of the image files."));
        image.src = url;
    });
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Could not read one of the image files."));
        reader.readAsDataURL(file);
    });
}

async function dataUrlToBytes(dataUrl) {
    const response = await fetch(dataUrl);
    return response.arrayBuffer();
}

function stripExtension(filename) {
    return filename.replace(/\.[^.]+$/, "") || "images";
}

function clampNumber(value, min, max, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
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

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
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
    new ImageToPDFTool();
});
