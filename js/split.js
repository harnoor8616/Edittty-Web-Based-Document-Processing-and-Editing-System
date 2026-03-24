class PDFSplitter {
    constructor() {
        this.pdfDoc = null;
        this.pageCount = 0;
        this.selectedPages = new Set();
        this.currentMode = 'individual'; // 'individual' or 'combined'
        this.canvasPool = [];
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.createCanvasPool();
    }

    bindEvents() {
        // Upload events
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const uploadBtn = document.getElementById('uploadBtn');

        uploadBtn.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        // Drag & drop
        uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        uploadArea.addEventListener('drop', (e) => this.handleDrop(e));

        // File info
        document.getElementById('clearFileBtn').addEventListener('click', () => this.clearFile());

        // Options
        document.querySelectorAll('.option-card').forEach(card => {
            card.addEventListener('click', (e) => this.selectSplitMode(e.currentTarget));
        });

        // Preview controls
        document.getElementById('selectAllBtn').addEventListener('click', () => this.selectAllPages());
        document.getElementById('clearSelectionBtn').addEventListener('click', () => this.clearSelection());
        document.getElementById('applyRangeBtn').addEventListener('click', () => this.applyPageRange());
        document.getElementById('pageRange').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.applyPageRange();
        });

        // Split button
        document.getElementById('splitBtn').addEventListener('click', () => this.processSplit());
    }

    createCanvasPool() {
        // Pre-create canvases for better performance
        for (let i = 0; i < 50; i++) {
            const canvas = document.createElement('canvas');
            canvas.className = 'page-canvas';
            this.canvasPool.push(canvas);
        }
    }

    async handleFileSelect(e) {
        const file = e.target.files[0];
        if (file && file.type === 'application/pdf') {
            await this.loadPDF(file);
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.currentTarget.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            const fileInput = document.getElementById('fileInput');
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            this.handleFileSelect({ target: fileInput });
        }
    }

    async loadPDF(file) {
        try {
            this.showLoading(false);
            
            // Show file info
            document.getElementById('fileName').textContent = file.name;
            document.getElementById('fileSize').textContent = this.formatFileSize(file.size);
            
            document.getElementById('uploadArea').style.display = 'none';
            document.getElementById('fileInfo').style.display = 'flex';

            // Load PDF with pdf.js
            const arrayBuffer = await file.arrayBuffer();
            this.pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
            this.pageCount = this.pdfDoc.numPages;

            document.getElementById('pageCount').textContent = this.pageCount;
            document.getElementById('totalPages').textContent = this.pageCount;

            // Show options
            document.getElementById('optionsSection').style.display = 'block';

            // Auto-generate previews after short delay
            setTimeout(() => this.generatePreviews(), 300);

        } catch (error) {
            console.error('Error loading PDF:', error);
            alert('Error loading PDF. Please try another file.');
        }
    }

    async generatePreviews() {
        const previewGrid = document.getElementById('previewGrid');
        previewGrid.innerHTML = '';

        document.getElementById('previewSection').style.display = 'block';
        document.getElementById('processSection').style.display = 'block';

        for (let pageNum = 1; pageNum <= this.pageCount; pageNum++) {
            const pagePreview = this.createPagePreview(pageNum);
            previewGrid.appendChild(pagePreview);
            
            // Render page thumbnail
            await this.renderPageThumbnail(pageNum, pagePreview);
        }

        this.updateSelectionInfo();
        this.updateSplitButton();
    }

    createPagePreview(pageNum) {
        const pagePreview = document.createElement('div');
        pagePreview.className = 'page-preview';
        pagePreview.dataset.page = pageNum;

        const canvas = this.getCanvasFromPool();
        const pageNumber = document.createElement('div');
        pageNumber.className = 'page-number';
        pageNumber.textContent = pageNum;

        pagePreview.appendChild(canvas);
        pagePreview.appendChild(pageNumber);

        // Add click handler
        pagePreview.addEventListener('click', () => this.togglePageSelection(pageNum, pagePreview));

        return pagePreview;
    }

    getCanvasFromPool() {
        return this.canvasPool.shift() || document.createElement('canvas');
    }

    returnCanvasToPool(canvas) {
        canvas.width = 0;
        canvas.height = 0;
        this.canvasPool.push(canvas);
    }

    async renderPageThumbnail(pageNum, pagePreview) {
        try {
            const page = await this.pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 0.4 });
            const canvas = pagePreview.querySelector('.page-canvas');
            
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            const context = canvas.getContext('2d');
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
        } catch (error) {
            console.error(`Error rendering page ${pageNum}:`, error);
        }
    }

    togglePageSelection(pageNum, pagePreview) {
        if (this.selectedPages.has(pageNum)) {
            this.selectedPages.delete(pageNum);
            pagePreview.classList.remove('selected');
        } else {
            this.selectedPages.add(pageNum);
            pagePreview.classList.add('selected');
        }
        this.updateSelectionInfo();
        this.updateSplitButton();
    }

    selectAllPages() {
        this.selectedPages.clear();
        for (let i = 1; i <= this.pageCount; i++) {
            this.selectedPages.add(i);
        }
        document.querySelectorAll('.page-preview').forEach(preview => {
            preview.classList.add('selected');
        });
        this.updateSelectionInfo();
        this.updateSplitButton();
    }

    clearSelection() {
        this.selectedPages.clear();
        document.querySelectorAll('.page-preview').forEach(preview => {
            preview.classList.remove('selected');
        });
        this.updateSelectionInfo();
        this.updateSplitButton();
    }

    applyPageRange() {
        const rangeInput = document.getElementById('pageRange').value.trim();
        if (!rangeInput) return;

        try {
            const pages = this.parsePageRange(rangeInput);
            this.selectedPages.clear();

            pages.forEach(pageNum => {
                if (pageNum >= 1 && pageNum <= this.pageCount) {
                    this.selectedPages.add(pageNum);
                }
            });

            // Update UI
            document.querySelectorAll('.page-preview').forEach(preview => {
                const pageNum = parseInt(preview.dataset.page);
                if (this.selectedPages.has(pageNum)) {
                    preview.classList.add('selected');
                } else {
                    preview.classList.remove('selected');
                }
            });

            this.updateSelectionInfo();
            this.updateSplitButton();
            document.getElementById('pageRange').value = '';
        } catch (error) {
            alert('Invalid page range format. Use: 1-3,5,7-9');
        }
    }

    parsePageRange(range) {
        const pages = new Set();
        const parts = range.split(',').map(part => part.trim());

        for (const part of parts) {
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(num => parseInt(num.trim()));
                if (!isNaN(start) && !isNaN(end)) {
                    for (let i = Math.max(1, start); i <= Math.min(this.pageCount, end); i++) {
                        pages.add(i);
                    }
                }
            } else {
                const pageNum = parseInt(part);
                if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= this.pageCount) {
                    pages.add(pageNum);
                }
            }
        }

        return Array.from(pages).sort((a, b) => a - b);
    }

    selectSplitMode(card) {
        document.querySelectorAll('.option-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.currentMode = card.dataset.mode;
        this.updateSplitButton();
    }

    updateSelectionInfo() {
        document.getElementById('selectedCount').textContent = this.selectedPages.size;
    }

    updateSplitButton() {
        const btnText = document.querySelector('.btn-text[data-mode="individual"]');
        const btnTextCombined = document.querySelector('.btn-text[data-mode="combined"]');
        const splitBtn = document.getElementById('splitBtn');
        
        if (this.selectedPages.size === 0) {
            splitBtn.disabled = true;
            splitBtn.style.opacity = '0.5';
            splitBtn.style.cursor = 'not-allowed';
        } else {
            splitBtn.disabled = false;
            splitBtn.style.opacity = '1';
            splitBtn.style.cursor = 'pointer';
            
            if (this.currentMode === 'individual') {
                btnText.style.display = 'inline';
                btnTextCombined.style.display = 'none';
            } else {
                btnText.style.display = 'none';
                btnTextCombined.style.display = 'inline';
            }
        }
    }

    async processSplit() {
        if (this.selectedPages.size === 0) return;

        this.showLoading(true);
        
        try {
            const pdfBytes = await this.pdfDoc.getData();
            const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
            const pagesToCopy = Array.from(this.selectedPages).sort((a, b) => a - b);

            if (this.currentMode === 'combined') {
                await this.createCombinedPDF(pdfDoc, pagesToCopy);
            } else {
                await this.createIndividualPDFs(pdfDoc, pagesToCopy);
            }
        } catch (error) {
            console.error('Error processing PDF:', error);
            alert('Error processing PDF. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }

    async createCombinedPDF(pdfDoc, pagesToCopy) {
        const newPdfDoc = await PDFLib.PDFDocument.create();
        
        for (const pageNum of pagesToCopy) {
            const [copiedPage] = await newPdfDoc.copyPages(pdfDoc, [pageNum - 1]);
            newPdfDoc.addPage(copiedPage);
        }

        const pdfBytes = await newPdfDoc.save();
        this.downloadPDF(pdfBytes, 'split-pages-combined.pdf');
    }

    async createIndividualPDFs(pdfDoc, pagesToCopy) {
        for (const pageNum of pagesToCopy) {
            const newPdfDoc = await PDFLib.PDFDocument.create();
            const [copiedPage] = await newPdfDoc.copyPages(pdfDoc, [pageNum - 1]);
            newPdfDoc.addPage(copiedPage);
            
            const pdfBytes = await newPdfDoc.save();
            this.downloadPDF(pdfBytes, `page-${pageNum}.pdf`);
            
            // Small delay to prevent browser throttling
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    downloadPDF(pdfBytes, filename) {
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    clearFile() {
        this.pdfDoc = null;
        this.pageCount = 0;
        this.selectedPages.clear();
        
        document.getElementById('uploadArea').style.display = 'block';
        document.getElementById('fileInfo').style.display = 'none';
        document.getElementById('optionsSection').style.display = 'none';
        document.getElementById('previewSection').style.display = 'none';
        document.getElementById('processSection').style.display = 'none';
        document.getElementById('previewGrid').innerHTML = '';
        document.getElementById('fileInput').value = '';
        
        // Return canvases to pool
        document.querySelectorAll('.page-canvas').forEach(canvas => {
            this.returnCanvasToPool(canvas);
        });
    }

    showLoading(show) {
        const spinner = document.getElementById('loadingSpinner');
        const btnText = document.querySelectorAll('.btn-text');
        
        if (show) {
            spinner.style.display = 'inline-block';
            btnText.forEach(text => text.style.display = 'none');
            document.getElementById('splitBtn').disabled = true;
        } else {
            spinner.style.display = 'none';
            btnText.forEach(text => text.style.display = 'inline');
            document.getElementById('splitBtn').disabled = false;
            this.updateSplitButton();
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Set worker source for pdf.js
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
    
    new PDFSplitter();
});

// Make pdfjsLib globally available for CDN
window.pdfjsLib = window['pdfjs-dist/build/pdf'];