import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCraUYe1gLzZTh_K3tobswQ9VXXhKV572M",
  authDomain: "exam-platform-59d6e.firebaseapp.com",
  projectId: "exam-platform-59d6e",
  storageBucket: "exam-platform-59d6e.firebasestorage.app",
  messagingSenderId: "558130177409",
  appId: "1:558130177409:web:0c6a526544d957cc09f480",
  measurementId: "G-P907XZ69PW"
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };