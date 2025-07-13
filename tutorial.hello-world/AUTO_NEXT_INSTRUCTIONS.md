# Chrome Extension Auto-Next Button Instructions

## What was added:

1. **Detection**: Added `isAmazonOrderHistoryPage()` function to detect Amazon order history pages
2. **Auto-click**: Added `clickNextButton()` function that finds and clicks the pagination Next button
3. **User feedback**: Shows when the Next button is clicked in the extension popup

## How it works:

1. Extension takes screenshots of the current page
2. Sends data to your Flask server for summarization
3. Displays the summary in the popup
4. **NEW**: If it's an Amazon order history page, automatically clicks the "Next" button after 1 second
5. User feedback shows "[Automatically moved to next page]" when successful

## Testing:

1. **Reload the extension** in Chrome Extensions manager
2. Navigate to an Amazon order history page (`amazon.com/your-orders/orders`)
3. Click the extension icon
4. Watch as it:
   - Takes screenshots
   - Generates summary
   - Automatically clicks "Next" button
   - Moves to the next page of orders

## Key selectors used:

- **Next button**: `ul.a-pagination li.a-last a` (contains "Next" text)
- **Page detection**: URL contains `amazon.com` and `/your-orders/orders`

## Configuration:

- `NEXT_BUTTON_DELAY = 1000` (1 second delay before clicking Next)
- Works only on Amazon order history pages
- Safely handles cases where Next button doesn't exist (last page)

## Troubleshooting:

- If Next button doesn't click, check browser console for error messages
- Make sure the page has fully loaded before using the extension
- The extension will only work on Amazon order history pages specifically

## Future enhancements:

- Could extend to other paginated sites by adding more detection functions
- Could add configuration options for different delay timings
- Could add support for "Previous" button or specific page numbers
