import os
import re

def remove_footer_socials(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # The block looks like this:
    # <div class="footer-socials">
    #   <a href="...">...</a>
    #   <a href="...">...</a>
    # </div>
    # Let's use regex to remove the <div class="footer-socials">...</div>
    # Using re.DOTALL to match across newlines
    new_content = re.sub(r'<div\s+class="footer-socials".*?</div>\s*', '', content, flags=re.DOTALL)
    
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

def main():
    for root, dirs, files in os.walk('.'):
        for file in files:
            if file.endswith('.html'):
                remove_footer_socials(os.path.join(root, file))

if __name__ == "__main__":
    main()
