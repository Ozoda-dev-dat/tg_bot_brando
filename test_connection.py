import os
import psycopg2

DATABASE_URL = os.getenv('DATABASE_URL')

try:
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()
    
    print("✓ Database connection successful!")
    
    cursor.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
    """)
    
    tables = cursor.fetchall()
    print(f"\n✓ Found {len(tables)} tables:")
    for table in tables:
        print(f"  - {table[0]}")
    
    cursor.execute("""
        SELECT routine_name 
        FROM information_schema.routines 
        WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';
    """)
    
    functions = cursor.fetchall()
    print(f"\n✓ Found {len(functions)} function(s):")
    for func in functions:
        print(f"  - {func[0]}")
    
    cursor.close()
    conn.close()
    
    print("\n✓ All database objects created successfully!")
    
except Exception as e:
    print(f"✗ Error: {e}")
