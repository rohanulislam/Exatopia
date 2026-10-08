
let pdfjsPromise = null;

function setupWorker(lib) {
    try {
        if (lib && lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) {
            lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
    } catch (e) {
        console.warn("Could not set workerSrc:", e);
    }
}

function loadPdfJs() {
    const existingLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    if (existingLib) {
        setupWorker(existingLib);
        return Promise.resolve(existingLib);
    }
    if (pdfjsPromise) return pdfjsPromise;

    pdfjsPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        script.async = true;
        script.onload = () => {
            const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
            if (lib) {
                setupWorker(lib);
                resolve(lib);
            } else {
                reject(new Error("PDF.js library loaded but pdfjsLib object not found."));
            }
        };
        script.onerror = () => reject(new Error("Failed to load PDF.js from CDN. Please check your internet connection."));
        document.head.appendChild(script);
    });

    return pdfjsPromise;
}

export async function extractTextFromPDF(file, startPage = 1, endPage = null) {
    const pdfjsLib = await loadPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    
    const loadingTask = pdfjsLib.getDocument({
        data: arrayBuffer
    });

    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    
    
    let start = Math.max(1, parseInt(startPage) || 1);
    let end = endPage ? Math.min(totalPages, parseInt(endPage)) : totalPages;

    if (start > totalPages) {
        throw new Error(`Start page (${start}) exceeds total PDF pages (${totalPages}).`);
    }

    if (start > end) {
        throw new Error("Start page cannot be greater than End page.");
    }

    let fullText = "";

    for (let pageNum = start; pageNum <= end; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        fullText += `--- Page ${pageNum} ---\n` + pageText + "\n\n";
    }

    return fullText.trim();
}