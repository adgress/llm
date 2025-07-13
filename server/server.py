from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from typing import Tuple
import os
from http import HTTPStatus
from extract_html import extract_text_from_html
from screenshots import extract_text_from_images, save_screenshots
from llms import count_tokens, generate_summary, MIN_INPUT_TOKENS, MAX_INPUT_TOKENS

app = Flask(__name__)
CORS(app)  # Allow Chrome extension access

@app.route("/summarize", methods=["POST"])
def summarize() -> Tuple[Response, int]:
  data = request.get_json()
  pageUrl = data.get("pageUrl", "")
  html_content = data.get("html", "")
  screenshots = data.get("screenshot", "")

  os.makedirs("logs", exist_ok=True)  # Ensure logs directory exists
  if not pageUrl and not html_content:
    print("No URL or HTML content provided for summarization")
    return jsonify({"error": "No URL or HTML content provided"}), HTTPStatus.BAD_REQUEST

  with open("logs/pageUrl.log", "w") as log_file:
    log_file.write(f"Received URL for summarization: {pageUrl}\n")

  # Log the received HTML content for debugging
  with open("logs/html_content.log", "w", encoding="utf-8") as html_log:
    html_log.write(f"Received HTML content:\n{html_content}\n")

  text = extract_text_from_html(html_content)
  print(f"Extracted text from HTML: {text[:20]}...")
  
  
  # Save screenshots if provided and extract text from them
  images = save_screenshots(screenshots)
  image_text = extract_text_from_images(images)
  
  # Combine HTML text with OCR text from images
  if image_text:
    combined_text = image_text
  else:
    combined_text = text
  
  # Log the extracted text for debugging
  with open("logs/extracted_text.log", "w", encoding="utf-8") as text_log:
    text_log.write(f"{text}")
  
  # Save OCR text to separate file if available
  if image_text:
    with open("logs/ocr_text.log", "w", encoding="utf-8") as ocr_log:
      ocr_log.write(f"{image_text}")
    print(f"OCR text saved to logs/ocr_text.log")
  
  token_count = count_tokens(combined_text)
  # token_count = count_tokens(image_text)
  print(f"Token count for input text: {token_count}")
  if token_count > MAX_INPUT_TOKENS:
    print("Input text exceeds token` limit")
    return jsonify({"error": f"Input text exceeds token limit ({token_count}/{MAX_INPUT_TOKENS})"}), HTTPStatus.BAD_REQUEST

  if token_count < MIN_INPUT_TOKENS:
    print("Input text is too short to summarize")
    return jsonify({"error": f"Input text is too short to summarize ({token_count}/{MIN_INPUT_TOKENS})"}), HTTPStatus.BAD_REQUEST
  print("Generating summary with OpenAI...")
  # Call OpenAI API to summarize the text
  try:
    summary = generate_summary(combined_text, pageUrl)
    response = jsonify({"summary": summary})
    print("Generating response:\n", response.get_data(as_text=True))
    return response, HTTPStatus.OK
  except ValueError as e:
    print(f"OpenAI API error: {e}")
    return jsonify({"error": str(e)}), HTTPStatus.INTERNAL_SERVER_ERROR

if __name__ == "__main__":
  app.run(port=5000)
