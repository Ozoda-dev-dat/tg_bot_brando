CREATE TABLE IF NOT EXISTS masters (
    id SERIAL PRIMARY KEY,
    name TEXT,
    phone TEXT UNIQUE,
    telegram_id BIGINT UNIQUE,
    region TEXT,
    last_lat DOUBLE PRECISION,
    last_lng DOUBLE PRECISION,
    last_location_update TIMESTAMP
);

CREATE TABLE IF NOT EXISTS warehouse (
    id SERIAL PRIMARY KEY,
    name TEXT,
    quantity INT DEFAULT 0,
    price NUMERIC,
    category TEXT,
    subcategory TEXT,
    region TEXT
);

CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    name TEXT,
    phone TEXT,
    address TEXT
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    master_id INT REFERENCES masters(id),
    client_name TEXT,
    client_phone TEXT,
    address TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    product TEXT,
    quantity INT,
    status TEXT DEFAULT 'new',
    before_photo TEXT,
    after_photo TEXT,
    signature TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    master_current_lat DOUBLE PRECISION,
    master_current_lng DOUBLE PRECISION,
    warranty_expired BOOLEAN DEFAULT NULL,
    spare_part_sent BOOLEAN DEFAULT FALSE,
    spare_part_received BOOLEAN DEFAULT FALSE,
    spare_part_photo TEXT,
    completion_gps_lat DOUBLE PRECISION,
    completion_gps_lng DOUBLE PRECISION,
    master_telegram_id BIGINT,
    barcode TEXT,
    completion_barcode TEXT,
    distance_km DOUBLE PRECISION DEFAULT 0,
    distance_fee NUMERIC DEFAULT 0,
    work_type TEXT DEFAULT NULL,
    work_fee NUMERIC DEFAULT 0,
    product_total NUMERIC DEFAULT 0,
    total_payment NUMERIC DEFAULT 0
);

CREATE OR REPLACE FUNCTION decrease_stock(p_name TEXT, p_qty INT)
RETURNS VOID AS $$
BEGIN
    UPDATE warehouse
    SET quantity = quantity - p_qty
    WHERE name = p_name AND quantity >= p_qty;
END;
$$ LANGUAGE plpgsql;
