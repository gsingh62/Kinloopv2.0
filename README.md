# KinLoop - Family Organizer & Collaboration App

A shared family organizer for iOS built with Next.js, Capacitor, and Firebase.

## Features

- **Shared Calendar** — Monthly grid + agenda view, color-coded events, time support, family member assignment
- **Shared To-Do Lists** — Multiple lists per room, drag items, check off tasks
- **Shared Messaging** — Real-time chat with emoji support
- **Document Editing** — Rich text editor with commenting and image support
- **Room Management** — Create/join family rooms with invite codes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 18, TypeScript |
| Styling | Tailwind CSS 3 |
| Mobile | Capacitor 7 (iOS) |
| Backend | Firebase Auth, Cloud Firestore |
| Icons | Lucide React |

## Getting Started

### Prerequisites

- Node.js 18+
- Xcode 15+ (for iOS builds)
- CocoaPods (`sudo gem install cocoapods`)
- Firebase project with Firestore and Authentication enabled

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your Firebase config

# 3. Start development server
npm run dev
```

### Environment Variables

Create a `.env.local` file with:

```
NEXT_PUBLIC_FIREBASE_API_KEY=your_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

## Building for iOS / App Store

### 1. Build the web app

```bash
npm run build
```

This generates a static export in the `out/` directory.

### 2. Sync with Capacitor

```bash
npx cap sync ios
```

### 3. Open in Xcode

```bash
npx cap open ios
```

Or use the shortcut:

```bash
npm run ios
```

### 4. In Xcode

1. **Select your team** in Signing & Capabilities
2. **Set the Bundle Identifier** to `com.kinloop.app` (or your own)
3. **Set the version** (e.g., 1.0.0) and build number (e.g., 1)
4. **Select a real device or "Any iOS Device"** to build
5. **Product → Archive** to create an App Store build
6. **Window → Organizer** → Distribute to App Store Connect

### 5. App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Create a new app with bundle ID `com.kinloop.app`
3. Fill in:
   - App name: **KinLoop**
   - Subtitle: **Family Organizer**
   - Category: **Lifestyle** or **Productivity**
   - Privacy Policy URL (required)
   - Screenshots (required for each device size)
   - App description
4. Submit for review

### App Store Checklist

- [ ] Apple Developer Account ($99/year) enrolled
- [ ] App icons: 1024x1024 for App Store, plus all device sizes
- [ ] Screenshots: 6.7" and 6.1" iPhone, plus iPad if supporting
- [ ] Privacy Policy URL hosted publicly
- [ ] App description (max 4000 chars)
- [ ] Keywords (max 100 chars)
- [ ] Support URL
- [ ] Firebase security rules configured
- [ ] Test on physical device before submission

## Project Structure

```
├── pages/              # Next.js pages
│   ├── index.tsx       # Login/Signup
│   ├── dashboard.tsx   # Room list
│   ├── room/[roomId].tsx  # Room view with tabs
│   └── ...
├── components/         # React components
│   ├── EventTab.tsx    # Shared Calendar (main feature)
│   ├── ChatTab.tsx     # Messaging
│   ├── ListTab.tsx     # To-do lists
│   └── ...
├── lib/                # Firebase & utilities
│   ├── firebase.ts     # Firebase init
│   ├── auth.ts         # Auth helpers
│   └── firestoreUtils.ts  # Firestore CRUD
├── ios/                # Capacitor iOS project
├── styles/             # Global CSS
└── capacitor.config.ts # Capacitor configuration
```

## Firestore Data Model

```
users/{userId}
  - email, createdAt

rooms/{roomId}
  - name, ownerId, inviteCode, memberIds[], createdAt
  
  messages/{messageId}
    - content, senderId, senderEmail, createdAt

  events/{eventId}
    - title, date, startTime, endTime, description
    - color, allDay, assignedTo[], createdBy, createdAt

  lists/{listId}
    - name
    items/{itemId}
      - content, completed, createdAt

  documents/{docId}
    - title, content, createdBy, createdAt, updatedAt
```
