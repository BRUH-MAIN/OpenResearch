# OpenResearch Client

Modern **Next.js 16** frontend for OpenResearch - a collaboration-first research platform for research groups with AI-powered features.

## 🎯 Features

- **Authentication** - Secure JWT-based authentication with automatic token refresh
- **Research Groups** - Create and manage collaborative research teams
- **Real-time Chat** - Live discussions with Socket.IO, typing indicators, and user presence
- **Paper Management** - Search, save, organize, and add papers to group collections
- **External Paper Search** - Query arXiv directly for academic papers
- **AI Chat (@ai trigger)** - Ask questions about group discussions with Groq (Llama 3.3) - group-isolated RAG context
- **Paper Q&A** - Ask specific questions about papers with AI responses
- **Paper Summarization** - Generate AI summaries with key points extraction
- **Paper Discovery** - AI-powered paper recommendations based on group context
- **PDF Reports** - Generate and download research activity reports
- **User Profiles** - Manage user information and research interests
- **Group Invitations** - Send and manage group invitations

##  Project Structure

```
client/
├── app/                         # Next.js 16 App Router
│   ├── auth/                    # Authentication pages
│   │   ├── signin/page.tsx      # Sign in page
│   │   └── signup/page.tsx      # Sign up page
│   ├── landing/page.tsx         # Landing page (public)
│   ├── home/page.tsx            # Groups dashboard
│   ├── chat/                    # Real-time chat sessions
│   │   └── [id]/page.tsx        # Session chat page
│   ├── paper/                   # Paper search and management
│   │   ├── page.tsx             # Paper search
│   │   └── [id]/page.tsx        # Paper details + AI Q&A
│   ├── group/                   # Group management
│   │   ├── [id]/page.tsx        # Group settings
│   │   └── [id]/members/        # Member management
│   ├── group-papers/            # Group papers with AI features
│   │   ├── page.tsx             # Group papers list
│   │   └── [id]/page.tsx        # Paper details + Q&A
│   ├── discover/                # Paper discovery & recommendations
│   │   └── page.tsx             # AI recommendations
│   ├── reports/                 # Group reports
│   │   ├── page.tsx             # Reports list
│   │   └── [id]/page.tsx        # Report details
│   ├── profile/page.tsx         # User profile
│   ├── invitations/page.tsx     # Group invitations
│   ├── layout.tsx               # Root layout with providers
│   ├── page.tsx                 # Root page (redirects)
│   └── globals.css              # Global styles (TailwindCSS 4)
├── components/
│   ├── layout/
│   │   ├── Navbar.tsx           # Navigation bar with user menu
│   │   └── Sidebar.tsx          # Sidebar navigation
│   ├── providers/
│   │   ├── AuthProvider.tsx     # Auth state management
│   │   ├── SocketProvider.tsx   # Socket.IO provider
│   │   └── ErrorBoundary.tsx    # Error boundary
│   ├── research/
│   │   ├── ChatWindow.tsx       # Chat interface
│   │   ├── PaperCard.tsx        # Paper display card
│   │   ├── AIChat.tsx           # AI chat component
│   │   └── ReportGenerator.tsx  # Report generation
│   ├── ui/                      # Reusable UI components
│   │   ├── Avatar.tsx           # User/group avatars
│   │   ├── Badge.tsx            # Status badges
│   │   ├── Button.tsx           # Button variants
│   │   ├── Card.tsx             # Card container
│   │   ├── Input.tsx            # Form inputs
│   │   ├── Textarea.tsx         # Text area
│   │   ├── Toast.tsx            # Toast notifications
│   │   ├── Dialog.tsx           # Modal dialogs
│   │   ├── Dropdown.tsx         # Dropdown menus
│   │   └── Loader.tsx           # Loading spinners
│   └── ErrorBoundary.tsx        # Error boundary wrapper
├── lib/
│   ├── api.ts                   # API client with TypeScript types
│   ├── auth.ts                  # Zustand auth store
│   ├── socket.ts                # Socket.IO React hook
│   ├── toast.ts                 # Toast notification helpers
│   └── utils.ts                 # Utility functions
├── public/                      # Static assets
├── next.config.ts               # Next.js configuration
├── tailwind.config.ts           # TailwindCSS 4 configuration
├── tsconfig.json                # TypeScript configuration
├── eslint.config.mjs            # ESLint configuration
├── postcss.config.mjs           # PostCSS configuration
└── package.json
```

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- npm or pnpm
- Backend server running on `http://localhost:3001` (see `../server/README.md`)
- AI Service running on `http://localhost:8000` (optional, for AI features)

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

Create `.env.local` with your backend URLs:

```env
# Backend API and WebSocket
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001

# Optional: for production
# NEXT_PUBLIC_API_URL=https://api.yourdomain.com
# NEXT_PUBLIC_WS_URL=https://api.yourdomain.com
```

**Note**: `NEXT_PUBLIC_` prefix is required for client-side environment variables in Next.js.

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Building for Production

```bash
# Create production build
npm run build

# Start production server
npm start
```

## 🔐 Authentication Flow

1. User registers or logs in via `/auth/signin` or `/auth/signup`
2. Server returns JWT access token + refresh token
3. Zustand auth store (`lib/auth.ts`) saves tokens to `localStorage`
4. All API requests include JWT in `Authorization: Bearer {token}` header
5. Socket.IO connection includes JWT in `auth.token` handshake parameter
6. Automatic token refresh on expiration via refresh token

```typescript
// Usage in components
import { useAuthStore } from '@/lib/auth';

function MyComponent() {
  const { user, accessToken, isLoggedIn, login, logout } = useAuthStore();
  
  if (!isLoggedIn) {
    return <LoginForm />;
  }
  
  return <Dashboard user={user} />;
}
```

### Building for Production

```bash
# Create production build
npm run build

# Start production server
npm start
```

## 🎨 UI Components

Located in `components/ui/`, all components are fully typed and support variants:

- **Avatar** - User/group avatars with fallback initials
- **Badge** - Status indicators with multiple variants
- **Button** - Multiple variants (primary, secondary, outline, ghost, danger)
- **Card** - Flexible container with header, body, footer sections
- **Dialog** - Modal dialogs for forms and confirmations
- **Dropdown** - Dropdown menus for user/group actions
- **Input** - Text inputs with built-in validation
- **Textarea** - Multi-line text input
- **Toast** - Non-intrusive notifications (success, error, info, warning)
- **Loader** - Loading spinners and skeleton screens

### Example Component Usage

```typescript
import { Button, Card, Input, Badge, Toast } from '@/components/ui';
import { useAuthStore } from '@/lib/auth';

export function UserProfile() {
  const { user, logout } = useAuthStore();
  
  return (
    <Card>
      <Card.Header>
        <h2>Profile</h2>
      </Card.Header>
      <Card.Body>
        <Input 
          value={user?.name} 
          placeholder="Your name"
        />
        <Badge variant="success">Active</Badge>
      </Card.Body>
      <Card.Footer>
        <Button onClick={() => logout()}>
          Logout
        </Button>
      </Card.Footer>
    </Card>
  );
}
```

## 📡 API Integration

The client uses the `ApiClient` class in `lib/api.ts` for all backend communication. All methods are fully typed with TypeScript.

```typescript
import { api } from '@/lib/api';

// Authentication
await api.register(email, password, name);
const { accessToken, refreshToken } = await api.login(email, password);
await api.logout(token);
const user = await api.getCurrentUser(token);

// Groups
const groups = await api.getGroups(token);
const group = await api.getGroup(token, groupId);
await api.createGroup(token, { name, description });
await api.updateGroup(token, groupId, updates);
await api.deleteGroup(token, groupId);

// Group Members
const members = await api.getGroupMembers(token, groupId);
await api.addGroupMember(token, groupId, userId);
await api.removeGroupMember(token, groupId, userId);

// Sessions
const sessions = await api.getGroupSessions(token, groupId);
const session = await api.getSession(token, sessionId);
await api.createSession(token, groupId, { title });
await api.updateSession(token, sessionId, updates);
await api.deleteSession(token, sessionId);

// Messages
const messages = await api.getSessionMessages(token, sessionId);
await api.deleteMessage(token, sessionId, messageId);

// Papers
const papers = await api.getPapers(token);
const savedPapers = await api.getSavedPapers(token);
const results = await api.searchExternalPapers(token, query, source);
await api.savePaper(token, paperId);
await api.unsavePaper(token, paperId);

// Group Papers (with AI features)
const groupPapers = await api.getGroupPapers(token, groupId);
await api.addPaperToGroup(token, groupId, paperId, notes);
const answer = await api.askPaperQuestion(token, groupId, paperId, question);
const summary = await api.summarizePaper(token, groupId, paperId);

// Reports
await api.generateReport(token, groupId);
const reports = await api.getGroupReports(token, groupId);
const report = await api.getReport(token, reportId);

// Recommendations
const recommendations = await api.getRecommendations(token, groupId);
```

## 🔐 Authentication

The client uses Zustand for global auth state management (`lib/auth.ts`). State persists in `localStorage` with automatic token refresh on expiration.

```typescript
import { useAuthStore } from '@/lib/auth';

function MyComponent() {
  const { 
    user,              // Current user object
    accessToken,       // JWT access token
    isLoggedIn,        // Login status
    login,             // Login function
    logout,            // Logout function
    register,          // Register function
    updateProfile      // Update user profile
  } = useAuthStore();
  
  const handleLogin = async () => {
    await login(email, password);
  };
  
  const handleLogout = () => {
    logout();
  };
}
```

### Protected Routes

Use `AuthProvider` to wrap protected pages/layouts:

```typescript
import { AuthProvider } from '@/components/providers';

export default function DashboardLayout({ children }) {
  return (
    <AuthProvider requiredAuth>
      {children}
    </AuthProvider>
  );
}
```

## 🔌 Real-time Features (Socket.IO)

The `useSocket` hook (`lib/socket.ts`) provides Socket.IO integration for real-time chat and AI responses:

```typescript
import { useSocket } from '@/lib/socket';

function ChatComponent() {
  const { socket, isConnected, emit, on, off } = useSocket();
  
  useEffect(() => {
    if (!socket) return;
    
    // Join a session
    emit('join:session', { sessionId: 'uuid' });
    
    // Listen for new messages
    on('message:new', (message) => {
      console.log('New message:', message);
      // Includes AI responses when @ai trigger is used
    });
    
    // Send typing indicator
    emit('typing:start', { sessionId: 'uuid' });
    
    // Send a message (triggers AI if contains @ai)
    emit('message:send', {
      sessionId: 'uuid',
      content: '@ai What have we discussed?'
    });
    
    // Ask question about a paper
    emit('paper:question', {
      paperId: 'paper-id',
      groupId: 'group-id',
      question: '@ai What is the methodology?'
    });
    
    // Request paper summarization
    emit('paper:summarize', { paperId: 'paper-id' });
    
    return () => {
      off('message:new');
      emit('leave:session', { sessionId: 'uuid' });
    };
  }, [socket]);
}
```

### Socket.IO Events

See [Socket.IO Events Documentation](../docs/socket-io-events.md) for comprehensive event details.

**Key Events:**
- `message:send` - Send chat message (supports @ai trigger)
- `join:session`, `leave:session` - Session management
- `message:new` - Receive messages (includes AI responses)
- `paper:question` - Ask paper-specific questions
- `paper:summarize` - Request paper summaries
- `typing:start`, `typing:stop` - Typing indicators
- `user:typing`, `user:stopped-typing` - Other users typing

## 📚 Dependencies

### Production

- `next` 16.0+ - React framework with App Router and Server Components
- `react` 19+ / `react-dom` 19+ - UI library
- `zustand` 5+ - Lightweight state management
- `socket.io-client` 4.8+ - Real-time communication
- `@tanstack/react-query` - Server state management and caching
- `lucide-react` - Icon library (100+ icons)
- `tailwindcss` 4 - Utility-first CSS framework
- `next-themes` - Dark mode support

### Development

- `typescript` 5+ - Static type safety
- `eslint` 9+ - Code linting
- `@types/node`, `@types/react` - TypeScript type definitions
- `tailwindcss` - Build CSS utilities

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

Vercel is optimized for Next.js and provides automatic deployments:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Or connect your GitHub repository to Vercel for automatic deployments on push.

### Environment Variables for Production

Set these in your deployment platform:

```env
NEXT_PUBLIC_API_URL=https://your-api.com
NEXT_PUBLIC_WS_URL=https://your-api.com
```

### Other Platforms

The app can be deployed to any platform supporting Next.js:
- Netlify
- AWS Amplify
- Railway
- Render
- Google Cloud Run

**Build Configuration:**
- Build command: `npm run build`
- Start command: `npm start`
- Output directory: `.next`

### Performance Optimization

Next.js 16 includes:
- Automatic code splitting and optimization
- Image optimization via `next/image`
- Font optimization
- Core Web Vitals optimization

## 🧪 Testing

```bash
# Run tests (when added)
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## 📄 License

MIT License - See root LICENSE file for details.
