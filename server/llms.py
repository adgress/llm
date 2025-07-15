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

def is_doordash_order_history_page(url: str) -> bool:
    """Check if the URL is a DoorDash order history page"""
    return "doordash.com" in url and "orders" in url

def is_twitter_page(url: str) -> bool:
    """Check if the URL is a Twitter page"""
    return "x.com" in url

def get_website_prompt(page_url: str) -> str:
    """Generate a prompt based on the website URL"""
    if is_amazon_order_history_page(page_url):
        return (
            """
            This is an order history from amazon.com. Please only include the list of products
            and their prices. Only include items that were purchased. Don't include items from
            the 'Recommended based on your purchase' section. The output should be a numbered list.
            """
        )
    elif is_doordash_order_history_page(page_url):
        return (
            """
            This is an order history from doordash.com. Please summarize the orders placed,
            including the restaurant names and order details.
            """
        )
    elif is_twitter_page(page_url):
        return (
            """
            \n\nThis is a Twitter (AKA X) feed. Please summarize the posts, including the main topics discussed
            and any notable interactions.
            Only include the most relevant tweets and avoid excessive details.
            The output should be a numbered list, concise and focused on the main themes of the conversation.
            Each item in the list should have links to the most relevant tweets.
            """
        )
    else:
        return f"Summarize the following text from the following website {page_url}."

def generate_summary(combined_text: str, page_url: str, screenshots: list[bytes], additional_instructions: str = "") -> str:
    """Generate summary using OpenAI API"""
    assert os.getenv("OPENAI_API_KEY"), "OPENAI API key not set in environment variables"
    
    client = OpenAI(
        api_key=os.getenv("OPENAI_API_KEY")
    )
    
    prompt = get_website_prompt(page_url)
    
    # Add additional instructions if provided
    if additional_instructions:
        prompt += f"\n\nAdditional instructions: {additional_instructions}"
    
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
        }) # type: ignore
    
    # raise ValueError("Skipping OpenAI API call for debugging")
    messages = [ # type: ignore
        {"role": "system", "content": [{"type": "text", "text": prompt}]},
        {"role": "user", "content": user_content}  # type: ignore
    ] 
    completion = client.chat.completions.create(
        model="gpt-4o",
        messages=messages, # type: ignore
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
