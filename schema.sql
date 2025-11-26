-- CREATE TABLE masters (
--     id SERIAL PRIMARY KEY,
--     name TEXT,
--     phone TEXT UNIQUE,
--     telegram_id BIGINT UNIQUE,
--     region TEXT
-- );

-- CREATE TABLE warehouse (
--     id SERIAL PRIMARY KEY,
--     name TEXT,
--     quantity INT DEFAULT 0,
--     price NUMERIC,
--     category TEXT,
--     subcategory TEXT,
--     region TEXT
-- );

-- CREATE TABLE clients (
--     id SERIAL PRIMARY KEY,
--     name TEXT,
--     phone TEXT,
--     address TEXT
-- );

-- CREATE TABLE orders (
--     id SERIAL PRIMARY KEY,
--     master_id INT REFERENCES masters(id),
--     client_name TEXT,
--     client_phone TEXT,
--     address TEXT,
--     lat DOUBLE PRECISION,
--     lng DOUBLE PRECISION,
--     product TEXT,
--     quantity INT,
--     status TEXT DEFAULT 'new',
--     before_photo TEXT,
--     after_photo TEXT,
--     signature TEXT,
--     created_at TIMESTAMP DEFAULT NOW(),
--     master_current_lat DOUBLE PRECISION,
--     master_current_lng DOUBLE PRECISION
-- );

CREATE OR REPLACE FUNCTION decrease_stock(p_name TEXT, p_qty INT)
RETURNS VOID AS $$
BEGIN
    UPDATE warehouse
    SET quantity = quantity - p_qty
    WHERE name = p_name AND quantity >= p_qty;
END;
$$ LANGUAGE plpgsql;
