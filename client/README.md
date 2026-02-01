# OpenResearch Client

Modern **Next.js 16** frontend for the OpenResearch platform - a collaboration-first research platform for research groups.

## 🎯 Features

- **Authentication** - Secure JWT-based authentication with registration and login
- **Research Groups** - Create and manage collaborative research groups
- **Real-time Chat** - Live discussions with Socket.IO integration
- **Paper Management** - Search, save, and organize academic papers
- **External Paper Search** - Query arXiv directly for academic papers
- **AI Chat** - Ask questions about session discussions with Groq (Llama 3.3)
- **User Profiles** - Manage user information and research interests
- **Invitations** - Accept/decline group invitations

## 📁 Project Structure

```
client/
├── app/                    # Next.js 16 App Router
│   ├── auth/              # Authentication pages (signin, signup)
│   ├── landing/           # Landing page
│   ├── home/              # Groups dashboard
│   ├── chat/              # Group discussions with real-time chat
│   ├── paper/             # Paper search and management
│   ├── profile/           # User profile
│   ├── group/             # Group management and settings
│   ├── invitations/       # Group invitation management
│   ├── layout.tsx         # Root layout with providers
│   ├── page.tsx           # Root page (redirects)
│   └── globals.css        # Global styles (TailwindCSS 4)
├── components/
│   ├── layout/            # Layout components
│   │   ├── Navbar.tsx     # Navigation bar
│   │   └── index.ts       # Exports
│   ├── providers/         # Context providers
│   │   ├── AuthProvider.tsx # Auth state management
│   │   └── index.ts       # Exports
│   ├── ui/                # Reusable UI components
│   │   ├── Avatar.tsx     # User/group avatars
│   │   ├── Badge.tsx      # Status badges
│   │   ├── Button.tsx     # Button variants
│   │   ├── Card.tsx       # Card container
│   │   ├── Input.tsx      # Form inputs
│   │   ├── Toast.tsx      # Toast notifications
│   │   └── index.ts       # Exports
│   └── ErrorBoundary.tsx  # Error boundary component
├── lib/
│   ├── api.ts             # API client & TypeScript types
│   ├── auth.ts            # Zustand auth store
│   ├── socket.ts          # Socket.IO React hook
│   └── toast.ts           # Toast notification helpers
├── public/                # Static assets
├── next.config.ts         # Next.js configuration
├── tailwind.config.ts     # TailwindCSS 4 configuration
├── tsconfig.json          # TypeScript configuration
└── package.json
```

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- npm or pnpm
- Backend server running (see `../server/README.md`)

### Installation

```bash
# Navigate to client directory
cd client

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Edit .env.local with your configuration
nano .env.local
```

### Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

**Note**: `NEXT_PUBLIC_` prefix is required for client-side environment variables in Next.js.

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

### Building for Production

```bash
# Create production build
npm run build

# Start production server
npm start
```

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

The client uses Zustand for global auth state management (`lib/auth.ts`):

```typescript
import { useAuthStore } from '@/lib/auth';

function MyComponent() {
  const { user, accessToken, login, logout } = useAuthStore();
  
  // Login
  await login(email, password);
  
  // Logout
  logout();
}
```

Auth state persists in `localStorage` and includes automatic token refresh.

## 🔌 Real-time Features (Socket.IO)

The `useSocket` hook (`lib/socket.ts`) provides Socket.IO integration:

```typescript
import { useSocket } from '@/lib/socket';

function ChatComponent() {
  const { socket, isConnected } = useSocket();
  
  useEffect(() => {
    if (!socket) return;
    
    // Join session
    socket.emit('session:join', sessionId);
    
    // Listen for new messages
    socket.on('message:new', (message) => {
      console.log('New message:', message);
    });
    
    // Send typing indicator
    socket.emit('typing:start', sessionId);
    
    return () => {
      socket.off('message:new');
    };
  }, [socket, sessionId]);
}
```

**Socket Events**:
- `session:join`, `session:leave` - Session management
- `message:send` - Send chat message
- `typing:start`, `typing:stop` - Typing indicators
- `message:new` - Receive new messages
- `user:typing`, `user:stopped-typing` - Other users typing

## 📚 Dependencies

**Production**:
- `next` 16.0.6 - React framework with App Router
- `react` 19.2.0 / `react-dom` 19.2.0 - UI library
- `zustand` 5.0.9 - State management
- `socket.io-client` 4.8.1 - Real-time communication
- `@tanstack/react-query` - Server state management
- `lucide-react` - Icon library
- `tailwindcss` 4 - Utility-first CSS

**Development**:
- `typescript` 5 - Type safety
- `eslint` 9 - Code linting
- `@types/*` - TypeScript type definitions

## 🧪 Testing

```bash
# Run tests (when added)
npm run test

# Run tests in watch mode
npm run test:watch
```

## 🔧 Configuration

### Next.js Configuration
- `next.config.ts` - Next.js build and runtime configuration
- `tsconfig.json` - TypeScript compiler settings
- `postcss.config.mjs` - PostCSS and Tailwind CSS configuration
- `eslint.config.mjs` - ESLint rules

### Environment Variables
- `.env.local` - Local development environment variables (not committed)
- `.env.example` - Template for environment variables

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Or connect your GitHub repository to Vercel for automatic deployments.

### Environment Variables for Production

Set these in your deployment platform:
- `NEXT_PUBLIC_API_URL` - Production API URL
- `NEXT_PUBLIC_WS_URL` - Production WebSocket URL

### Other Platforms

The app can be deployed to any platform that supports Next.js:
- Netlify
- AWS Amplify
- Railway
- Render

Build command: `npm run build`
Start command: `npm start`
Output directory: `.next`

## 📄 License

MIT License - See root LICENSE file for details.
