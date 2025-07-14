chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    await chrome.sidePanel.setOptions({
        tabId,
        path: 'hello.html',
        enabled: true
    });
});

// Handle extension button click
chrome.action.onClicked.addListener(async (tab) => {
    try {
        // Open the side panel for the current window
        await chrome.sidePanel.open({
            windowId: tab.windowId
        });
    } catch (error) {
        console.error('Error opening side panel:', error);
    }
});
``