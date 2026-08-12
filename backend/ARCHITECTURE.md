# Backend Architecture

## Backend Requirements
- Provide a robust, scalable backend using Firebase for the SYNCO Flutter application.
- All code in JavaScript.
- No Express.js or MongoDB.

## Firebase Services Required
- Firebase Authentication (Google, Email/password)
- Cloud Firestore
- Firebase Storage
- Firebase Cloud Functions
- Firebase Cloud Messaging (FCM)
- Firebase Security Rules & App Check

## Database Architecture
- NoSQL structure via Cloud Firestore.
- Modular collections based on bounded contexts: `users`, `healthProfiles`, `doctors`, `foodScans`, `whisperRooms`, `conversations`, `knowledgeMetadata`.
- Subcollections used for localized, bounded data (e.g., `messages` within `conversations` or `whisperRooms`).

## Authentication Architecture
- Managed by Firebase Authentication.
- UID acts as the primary identity key.
- RBAC implemented via Firebase Custom Claims (e.g., `role: "doctor"`, `role: "admin"`).
- Client-provided roles are ignored for authorization.

## Cloud Functions
- Written in JavaScript.
- Grouped in modules (`auth`, `users`, `health`, `doctors`, `food`, `whisper`, `chat`, `ai`, `rag`, `notifications`).
- Secret management via Firebase Secrets / Google Secret Manager.
- Use callable functions and HTTP triggers where necessary.

## Storage Architecture
- Organized by user context: `users/{uid}/*` and `doctors/{uid}/*`.
- Strict Storage rules validating ownership, content type, and file size.
- Health and doctor documents are protected from public access.

## AI Architecture
- Gemini AI integrated solely via Cloud Functions.
- Gemini API Keys never exposed to the client.
- Functions manage image analysis (food), chat with AI, and context injection.

## RAG Architecture
- Trusted sources only (WHO, medical guidelines).
- Stored as vector embeddings in a vector database (e.g., via Vertex AI or similar).
- Cloud Functions handle similarity search and append context to Gemini prompts.

## Doctor Verification
- Registration -> Admin Review (manual/official registry) -> Verification.
- Unverified doctors cannot access specialized consultation tools.
- Statuses: `pending`, `verified`, `rejected`.

## Whisper Room
- Private user spaces. 
- AI interacts securely via Cloud Functions.
- Not shared with doctors by default; requires explicit user sharing.

## Real-Time Chat
- Managed via Firestore real-time listeners.
- No Socket.IO.
- Chat documents restricted to verified participants.

## Security Model
- Firestore & Storage Rules enforce strictly authenticated and authorized access.
- Role verification relies on Custom Claims, not client data.
- Rate limits implemented for API/Cloud Function calls.

## TODO / REQUIRES DECISION
- Which vector database precisely to use for RAG? (Firestore vector search or external like Pinecone/Vertex AI?)
- What specific indicators/APIs to use from WHO?
- Detailed specs for food scanner image size limits?
