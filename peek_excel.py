import pandas as pd
import sys

file_path = r'C:\Users\QuangLêBáDuy\OneDrive - Nha Dat Co Ltd\Team Mktg - NPD mktg\mktg - private\03_Content\ChatBot, LiveSlide\ChatBotData_Upload\Data_productlist.xlsx'
xls = pd.ExcelFile(file_path)

with open('peek.txt', 'w', encoding='utf-8') as f:
    f.write(f"Sheets: {xls.sheet_names}\n")
    for sheet in xls.sheet_names:
        df = pd.read_excel(file_path, sheet_name=sheet)
        f.write(f"\n--- Sheet: {sheet} ---\n")
        f.write(f"Columns: {list(df.columns)}\n")
        f.write(f"Head:\n{df.head(10).to_markdown()}\n")
        f.write(f"Shape: {df.shape}\n")
