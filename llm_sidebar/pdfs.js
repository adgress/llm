// Method 1: Extract blob data and send to server
async function handleBlobUrl(tabId, blobUrl) {
    console.log("handleBlobUrl called with:", { tabId, blobUrl });

    try {
        console.log("Attempting to inject script into tab:", tabId);

        // Get the blob data from the page
        const [{ result: blobData }] = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: (url) => {
                console.log("Script injected, attempting to fetch blob URL:", url);

                return fetch(url)
                    .then(response => {
                        console.log("Fetch response status:", response.status);
                        console.log("Fetch response headers:", Object.fromEntries(response.headers.entries()));

                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }

                        return response.arrayBuffer();
                    })
                    .then(buffer => {
                        console.log("ArrayBuffer received, size:", buffer.byteLength);

                        if (buffer.byteLength === 0) {
                            throw new Error("Empty buffer received");
                        }

                        // Convert ArrayBuffer to base64
                        const bytes = new Uint8Array(buffer);
                        let binary = '';
                        for (let i = 0; i < bytes.byteLength; i++) {
                            binary += String.fromCharCode(bytes[i]);
                        }

                        const base64Data = btoa(binary);
                        console.log("Base64 conversion successful, length:", base64Data.length);

                        return base64Data;
                    })
                    .catch(error => {
                        console.error("Error in injected script:", error);
                        throw error;
                    });
            },
            args: [blobUrl]
        });

        console.log("Script execution completed, result type:", typeof blobData);
        console.log("Result length:", blobData ? blobData.length : 0);

        return blobData;
    } catch (error) {
        console.error("Error in handleBlobUrl:", error);
        console.error("Error details:", {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        return null;
    }
}

// Method 4: Extract text from PDF viewer on the page
async function extractPdfTextFromPage(tabId) {
    console.log("extractPdfTextFromPage called with tabId:", tabId);

    try {
        // Check if chrome.scripting is available
        if (!chrome.scripting || !chrome.scripting.executeScript) {
            console.warn("chrome.scripting.executeScript not available - likely a local file");
            return null;
        }

        console.log("Attempting to inject PDF text extraction script");

        const [{ result: textContent }] = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                console.log("PDF text extraction script injected");

                // Try various methods to extract text from PDF viewers

                // Method 1: Try PDF.js text layer
                console.log("Trying Method 1: PDF.js text layer");
                const textLayer = document.querySelector('.textLayer');
                if (textLayer) {
                    console.log("Found single text layer, extracting text");
                    const text = textLayer.innerText;
                    console.log("Text layer content length:", text.length);
                    return text;
                }

                // Method 2: Try multiple text layers (for multi-page PDFs)
                console.log("Trying Method 2: Multiple text layers");
                const textLayers = document.querySelectorAll('.textLayer');
                if (textLayers.length > 0) {
                    console.log("Found", textLayers.length, "text layers");
                    let allText = '';
                    textLayers.forEach((layer, index) => {
                        const layerText = layer.innerText;
                        console.log(`Text layer ${index} length:`, layerText.length);
                        allText += layerText + '\n';
                    });
                    console.log("Combined text layers length:", allText.length);
                    return allText;
                }

                // Method 3: Try PDF.js viewer application
                console.log("Trying Method 3: PDF.js viewer application");
                if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                    console.log("PDF.js viewer application found");
                    // This is more complex and would need additional handling
                    return "PDF.js detected but text extraction needs more work";
                }

                // Method 4: Try to get all visible text from body
                console.log("Trying Method 4: Body text extraction");
                const body = document.body;
                if (body && body.innerText) {
                    const text = body.innerText;
                    console.log("Body text length:", text.length);

                    // Filter out common PDF viewer UI elements
                    const filteredText = text
                        .replace(/Page \d+ of \d+/g, '')
                        .replace(/Zoom In|Zoom Out|Previous|Next|Print|Download/g, '')
                        .replace(/\d+%/g, '') // Remove zoom percentages
                        .trim();

                    console.log("Filtered text length:", filteredText.length);

                    if (filteredText && filteredText.length > 100) {
                        console.log("Body text extraction successful");
                        return filteredText;
                    }
                }

                // Method 5: Try specific PDF viewer selectors
                console.log("Trying Method 5: PDF viewer selectors");
                const pdfContent = document.querySelector('[data-page-number]');
                if (pdfContent) {
                    console.log("Found PDF content with data-page-number");
                    const text = pdfContent.innerText;
                    console.log("PDF content text length:", text.length);
                    return text;
                }

                // Method 6: Try canvas-based PDF viewers (extract from canvas is complex)
                console.log("Trying Method 6: Canvas detection");
                const canvases = document.querySelectorAll('canvas');
                if (canvases.length > 0) {
                    console.log("Found", canvases.length, "canvas elements");
                    return "Canvas-based PDF detected - text extraction not implemented";
                }

                // Method 7: Try embed or object tags
                console.log("Trying Method 7: Embed/Object tags");
                const embed = document.querySelector('embed[type="application/pdf"]');
                const object = document.querySelector('object[type="application/pdf"]');
                if (embed || object) {
                    console.log("Found embedded PDF element");
                    return "Embedded PDF detected - text extraction limited";
                }

                console.log("All text extraction methods failed");
                return null;
            }
        });

        console.log("Text extraction completed, result:", {
            success: textContent !== null,
            textLength: textContent ? textContent.length : 0,
            textType: typeof textContent
        });

        return textContent;
    } catch (error) {
        console.error("Error extracting PDF text:", error);
        console.error("Error details:", {
            message: error.message,
            stack: error.stack,
            name: error.name,
            tabId: tabId
        });
        return null;
    }
}

// Combined function to handle both blob URLs and PDF text extraction
async function processPdfContent(tabId, pageUrl) {
    try {
        // Check if this is a local file URL
        if (pageUrl.startsWith('file:///')) {
            console.log("Local file detected - attempting blob extraction only");
            // For local files, we can't use scripting API, so try blob extraction
            const blobData = await handleBlobUrl(tabId, pageUrl);

            if (blobData) {
                return {
                    success: true,
                    method: 'blob_data',
                    content: blobData,
                    needsServerProcessing: true
                };
            }

            return {
                success: false,
                method: 'none',
                content: null,
                needsServerProcessing: false,
                error: "Local file access not supported. Please enable file access in extension settings."
            };
        }



        // For direct PDF URLs (like arXiv), try to download and process server-side
        if (pageUrl.endsWith('.pdf') || pageUrl.includes('/pdf/') || pageUrl.includes('arxiv.org/pdf/')) {
            console.log("Step 1: Direct PDF URL detected - will process server-side");
            return {
                success: true,
                method: 'direct_url',
                content: pageUrl,
                needsServerProcessing: true
            };
        }

        // First, try to extract text from the PDF viewer (Method 4)
        console.log("Step 2: Attempting text extraction from PDF viewer");
        const extractedText = await extractPdfTextFromPage(tabId);
        console.log("Extracted text length:", extractedText ? extractedText.length : 0);
        console.log("Extracted text:", extractedText ? extractedText.substring(0, 300) : "No text extracted");
        if (extractedText && extractedText.length > 100) { // Lowered threshold for arXiv
            console.log("Successfully extracted text from PDF viewer");
            return {
                success: true,
                method: 'text_extraction',
                content: extractedText,
                needsServerProcessing: false
            };
        }

        // If text extraction failed and it's a blob URL, try to get blob data (Method 1)
        if (pageUrl.startsWith('blob:')) {
            console.log("Step 3: Attempting to extract blob data for server processing");
            console.log("Blob URL details:", {
                url: pageUrl,
                tabId: tabId,
                urlLength: pageUrl.length
            });

            const blobData = await handleBlobUrl(tabId, pageUrl);
            console.log("Blob data extraction result:", {
                success: blobData !== null,
                dataLength: blobData ? blobData.length : 0,
                dataType: typeof blobData
            });

            if (blobData) {
                console.log("Successfully extracted blob data, returning for server processing");
                return {
                    success: true,
                    method: 'blob_data',
                    content: blobData,
                    needsServerProcessing: true
                };
            } else {
                console.log("Failed to extract blob data");
            }
        } else {
            console.log("Step 3: Skipped - not a blob URL, pageUrl:", pageUrl);
        }

        // If all methods fail
        console.log("All PDF processing methods failed");
        console.log("Final processing summary:", {
            pageUrl: pageUrl,
            isBlob: pageUrl.startsWith('blob:'),
            isDirectPdf: pageUrl.endsWith('.pdf') || pageUrl.includes('/pdf/') || pageUrl.includes('arxiv.org/pdf/'),
            isLocalFile: pageUrl.startsWith('file:///')
        });

        return {
            success: false,
            method: 'none',
            content: null,
            needsServerProcessing: false,
            error: "Unable to extract content from PDF"
        };

    } catch (error) {
        console.error("Error processing PDF content:", error);
        console.error("Error details:", {
            message: error.message,
            stack: error.stack,
            name: error.name,
            pageUrl: pageUrl,
            tabId: tabId
        });

        return {
            success: false,
            method: 'none',
            content: null,
            needsServerProcessing: false,
            error: error.message
        };
    }
}

// Helper function to check if a URL is likely a PDF
function isPdfUrl(url) {
    return url.includes('/pdf/') ||           // arXiv, many academic sites
        url.endsWith('.pdf') ||            // Direct PDF files
        url.includes('pdf?') ||            // PDF with query params
        url.includes('filetype=pdf') ||    // Some document viewers
        url.match(/\/pdf\/\d+/) ||         // arXiv-specific pattern
        url.includes('arxiv.org/pdf/') ||  // Explicit arXiv PDF check
        url.startsWith('blob:');           // Blob URLs (often PDFs)
}

// Helper function to send PDF data to server
async function sendPdfToServer(pdfResult, pageUrl, additionalInstructions = '') {
    try {
        const requestBody = {
            pageUrl: pageUrl,
            additionalInstructions: additionalInstructions
        };

        if (pdfResult.method === 'direct_url') {
            // For direct PDF URLs, let server download and process
            console.log("Sending direct PDF URL to server for processing");
            requestBody.isPdf = true;
            requestBody.directPdfUrl = pdfResult.content;
        } else if (pdfResult.needsServerProcessing) {
            // Send blob data for server-side processing
            console.log("Sending blob data to server for processing");
            requestBody.isPdf = true;
            requestBody.pdfData = pdfResult.content;
        } else {
            // Send extracted text directly
            console.log("Sending extracted text to server");
            requestBody.extractedText = pdfResult.content;
            requestBody.isPdf = false;
        }

        const response = await fetch("http://localhost:5000/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`Server error ${response.status}`);
        }

        const summary = await response.json();
        return summary;

    } catch (error) {
        console.error("Error sending PDF to server:", error);
        throw error;
    }
}

// PDF-specific screenshot capture functions

// Main function to capture PDF screenshots with PDF-specific logic
async function capturePdfScreenshots(tabId, windowId, pageUrl) {
    try {
        console.log("Capturing PDF screenshots with PDF-specific logic");

        // For PDFs, we need different approaches based on the viewer type
        if (pageUrl.startsWith('blob:')) {
            // Blob URLs - limited scrolling capability
            return await captureBlobPdfScreenshots(tabId, windowId);
        } else if (pageUrl.startsWith('file:///')) {
            // Local files - different handling
            return await captureLocalPdfScreenshots(tabId, windowId);
        } else {
            // Web-based PDFs
            return await captureWebPdfScreenshots(tabId, windowId);
        }
    } catch (error) {
        console.error("PDF screenshot capture failed:", error);
        return await captureSinglePdfScreenshot(windowId);
    }
}

// Handle blob PDF screenshots
async function captureBlobPdfScreenshots(tabId, windowId) {
    try {
        console.log("Capturing blob PDF screenshots");

        // For blob PDFs, try to detect if it's a multi-page viewer
        const [{ result: pdfInfo }] = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                // Look for PDF.js page indicators
                const pageInfo = document.querySelector('#pageNumber, .page-number, [data-page-number]');
                const totalPages = document.querySelector('#numPages, .total-pages');

                // Check for scroll-based PDF viewer
                const pdfContainer = document.querySelector('.pdfViewer, #viewer, .pdf-container, .document-container');

                // Check for any scrollable container that might contain PDF content
                const scrollableElements = document.querySelectorAll('*');
                let bestContainer = null;
                let maxScrollHeight = 0;

                for (const element of scrollableElements) {
                    if (element.scrollHeight > element.clientHeight && element.scrollHeight > maxScrollHeight) {
                        maxScrollHeight = element.scrollHeight;
                        bestContainer = element;
                    }
                }

                const containerInfo = pdfContainer || bestContainer;

                return {
                    hasPageIndicator: !!pageInfo,
                    totalPages: totalPages ? parseInt(totalPages.textContent) : 1,
                    hasScrollableContainer: !!containerInfo,
                    scrollHeight: containerInfo ? containerInfo.scrollHeight : document.documentElement.scrollHeight,
                    containerSelector: containerInfo ? containerInfo.className || containerInfo.tagName : null,
                    viewportHeight: window.innerHeight,
                    documentHeight: document.documentElement.scrollHeight,
                    bodyHeight: document.body ? document.body.scrollHeight : 0
                };
            }
        });

        console.log("PDF info:", pdfInfo);

        if (pdfInfo.hasScrollableContainer && pdfInfo.scrollHeight > pdfInfo.viewportHeight) {
            // Try scrolling within the PDF container
            return await captureScrollablePdfScreenshots(tabId, windowId, pdfInfo);
        } else if (pdfInfo.documentHeight > pdfInfo.viewportHeight) {
            // Try regular document scrolling
            return await captureDocumentScrollPdfScreenshots(tabId, windowId, pdfInfo);
        } else {
            // Single page or non-scrollable PDF
            return await captureSinglePdfScreenshot(windowId);
        }
    } catch (error) {
        console.error("Error in blob PDF capture:", error);
        return await captureSinglePdfScreenshot(windowId);
    }
}

// Handle local file PDF screenshots
async function captureLocalPdfScreenshots(tabId, windowId) {
    try {
        console.log("Capturing local PDF screenshots");

        // Local PDFs often have limited DOM access, so try basic scrolling
        const [{ result: scrollInfo }] = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                return {
                    scrollHeight: Math.max(
                        document.documentElement.scrollHeight,
                        document.body ? document.body.scrollHeight : 0
                    ),
                    viewportHeight: window.innerHeight
                };
            }
        });

        if (scrollInfo.scrollHeight > scrollInfo.viewportHeight) {
            return await captureDocumentScrollPdfScreenshots(tabId, windowId, scrollInfo);
        } else {
            return await captureSinglePdfScreenshot(windowId);
        }
    } catch (error) {
        console.error("Error in local PDF capture:", error);
        return await captureSinglePdfScreenshot(windowId);
    }
}

// Handle web-based PDF screenshots
async function captureWebPdfScreenshots(tabId, windowId) {
    try {
        console.log("Capturing web-based PDF screenshots");

        // Web PDFs might use various viewers, try comprehensive detection
        const [{ result: viewerInfo }] = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                // Check for various PDF viewer types
                const viewers = {
                    pdfjs: !!window.PDFViewerApplication,
                    embed: !!document.querySelector('embed[type="application/pdf"]'),
                    object: !!document.querySelector('object[type="application/pdf"]'),
                    iframe: !!document.querySelector('iframe[src*=".pdf"]'),
                    canvas: document.querySelectorAll('canvas').length > 0
                };

                // Find the best scrollable container
                const containers = [
                    '.pdfViewer', '#viewer', '.pdf-container',
                    '.document-container', '.page-container',
                    'embed', 'object', 'iframe'
                ];

                let bestContainer = null;
                for (const selector of containers) {
                    const element = document.querySelector(selector);
                    if (element) {
                        bestContainer = {
                            selector: selector,
                            scrollHeight: element.scrollHeight || 0,
                            clientHeight: element.clientHeight || 0
                        };
                        break;
                    }
                }

                return {
                    viewers: viewers,
                    container: bestContainer,
                    documentHeight: document.documentElement.scrollHeight,
                    viewportHeight: window.innerHeight
                };
            }
        });

        console.log("Web PDF viewer info:", viewerInfo);

        if (viewerInfo.container && viewerInfo.container.scrollHeight > viewerInfo.container.clientHeight) {
            return await captureContainerScrollPdfScreenshots(tabId, windowId, viewerInfo);
        } else if (viewerInfo.documentHeight > viewerInfo.viewportHeight) {
            return await captureDocumentScrollPdfScreenshots(tabId, windowId, viewerInfo);
        } else {
            return await captureSinglePdfScreenshot(windowId);
        }
    } catch (error) {
        console.error("Error in web PDF capture:", error);
        return await captureSinglePdfScreenshot(windowId);
    }
}

// Capture screenshots by scrolling within a specific container
async function captureScrollablePdfScreenshots(tabId, windowId, pdfInfo) {
    console.log("Capturing scrollable PDF screenshots");
    const screenshots = [];
    const maxScreenshots = Math.min(5, Math.ceil(pdfInfo.scrollHeight / pdfInfo.viewportHeight));
    const SCROLL_DELAY = 300; // Longer delay for PDFs
    const CAPTURE_DELAY = 500;

    for (let i = 0; i < maxScreenshots; i++) {
        try {
            // Scroll within the PDF container
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: (scrollY, containerSelector) => {
                    const pdfContainer = document.querySelector('.pdfViewer, #viewer, .pdf-container, .document-container') ||
                        document.querySelector('*[class*="pdf"], *[class*="viewer"], *[class*="document"]');

                    if (pdfContainer) {
                        console.log(`Scrolling PDF container to ${scrollY}`);
                        pdfContainer.scrollTop = scrollY;
                    } else {
                        console.log(`Falling back to window scroll to ${scrollY}`);
                        window.scrollTo(0, scrollY);
                    }
                },
                args: [i * pdfInfo.viewportHeight, pdfInfo.containerSelector]
            });

            await new Promise(resolve => setTimeout(resolve, SCROLL_DELAY));

            const screenshot = await chrome.tabs.captureVisibleTab(windowId, {
                format: 'png',
                quality: 90
            });
            screenshots.push(screenshot);

            if (i < maxScreenshots - 1) {
                await new Promise(resolve => setTimeout(resolve, CAPTURE_DELAY));
            }
        } catch (error) {
            console.error(`Error capturing PDF screenshot ${i}:`, error);
            break;
        }
    }

    return screenshots.length > 0 ? screenshots : await captureSinglePdfScreenshot(windowId);
}

// Capture screenshots by scrolling the document
async function captureDocumentScrollPdfScreenshots(tabId, windowId, scrollInfo) {
    console.log("Capturing document scroll PDF screenshots");
    const screenshots = [];
    const maxScreenshots = Math.min(5, Math.ceil(scrollInfo.scrollHeight / scrollInfo.viewportHeight));
    const SCROLL_DELAY = 300;
    const CAPTURE_DELAY = 500;

    for (let i = 0; i < maxScreenshots; i++) {
        try {
            // Scroll the document
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: (scrollY) => {
                    window.scrollTo(0, scrollY);
                },
                args: [i * scrollInfo.viewportHeight]
            });

            await new Promise(resolve => setTimeout(resolve, SCROLL_DELAY));

            const screenshot = await chrome.tabs.captureVisibleTab(windowId, {
                format: 'png',
                quality: 90
            });
            screenshots.push(screenshot);

            if (i < maxScreenshots - 1) {
                await new Promise(resolve => setTimeout(resolve, CAPTURE_DELAY));
            }
        } catch (error) {
            console.error(`Error capturing PDF screenshot ${i}:`, error);
            break;
        }
    }

    // Restore scroll position
    await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => window.scrollTo(0, 0)
    });

    return screenshots.length > 0 ? screenshots : await captureSinglePdfScreenshot(windowId);
}

// Capture screenshots by scrolling within a container
async function captureContainerScrollPdfScreenshots(tabId, windowId, viewerInfo) {
    console.log("Capturing container scroll PDF screenshots");
    const screenshots = [];
    const container = viewerInfo.container;
    const maxScreenshots = Math.min(5, Math.ceil(container.scrollHeight / container.clientHeight));
    const SCROLL_DELAY = 300;
    const CAPTURE_DELAY = 500;

    for (let i = 0; i < maxScreenshots; i++) {
        try {
            // Scroll within the specific container
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: (scrollY, selector) => {
                    const element = document.querySelector(selector);
                    if (element) {
                        element.scrollTop = scrollY;
                    }
                },
                args: [i * container.clientHeight, container.selector]
            });

            await new Promise(resolve => setTimeout(resolve, SCROLL_DELAY));

            const screenshot = await chrome.tabs.captureVisibleTab(windowId, {
                format: 'png',
                quality: 90
            });
            screenshots.push(screenshot);

            if (i < maxScreenshots - 1) {
                await new Promise(resolve => setTimeout(resolve, CAPTURE_DELAY));
            }
        } catch (error) {
            console.error(`Error capturing PDF screenshot ${i}:`, error);
            break;
        }
    }

    return screenshots.length > 0 ? screenshots : await captureSinglePdfScreenshot(windowId);
}

// Fallback to capture single screenshot
async function captureSinglePdfScreenshot(windowId) {
    console.log("Capturing single PDF screenshot");
    try {
        const screenshot = await chrome.tabs.captureVisibleTab(windowId, {
            format: 'png',
            quality: 90
        });
        return [screenshot];
    } catch (error) {
        console.error("Error capturing single PDF screenshot:", error);
        throw error;
    }
}
