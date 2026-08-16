# Firestore Schema

## `users` Collection
- **Path:** `/users/{uid}`
- **Description:** Stores basic user profile information.
- **Fields:**
  - `uid` (string): Firebase Auth UID
  - `name` (string)
  - `email` (string)
  - `photoUrl` (string)
  - `role` (string): 'user', 'doctor', 'admin'
  - `isActive` (boolean)
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp)
- **Permissions:**
  - **Read:** Authenticated users (or owner/doctors based on privacy needs).
  - **Write/Update/Delete:** Owner (`uid == request.auth.uid`) or Admins.

## `healthProfiles` Collection
- **Path:** `/healthProfiles/{uid}`
- **Description:** Private health information for the user.
- **Fields:**
  - `userId` (string)
  - `dateOfBirth` (timestamp)
  - `gender` (string)
  - `medicalHistory` (array of strings)
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp)
- **Permissions:**
  - **Read/Write/Update/Delete:** Owner only. Doctors must be explicitly granted access (TODO).

## `doctors` Collection
- **Path:** `/doctors/{uid}`
- **Description:** Doctor registration and profile data.
- **Fields:**
  - `uid` (string)
  - `name` (string)
  - `email` (string)
  - `registrationNumber` (string)
  - `medicalCouncil` (string)
  - `qualification` (string)
  - `specialization` (string)
  - `verificationStatus` (string): 'pending', 'verified', 'rejected'
  - `submittedAt` (timestamp)
  - `verifiedAt` (timestamp)
  - `verifiedBy` (string)
- **Permissions:**
  - **Read:** Authenticated users.
  - **Write:** Owner (initial registration) and Admins (verification).

## `whisperRooms` Collection
- **Path:** `/whisperRooms/{uid}`
- **Description:** Private Whisper Room for a user.
- **Permissions:**
  - **Read/Write:** Owner only.

### `messages` Subcollection
- **Path:** `/whisperRooms/{uid}/messages/{messageId}`
- **Fields:**
  - `senderId` (string)
  - `text` (string)
  - `isAi` (boolean)
  - `createdAt` (timestamp)

## `foodScans` Collection
- **Path:** `/foodScans/{scanId}`
- **Fields:**
  - `userId` (string)
  - `imageUrl` (string)
  - `nutritionDetails` (map)
  - `aiFeedback` (string)
  - `createdAt` (timestamp)
- **Permissions:**
  - **Read/Write:** Owner only (or via backend function).

## `conversations` Collection
- **Path:** `/conversations/{conversationId}`
- **Description:** Primary 1-to-1 chat record for the conversation between two users or a patient and doctor.
- **Fields:**
  - `participants` (array of strings): authenticated UIDs that can access the conversation
  - `lastMessage` (string, optional)
  - `status` (string, optional)
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp)
- **Permissions:**
  - **Read/Update:** Authenticated user must be in `participants`.
  - **Create:** Authenticated user must be in `request.resource.data.participants`.

### `messages` Subcollection
- **Path:** `/conversations/{conversationId}/messages/{messageId}`
- **Fields:**
  - `senderId` (string)
  - `text` (string)
  - `status` (string, optional): `sent`, `delivered`, `read`
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp, optional)
- **Permissions:**
  - **Read:** Only authenticated participants may read.
  - **Create:** Only the authenticated sender may create a message, and only if they are in the parent conversation's `participants`.
  - **Update:** Restricted to participant-scoped status changes; arbitrary content overwrites are not allowed.

## RTDB Chat State
- **Path:** `/typing/{conversationId}/{uid}` and `/presence/{uid}`
- **Purpose:** ephemeral user state used for typing indicators and online/offline presence.
- **Permissions:**
  - Authenticated user may only read the state relevant to them and write their own own typing/presence status.
- **Use case:** high-frequency updates that should not consume Firestore write quotas.
