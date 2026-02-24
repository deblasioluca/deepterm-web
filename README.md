# DeepTerm

A modern, professional SSH client with AI capabilities. Built with Next.js 14, TypeScript, and Tailwind CSS.

![DeepTerm Screenshot](./docs/screenshot.png)

## Features

### Public Website
- **Home Page** - Hero section with interactive terminal demo, feature grid, testimonials
- **Product Page** - Detailed feature showcase with 8 deep-dive sections
- **Security Page** - Security features, certifications, and privacy commitment
- **Pricing Page** - 4 pricing tiers with feature comparison
- **Enterprise Page** - Enterprise features and contact form

### Dashboard (Protected)
- **Account** - Profile management, password, 2FA, sessions
- **Team** - Team member management with roles
- **Vaults** - Secure credential storage with organization
- **SSO** - SAML SSO configuration for enterprise
- **Billing** - Subscription management, invoices, payment methods
- **Ideas** - Feature voting board (Kanban style)
- **Get the App** - Download links for all platforms
- **Security Assessment** - Request compliance documents
- **Help & Feedback** - Search help, submit feedback
- **Students** - Student verification for free access

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 3+
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Authentication**: NextAuth.js v5 (Beta)
- **Database**: SQLite with Prisma ORM
- **Deployment**: Nginx + PM2

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/deepterm.git
cd deepterm
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Set up the database:
```bash
npx prisma generate
npx prisma db push
```

5. Seed the database (optional):
```bash
npx ts-node prisma/seed.ts
```

6. Run the development server:
```bash
npm run dev
```

7. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Demo Credentials

After seeding the database:
- **Email**: alice@deepterm.net
- **Password**: password123

## Project Structure

```
deepterm/
├── nginx/                  # Nginx configuration
├── prisma/                 # Database schema and migrations
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── app/               # Next.js App Router pages
│   │   ├── api/           # API routes
│   │   ├── dashboard/     # Protected dashboard pages
│   │   ├── login/         # Login page
│   │   ├── register/      # Registration page
│   │   └── ...            # Public pages
│   ├── components/        # React components
│   │   ├── layout/        # Layout components
│   │   ├── sections/      # Page sections
│   │   └── ui/            # UI components
│   ├── lib/               # Utility functions
│   └── styles/            # Global styles
├── ecosystem.config.js    # PM2 configuration
├── setup.sh              # Raspberry Pi setup script
└── package.json
```

## Deployment

### Raspberry Pi Deployment

1. Transfer the project to your Raspberry Pi:
```bash
scp -r deepterm/ pi@raspberrypi:~/
```

2. Run the setup script:
```bash
cd ~/deepterm
sudo bash setup.sh
```

The script will:
- Install Node.js 20 LTS
- Install PM2 and Nginx
- Generate SSL certificates
- Build and start the application
- Configure Nginx as reverse proxy

3. Access your site at `https://deepterm.local`

### Manual Deployment

1. Build the application:
```bash
npm run build
```

2. Start with PM2:
```bash
pm2 start ecosystem.config.js --env production
```

3. Configure Nginx using the provided configuration:
```bash
sudo cp nginx/deepterm.conf /etc/nginx/sites-available/deepterm
sudo ln -s /etc/nginx/sites-available/deepterm /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | SQLite database path | Yes |
| `NEXTAUTH_URL` | Application URL | Yes |
| `NEXTAUTH_SECRET` | Secret for JWT signing | Yes |
| `NODE_ENV` | Environment (development/production) | Yes |
| `PORT` | Application port (default: 3000) | No |

### Tailwind Theme

The application uses a custom dark theme with these colors:

```js
colors: {
  background: {
    primary: '#0A0A0F',
    secondary: '#12121A',
    tertiary: '#1A1A2E',
  },
  accent: {
    primary: '#6C5CE7',
    secondary: '#00D4AA',
    danger: '#FF6B6B',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#A0A0B0',
    tertiary: '#6B6B80',
  },
}
```

## Development

### Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

### Database Commands

```bash
npx prisma studio    # Open Prisma Studio
npx prisma db push   # Push schema changes
npx prisma generate  # Regenerate Prisma client
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Design inspired by [Termius](https://termius.com)
- Icons by [Lucide](https://lucide.dev)
- Animations by [Framer Motion](https://www.framer.com/motion/)
