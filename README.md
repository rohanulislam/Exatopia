# Exatopia

**AI-Powered Examination & Live Proctoring Platform**

Exatopia is an end-to-end, full-stack examination and proctoring platform designed to streamline automated assessment, online proctoring, and oral evaluation. It empowers educators to generate code-locked formal exams from raw source materials (PDF notes, syllabi) while enabling students to undergo AI-supervised testing, practice with personalized mock exams, and participate in interactive voice-driven viva sessions.

**Live Demo:** [https://exatopia-1.onrender.com](https://exatopia-1.onrender.com)

---

## Table of Contents
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Project Directory Structure](#project-directory-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation & Setup](#installation--setup)
  - [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Data Model & Firestore Schema](#data-model--firestore-schema)
- [Proctoring & Anti-Cheating Engine](#proctoring--anti-cheating-engine)
- [AI Integration & Model Fallback](#ai-integration--model-fallback)
- [Grading Scale](#grading-scale)
- [License](#license)

---

## Key Features

###  Examination & Assessment
* **Formal Exam Management:** Teachers can create scheduled, code-locked (`EX-XXXX`) exams with custom start/end time windows, timer limits, and strict single-attempt policies.
* **AI Question Generation:** Automatically generate Multiple Choice Questions (MCQs) from uploaded PDFs (with page-range filters) or pasted syllabus text via Large Language Models.
* **AI Practice Exams (Mocks):** Students can generate self-assessment exams (up to 100 questions) with instant scoring, offline caching, and detailed explanations.
* **AI Voice Viva (Oral Exam):** Real-time, spoken evaluation featuring 3 dynamic questions per session. Leverages browser native Web Speech APIs (`SpeechRecognition` and `SpeechSynthesis`) for voice input and feedback playback.

###  Real-Time Browser Proctoring
* **Fullscreen Enforcement:** Mandatory full-screen start gate prior to exam initialization.
* **Comprehensive Event Tracking:** Monitors tab switching, window blurring, fullscreen exits, right-clicks, DevTools opening, viewing page source, print commands, page saving, and copy/cut/paste actions.
* **Automatic Submission:** Violations are deduplicated within a 500 ms cooldown window and logged directly to Cloud Firestore. Accumulating violations up to the set threshold triggers automatic exam termination and submission.

###  Authentication & Role Management
* **Role-Based Access Control (RBAC):** Distinct dashboards and features for `student`, `teacher`, and `admin` roles.
* **Secure Registration & Auth:** Powered by Firebase Auth with standard email/password login and dual-layer OTP verification via email for account registration and password resets (2-minute TTL).
* **Admin Control Center:** Comprehensive administrative oversight to manage users, delete accounts, and perform cascading removals of associated exams, attempts, and viva records.

###  Analytics & Submissions
* **Automated Grading:** Real-time client-side evaluation against stored answer keys with automatic letter grade assignment (A–F).
* **Visual Analytics:** Native HTML5 Canvas 2D grade distribution charts for student and teacher analytics dashboards.
* **Submissions Modal:** Comprehensive submission viewer showing marks, percentage scores, submission timestamps, and flagged proctoring violations.

---

## System Architecture

Exatopia operates as a hybrid serverless/Express architecture. The frontend handles static assets, native client-side processing (PDF parsing, Web Speech API, UI rendering), and direct interaction with Firebase backend services, while the Express server manages secret API keys, transactional emails, and AI orchestration.

```
+-------------------------------------------------------------------------------+
|                            Client Browser                                     |
|  (Vanilla HTML5 / CSS3 / Vanilla ES Modules - SPA Navigation Pattern)         |
+-------------------+---------------------------+-------------------------------+
                    |                           |
                    | Direct SDK                | REST API (/api/*)
                    v                           v
+-------------------+-------------------+ +-----+---------------------------------+
|      Firebase Cloud Services          | |        Express / Node.js Server         |
|  - Firebase Auth (User Sessions)      | |  - Static Hosting                     |
|  - Cloud Firestore (NoSQL DB)         | |  - CORS & Security Headers            |
+---------------------------------------+ +-----+-------------------+-------------+
                                                |                   |
                                                v                   v
                                      +---------+-------+   +-------+---------+
                                      |   OpenRouter    |   | Transactional   |
                                      |   AI Gateway    |   | Email Services  |
                                      | (LLM Cascades)  |   | (Brevo / Gmail) |
                                      +-----------------+   +-----------------+
```

---

## Tech Stack

| Domain | Technology / Library | Purpose |
|---|---|---|
| **Frontend Framework** | Vanilla HTML5 / CSS3 / ES Modules | Lightweight, zero-bundler Single Page Application architecture |
| **Authentication** | Firebase Auth (v10.8.0) | User session management and OTP password workflows |
| **Database** | Cloud Firestore | NoSQL storage for users, exams, attempts, violations, and vivas |
| **Backend Server** | Node.js (v18+) / Express.js | API proxy, AI request routing, transactional email backend |
| **AI Processing** | OpenRouter API Gateway | Multi-model fallback (`gpt-4o-mini` → `gemini-flash-1.5` → `llama-3.1-8b`) |
| **Email Services** | Brevo API & Nodemailer (SMTP) | Delivery of registration and password recovery OTPs |
| **PDF Extraction** | PDF.js (v3.11.174) | Browser-side text extraction from uploaded study materials |
| **Speech Processing** | Web Speech API | Client-side Speech-to-Text and Text-to-Speech execution |
| **Data Visualization**| Native HTML5 Canvas 2D API | Custom donut and pie chart analytics rendering |
| **Deployment** | Render.com | Cloud platform hosting (`render.yaml` deployment blueprint) |

---

## Project Directory Structure

```
Exatopia/
├── index.html                  # Main landing page & application entry
├── package.json                # Project root dependency definitions
├── render.yaml                 # Deployment specification for Render
├── .env.example                # Template for server environment variables
│
├── server/                     # Express Backend Architecture
│   └── index.js                # Server entry point: static hosting & API endpoints
│
├── js/                         # Frontend ES Modules Architecture
│   ├── firebase-config.js      # Firebase app initialization & SDK exports
│   ├── auth.js                 # Authentication, registration & profile logic
│   ├── exam.js                 # CRUD operations for exams, attempts, and vivas
│   ├── api.js                  # Client API wrapper with backend/Direct AI fallback
│   ├── cheat-detector.js       # Real-time event proctoring monitor
│   ├── guard.js                # Route protection & role verification
│   ├── nav.js                  # SPA routing engine & state navigation
│   ├── pdf-extract.js          # Client-side PDF parsing using PDF.js
│   ├── ui-utils.js             # Shared utilities (grades, toasts, canvas charts)
│   └── submissions-modal.js    # Overlay component for exam submission review
│
├── pages/                      # Application Page Templates
│   ├── login.html              # Authentication sign-in page
│   ├── register.html           # Sign-up page with multi-step OTP validation
│   ├── student/                # Student/Examinee views
│   │   ├── dashboard.html      # Performance analytics & exam history
│   │   ├── exams.html          # Exam hub (join by code, mock exams list)
│   │   ├── exam-room.html      # Proctored examination room
│   │   ├── mock-exam.html      # Practice exam generator setup
│   │   ├── mock-exam-room.html # Practice exam testing environment
│   │   ├── result.html         # Individual exam result viewer
│   │   ├── viva.html           # Interactive AI voice viva room
│   │   └── profile.html        # Examinee profile settings
│   ├── teacher/                # Teacher/Examiner views
│   │   ├── create-exam.html    # AI and manual exam creator
│   │   ├── edit-exam.html      # Existing exam modification view
│   │   ├── result.html         # Teacher view for student results
│   │   └── profile.html        # Examiner profile settings
│   └── admin/                  # System Administrator views
│       ├── dashboard.html      # User & exam management control center
│       └── profile.html        # Administrator profile settings
│
└── assets/                     # Static CSS System and Graphics
    ├── favicon.svg             # Platform favicon
    └── css/
        ├── main.css            # Global CSS variables, buttons, forms, layout
        ├── dashboard.css       # Dashboard grid layout system
        └── exam.css            # Custom components for exam environments
```

---

## Getting Started

### Prerequisites
* **Node.js**: `v18.0.0` or higher
* **npm**: `v9.0.0` or higher
* **Firebase Project**: An active project with **Firebase Authentication** (Email/Password enabled) and **Cloud Firestore** activated.

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/rohanulislam/Exatopia.git
   cd exatopia
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Firebase Credentials:**
   Update `js/firebase-config.js` with your Firebase web configuration keys:
   ```javascript
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_PROJECT_ID.appspot.com",
     messagingSenderId: "YOUR_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```

4. **Configure Environment Variables:**
   Copy the example environment file and populate it with your service credentials:
   ```bash
   cp .env.example .env
   ```

5. **Start the local development server:**
   ```bash
   npm run dev
   ```
   Navigate to `http://localhost:3000` in your browser.

---

### Environment Variables

The Node.js server reads the following variables defined in your `.env` file or environment settings:

| Variable | Required | Description |
|---|---|---|
| `PORT` | Optional | Port on which the Express server listens (Default: `3000`) |
| `SITE_URL` | Optional | Public application URL, forwarded as `HTTP-Referer` to OpenRouter |
| `OPENROUTER_API_KEY` | Recommended | Key for OpenRouter API calls (AI question generation & viva evaluation) |
| `BREVO_API_KEY` | Recommended | Primary API key for sending OTP emails via Brevo |
| `BREVO_SENDER_EMAIL` | Recommended | Verified sender address associated with Brevo |
| `GMAIL_USER` | Optional | Gmail address used for Nodemailer SMTP fallback |
| `GMAIL_APP_PASSWORD` | Optional | Google App Password for SMTP fallback |
| `NODE_ENV` | Optional | Environment mode (`development` or `production`) |

---

## API Reference

The backend exposes a JSON REST API under the `/api` prefix. All requests accept and return standard `application/json` payloads.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check endpoint returning server uptime and AI/email configuration statuses. |
| `POST` | `/api/send-otp` | Sends a 6-digit verification OTP to the target email address. |
| `POST` | `/api/ai/generate-questions` | Generates formal exam MCQs from supplied document context. |
| `POST` | `/api/ai/generate-mock-exam` | Generates practice MCQs complete with answer explanations. |
| `POST` | `/api/ai/generate-viva` | Produces 3 context-aware viva questions based on provided study material. |
| `POST` | `/api/ai/evaluate-viva` | Evaluates a student's spoken/typed response and returns a score and feedback. |
| `POST` | `/api/submit-exam` | Submit acknowledgement endpoint for formal exam submissions. |

---

## Data Model & Firestore Schema

Cloud Firestore stores relational platform metadata across the following collections:

### `users`
* Document ID: `{uid}` (Firebase Auth UID)
* **Fields:** `name`, `email`, `role` (`student` | `teacher` | `admin`), `institution`, `photoURL`, `createdAt`

### `exams`
* Document ID: `{examId}` (Auto-generated)
* **Fields:** `title`, `teacherId`, `teacherEmail`, `code`, `duration`, `startTime`, `endTime`, `maxViolations`, `isMock`, `status`, `createdAt`
* **Sub-collection (`questions`):** `text`, `options[]`, `correctAnswer`, `marks`

### `answerKeys`
* Document ID: `{examId}`
* **Fields:** Map of question document IDs to their string correct answers (`{ [questionId]: correctAnswer }`)

### `attempts`
* Document ID: `{attemptId}` (Auto-generated)
* **Fields:** `examId`, `examTitle`, `studentId`, `studentEmail`, `answers{}`, `startedAt`, `submittedAt`, `autoSubmitted`, `violationCount`, `score`, `total`, `percentage`, `isMock`
* **Sub-collection (`violations`):** `type`, `description`, `timestamp`

### `vivas`
* Document ID: `{vivaId}` (Auto-generated)
* **Fields:** `studentId`, `studentEmail`, `title`, `score`, `total`, `percentage`, `questions[]`, `answers[]`, `feedbacks[]`, `scores[]`, `completedAt`

---

## Proctoring & Anti-Cheating Engine

The client-side `CheatDetector` engine monitors candidate browser events during formal examinations to preserve academic integrity:

```
                  +-----------------------------------+
                  |   Active Proctoring Monitoring    |
                  +-----------------+-----------------+
                                    |
          +-------------------------+-------------------------+
          |                                                   |
[ Window & Browser State ]                             [ Input Devices ]
 - Tab Switch (visibilitychange)                        - Right-click Context Menu
 - Window Blur                                          - Forbidden Keys (F12, PrintScreen)
 - Fullscreen Exit                                      - Key Combos (DevTools, Print, Save)
                                                        - Clipboard Actions (Copy, Cut, Paste)
          |                                                   |
          +-------------------------+-------------------------+
                                    |
                                    v
                  +-----------------------------------+
                  |  Deduplication Window (500 ms)     |
                  +-----------------+-----------------+
                                    |
                                    v
                  +-----------------------------------+
                  | Log Violation to Firestore & UI   |
                  +-----------------+-----------------+
                                    |
            [ Violation Limit Exceeded (count >= max) ]
                                    |
                                    v
                  +-----------------------------------+
                  | Force Terminate & Auto-Submit     |
                  +-----------------------------------+
```

---

## AI Integration & Model Fallback

To ensure uninterrupted uptime and avoid rate-limiting issues during exam sessions, AI operations pass through an automated fallback strategy implemented across both server and client layers:

1. **Server-Side Model Cascade:**
   The server attempts requests using OpenRouter with the following priority list:
   * **Primary:** `openai/gpt-4o-mini` (Optimized for speed and accuracy)
   * **Secondary:** `google/gemini-flash-1.5`
   * **Tertiary:** `meta-llama/llama-3.1-8b-instruct`

2. **Client-Side Direct Fallback:**
   If the Node.js Express backend is unreachable (e.g., during network disruptions), `js/api.js` redirects requests directly to OpenRouter from the user's browser using a client-side API key stored in `localStorage` (`OPENROUTER_API_KEY`).

---

## Grading Scale

Exatopia automatically computes student performance using a standardized grading rubric:

| Score Percentage | Grade | Status Badge |
|---|---|---|
| **$\ge$ 90%** | **Grade A** | Green |
| **80% – 89%** | **Grade B** | Blue |
| **70% – 79%** | **Grade C** | Indigo |
| **60% – 69%** | **Grade D** | Amber |
| **40% – 59%** | **Grade E** | Pink |
| **< 40%** | **Fail** | Red |

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
