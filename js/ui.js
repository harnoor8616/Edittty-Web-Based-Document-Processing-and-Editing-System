// UI Components and Tool Utilities
class UIUtils {
    static showMessage(type, message, container = document.body) {
        // Remove existing messages
        const existing = container.querySelector('.success-message, .error-message');
        if (existing) {
            existing.remove();
        }
        
        const msgDiv = document.createElement('div');
        msgDiv.className = `${type}-message active`;
        msgDiv.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            ${message}
        `;
        
        container.insertBefore(msgDiv, container.firstChild);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            msgDiv.classList.remove('active');
            setTimeout(() => msgDiv.remove(), 300);
        }, 5000);
    }
    
    static updateProgress(percent) {
        const fill = document.querySelector('.progress-fill');
        if (fill) {
            fill.style.width = `${percent}%`;
        }
    }
    
    static showLoading(show = true) {
        const loading = document.querySelector('.loading');
        if (loading) {
            loading.classList.toggle('active', show);
        }
    }
    
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    static createFileItem(file, index) {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.innerHTML = `
            <i class="fas fa-file-pdf file-icon"></i>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-size">${this.formatFileSize(file.size)}</div>
            </div>
            <button class="file-remove" data-index="${index}">
                <i class="fas fa-times"></i>
            </button>
        `;
        return div;
    }
}

// Drag and Drop Handler
class DragDropHandler {
    constructor(dropZone) {
        this.dropZone = dropZone;
        this.files = [];
        this.init();
    }
    
    init() {
        this.dropZone.addEventListener('dragover', this.handleDragOver.bind(this));
        this.dropZone.addEventListener('dragleave', this.handleDragLeave.bind(this));
        this.dropZone.addEventListener('drop', this.handleDrop.bind(this));
        this.dropZone.addEventListener('click', this.handleClick.bind(this));
        
        // File input
        const fileInput = this.dropZone.querySelector('input[type="file"]');
        if (fileInput) {
            fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        }
    }
    
    handleDragOver(e) {
        e.preventDefault();
        this.dropZone.classList.add('dragover');
    }
    
    handleDragLeave(e) {
        if (!this.dropZone.contains(e.relatedTarget)) {
            this.dropZone.classList.remove('dragover');
        }
    }
    
    handleDrop(e) {
        e.preventDefault();
        this.dropZone.classList.remove('dragover');
        
        const files = Array.from(e.dataTransfer.files);
        this.addFiles(files);
    }
    
    handleClick() {
        const fileInput = this.dropZone.querySelector('input[type="file"]');
        fileInput?.click();
    }
    
    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        this.addFiles(files);
    }
    
    addFiles(files) {
        // Filter only PDF files for PDF tools
        const pdfFiles = files.filter(file => 
            file.type === 'application/pdf' || 
            file.name.toLowerCase().endsWith('.pdf')
        );
        
        if (pdfFiles.length === 0) {
            UIUtils.showMessage('error', 'Please select PDF files only.');
            return;
        }
        
        this.files.push(...pdfFiles);
        this.renderFiles();
    }
    
    removeFile(index) {
        this.files.splice(index, 1);
        this.renderFiles();
    }
    
    renderFiles() {
        const fileList = document.querySelector('.file-list');
        if (!fileList) return;
        
        fileList.innerHTML = '';
        
        this.files.forEach((file, index) => {
            const fileItem = UIUtils.createFileItem(file, index);
            
            // Remove button handler
            fileItem.querySelector('.file-remove').addEventListener('click', () => {
                this.removeFile(index);
            });
            
            fileList.appendChild(fileItem);
        });
        
        // Update process button state
        const processBtn = document.querySelector('.process-btn');
        if (processBtn) {
            processBtn.disabled = this.files.length === 0;
        }
    }
    
    getFiles() {
        return this.files;
    }
    
    clearFiles() {
        this.files = [];
        this.renderFiles();
    }
}

// Export utilities
window.UIUtils = UIUtils;
window.DragDropHandler = DragDropHandler;