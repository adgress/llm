from openai import OpenAI
import os
import tiktoken

import base64

LLM_MODEL = "gpt-4o"  # Changed to vision model
MIN_INPUT_TOKENS = 50  # Minimum tokens for the model to summarize
MAX_INPUT_TOKENS = 10000  # Maximum tokens for the model
MAX_OUTPUT_TOKENS = 4096  # Maximum tokens for the output

def count_tokens(text: str, model: str = LLM_MODEL) -> int:
    encoding = tiktoken.encoding_for_model(model)
    return len(encoding.encode(text))

def is_amazon_order_history_page(url: str) -> bool:
    """Check if the URL is an Amazon order history page"""
    return "amazon.com" in url and "your-orders" in url

def generate_summary(combined_text: str, page_url: str, screenshots: list[bytes]) -> str:
    """Generate summary using OpenAI API"""
    assert os.getenv("OPENAI_API_KEY"), "OPENAI API key not set in environment variables"
    
    client = OpenAI(
        api_key=os.getenv("OPENAI_API_KEY")
    )
    
    if is_amazon_order_history_page(page_url):
        prompt = (
            "\n\nThis is an order history from amazon.com. Please only include the list of products "
            "and their prices. Only include items that were purchased. Don't include items from "
            "the 'Recommended based on your purchase' section.  The output should be a numbered list."
        )
    else:
        prompt = (
        f"Summarize the following text from the following website {page_url}. " + 
        "This may include both web page content and text extracted from screenshots."
    )
    print(f"Using prompt: {prompt}")
    
    # Create user message with text and optionally the first screenshot
    user_content = [{"type": "text", "text": combined_text}]
    
    # Add first screenshot if available
    if screenshots and len(screenshots) > 0:
        # Convert bytes to base64 string
        screenshot_base64 = base64.b64encode(screenshots[0]).decode('utf-8')
        user_content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/png;base64,{screenshot_base64}"
            }
        })
    
    raise ValueError("Skipping OpenAI API call for debugging")

    completion = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_content}  # type: ignore
        ],
        max_tokens=MAX_OUTPUT_TOKENS,
        temperature=0.0
    )
    
    # Log only the summary content, not the entire response object
    if completion.choices and completion.choices[0].message:
        print("OpenAI summary generated successfully")
    
    if not completion.choices or not completion.choices[0].message:
        raise ValueError("No valid response from OpenAI")
    
    summary = completion.choices[0].message.content
    if summary is None:
        raise ValueError("Empty response from OpenAI")
    
    # Save summary to logs directory
    try:
        os.makedirs("logs", exist_ok=True)
        with open("logs/summary.log", "w", encoding="utf-8") as f:
            f.write(f"URL: {page_url}\n")
            f.write(f"Summary:\n{summary.strip()}\n")
        print("Summary saved to logs/summary.log")
    except Exception as e:
        print(f"Error saving summary to logs: {e}")
    
    return summary.strip()
