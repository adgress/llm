// Configuration constants
const MAX_SCREENSHOTS = 10; // Reduced limit to be more conservative
const SCROLL_DELAY = 200; // Delay after scrolling before capture
const CAPTURE_DELAY = 500; // Delay between screenshot captures
const SCREENSHOT_QUALITY = 90; // PNG quality for screenshots

// Show loading message immediately
const resultElement = document.getElementById("result");
resultElement.textContent = "Loading summary...";
resultElement.className = "loading";

// Function to detect if URL is likely a PDF
function isPdfUrl(url) {
  return url.includes('/pdf/') ||           // arXiv, many academic sites
         url.endsWith('.pdf') ||            // Direct PDF files
         url.includes('pdf?') ||            // PDF with query params
         url.includes('filetype=pdf') ||    // Some document viewers
         url.match(/\/pdf\/\d+/) ||         // arXiv-specific pattern
         url.includes('arxiv.org/pdf/');    // Explicit arXiv PDF check
}

// Function to show error message
function showError(message) {
  const resultElement = document.getElementById("result");
  resultElement.textContent = message;
  resultElement.className = "error";
}

// Function to show success message
function showSuccess(message) {
  const resultElement = document.getElementById("result");
  resultElement.textContent = message;
  resultElement.className = "success";
}

// Function to capture full page screenshot
async function captureFullPageScreenshot(tabId, windowId) {
  try {
    // Scroll to top before starting
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => window.scrollTo(0, 0)
    });

    // Get page dimensions
    const [{ result: pageHeight }] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => document.documentElement.scrollHeight
    });

    // Store original viewport height
    const [{ result: viewportHeight }] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => window.innerHeight
    });

    // Calculate number of screenshots needed
    const numScreenshots = Math.ceil(pageHeight / viewportHeight);
    
    // Limit the number of screenshots to avoid quota issues
    const actualScreenshots = Math.min(numScreenshots, MAX_SCREENSHOTS);
    
    let screenshots = [];

    for (let i = 0; i < actualScreenshots; i++) {
      // Scroll to next viewport
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (y) => window.scrollTo(0, y),
        args: [i * viewportHeight]
      });

      // Wait for scroll to finish and add rate limiting delay
      await new Promise(resolve => setTimeout(resolve, SCROLL_DELAY));

      // Capture screenshot with rate limiting
      const screenshot = await chrome.tabs.captureVisibleTab(windowId, {
        format: 'png',
        quality: SCREENSHOT_QUALITY
      });
      screenshots.push(screenshot);
      
      // Add delay between captures to respect rate limits
      if (i < actualScreenshots - 1) { // Don't delay after the last screenshot
        await new Promise(resolve => setTimeout(resolve, CAPTURE_DELAY));
      }
    }

    // Restore scroll position
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => window.scrollTo(0, 0)
    });

    console.log(`Captured ${screenshots.length} screenshots out of ${numScreenshots} needed`);
    return screenshots;
  } catch (error) {
    // If full page capture fails due to quota, fall back to single screenshot
    console.warn("Full page capture failed, falling back to single screenshot:", error);
    return await captureSingleScreenshot(windowId);
  }
}

// Fallback function to capture just the visible area
async function captureSingleScreenshot(windowId) {
  const screenshot = await chrome.tabs.captureVisibleTab(windowId, {
    format: 'png',
    quality: SCREENSHOT_QUALITY
  });
  return [screenshot]; // Return as array for consistency
}

// Auto-run summarization when popup opens
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const pageUrl = tab.url; // Get the URL of the active tab
  
  // Check if this is a PDF URL
  if (isPdfUrl(pageUrl)) {
    showError("PDF summarization is not currently supported. This appears to be a PDF document.");
    return;
  }
  
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: function () {
      return document.documentElement.outerHTML;
    }
  }, async (results) => {
    console.log(results);
    if (!results || !results[0] || !results[0].result) {
      showError("Cannot summarize this page. Unable to access page content.");
      return;
    }
    
    // Capture screenshot of the visible tab
    try {
      const screenshots = await captureFullPageScreenshot(tab.id, tab.windowId);
      
      console.log("Screenshot captured successfully");
      
      const response = await fetch("http://localhost:5000/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          pageUrl: pageUrl,
          html: results[0].result,
          screenshot: screenshots
        })
      });
      console.log(response);
      if (!response.ok) {
        let errorMessage = `Server error ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // If JSON parsing fails, try to get plain text
          try {
            const errorText = await response.text();
            if (errorText) {
              errorMessage = errorText;
            }
          } catch {
            // If everything fails, use default message
            errorMessage = `Server error ${response.status}`;
          }
        }
        console.error(`Server error (${response.status}):`, errorMessage);
        showError(errorMessage);
        return;
      }
      const summary = await response.json();
      showSuccess(summary.summary || "Error summarizing - no content returned.");
    } catch (err) {
      console.error("Detailed error:", err);
      let errorMessage = "An error occurred.";
      
      if (err.message) {
        errorMessage = `Error: ${err.message}`;
      }
      
      // Check for specific error types
      if (err.name === "TypeError" && err.message.includes("fetch")) {
        errorMessage = "Cannot connect to server. Make sure the server is running on localhost:5000.";
      } else if (err.message.includes("Extension context invalidated")) {
        errorMessage = "Extension was reloaded. Please close and reopen the popup.";
      } else if (err.message.includes("tabs.captureVisibleTab")) {
        errorMessage = "Screenshot capture failed. The extension may need additional permissions.";
      }
      
      document.getElementById("result").textContent = errorMessage;
      document.getElementById("result").className = "error";
    }
  });
});