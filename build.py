import json
import os

TEMPLATE_FILE = 'category-template.html'
CATALOG_FILE = 'data/catalog.json'

with open(TEMPLATE_FILE, 'r') as f:
    template = f.read()

with open(CATALOG_FILE, 'r') as f:
    catalog = json.load(f)

for category in catalog['categories']:
    slug = category['slug']
    title_en = category['title']['en']
    desc_en = category['description']['en']
    
    # Generate some keywords based on title
    keywords = f"{title_en.lower()} quiz, {title_en.lower()} trivia, {slug.replace('-', ' ')} questions, jakh riddles, quiz, trivia"
    
    # Replace placeholders
    html = template.replace('{{SLUG}}', slug)
    html = html.replace('{{SHORT_NAME}}', title_en)
    html = html.replace('{{SEO_TITLE}}', f"{title_en} Quiz & Trivia")
    html = html.replace('{{SEO_DESC}}', desc_en)
    html = html.replace('{{SEO_KEYWORDS}}', keywords)
    
    # Write the output file
    output_path = f"{slug}.html"
    with open(output_path, 'w') as f:
        f.write(html)
        
    print(f"Generated {output_path}")

print("All category pages have been generated successfully!")
