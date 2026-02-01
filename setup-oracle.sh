#!/bin/bash

# Tetracubed Fox - Oracle Cloud Setup Script
# This script sets up the Discord bot on Oracle Cloud's free tier

set -e

echo "========================================="
echo "Tetracubed Fox - Oracle Cloud Setup"
echo "========================================="
echo ""

# Update system packages
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
echo "📦 Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"

# Install git if not present
if ! command -v git &> /dev/null; then
    echo "📦 Installing git..."
    sudo apt install -y git
fi

# Create application directory
APP_DIR="/home/ubuntu/tetracubed-fox"
echo "📁 Setting up application directory: $APP_DIR"

# Clone or update repository
if [ -d "$APP_DIR" ]; then
    echo "📁 Directory exists, pulling latest changes..."
    cd "$APP_DIR"
    git pull
else
    echo "📁 Cloning repository..."
    cd /home/ubuntu
    git clone https://github.com/tetracionist/tetracubed-fox.git
    cd tetracubed-fox
fi

# Install dependencies
echo "📦 Installing npm dependencies..."
npm install --production

# Create .env file if it doesn't exist
if [ ! -f "$APP_DIR/.env" ]; then
    echo "📝 Creating .env file..."
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    echo ""
    echo "⚠️  IMPORTANT: Edit the .env file with your credentials:"
    echo "    nano $APP_DIR/.env"
    echo ""
else
    echo "✅ .env file already exists"
fi

# Set up systemd service
echo "🔧 Setting up systemd service..."
sudo cp "$APP_DIR/tetracubed-fox.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable tetracubed-fox

echo ""
echo "========================================="
echo "✅ Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Edit the .env file with your credentials:"
echo "   nano $APP_DIR/.env"
echo ""
echo "2. Start the bot:"
echo "   sudo systemctl start tetracubed-fox"
echo ""
echo "3. Check status:"
echo "   sudo systemctl status tetracubed-fox"
echo ""
echo "4. View logs:"
echo "   sudo journalctl -u tetracubed-fox -f"
echo ""
echo "The bot will automatically start on system reboot."
echo "========================================="
