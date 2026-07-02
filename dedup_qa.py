import os
import re
from difflib import SequenceMatcher

def similar(a, b):
    return SequenceMatcher(None, a, b).ratio()

qa_file = r"C:\Users\QuangLêBáDuy\OneDrive - Nha Dat Co Ltd\Team Mktg - NPD mktg\mktg - private\03_Content\ChatBot, LiveSlide\ChatBotData_Upload\qa-generated.md"

with open(qa_file, 'r', encoding='utf-8') as f:
    content = f.read()

blocks = re.split(r'\n(?=Q: )', content.strip())
unique_qas = []

for block in blocks:
    if not block.strip(): continue
    lines = block.strip().split('\n')
    qs = []
    a_lines = []
    for line in lines:
        if line.startswith('Q:'):
            qs.append(line.replace('Q:', '').strip())
        elif line.startswith('A:'):
            a_lines.append(line.replace('A:', '').strip())
        else:
            if a_lines:
                a_lines.append(line.strip())
    
    ans = '\n'.join(a_lines).strip()
    if ans:
        # Check if ans is similar to any existing ans
        found = False
        for item in unique_qas:
            if similar(item['ans'], ans) > 0.8:  # 80% similarity threshold
                item['qs'].extend(qs)
                found = True
                break
        if not found:
            unique_qas.append({'ans': ans, 'qs': qs})

new_content = ""
for item in unique_qas:
    ans = item['ans']
    qs = item['qs']
    # Deduplicate questions within the group
    qs = list(set(qs))
    combined_q = " / ".join(qs)
    new_content += f"Q: {combined_q}\nA: {ans}\n\n"

with open(qa_file, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"Processed {len(blocks)} QA blocks into {len(unique_qas)} unique answers after fuzzy merge (ratio > 0.8).")
