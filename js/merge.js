class PDFMerger {
    constructor() {
        this.files = [];
        this.previewCanvases = new Map();
        this.initEventListeners();
    }

    initEventListeners() {
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const uploadBtn = document.getElementById('uploadBtn');
        const mergeBtn = document.getElementById('mergeBtn');
        const clearAllBtn = document.getElementById('clearAllBtn');

        // File input events
        uploadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
        
        // Drag and drop
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, (e) => this.preventDefaults(e));
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            uploadArea.addEventListener(eventName, () => uploadArea.classList.add('dragover'));
        });

        ['dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, () => uploadArea.classList.remove('dragover'));
        });

        uploadArea.addEventListener('drop', (e) => this.handleFiles(e.dataTransfer.files));

        // Button events
        mergeBtn.addEventListener('click', () => this.mergePDFs());
        clearAllBtn.addEventListener('click', () => this.clearAll());

        // Click to upload
        uploadArea.addEventListener('click', () => fileInput.click());
    }

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    async handleFiles(fileList) {
        const newFiles = Array.from(fileList).filter(file => 
            file.type === 'application/pdf' && 
            !this.files.some(f => f.name === file.name && f.size === file.size)
        );

        if (newFiles.length === 0) return;

        // Check limits
        const totalSize = this.files.reduce((sum, f) => sum + f.size, 0) + 
                         newFiles.reduce((sum, f) => sum + f.size, 0);
        
        if (this.files.length + newFiles.length > 10) {
            this.showError('Maximum 10 files allowed');
            return;
        }

        if (totalSize > 100 * 1024 * 1024) {
            this.showError('Total file size cannot exceed 100MB');
            return;
        }

        // Add files
        this.files.push(...newFiles);
        await this.renderFilesList();
    }

    async renderFilesList() {
        const filesList = document.getElementById('filesList');
        const previewSection = document.getElementById('previewSection');
        const processSection = document.getElementById('processSection');

        if (this.files.length === 0) {
            filesList.innerHTML = `
                <div class="empty-state">
                    <p>No files selected yet</p>
                </div>
            `;
            previewSection.style.display = 'none';
            processSection.style.display = 'none';
            return;
        }

        filesList.innerHTML = '';
        const previewGrid = document.getElementById('previewGrid');
        previewGrid.innerHTML = '';

        for (let i = 0; i < this.files.length; i++) {
            const file = this.files[i];
            const pages = await this.getPDFPageCount(file);
            
            const previewItem = this.createPreviewItem(i, file, pages);
            previewGrid.appendChild(previewItem);
            
            // Generate thumbnail for first page
            await this.generateThumbnail(file, i);
        }

        previewSection.style.display = 'block';
        processSection.style.display = 'block';

        // Initialize drag and drop sorting
        this.initDragAndDrop();
    }

    createPreviewItem(index, file, pages) {
        const div = document.createElement('div');
        div.className = 'preview-item';
        div.dataset.index = index;
        div.draggable = true;

                div.innerHTML = `
            <div class="preview-header">
                <div class="preview-filename">${this.escapeHtml(file.name)}</div>
                <div class="preview-pages">${pages} page${pages > 1 ? 's' : ''}</div>
            </div>
            <div class="preview-thumbnail">
                <canvas id="thumb-${index}"></canvas>
            </div>
            <div class="preview-actions">
                <span class="move-icon">⋮⋮</span>
                <button class="remove-btn" data-index="${index}">×</button>
            </div>
        `;

        // Event listeners
        div.querySelector('.remove-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeFile(index);
        });

        return div;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async generateThumbnail(file, index) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await PDFLib.PDFDocument.load(arrayBuffer);
            const firstPage = pdf.getPages()[0];
            
            const canvas = document.getElementById(`thumb-${index}`);
            const ctx = canvas.getContext('2d');
            
            // Scale thumbnail to fit
            const scale = 0.5;
            const viewport = firstPage.getViewport({ scale });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            // Simple thumbnail rendering (using pdf-lib limitations, show placeholder for now)
            ctx.fillStyle = '#e3f2fd';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#1976d2';
            ctx.font = '24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('PDF Page 1', canvas.width / 2, canvas.height / 2);
            
        } catch (error) {
            console.error('Thumbnail generation failed:', error);
        }
    }

    async getPDFPageCount(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await PDFLib.PDFDocument.load(arrayBuffer);
            return pdf.getPageCount();
        } catch (error) {
            console.error('Page count failed:', error);
            return 1;
        }
    }

    initDragAndDrop() {
        const previewItems = document.querySelectorAll('.preview-item');
        
        previewItems.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', item.dataset.index);
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const targetIndex = parseInt(item.dataset.index);
                
                if (draggedIndex !== targetIndex) {
                    this.reorderFiles(draggedIndex, targetIndex);
                }
            });
        });
    }

    reorderFiles(fromIndex, toIndex) {
        const file = this.files.splice(fromIndex, 1)[0];
        this.files.splice(toIndex, 0, file);
        this.renderFilesList();
    }

    removeFile(index) {
        this.files.splice(index, 1);
        this.renderFilesList();
    }

    clearAll() {
        this.files = [];
        document.getElementById('filesList').innerHTML = `
            <div class="empty-state">
                <p>No files selected yet</p>
            </div>
        `;
        document.getElementById('previewSection').style.display = 'none';
        document.getElementById('processSection').style.display = 'none';
    }

    async mergePDFs() {
        const mergeBtn = document.getElementById('mergeBtn');
        const btnText = mergeBtn.querySelector('.btn-text');
        const spinner = document.getElementById('loadingSpinner');

        // Show loading
        mergeBtn.disabled = true;
        btnText.style.opacity = '0';
        spinner.style.display = 'block';

        try {
            const mergedPdf = await PDFLib.PDFDocument.create();

            for (const file of this.files) {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await PDFLib.PDFDocument.load(arrayBuffer);
                
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
            }

            const pdfBytes = await mergedPdf.save();

            // Trigger download
            this.downloadFile(pdfBytes, 'merged-document.pdf');
            
            // Show success
            this.showSuccess('PDFs merged successfully!');
            
        } catch (error) {
            console.error('Merge failed:', error);
            this.showError('Failed to merge PDFs. Please try again.');
        } finally {
            // Hide loading
            mergeBtn.disabled = false;
            btnText.style.opacity = '1';
            spinner.style.display = 'none';
        }
    }

    downloadFile(bytes, filename) {
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type) {
        // Create notification
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            padding: 16px 24px;
            border-radius: 12px;
            color: white;
            font-weight: 500;
            z-index: 1000;
            transform: translateX(400px);
            transition: transform 0.3s ease;
            max-width: 350px;
        `;

        if (type === 'success') {
            notification.style.background = 'linear-gradient(135deg, #4caf50, #45a049)';
        } else {
            notification.style.background = 'linear-gradient(135deg, #f44336, #d32f2f)';
        }

        document.body.appendChild(notification);

        // Animate in
        requestAnimationFrame(() => {
            notification.style.transform = 'translateX(0)';
        });

        // Auto remove
        setTimeout(() => {
            notification.style.transform = 'translateX(400px)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 4000);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PDFMerger();
});