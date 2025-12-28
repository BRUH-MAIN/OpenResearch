# OpenResearch Client

A modern **Next.js 14** frontend for the OpenResearch platform - a collaboration-first research platform for research groups.

## 🎯 Features

- **Authentication** - Secure JWT-based authentication with registration and login
- **Research Groups** - Create and manage collaborative research groups
- **Real-time Chat** - Live discussions with Socket.IO integration
- **Paper Management** - Search, save, and organize academic papers
- **External Paper Search** - Query Semantic Scholar and arXiv directly
- **User Profiles** - Manage user information and research interests

## 📁 Project Structure

```
client/
├── app/                    # Next.js App Router
│   ├── auth/              # Authentication pages (signin, signup)
│   ├── landing/           # Landing page
│   ├── home/              # Groups and dashboard
│   ├── chat/              # Group discussions
│   ├── paper/             # Paper search and management
│   ├── profile/           # User profile
│   └── group/             # Group management
├── components/
│   ├── layout/            # Navbar and sidebar
│   ├── providers/         # Auth provider
│   └── ui/                # Reusable UI components
├── lib/
│   ├── api.ts             # API client with type definitions
│   ├── auth.ts            # Zustand auth store
│   ├── socket.ts          # Socket.IO integration
│   └── toast.ts           # Toast notifications
├── public/                # Static assets
└── package.json
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Navigate to client directory
cd client

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## 🎨 UI Components

Located in `components/ui/`:
- **Button** - Multiple variants (primary, secondary, outline, ghost)
- **Card** - Container with header, body, and footer sections
- **Input/Textarea** - Form inputs with built-in validation
- **Avatar** - User/group avatars with fallbacks
- **Badge** - Status indicators with variants
- **Toast** - Toast notification system

## 📡 API Integration

The client uses the `ApiClient` class in `lib/api.ts` for all backend communication:

```typescript
// Example: Get user groups
const groups = await api.getGroups(accessToken);

// Example: Create a session
const session = await api.createSession(accessToken, groupId, title);

// Example: Search external papers
const papers = await api.searchExternalPapers(accessToken, query, 'all');
```

## 🔐 Authentication

- JWT-based authentication with access and refresh tokens
- Automatic token refresh using Zustand store
- Protected routes with auth middleware
- User registration with email and interests

## 💬 Real-time Chat

Built with Socket.IO for real-time messaging:
- Live message delivery
- Typing indicators
- User presence tracking

## 🧪 Testing

```bash
# Run tests
npm run test

# Run tests in watch mode
npm run test:watch
```

## 📦 Build

```bash
# Create production build
npm run build

# Start production server
npm run start
```

## 🔧 Configuration

### Build Configuration
- `next.config.ts` - Next.js configuration
- `tsconfig.json` - TypeScript settings
- `postcss.config.mjs` - Tailwind CSS configuration

## 📄 License

MIT License

---

Part of the **OpenResearch** platform ✨
