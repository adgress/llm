from openai import OpenAI
import os
import tiktoken

LLM_MODEL = "gpt-3.5-turbo"
MIN_INPUT_TOKENS = 50  # Minimum tokens for the model to summarize
MAX_INPUT_TOKENS = 10000  # Maximum tokens for the model
MAX_OUTPUT_TOKENS = 4096  # Maximum tokens for the output

def count_tokens(text: str, model: str = LLM_MODEL) -> int:
    encoding = tiktoken.encoding_for_model(model)
    return len(encoding.encode(text))

def generate_summary(combined_text: str, page_url: str) -> str:
    """Generate summary using OpenAI API"""
    assert os.getenv("OPENAI_API_KEY"), "OPENAI API key not set in environment variables"
    
    client = OpenAI(
        api_key=os.getenv("OPENAI_API_KEY")
    )
    
    prompt = (
        f"Summarize the following text from the following website {page_url}. " + 
        "This may include both web page content and text extracted from screenshots."
    )
    if "amazon.com" in page_url and "order-history" in page_url:
        prompt += (
            "\n\nThis is an order history from amazon.com. Please only include the list of products "
            "and their prices. Only include items that were purchased. Don't include items from "
            "the 'Recommended based on your purchase' section."
        )
    print(f"Using prompt: {prompt}")
    completion = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": combined_text}
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
