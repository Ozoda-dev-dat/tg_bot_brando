# Telegram Delivery Bot

## Overview
A Telegram bot for delivery management built with Node.js and PostgreSQL. The bot helps manage delivery orders, warehouses, and technicians (masters).

## Project Structure
- `bot.js` - Main bot logic with Grammy framework
- `start.js` - Entry point that checks environment and database setup
- `setup-db.js` - Database schema setup script
- `schema.sql` - PostgreSQL database schema

## Technology Stack
- **Runtime**: Node.js 20
- **Framework**: Grammy (Telegram Bot framework)
- **Database**: PostgreSQL (Neon-backed)
- **Libraries**: dotenv, pg, exceljs, xlsx

## Features

### Admin Panel
- **+ Yangi yetkazish** - Create new delivery orders
- **➕ Usta qo'shish** - Add new technicians (masters)
- **➕ Mahsulot qo'shish** - Add new products
- **📥 Excel import** - Import products from Excel files
- **📋 Barcha buyurtmalar** - View all orders
- **👥 Barcha ustalar** - View all technicians
- **📦 Ombor** - View warehouse inventory
- **📅 Kunlik hisobot** - Daily report (NEW)
- **📊 Oylik hisobot** - Monthly report

### Daily Report (📅 Kunlik hisobot)
Generates a comprehensive daily report showing:
- **Order Statistics**: Total orders created today, breakdown by status (new, accepted, in transit, completed, delivered)
- **Geographic Distribution**: Orders by region/location
- **Completed Orders**: Count of successfully delivered orders
- **Per-Master Analysis**: For each technician:
  - Total orders assigned and completed
  - Distance traveled (km)
  - Payment breakdown:
    - Distance fees (per km)
    - Labor/work fees
    - Product costs
    - Total payment due
- **Overall Summary**: Total distance, fees, and payments for the day

### Master (Technician) Features
- Location sharing for order assignment
- View assigned orders
- Accept/reject orders
- Upload before/after photos
- Track warranty status
- Manage spare parts

## Required Secrets
Set these in the Secrets tab to make the bot functional:
1. **BOT_TOKEN** - Get from @BotFather on Telegram when you create your bot
2. **ADMIN_CHAT_ID** - Your Telegram chat ID for admin notifications
3. **ADMIN_USER_ID** - Your Telegram user ID to access admin features

## Database Tables
- `service_centers` - Service center locations and coordinates
- `masters` - Technicians/delivery workers with regions and locations
- `warehouse` - Product inventory with categories and pricing
- `clients` - Customer information
- `orders` - Delivery orders with status, photos, GPS coordinates, and payment tracking

## Running the Bot
The bot runs automatically via the configured workflow: `node start.js`

## Deployment
Configured for VM deployment with command: `node start.js`
