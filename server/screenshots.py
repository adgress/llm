import base64
import pytesseract
from PIL import Image
import io
import os
import shutil


def extract_text_from_images(image_bytes_list: list[bytes]) -> str:
    """Extract text from images using OCR (pytesseract)"""
    if not image_bytes_list:
        return ""
    
    extracted_texts = []
    
    for i, image_bytes in enumerate(image_bytes_list):
        try:
            # Convert bytes to PIL Image
            image = Image.open(io.BytesIO(image_bytes))
            
            # Extract text using pytesseract
            text = pytesseract.image_to_string(image)
            
            if text.strip():  # Only add non-empty text
                extracted_texts.append(f"--- Screenshot {i+1} Text ---\n{text.strip()}")
                print(f"Extracted {len(text.strip())} characters from screenshot {i+1}")
            else:
                print(f"No text found in screenshot {i+1}")
                
        except Exception as e:
            print(f"Error extracting text from screenshot {i+1}: {e}")
    
    combined_text = "\n\n".join(extracted_texts)
    return combined_text


def save_screenshots(screenshots: list[str]) -> list[bytes]:
    """Save array of screenshot data URLs to files"""
    if not screenshots:
        return []
    images: list[bytes] = []
    try:
        # Clean up and recreate screenshots directory
        screenshots_dir = "logs/screenshots"
        if os.path.exists(screenshots_dir):
            shutil.rmtree(screenshots_dir)
            print(f"Deleted existing screenshots directory: {screenshots_dir}")
        
        os.makedirs(screenshots_dir, exist_ok=True)
        print(f"Created clean screenshots directory: {screenshots_dir}")
        
        print(f"Received {len(screenshots)} screenshot(s)")
        
        for i, screenshot in enumerate(screenshots):
            if screenshot.startswith("data:image/png;base64,"):
                # Extract base64 data from data URL (remove "data:image/png;base64," prefix)
                base64_data = screenshot.split(",")[1]
                screenshot_bytes = base64.b64decode(base64_data)
                
                # Save each screenshot with a unique filename
                filename = f"logs/screenshots/screenshot_{i+1}.png" if len(screenshots) > 1 else "logs/screenshot.png"
                with open(filename, "wb") as screenshot_file:
                    screenshot_file.write(screenshot_bytes)
                images.append(screenshot_bytes)
                print(f"Screenshot {i+1} saved successfully as {filename}")
            else:
                print(f"Invalid screenshot format for screenshot {i+1}")
                
    except Exception as e:
        print(f"Error saving screenshot: {e}")
    return images
