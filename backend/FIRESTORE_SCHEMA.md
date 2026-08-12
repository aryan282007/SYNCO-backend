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
- **Fields:**
  - `userId` (string)
  - `doctorId` (string)
  - `status` (string)
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp)
- **Permissions:**
  - **Read/Write:** Only the participating `userId` and `doctorId`.

### `messages` Subcollection
- **Path:** `/conversations/{conversationId}/messages/{messageId}`
- **Fields:**
  - `senderId` (string)
  - `text` (string)
  - `messageType` (string)
  - `createdAt` (timestamp)
