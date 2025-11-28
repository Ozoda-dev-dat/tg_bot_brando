# Telegram Delivery Bot

## Overview
This is a Telegram bot for delivery management built with Grammy (Telegram bot framework) and PostgreSQL. The bot manages masters (delivery workers), warehouse inventory, and orders with location-based assignment.

## Project Architecture
- **Language**: Node.js (v20.19.3)
- **Framework**: Grammy (Telegram Bot Framework)
- **Database**: PostgreSQL (Neon-backed)
- **Main Files**:
  - `bot.js` - Main bot logic and handlers
  - `start.js` - Startup script with environment validation
  - `schema.sql` - Database schema
  - `setup-db.js` - Database setup utility

## Features
- Master (delivery worker) management with location tracking
- Warehouse inventory management with Excel import support
- Order management with automatic master assignment based on location
- Admin panel for managing the system
- Region-based product and master organization
- Real-time location-based closest master finding

## Setup Instructions

### 1. Database Setup
1. Go to **Tools → Database** in the Replit sidebar
2. Create a PostgreSQL database
3. The `DATABASE_URL` environment variable will be set automatically
4. The database schema is automatically created on first run

### 2. Required Environment Variables
You need to set these in the **Secrets** tab:
- `BOT_TOKEN` - Get this from @BotFather on Telegram
- `ADMIN_CHAT_ID` - Your Telegram chat ID (can be multiple, comma-separated)
- `ADMIN_USER_ID` - Your Telegram user ID (can be multiple, comma-separated)

To get your Telegram IDs, you can use @userinfobot on Telegram.

### 3. Running the Bot
The bot runs automatically via the configured workflow. It will:
1. Check all required environment variables
2. Verify database connection
3. Create database schema if needed
4. Start the bot

## Database Schema
- **masters** - Delivery workers with location tracking
- **warehouse** - Product inventory with region support
- **orders** - Order management with location and status tracking
- **clients** - Client information

## Recent Changes
- **2025-11-28**: Initial Replit setup
  - Created .gitignore for Node.js
  - Configured workflow for bot execution
  - Set up environment variable requirements
  - Added project documentation

## Current State
- ✅ Node.js dependencies installed
- ✅ Workflow configured
- ✅ Database schema ready
- ⏳ Waiting for environment variables (BOT_TOKEN, ADMIN_CHAT_ID, ADMIN_USER_ID)
- ⏳ Waiting for PostgreSQL database creation

## Usage
Once configured, users can:
- **/start** - Initialize the bot and share location
- **Admin commands**: Add masters, products, manage orders, import Excel data
- **Master commands**: View orders, manage warehouse, add products
- Location-based order assignment to nearest available master
