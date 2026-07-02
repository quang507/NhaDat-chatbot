import os
import sys
import hashlib
from collections import defaultdict
import fnmatch

sys.stdout.reconfigure(encoding='utf-8')

data_dir = r"C:\Users\QuangLêBáDuy\OneDrive - Nha Dat Co Ltd\Team Mktg - NPD mktg\mktg - private\03_Content\ChatBot, LiveSlide\ChatBotData_Upload"

empty_files = []
hashes = defaultdict(list)
md_files = []

for root, dirs, files in os.walk(data_dir):
    for f in files:
        if f.startswith('~') or f.startswith('.'): continue
        if not f.endswith('.md'): continue
        filepath = os.path.join(root, f)
        abs_path = os.path.abspath(filepath)
        if not abs_path.startswith("\\\\?\\"):
            abs_path = "\\\\?\\" + abs_path
        
        md_files.append(abs_path)
        
        try:
            with open(abs_path, 'r', encoding='utf-8') as file:
                content = file.read().strip()
                if not content:
                    empty_files.append(abs_path)
                    continue
                
                # MD5 hash
                file_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
                hashes[file_hash].append(abs_path)
        except Exception as e:
            print(f"Error reading {abs_path}: {e}")

duplicates = {k: v for k, v in hashes.items() if len(v) > 1}

print(f"Total MD files: {len(md_files)}")
print(f"Empty files: {len(empty_files)}")
for ef in empty_files:
    print(f" - {ef.replace('\\\\?\\', '')}")

print(f"Duplicate file groups: {len(duplicates)}")
for k, v in duplicates.items():
    print(f"Group ({len(v)} files):")
    for filepath in v:
        print(f" - {filepath.replace('\\\\?\\', '')}")

qa_files = [f for f in md_files if "qa" in f.lower() or "câu hỏi" in f.lower()]
print(f"QA files found: {len(qa_files)}")
for qf in qa_files:
    print(f" - {qf.replace('\\\\?\\', '')}")
