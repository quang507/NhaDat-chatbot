import pandas as pd
import sys

file_path = r'C:\Users\QuangLêBáDuy\OneDrive - Nha Dat Co Ltd\Team Mktg - NPD mktg\mktg - private\03_Content\ChatBot, LiveSlide\ChatBotData_Upload\Data_productlist.xlsx'
df = pd.read_excel(file_path, sheet_name='Data')

df.columns = df.iloc[2]
df = df[3:]

import os
output_md = r'C:\Users\QuangLêBáDuy\.gemini\antigravity\scratch\NhaDat-chatbot\data\ThongTinCacCan_ProductList.md'
os.makedirs(os.path.dirname(output_md), exist_ok=True)
markdown_lines = []
markdown_lines.append("# Thông Tin Chi Tiết Các Căn Hộ/Nhà Ở (Tổng hợp từ danh sách sản phẩm)")

# Drop rows where 'Lô đất' is NaN
df = df.dropna(subset=['Lô đất'])

for index, row in df.iterrows():
    lo_dat = str(row.get('Lô đất', '')).strip()
    if not lo_dat or lo_dat.lower() == 'nan': continue
    
    mau_nha = str(row.get('Mẫu nhà', '')).strip()
    dt_dat = str(row.get('DT đất theo GCN (m2)', '')).strip()
    dt_san = str(row.get('DT sàn GPXD (m2)', '')).strip()
    kich_thuoc = str(row.get('Kích thước lô đất ( theo sơ đồ phân lô)', '')).strip()
    dt_ham = str(row.get('DT hầm GPXD (m2)', '')).strip()
    huong = str(row.get('Hướng nhà', '')).strip()
    dia_chi = str(row.get('Địa chỉ', '')).strip()
    
    if dia_chi == 'nan': dia_chi = 'Chưa có thông tin'
    if dt_ham == 'nan': dt_ham = 'Không có'
    
    para = f"## 🏠 Thông tin Lô đất số {lo_dat}\n\n"
    para += f"Lô đất số **{lo_dat}** được xây dựng theo **{mau_nha}**. "
    para += f"Căn nhà toạ lạc tại địa chỉ: **{dia_chi}**. "
    para += f"Hướng nhà là **{huong}**. "
    para += f"Về diện tích, diện tích đất theo GCN là **{dt_dat} m2**, với tổng diện tích sàn GPXD là **{dt_san} m2**. "
    if dt_ham != 'Không có':
        para += f"Diện tích hầm GPXD là **{dt_ham} m2**. "
    para += f"Kích thước lô đất (theo sơ đồ phân lô) là: **{kich_thuoc}**. "
    
    markdown_lines.append(para)

with open(output_md, 'w', encoding='utf-8') as f:
    f.write('\n\n'.join(markdown_lines))

print(f"Successfully processed {len(markdown_lines) - 1} houses and saved to {output_md}")
