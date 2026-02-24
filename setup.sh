#!/bin/bash

# DeepTerm Setup Script for Raspberry Pi
# This script sets up the DeepTerm application on a fresh system

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root or with sudo"
        exit 1
    fi
}

# Detect system architecture
detect_arch() {
    ARCH=$(uname -m)
    log_info "Detected architecture: $ARCH"
    
    if [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
        NODE_ARCH="arm64"
    elif [[ "$ARCH" == "armv7l" ]]; then
        NODE_ARCH="armv7l"
    elif [[ "$ARCH" == "x86_64" ]]; then
        NODE_ARCH="x64"
    else
        log_error "Unsupported architecture: $ARCH"
        exit 1
    fi
}

# Update system packages
update_system() {
    log_info "Updating system packages..."
    apt-get update
    apt-get upgrade -y
    log_success "System packages updated"
}

# Install Node.js
install_nodejs() {
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        log_info "Node.js already installed: $NODE_VERSION"
        
        # Check if version is >= 18
        MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | tr -d 'v')
        if [[ $MAJOR_VERSION -lt 18 ]]; then
            log_warning "Node.js version is too old. Installing Node.js 20..."
        else
            return 0
        fi
    fi
    
    log_info "Installing Node.js 20 LTS..."
    
    # Install Node.js using NodeSource
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    
    # Verify installation
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    log_success "Node.js $NODE_VERSION installed"
    log_success "npm $NPM_VERSION installed"
}

# Install PM2
install_pm2() {
    if command -v pm2 &> /dev/null; then
        log_info "PM2 already installed"
        return 0
    fi
    
    log_info "Installing PM2..."
    npm install -g pm2
    
    # Setup PM2 startup script
    pm2 startup systemd -u $SUDO_USER --hp /home/$SUDO_USER
    
    log_success "PM2 installed and configured"
}

# Install Nginx
install_nginx() {
    if command -v nginx &> /dev/null; then
        log_info "Nginx already installed"
        return 0
    fi
    
    log_info "Installing Nginx..."
    apt-get install -y nginx
    
    # Start and enable Nginx
    systemctl start nginx
    systemctl enable nginx
    
    log_success "Nginx installed and started"
}

# Setup SSL certificates (self-signed for development)
setup_ssl() {
    log_info "Setting up SSL certificates..."
    
    SSL_DIR="/etc/nginx/ssl"
    mkdir -p $SSL_DIR
    
    if [[ -f "$SSL_DIR/deepterm.crt" && -f "$SSL_DIR/deepterm.key" ]]; then
        log_info "SSL certificates already exist"
        return 0
    fi
    
    # Generate self-signed certificate
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout $SSL_DIR/deepterm.key \
        -out $SSL_DIR/deepterm.crt \
        -subj "/C=US/ST=State/L=City/O=DeepTerm/CN=deepterm.local"
    
    chmod 600 $SSL_DIR/deepterm.key
    
    log_success "SSL certificates generated"
    log_warning "These are self-signed certificates. For production, use Let's Encrypt or proper certificates."
}

# Setup Nginx configuration
setup_nginx_config() {
    log_info "Configuring Nginx..."
    
    DEEPTERM_DIR="/home/$SUDO_USER/deepterm"
    NGINX_AVAILABLE="/etc/nginx/sites-available"
    NGINX_ENABLED="/etc/nginx/sites-enabled"
    
    # Create cache directory
    mkdir -p /var/cache/nginx/deepterm
    chown www-data:www-data /var/cache/nginx/deepterm
    
    # Copy configuration
    if [[ -f "$DEEPTERM_DIR/nginx/deepterm.conf" ]]; then
        cp "$DEEPTERM_DIR/nginx/deepterm.conf" "$NGINX_AVAILABLE/deepterm"
        
        # Enable the site
        ln -sf "$NGINX_AVAILABLE/deepterm" "$NGINX_ENABLED/deepterm"
        
        # Remove default site
        rm -f "$NGINX_ENABLED/default"
        
        # Test Nginx configuration
        nginx -t
        
        # Reload Nginx
        systemctl reload nginx
        
        log_success "Nginx configured for DeepTerm"
    else
        log_warning "Nginx configuration file not found. Skipping..."
    fi
}

# Install application dependencies
install_dependencies() {
    log_info "Installing application dependencies..."
    
    DEEPTERM_DIR="/home/$SUDO_USER/deepterm"
    
    if [[ ! -d "$DEEPTERM_DIR" ]]; then
        log_error "DeepTerm directory not found: $DEEPTERM_DIR"
        exit 1
    fi
    
    cd "$DEEPTERM_DIR"
    
    # Install npm dependencies as the regular user
    sudo -u $SUDO_USER npm install
    
    log_success "Dependencies installed"
}

# Setup database
setup_database() {
    log_info "Setting up database..."
    
    DEEPTERM_DIR="/home/$SUDO_USER/deepterm"
    cd "$DEEPTERM_DIR"
    
    # Generate Prisma client
    sudo -u $SUDO_USER npx prisma generate
    
    # Run migrations
    sudo -u $SUDO_USER npx prisma db push
    
    # Seed database (optional)
    if [[ -f "prisma/seed.ts" ]]; then
        log_info "Seeding database..."
        sudo -u $SUDO_USER npx ts-node prisma/seed.ts || true
    fi
    
    log_success "Database setup complete"
}

# Create environment file
create_env_file() {
    log_info "Creating environment file..."
    
    DEEPTERM_DIR="/home/$SUDO_USER/deepterm"
    ENV_FILE="$DEEPTERM_DIR/.env"
    
    if [[ -f "$ENV_FILE" ]]; then
        log_info "Environment file already exists"
        return 0
    fi
    
    # Generate a random secret
    AUTH_SECRET=$(openssl rand -base64 32)
    
    cat > "$ENV_FILE" << EOF
# Database
DATABASE_URL="file:./prisma/deepterm.db"

# NextAuth
NEXTAUTH_URL="https://deepterm.local"
NEXTAUTH_SECRET="$AUTH_SECRET"

# Application
NODE_ENV="production"
PORT=3000
EOF
    
    chown $SUDO_USER:$SUDO_USER "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    
    log_success "Environment file created"
}

# Build application
build_application() {
    log_info "Building application..."
    
    DEEPTERM_DIR="/home/$SUDO_USER/deepterm"
    cd "$DEEPTERM_DIR"
    
    # Build the Next.js application
    sudo -u $SUDO_USER npm run build
    
    log_success "Application built"
}

# Create log directory
create_log_directory() {
    log_info "Creating log directory..."
    
    DEEPTERM_DIR="/home/$SUDO_USER/deepterm"
    LOG_DIR="$DEEPTERM_DIR/logs"
    
    mkdir -p "$LOG_DIR"
    chown $SUDO_USER:$SUDO_USER "$LOG_DIR"
    
    log_success "Log directory created"
}

# Start application with PM2
start_application() {
    log_info "Starting application with PM2..."
    
    DEEPTERM_DIR="/home/$SUDO_USER/deepterm"
    cd "$DEEPTERM_DIR"
    
    # Start or restart the application
    sudo -u $SUDO_USER pm2 startOrRestart ecosystem.config.js --env production
    
    # Save PM2 process list
    sudo -u $SUDO_USER pm2 save
    
    log_success "Application started"
}

# Setup hosts file
setup_hosts() {
    log_info "Updating /etc/hosts..."
    
    if ! grep -q "deepterm.local" /etc/hosts; then
        echo "127.0.0.1 deepterm.local" >> /etc/hosts
        log_success "Added deepterm.local to /etc/hosts"
    else
        log_info "deepterm.local already in /etc/hosts"
    fi
}

# Print completion message
print_completion() {
    echo ""
    echo "=============================================="
    echo -e "${GREEN}DeepTerm Setup Complete!${NC}"
    echo "=============================================="
    echo ""
    echo "Your DeepTerm instance is now running at:"
    echo -e "  ${BLUE}https://deepterm.local${NC}"
    echo ""
    echo "Default credentials (from seed data):"
    echo "  Email: alice@deepterm.net"
    echo "  Password: password123"
    echo ""
    echo "Useful commands:"
    echo "  pm2 status        - Check application status"
    echo "  pm2 logs deepterm - View application logs"
    echo "  pm2 restart deepterm - Restart application"
    echo ""
    echo "To stop the application:"
    echo "  pm2 stop deepterm"
    echo ""
    echo -e "${YELLOW}Note: You're using self-signed SSL certificates.${NC}"
    echo "Your browser will show a security warning."
    echo ""
}

# Main function
main() {
    echo "=============================================="
    echo "  DeepTerm Setup Script for Raspberry Pi"
    echo "=============================================="
    echo ""
    
    check_root
    detect_arch
    update_system
    install_nodejs
    install_pm2
    install_nginx
    setup_ssl
    create_log_directory
    create_env_file
    install_dependencies
    setup_database
    build_application
    setup_nginx_config
    setup_hosts
    start_application
    print_completion
}

# Run main function
main "$@"
