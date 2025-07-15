// Configuration constants
const MAX_SCREENSHOTS = 10; // Reduced limit to be more conservative
const SCROLL_DELAY = 200; // Delay after scrolling before capture
const CAPTURE_DELAY = 500; // Delay between screenshot captures
const SCREENSHOT_QUALITY = 90; // PNG quality for screenshots
const NEXT_BUTTON_DELAY = 1000; // Delay before clicking next button


// Show initial message
const resultElement = document.getElementById("result");
resultElement.textContent = "Click 'Summarize Page' to get started...";
resultElement.className = "loading";


console.log("Sidebar extension loaded in:", window.location.href);

// Add event listener for the summarize button
document.addEventListener('DOMContentLoaded', function () {
  const summarizeBtn = document.getElementById('summarize-btn');
  const instructionsInput = document.getElementById('instructions-input');

  if (summarizeBtn) {
    summarizeBtn.addEventListener('click', function () {
      this.disabled = true;
      this.textContent = 'Summarizing...';
      resultElement.textContent = "Analyzing page content...";
      resultElement.className = "loading";

      // Get additional instructions from the text box
      const additionalInstructions = instructionsInput ? instructionsInput.value.trim() : '';

      summarizeCurrentTab(additionalInstructions).finally(() => {
        this.disabled = false;
        this.textContent = 'Summarize Page';
      });
    });
  }
});

// Function to detect if URL is likely a PDF
function isPdfUrl(url) {
  return url.includes('/pdf/') ||           // arXiv, many academic sites
    url.endsWith('.pdf') ||            // Direct PDF files
    url.includes('pdf?') ||            // PDF with query params
    url.includes('filetype=pdf') ||    // Some document viewers
    url.match(/\/pdf\/\d+/) ||         // arXiv-specific pattern
    url.includes('arxiv.org/pdf/');    // Explicit arXiv PDF check
}

// Function to check if this is an Amazon order history page
function isAmazonOrderHistoryPage(url) {
  return url.includes('amazon.com') && url.includes('/your-orders/orders');
}

function isTwitterPage(url) {
  // Check if the URL is a Twitter page
  return url.includes('twitter.com') || url.includes('x.com');
}

// Function to check if the Next button is currently visible
async function isNextButtonVisible(tabId) {
  try {
    const [{ result: buttonInfo }] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        // Look for the Next button in pagination
        const nextButton = document.querySelector('ul.a-pagination li.a-last a');
        if (nextButton && nextButton.textContent.includes('Next')) {
          // Check if the button is visible
          const rect = nextButton.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0 &&
            rect.top >= 0 && rect.left >= 0 &&
            rect.bottom <= window.innerHeight &&
            rect.right <= window.innerWidth;

          const computedStyle = window.getComputedStyle(nextButton);
          const isDisplayed = computedStyle.display !== 'none' &&
            computedStyle.visibility !== 'hidden' &&
            computedStyle.opacity !== '0';

          return {
            exists: true,
            visible: isVisible && isDisplayed,
            text: nextButton.textContent.trim(),
            bounds: rect
          };
        }
        return {
          exists: false,
          visible: false,
          text: '',
          bounds: null
        };
      }
    });

    console.log("Next button visibility check:", buttonInfo);
    return buttonInfo;
  } catch (error) {
    console.error("Error checking Next button visibility:", error);
    return {
      exists: false,
      visible: false,
      text: '',
      bounds: null
    };
  }
}

// Function to click the Next button on Amazon order history page
async function clickNextButton(tabId) {
  try {

    const [{ result: nextButtonExists }] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        // Look for the Next button in pagination
        const nextButton = document.querySelector('ul.a-pagination li.a-last a');
        if (nextButton && nextButton.textContent.includes('Next')) {
          nextButton.click();
          return true;
        }
        return false;
      }
    });

    if (nextButtonExists) {
      console.log("Successfully clicked Next button");
      return true;
    } else {
      console.log("Next button not found during click attempt");
      return false;
    }
  } catch (error) {
    console.error("Error clicking Next button:", error);
    return false;
  }
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
    // Get tab information first
    const tab = await chrome.tabs.get(tabId);

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

      // Check if this is Amazon order history and if Next button is visible
      if (isAmazonOrderHistoryPage(tab.url)) {
        const buttonInfo = await isNextButtonVisible(tabId);
        if (buttonInfo.visible) {
          console.log("Next button is visible, stopping capture");
          break;
        }
      }

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

// Function to summarize the current active tab
async function summarizeCurrentTab(additionalInstructions = '') {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const pageUrl = tab.url;

    // Check if this is a PDF URL
    if (isPdfUrl(pageUrl)) {
      showError("PDF summarization is not currently supported. This appears to be a PDF document.");
      return;
    }

    // Get page HTML
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function () {
        return document.documentElement.outerHTML;
      }
    });

    console.log(results);
    if (!results || !results[0] || !results[0].result) {
      showError("Cannot summarize this page. Unable to access page content.");
      return;
    }

    // Capture screenshot of the visible tab
    try {
      // const screenshots = await captureFullPageScreenshot(tab.id, tab.windowId);
      let screenshots = [];
      if (isTwitterPage(pageUrl)) {
        screenshots = await captureFullPageScreenshot(tab.id, tab.windowId);
      }


      console.log("Screenshot captured successfully");

      const response = await fetch("http://localhost:5000/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageUrl: pageUrl,
          html: results[0].result,
          screenshot: screenshots,
          additionalInstructions: additionalInstructions
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

      // Check if this is Amazon order history page and click Next button
      if (isAmazonOrderHistoryPage(pageUrl)) {
        console.log("Detected Amazon order history page, attempting to click Next button");
        setTimeout(async () => {
          const clicked = await clickNextButton(tab.id);
          if (clicked) {
            showSuccess((summary.summary || "Summary generated") + "\n\n[Automatically moved to next page]");
          }
        }, NEXT_BUTTON_DELAY);
      }
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
  } catch (error) {
    console.error("Error in summarizeCurrentTab:", error);
    showError("Failed to get current tab information.");
  }
}

// Button click handler is set up in DOMContentLoaded event listener above