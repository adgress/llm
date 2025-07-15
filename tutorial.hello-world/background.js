chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    await chrome.sidePanel.setOptions({
        tabId,
        path: 'llm_sidebar.html',
        enabled: true
    });
});

// Set up the side panel to open automatically on action click
chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Handle extension button click
chrome.action.onClicked.addListener(async (tab) => {
    try {
        const options = await chrome.sidePanel.getOptions({ tabId: tab.id });
        console.log('Extension button clicked, isPanelOpen:', options.enabled);
        if (options.enabled) {
            // Close the side panel by disabling it
            await chrome.sidePanel.setOptions({
                tabId: tab.id,
                enabled: false
            });
            console.log('Side panel closed');
        } else {
            await chrome.sidePanel.setOptions({
                tabId: tab.id,
                enabled: true
            });
            console.log('Side panel opened');
        }
    } catch (error) {
        console.error('Error opening side panel:', error);
    }
});
``