const API_URL = 'http://localhost:8080/api/research/process';

class ResearchAssistant {
    constructor() {
        // Ensure initialization happens after DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        console.log('Initializing Research Assistant...');
        this.setupEventListeners();
        this.loadSavedNotes();
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        const operations = [
            'summarize', 'expand', 'suggest', 'paraphrase',
            'questions', 'compare', 'examples', 'eli5'
        ];

        operations.forEach(op => {
            const btn = document.getElementById(`${op}Btn`);
            if (btn) {
                btn.addEventListener('click', this.processOperation.bind(this, op));
                console.log(`Added listener for ${op}Btn`);
            }
        });

        // Setup notes-related event listeners
        const saveBtn = document.getElementById('saveNotesBtn');
        const deleteBtn = document.getElementById('deleteNotesBtn');
        const notesTextarea = document.getElementById('notes');

        if (saveBtn && deleteBtn && notesTextarea) {
            saveBtn.addEventListener('click', this.saveNotes.bind(this));
            deleteBtn.addEventListener('click', this.deleteNotes.bind(this));
            
            // Auto-save functionality
            notesTextarea.addEventListener('input', this.debounce(this.saveNotes.bind(this), 1000));
            
            console.log('Notes event listeners setup complete');
        } else {
            console.error('Some notes elements not found:', {
                saveBtn: !!saveBtn,
                deleteBtn: !!deleteBtn,
                notesTextarea: !!notesTextarea
            });
        }
    }

    // Debounce helper for auto-save
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    async loadSavedNotes() {
        console.log('Loading saved notes...');
        try {
            const result = await chrome.storage.local.get(['researchNotes']);
            const notesTextarea = document.getElementById('notes');
            
            if (notesTextarea) {
                if (result.researchNotes) {
                    notesTextarea.value = result.researchNotes;
                    console.log('Notes loaded successfully:', result.researchNotes);
                } else {
                    console.log('No saved notes found');
                }
            } else {
                console.error('Notes textarea not found');
            }
        } catch (error) {
            console.error('Failed to load notes:', error);
            this.showError('Failed to load saved notes: ' + error.message);
        }
    }

    async saveNotes() {
        console.log('Attempting to save notes...');
        try {
            const notesTextarea = document.getElementById('notes');
            if (!notesTextarea) {
                throw new Error('Notes textarea not found');
            }

            const notes = notesTextarea.value;
            await chrome.storage.local.set({ researchNotes: notes });
            console.log('Stored notes:', notes);
            console.log('Notes saved successfully');

            // Show success indicator
            this.showSaveSuccess();
        } catch (error) {
            console.error('Failed to save notes:', error);
            this.showError('Failed to save notes: ' + error.message);
        }
    }

    async deleteNotes() {
        if (confirm('Are you sure you want to delete all notes?')) {
            document.getElementById('notes').value = '';
            try {
                await chrome.storage.local.remove(['researchNotes']);
                
                // Show success message
                const deleteBtn = document.getElementById('deleteNotesBtn');
                const originalText = deleteBtn.innerHTML;
                deleteBtn.innerHTML = '<i class="fas fa-check"></i> Deleted!';
                deleteBtn.style.backgroundColor = 'var(--success)';
                
                setTimeout(() => {
                    deleteBtn.innerHTML = originalText;
                    deleteBtn.style.backgroundColor = '';
                }, 2000);
            } catch (error) {
                this.showError('Failed to delete notes');
            }
        }
    }

    showSaveSuccess() {
        const saveBtn = document.getElementById('saveNotesBtn');
        if (!saveBtn) return;

        const originalText = saveBtn.innerHTML;
        const originalBg = saveBtn.style.backgroundColor;

        saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
        saveBtn.style.backgroundColor = 'var(--success)';

        setTimeout(() => {
            saveBtn.innerHTML = originalText;
            saveBtn.style.backgroundColor = originalBg;
        }, 2000);
    }

    async processOperation(operation) {
        try {
            // Get selected text from the active tab
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            const [{result}] = await chrome.scripting.executeScript({
                target: {tabId: tab.id},
                function: () => window.getSelection().toString()
            });

            const selectedText = result.trim();
            if (!selectedText) {
                this.showError('Please select some text first');
                return;
            }

            this.showLoading(true);

            const requestBody = {
                content: selectedText,
                operation: operation === 'questions' ? 'generate_questions' : 
                          operation === 'compare' ? 'compare_contrast' : operation
            };

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorData}`);
            }

            const data = await response.text();
            this.showResult(data);
        } catch (error) {
            this.showError(`Failed to process request: ${error.message}`);
        } finally {
            this.showLoading(false);
        }
    }

    showError(message) {
        const resultsSection = document.querySelector('.results-section');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
        errorDiv.style.color = 'var(--error)';
        errorDiv.style.padding = '12px';
        errorDiv.style.borderRadius = '4px';
        errorDiv.style.backgroundColor = 'rgba(240, 71, 71, 0.1)';
        
        resultsSection.prepend(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
    }

    showLoading(show) {
        document.querySelector('.loading-spinner').classList.toggle('hidden', !show);
        document.querySelector('.result-content').style.opacity = show ? '0.5' : '1';
    }

    showResult(content) {
        const resultElement = document.querySelector('.result-content');
        resultElement.style.opacity = '0';
        
        setTimeout(() => {
            // Format the content
            let formattedContent = content
                // Remove markdown stars from headings
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                // Convert markdown headings to HTML with proper hierarchy
                .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
                .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
                .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
                // Handle bullet points that aren't headings
                .replace(/^[*-] (?!#)(.*?)$/gm, '<li>$1</li>')
                // Wrap paragraphs
                .split('\n\n')
                .map(para => {
                    para = para.trim();
                    if (!para) return '';
                    if (para.startsWith('<h') || para.startsWith('<li>')) {
                        return para;
                    }
                    return `<p>${para}</p>`;
                })
                .filter(para => para)
                .join('\n');

            // Wrap consecutive list items in <ul> tags
            formattedContent = formattedContent.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

            resultElement.innerHTML = formattedContent;
            resultElement.style.opacity = '1';
        }, 200);
    }
}

// Initialize the application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM loaded, creating ResearchAssistant instance...');
        window.researchAssistant = new ResearchAssistant();
    });
} else {
    console.log('DOM already loaded, creating ResearchAssistant instance...');
    window.researchAssistant = new ResearchAssistant();
}
