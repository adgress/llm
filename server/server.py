from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from typing import Tuple
import os
import base64
import requests
from http import HTTPStatus
from io import BytesIO
from extract_html import extract_text_from_html
from screenshots import extract_text_from_images, save_screenshots
from llms import count_tokens, generate_summary, MIN_INPUT_TOKENS, MAX_INPUT_TOKENS

# Try to import PyPDF2, handle if not installed
import PyPDF2
PDF_SUPPORT = True

# Try to import pdf2image for PNG conversion
from pdf2image import convert_from_bytes
PDF_TO_IMAGE_SUPPORT = True

app = Flask(__name__)
CORS(app)  # Allow Chrome extension access

def process_pdf_data(pdf_data: str, page_url: str, additional_instructions: str) -> Tuple[Response, int]:
  """Process PDF data and return summary"""
  print("Processing PDF content")
  if not PDF_SUPPORT:
    return jsonify({"error": "PDF processing not available. PyPDF2 not installed."}), HTTPStatus.INTERNAL_SERVER_ERROR
  
  try:
    # Process PDF data (base64 encoded)
    pdf_bytes = base64.b64decode(pdf_data)
    pdf_file = BytesIO(pdf_bytes)
    pdf_reader = PyPDF2.PdfReader(pdf_file)
    
    text = ""
    for page in pdf_reader.pages:
      text += page.extract_text() + "\n"
    
    # Log the extracted PDF text for debugging
    with open("logs/pdf_text.log", "w", encoding="utf-8") as pdf_log:
      pdf_log.write(f"URL: {page_url}\n")
      pdf_log.write(f"Extracted PDF text:\n{text}\n")
    print(f"PDF text saved to logs/pdf_text.log")
    
    # Convert PDF to PNG images and save them
    if PDF_TO_IMAGE_SUPPORT:
      try:
        # Create directory for PDF screenshots
        os.makedirs("logs/pdf_screenshots", exist_ok=True)
        
        # Convert PDF bytes to images
        images = convert_from_bytes(pdf_bytes, dpi=200, fmt='PNG')
        
        # Save each page as a PNG file
        for i, image in enumerate(images):
          if (i >= 5):
            break
          filename = f"logs/pdf_screenshots/pdf_page_{i+1}.png"
          image.save(filename, 'PNG')
          print(f"Saved PDF page {i+1} as {filename}")
        
        print(f"Successfully converted PDF to {i} PNG images")
        
      except Exception as e:
        print(f"Error converting PDF to PNG: {e}")
    else:
      print("PDF to PNG conversion skipped - pdf2image not available")
    
    if not text.strip():
      return jsonify({"error": "Could not extract text from PDF"}), HTTPStatus.BAD_REQUEST
    if len(text) < MIN_INPUT_TOKENS:
      return jsonify({"error": f"Extracted text is too short to summarize ({len(text)}/{MIN_INPUT_TOKENS})"}), HTTPStatus.BAD_REQUEST
    if len(text) > MAX_INPUT_TOKENS:
      text = text[:MAX_INPUT_TOKENS]  # Truncate to max tokens if needed
    # Generate summary for PDF text
    summary = generate_summary(text[:3000], page_url, [], additional_instructions)
    return jsonify({"summary": summary}), HTTPStatus.OK
    
  except Exception as e:
    print(f"Error processing PDF: {e}")
    return jsonify({"error": f"Error processing PDF: {str(e)}"}), HTTPStatus.INTERNAL_SERVER_ERROR

@app.route("/summarize", methods=["POST"])
def summarize() -> Tuple[Response, int]:
  data = request.get_json()
  pageUrl = data.get("pageUrl", "")
  html_content = data.get("html", "")
  screenshots = data.get("screenshot", "")
  additional_instructions = data.get("additionalInstructions", "")
  
  # New PDF handling
  is_pdf = data.get("isPdf", False)
  pdf_data = data.get("pdfData", "")
  direct_pdf_url = data.get("directPdfUrl", "")
  extracted_text = data.get("extractedText", "")

  os.makedirs("logs", exist_ok=True)  # Ensure logs directory exists
  
  # Handle PDF content
  if is_pdf:
    if direct_pdf_url:
      # Handle direct PDF URL (like arXiv)
      try:
        print(f"Processing direct PDF URL: {direct_pdf_url}")
        response = requests.get(direct_pdf_url)
        if response.status_code == 200:
          return process_pdf_data(base64.b64encode(response.content).decode(), pageUrl, additional_instructions)
        else:
          return jsonify({"error": f"Failed to download PDF: {response.status_code}"}), HTTPStatus.BAD_REQUEST
      except Exception as e:
        print(f"Error downloading PDF: {e}")
        return jsonify({"error": f"Error downloading PDF: {str(e)}"}), HTTPStatus.INTERNAL_SERVER_ERROR
    elif pdf_data:
      # Handle blob data
      return process_pdf_data(pdf_data, pageUrl, additional_instructions)
    else:
      return jsonify({"error": "No PDF data provided"}), HTTPStatus.BAD_REQUEST
  
  # Handle extracted text from PDF viewer
  elif extracted_text:
    try:
      # Use the extracted text directly
      summary = generate_summary(extracted_text, pageUrl, [], additional_instructions)
      return jsonify({"summary": summary}), HTTPStatus.OK
    except Exception as e:
      print(f"Error processing extracted text: {e}")
      return jsonify({"error": f"Error processing extracted text: {str(e)}"}), HTTPStatus.INTERNAL_SERVER_ERROR
  
  # Original HTML processing logic
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
  # Log the extracted text for debugging
  with open("logs/extracted_text.log", "w", encoding="utf-8") as text_log:
    text_log.write(f"{text}")
  
  # Save screenshots if provided and extract text from them
  images = save_screenshots(screenshots)
  image_text = extract_text_from_images(images)
  
    # Save OCR text to separate file if available
  if image_text:
    with open("logs/ocr_text.log", "w", encoding="utf-8") as ocr_log:
      ocr_log.write(f"{image_text}")
    print(f"OCR text saved to logs/ocr_text.log")
  
  combined_text = text
  # Combine HTML text with OCR text from images
  if image_text:
    combined_text += "\n\n" + image_text
  
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
    summary = generate_summary(combined_text, pageUrl, images, additional_instructions)
    response = jsonify({"summary": summary})
    print("Generating response:\n", response.get_data(as_text=True))
    return response, HTTPStatus.OK
  except ValueError as e:
    print(f"OpenAI API error: {e}")
    return jsonify({"error": str(e)}), HTTPStatus.INTERNAL_SERVER_ERROR

if __name__ == "__main__":
  app.run(port=5000)
