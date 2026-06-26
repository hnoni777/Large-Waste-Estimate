import pandas as pd

try:
    df = pd.read_excel('2026-06-26.xls')
    print("Columns:", list(df.columns))
    print(df.head(3))
except Exception as e:
    import traceback
    traceback.print_exc()
